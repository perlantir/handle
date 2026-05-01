import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it, vi } from "vitest";
import type { E2BSandboxLike } from "../execution/types";
import { createAgentRunner } from "./runAgent";

const fakeModel = {} as BaseChatModel;

function sandbox(): E2BSandboxLike {
  return {
    commands: {
      run: vi.fn(),
    },
    files: {
      list: vi.fn(),
      read: vi.fn(),
      write: vi.fn(),
    },
    kill: vi.fn().mockResolvedValue(undefined),
    sandboxId: "sandbox-test",
  };
}

async function* successfulStream() {
  yield {
    data: { output: { output: "Done [[HANDLE_RESULT:SUCCESS]]" } },
    event: "on_chain_end",
    name: "AgentExecutor",
  };
}

describe("createAgentRunner", () => {
  it("initializes providers and passes the selected model into the agent", async () => {
    const testSandbox = sandbox();
    const createSandbox = vi.fn().mockResolvedValue(testSandbox);
    const createAgent = vi.fn().mockResolvedValue({
      streamEvents: vi.fn().mockReturnValue(successfulStream()),
    });
    const providerRegistry = {
      getActiveModel: vi.fn().mockResolvedValue({
        model: fakeModel,
        provider: {
          config: { primaryModel: "claude-sonnet-4-5" },
          id: "anthropic",
        },
      }),
      initialize: vi.fn().mockResolvedValue(undefined),
    };
    const store = {
      message: {
        create: vi.fn().mockResolvedValue({}),
      },
      task: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ providerOverride: "anthropic" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const emitEvent = vi.fn();
    const runner = createAgentRunner({
      createAgent,
      createSandbox,
      emitEvent,
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry,
      store,
    });

    await runner("task-test", "Do the thing");

    expect(providerRegistry.initialize).toHaveBeenCalledOnce();
    expect(providerRegistry.getActiveModel).toHaveBeenCalledWith({
      taskId: "task-test",
      taskOverride: "anthropic",
    });
    expect(createAgent).toHaveBeenCalledWith(
      { sandbox: testSandbox, taskId: "task-test" },
      { llm: fakeModel },
    );
    expect(store.task.update).toHaveBeenCalledWith({
      data: { status: "STOPPED" },
      where: { id: "task-test" },
    });
    expect(testSandbox.kill).toHaveBeenCalledOnce();
    expect(emitEvent).toHaveBeenCalledWith({
      type: "status_update",
      status: "STOPPED",
      taskId: "task-test",
    });
  });

  it("uses an explicit provider override before the stored task override", async () => {
    const testSandbox = sandbox();
    const providerRegistry = {
      getActiveModel: vi.fn().mockResolvedValue({
        model: fakeModel,
        provider: {
          config: { primaryModel: "openrouter/auto" },
          id: "openrouter",
        },
      }),
      initialize: vi.fn().mockResolvedValue(undefined),
    };
    const runner = createAgentRunner({
      createAgent: vi.fn().mockResolvedValue({
        streamEvents: vi.fn().mockReturnValue(successfulStream()),
      }),
      createSandbox: vi.fn().mockResolvedValue(testSandbox),
      emitEvent: vi.fn(),
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry,
      store: {
        message: {
          create: vi.fn().mockResolvedValue({}),
        },
        task: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ providerOverride: "anthropic" }),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await runner("task-test", "Do the thing", {
      providerOverride: "openrouter",
    });

    expect(providerRegistry.getActiveModel).toHaveBeenCalledWith({
      taskId: "task-test",
      taskOverride: "openrouter",
    });
  });
});
