import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import { createHandleAgent, createPhase1Agent } from "./createAgent";
import { E2BBackend } from "../execution/e2bBackend";
import type { E2BSandboxLike } from "../execution/types";

function structuredText(text: string) {
  return [{ type: "text", text }];
}

class SequentialToolChatModel extends BaseChatModel {
  private index = 0;

  constructor(private readonly responses: AIMessage[]) {
    super({});
  }

  _llmType() {
    return "sequential-tool-chat";
  }

  bindTools() {
    return this;
  }

  async _generate(): Promise<ChatResult> {
    const message =
      this.responses[Math.min(this.index, this.responses.length - 1)];
    if (!message) throw new Error("SequentialToolChatModel has no responses");
    this.index += 1;

    return {
      generations: [
        {
          message,
          text:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        },
      ],
    };
  }
}

const sandbox: E2BSandboxLike = {
  sandboxId: "sandbox-agent-test",
  commands: {
    async run() {
      return { exitCode: 0, stderr: "", stdout: "" };
    },
  },
  files: {
    async list() {
      return [];
    },
    async read() {
      return "";
    },
    async write() {
      return {};
    },
  },
  async kill() {},
};

function context(taskId: string, taskSandbox: E2BSandboxLike = sandbox) {
  return {
    backend: new E2BBackend({
      installCommonPackages: false,
      sandbox: taskSandbox,
    }),
    sandbox: taskSandbox,
    taskId,
  };
}

describe("createPhase1Agent", () => {
  it("creates an AgentExecutor with the Phase 1 tools", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-real";

    const executor = await createPhase1Agent(context("task-agent-test"));
    const toolNames = executor.tools.map((agentTool) => agentTool.name);

    expect(toolNames).toEqual([
      "shell_exec",
      "file_write",
      "file_read",
      "file_list",
    ]);
    expect(executor.maxIterations).toBe(40);
  });

  it("runs the full LangChain prompt path with the brace-free result marker", async () => {
    const llm = new FakeStreamingChatModel({
      responses: [
        new AIMessage("Created the requested file.\n[[HANDLE_RESULT:SUCCESS]]"),
      ],
    });

    const executor = await createPhase1Agent(
      context("task-agent-prompt-test"),
      { llm },
    );
    const result = await executor.invoke({
      chat_history: [],
      input: "Create a test artifact and report success.",
    });

    expect(result.output).toContain("[[HANDLE_RESULT:SUCCESS]]");
  });

  it.each([
    "openai",
    "anthropic",
    "kimi",
    "openrouter",
    "local",
    "openai-chatgpt-oauth",
  ])(
    "runs a %s-compatible structured tool call through the unified agent",
    async () => {
      const writes: Array<{ content: string; path: string }> = [];
      const llm = new SequentialToolChatModel([
        new AIMessage({
          content: structuredText("I will write the file now."),
          tool_calls: [
            {
              args: {
                content: "provider compatibility test",
                path: "/tmp/provider.txt",
              },
              id: "call_file_write",
              name: "file_write",
            },
          ],
        }),
        new AIMessage({
          content: structuredText("Wrote the file.\n[[HANDLE_RESULT:SUCCESS]]"),
        }),
      ]);
      const taskSandbox: E2BSandboxLike = {
        ...sandbox,
        files: {
          ...sandbox.files,
          async write(path, content) {
            writes.push({ content, path });
            return {};
          },
        },
      };
      const executor = await createPhase1Agent(
        context(
          "task-agent-provider-compat-test",
          taskSandbox,
        ),
        { llm },
      );

      const result = await executor.invoke({
        chat_history: [],
        input: "Write /tmp/provider.txt.",
      });

      expect(writes).toEqual([
        {
          content: "provider compatibility test",
          path: "/tmp/provider.txt",
        },
      ]);
      expect(JSON.stringify(result.output)).toContain(
        "[[HANDLE_RESULT:SUCCESS]]",
      );
    },
  );
});

describe("createHandleAgent", () => {
  it("creates an AgentExecutor with Phase 1, browser, and computer-use tools", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-real";

    const executor = await createHandleAgent(context("task-agent-phase3-test"));
    const toolNames = executor.tools.map((agentTool) => agentTool.name);

    expect(toolNames).toEqual([
      "shell_exec",
      "file_write",
      "file_read",
      "file_list",
      "browser_navigate",
      "browser_click",
      "browser_type",
      "browser_extract_text",
      "browser_screenshot",
      "browser_go_back",
      "browser_scroll",
      "browser_wait_for_selector",
      "computer_use",
    ]);
  });
});
