import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it, vi } from "vitest";
import type { E2BSandboxLike, ExecutionBackend } from "../execution/types";
import type { ProviderId, ProviderInstance } from "../providers/types";
import { createAgentRunner } from "./runAgent";

const fakeModel = {
  invoke: vi.fn().mockResolvedValue({
    content: "## Summary\n- Specialist test report.\n## Findings\n- Test finding.\n## Recommendations\n- Test recommendation.",
  }),
} as unknown as BaseChatModel;
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

function backendForSandbox(testSandbox: E2BSandboxLike) {
  return {
    id: "e2b",
    async browserSession() {
      throw new Error("browser not used in this test");
    },
    async fileDelete(path: string) {
      await testSandbox.files.remove?.(path);
    },
    async fileList() {
      return [];
    },
    async fileRead() {
      return "";
    },
    async fileWrite() {},
    getSandbox() {
      return testSandbox;
    },
    getWorkspaceDir() {
      return "/home/user";
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    async shellExec() {
      return { exitCode: 0, stderr: "", stdout: "" };
    },
    shutdown: vi.fn().mockResolvedValue(undefined),
  } satisfies ExecutionBackend & { getSandbox(): E2BSandboxLike };
}

function localBackend() {
  return {
    id: "local",
    async browserSession() {
      throw new Error("browser not used in this test");
    },
    async fileDelete() {},
    async fileList() {
      return [];
    },
    async fileRead() {
      return "";
    },
    async fileWrite() {},
    getWorkspaceDir() {
      return "/Users/perlantir/Documents/Handle/workspaces/task-local";
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    async shellExec() {
      return { exitCode: 0, stderr: "", stdout: "" };
    },
    shutdown: vi.fn().mockResolvedValue(undefined),
  } satisfies ExecutionBackend;
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
    const backend = backendForSandbox(testSandbox);
    const createBackend = vi.fn().mockReturnValue(backend);
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
          .mockResolvedValue({ backend: "e2b", providerOverride: "anthropic" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const emitEvent = vi.fn();
    const emitPlan = vi.fn().mockResolvedValue(undefined);
    const runner = createAgentRunner({
      createAgent,
      createBackend,
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
      signal: expect.any(AbortSignal),
    });
    expect(createAgent).toHaveBeenCalledWith(
      {
        backend,
        memoryContext: expect.stringContaining("<memory_context>None recalled</memory_context>"),
        recordTrajectoryStep: expect.any(Function),
        sandbox: testSandbox,
        taskId: "task-test",
        trustedDomains: [],
      },
      { llm: fakeModel },
    );
    expect(store.task.update).toHaveBeenCalledWith({
      data: { status: "STOPPED" },
      where: { id: "task-test" },
    });
    expect(backend.shutdown).toHaveBeenCalledWith("task-test");
    expect(emitEvent).toHaveBeenCalledWith({
      type: "status_update",
      status: "STOPPED",
      taskId: "task-test",
    });
  });

  it("uses an explicit provider override before the stored task override", async () => {
    const testSandbox = sandbox();
    const createBackend = vi.fn().mockReturnValue(backendForSandbox(testSandbox));
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
      createBackend,
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
            .mockResolvedValue({ backend: "e2b", providerOverride: "anthropic" }),
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

  it("loads conversation history from AgentRun context without duplicating the current user message", async () => {
    const testSandbox = sandbox();
    const createBackend = vi.fn().mockReturnValue(backendForSandbox(testSandbox));
    const streamEvents = vi.fn().mockReturnValue(successfulStream());
    const createAgent = vi.fn().mockResolvedValue({ streamEvents });
    const selectedProvider = provider("anthropic", "claude-opus-4-7");
    const store = {
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          backend: "LOCAL",
          conversationId: "conversation-test",
          conversation: {
            messages: [
              { content: "Write a script", role: "USER" },
              { content: "I wrote script.py.", role: "ASSISTANT" },
              { content: "Now run it", role: "USER" },
            ],
            project: {
              browserMode: "SEPARATE_PROFILE",
              customScopePath: null,
              defaultBackend: "LOCAL",
              defaultModel: null,
              defaultProvider: "anthropic",
              id: "project-test",
              workspaceScope: "DEFAULT_WORKSPACE",
            },
          },
          modelName: null,
          providerId: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      message: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const runner = createAgentRunner({
      createAgent,
      createBackend,
      createLocalBackend: vi.fn().mockReturnValue(localBackend()),
      emitEvent: vi.fn(),
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry: {
        getActiveModel: vi.fn().mockResolvedValue({
          model: fakeModel,
          provider: selectedProvider,
        }),
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      store,
    });

    await runner("run-test", "Now run it");

    expect(streamEvents).toHaveBeenCalledWith(
      {
        chat_history: [
          { content: "Write a script", role: "user" },
          { content: "I wrote script.py.", role: "assistant" },
        ],
        input: "Now run it",
      },
      { signal: expect.any(AbortSignal), version: "v2" },
    );
    expect(store.agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        backend: "LOCAL",
        providerId: "anthropic",
      }),
      where: { id: "run-test" },
    });
    expect(store.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentRunId: "run-test",
        conversationId: "conversation-test",
        role: "ASSISTANT",
      }),
    });
  });

  it("routes browser and desktop goals to the E2B Desktop sandbox", async () => {
    const headlessSandbox = sandbox();
    const desktopSandbox = { ...sandbox(), sandboxId: "desktop-sandbox-test" };
    const createBackend = vi.fn((options) =>
      backendForSandbox(options?.sandbox ?? headlessSandbox),
    );
    const createDesktopSandbox = vi.fn().mockResolvedValue(desktopSandbox);
    const createAgent = vi.fn().mockResolvedValue({
      streamEvents: vi.fn().mockReturnValue(successfulStream()),
    });
    const selectedProvider = provider("openai", "gpt-4o");
    const runner = createAgentRunner({
      createAgent,
      createBackend,
      createDesktopSandbox,
      emitEvent: vi.fn(),
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry: {
        getActiveModel: vi.fn().mockResolvedValue({
          model: fakeModel,
          provider: selectedProvider,
        }),
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      store: {
        message: {
          create: vi.fn().mockResolvedValue({}),
        },
        task: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ backend: "e2b", providerOverride: null }),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await runner(
      "task-desktop-test",
      "Navigate to https://news.ycombinator.com.",
    );

    expect(createDesktopSandbox).toHaveBeenCalledWith({
      resolution: [1280, 800],
    });
    expect(createBackend).toHaveBeenCalledWith({
      installCommonPackages: false,
      sandbox: desktopSandbox,
    });
    expect(createAgent).toHaveBeenCalledWith(
      {
        backend: expect.objectContaining({ id: "e2b" }),
        memoryContext: expect.stringContaining("<memory_context>None recalled</memory_context>"),
        recordTrajectoryStep: expect.any(Function),
        sandbox: desktopSandbox,
        taskId: "task-desktop-test",
        trustedDomains: [],
      },
      { llm: fakeModel },
    );
  });

  it("runs pure desktop screenshot goals directly through computer_use", async () => {
    const desktopSandbox = { ...sandbox(), sandboxId: "desktop-direct-test" };
    const createBackend = vi.fn((options) =>
      backendForSandbox(options?.sandbox ?? desktopSandbox),
    );
    const createAgent = vi.fn();
    const createComputerUseTools = vi.fn().mockReturnValue([
      {
        implementation: vi
          .fn()
          .mockResolvedValue(
            "I see an empty desktop. A panel is visible. The screen is ready.",
          ),
      },
    ]);
    const selectedProvider = provider("openai", "gpt-4o");
    const store = {
      message: {
        create: vi.fn().mockResolvedValue({}),
      },
      task: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ backend: "e2b", providerOverride: "openai" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const emitEvent = vi.fn();
    const runner = createAgentRunner({
      createAgent,
      createBackend,
      createComputerUseTools,
      createDesktopSandbox: vi.fn().mockResolvedValue(desktopSandbox),
      emitEvent,
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry: {
        getActiveModel: vi.fn().mockResolvedValue({
          model: fakeModel,
          provider: selectedProvider,
        }),
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      store,
    });

    await runner(
      "task-direct-computer-use-test",
      "Take a screenshot of the desktop and describe it.",
    );

    expect(createAgent).not.toHaveBeenCalled();
    expect(createComputerUseTools()[0].implementation).toHaveBeenCalledWith(
      {
        goal: "Take a screenshot of the desktop and describe it.",
        maxIterations: 4,
      },
      {
        backend: expect.objectContaining({ id: "e2b" }),
        sandbox: desktopSandbox,
        taskId: "task-direct-computer-use-test",
        trustedDomains: [],
      },
    );
    expect(store.message.create).toHaveBeenCalledWith({
      data: {
        content:
          "I see an empty desktop. A panel is visible. The screen is ready.",
        role: "ASSISTANT",
        taskId: "task-direct-computer-use-test",
      },
    });
    expect(store.task.update).toHaveBeenCalledWith({
      data: { status: "STOPPED" },
      where: { id: "task-direct-computer-use-test" },
    });
    expect(emitEvent).toHaveBeenCalledWith({
      content:
        "I see an empty desktop. A panel is visible. The screen is ready.",
      role: "assistant",
      taskId: "task-direct-computer-use-test",
      type: "message",
    });
  });

  it("keeps non-browser goals on the standard E2B sandbox", async () => {
    const headlessSandbox = sandbox();
    const createBackend = vi.fn().mockReturnValue(backendForSandbox(headlessSandbox));
    const createDesktopSandbox = vi.fn();
    const selectedProvider = provider("openai", "gpt-4o");
    const runner = createAgentRunner({
      createAgent: vi.fn().mockResolvedValue({
        streamEvents: vi.fn().mockReturnValue(successfulStream()),
      }),
      createBackend,
      createDesktopSandbox,
      emitEvent: vi.fn(),
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry: {
        getActiveModel: vi.fn().mockResolvedValue({
          model: fakeModel,
          provider: selectedProvider,
        }),
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      store: {
        message: {
          create: vi.fn().mockResolvedValue({}),
        },
        task: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ backend: "e2b", providerOverride: null }),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await runner(
      "task-shell-test",
      "Write a Python script that prints hello world.",
    );

    expect(createBackend).toHaveBeenCalledWith();
    expect(createDesktopSandbox).not.toHaveBeenCalled();
  });

  it("keeps URL-fetch coding tasks on the standard E2B sandbox", async () => {
    const headlessSandbox = sandbox();
    const createBackend = vi.fn().mockReturnValue(backendForSandbox(headlessSandbox));
    const createDesktopSandbox = vi.fn();
    const selectedProvider = provider("openai", "gpt-4o");
    const runner = createAgentRunner({
      createAgent: vi.fn().mockResolvedValue({
        streamEvents: vi.fn().mockReturnValue(successfulStream()),
      }),
      createBackend,
      createDesktopSandbox,
      emitEvent: vi.fn(),
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry: {
        getActiveModel: vi.fn().mockResolvedValue({
          model: fakeModel,
          provider: selectedProvider,
        }),
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      store: {
        message: {
          create: vi.fn().mockResolvedValue({}),
        },
        task: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ backend: "e2b", providerOverride: null }),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await runner(
      "task-url-fetch-test",
      "Write a Python script that fetches https://news.ycombinator.com and saves the top 10 stories to /tmp/hn.json.",
    );

    expect(createBackend).toHaveBeenCalledWith();
    expect(createDesktopSandbox).not.toHaveBeenCalled();
  });

  it("uses the LocalBackend when the task backend is local", async () => {
    const backend = localBackend();
    const createBackend = vi.fn();
    const createLocalBackend = vi.fn().mockReturnValue(backend);
    const createAgent = vi.fn().mockResolvedValue({
      streamEvents: vi.fn().mockReturnValue(successfulStream()),
    });
    const selectedProvider = provider("openai", "gpt-4o");
    const store = {
      browserSettings: {
        findUnique: vi.fn().mockResolvedValue({ mode: "separate-profile" }),
      },
      message: {
        create: vi.fn().mockResolvedValue({}),
      },
      task: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ backend: "local", providerOverride: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const runner = createAgentRunner({
      createAgent,
      createBackend,
      createLocalBackend,
      emitEvent: vi.fn(),
      emitPlan: vi.fn().mockResolvedValue(undefined),
      isSmokeEnabled: () => false,
      providerRegistry: {
        getActiveModel: vi.fn().mockResolvedValue({
          model: fakeModel,
          provider: selectedProvider,
        }),
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      store,
    });

    await runner("task-local-test", "Write a Python script.");

    expect(createBackend).not.toHaveBeenCalled();
    expect(createLocalBackend).toHaveBeenCalledWith("task-local-test", {
      browserMode: "separate-profile",
    });
    expect(createAgent).toHaveBeenCalledWith(
      {
        backend,
        memoryContext: expect.stringContaining("<memory_context>None recalled</memory_context>"),
        recordTrajectoryStep: expect.any(Function),
        sandbox: expect.objectContaining({ sandboxId: "local:task-local-test" }),
        taskId: "task-local-test",
        trustedDomains: [],
      },
      { llm: fakeModel },
    );
    expect(store.task.update).toHaveBeenCalledWith({
      data: { sandboxId: "local:task-local-test" },
      where: { id: "task-local-test" },
    });
    expect(backend.shutdown).toHaveBeenCalledWith("task-local-test");
  });

  it("marks the task errored when plan generation fails before sandbox creation", async () => {
    const createBackend = vi.fn();
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
        findUnique: vi
          .fn()
          .mockResolvedValue({ backend: "e2b", providerOverride: "openai" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const emitEvent = vi.fn();
    const runner = createAgentRunner({
      createAgent: vi.fn(),
      createBackend,
      emitEvent,
      emitPlan: vi.fn().mockRejectedValue(new Error("planner unavailable")),
      isSmokeEnabled: () => false,
      providerRegistry,
      store,
    });

    await runner("task-test", "Do the thing");

    expect(createBackend).not.toHaveBeenCalled();
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
