import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it, vi } from "vitest";
import type { E2BSandboxLike } from "../execution/types";
import type { ProviderId, ProviderInstance } from "../providers/types";
import { createAgentRunner } from "./runAgent";

const fakeModel = {} as BaseChatModel;
const fakePlanModel = { name: "plan-model" } as unknown as BaseChatModel;

function provider(id: ProviderId, primaryModel: string): ProviderInstance {
  return {
    config: {
      authMode: "apiKey",
      enabled: true,
      fallbackOrder: 1,
      id,
      primaryModel,
    },
    createModel: vi.fn().mockResolvedValue(fakePlanModel),
    description: id,
    id,
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

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
    const selectedProvider = provider("anthropic", "claude-sonnet-4-5");
    const providerRegistry = {
      getActiveModel: vi.fn().mockResolvedValue({
        model: fakeModel,
        provider: selectedProvider,
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
    const emitPlan = vi.fn().mockResolvedValue(undefined);
    const runner = createAgentRunner({
      createAgent,
      createSandbox,
      emitEvent,
      emitPlan,
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
    expect(selectedProvider.createModel).toHaveBeenCalledWith(undefined, {
      streaming: false,
    });
    expect(emitPlan).toHaveBeenCalledWith("task-test", "Do the thing", {
      llm: fakePlanModel,
      provider: {
        id: "anthropic",
        model: "claude-sonnet-4-5",
      },
    });
    expect(createAgent).toHaveBeenCalledWith(
      { sandbox: testSandbox, taskId: "task-test", trustedDomains: [] },
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
    const selectedProvider = provider("openrouter", "openrouter/auto");
    const providerRegistry = {
      getActiveModel: vi.fn().mockResolvedValue({
        model: fakeModel,
        provider: selectedProvider,
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

  it("marks the task errored when plan generation fails before sandbox creation", async () => {
    const createSandbox = vi.fn();
    const selectedProvider = provider("openai", "gpt-4o");
    const providerRegistry = {
      getActiveModel: vi.fn().mockResolvedValue({
        model: fakeModel,
        provider: selectedProvider,
      }),
      initialize: vi.fn().mockResolvedValue(undefined),
    };
    const store = {
      message: {
        create: vi.fn().mockResolvedValue({}),
      },
      task: {
        findUnique: vi.fn().mockResolvedValue({ providerOverride: "openai" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const emitEvent = vi.fn();
    const runner = createAgentRunner({
      createAgent: vi.fn(),
      createSandbox,
      emitEvent,
      emitPlan: vi.fn().mockRejectedValue(new Error("planner unavailable")),
      isSmokeEnabled: () => false,
      providerRegistry,
      store,
    });

    await runner("task-test", "Do the thing");

    expect(createSandbox).not.toHaveBeenCalled();
    expect(store.task.update).toHaveBeenCalledWith({
      data: { status: "ERROR" },
      where: { id: "task-test" },
    });
    expect(emitEvent).toHaveBeenCalledWith({
      type: "error",
      message: "planner unavailable",
      taskId: "task-test",
    });
    expect(emitEvent).toHaveBeenCalledWith({
      type: "status_update",
      status: "ERROR",
      taskId: "task-test",
    });
  });
});
