import { AIMessage } from '@langchain/core/messages';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import { describe, expect, it } from 'vitest';
import { createPhase1Agent } from './createAgent';
import type { E2BSandboxLike } from '../execution/types';

const sandbox: E2BSandboxLike = {
  sandboxId: 'sandbox-agent-test',
  commands: {
    async run() {
      return { exitCode: 0, stderr: '', stdout: '' };
    },
  },
  files: {
    async list() {
      return [];
    },
    async read() {
      return '';
    },
    async write() {
      return {};
    },
  },
  async kill() {},
};

describe('createPhase1Agent', () => {
  it('creates an AgentExecutor with the Phase 1 tools', async () => {
    process.env.OPENAI_API_KEY = 'test-key-not-real';

    const executor = await createPhase1Agent({ taskId: 'task-agent-test', sandbox });
    const toolNames = executor.tools.map((agentTool) => agentTool.name);

    expect(toolNames).toEqual(['shell_exec', 'file_write', 'file_read', 'file_list']);
  });

  it('runs the full LangChain prompt path with the brace-free result marker', async () => {
    const llm = new FakeStreamingChatModel({
      responses: [new AIMessage('Created the requested file.\n[[HANDLE_RESULT:SUCCESS]]')],
    });

    const executor = await createPhase1Agent({ taskId: 'task-agent-prompt-test', sandbox }, { llm });
    const result = await executor.invoke({
      chat_history: [],
      input: 'Create a test artifact and report success.',
    });

    expect(result.output).toContain('[[HANDLE_RESULT:SUCCESS]]');
  });
});
