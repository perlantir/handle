import { describe, expect, it } from 'vitest';
import { subscribeToTask } from '../lib/eventBus';
import { createPhase1ToolDefinitions } from './tools';
import type { E2BSandboxLike } from '../execution/types';

function createMockSandbox(): E2BSandboxLike {
  return {
    sandboxId: 'sandbox-test',
    commands: {
      async run(_command, opts) {
        await opts?.onStdout?.('hello');
        await opts?.onStderr?.('warn');
        return {
          exitCode: 0,
          stderr: 'warn',
          stdout: 'hello',
        };
      },
    },
    files: {
      async list(path) {
        return [{ name: 'example.txt', path, type: 'file' }];
      },
      async read(path) {
        return `content from ${path}`;
      },
      async write(path, data) {
        return { path, size: String(data).length };
      },
    },
    async kill() {},
  };
}

describe('phase 1 tools', () => {
  it('exposes registry metadata for all Phase 1 tools', () => {
    const definitions = createPhase1ToolDefinitions();

    expect(definitions.map((definition) => definition.name)).toEqual([
      'shell_exec',
      'file_write',
      'file_read',
      'file_list',
    ]);
    expect(definitions.every((definition) => definition.backendSupport.e2b)).toBe(true);
    expect(definitions.every((definition) => !definition.backendSupport.local)).toBe(true);
    expect(definitions.every((definition) => definition.requiresApproval === false)).toBe(true);
  });

  it('emits streaming events from shell_exec', async () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeToTask('task-tools', (event) => events.push(event));
    const shellExec = createPhase1ToolDefinitions().find((definition) => definition.name === 'shell_exec');

    if (!shellExec) throw new Error('shell_exec definition missing');

    const result = await shellExec.implementation(
      { command: 'printf hello' },
      { taskId: 'task-tools', sandbox: createMockSandbox() },
    );

    unsubscribe();

    expect(JSON.parse(result)).toMatchObject({ exitCode: 0, stdout: 'hello', stderr: 'warn' });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool_call', toolName: 'shell.exec' }),
        expect.objectContaining({ type: 'tool_stream', channel: 'stdout', content: 'hello' }),
        expect.objectContaining({ type: 'tool_stream', channel: 'stderr', content: 'warn' }),
        expect.objectContaining({ type: 'tool_result' }),
      ]),
    );
  });

  it('reads, writes, and lists files through the sandbox', async () => {
    const definitions = createPhase1ToolDefinitions();
    const context = { taskId: 'task-files', sandbox: createMockSandbox() };
    const fileWrite = definitions.find((definition) => definition.name === 'file_write');
    const fileRead = definitions.find((definition) => definition.name === 'file_read');
    const fileList = definitions.find((definition) => definition.name === 'file_list');

    if (!fileWrite || !fileRead || !fileList) throw new Error('file tool definition missing');

    await expect(fileWrite.implementation({ path: '/tmp/a.txt', content: 'abc' }, context)).resolves.toContain(
      'Wrote 3 bytes',
    );
    await expect(fileRead.implementation({ path: '/tmp/a.txt' }, context)).resolves.toBe('content from /tmp/a.txt');
    await expect(fileList.implementation({ path: '/tmp' }, context)).resolves.toContain('example.txt');
  });
});
