import { describe, expect, it, vi } from 'vitest';
import { commonPythonPackages, E2BBackend, installCommonPythonPackages } from './e2bBackend';
import type { E2BSandboxLike } from './types';

function createSandbox(run: E2BSandboxLike['commands']['run']): E2BSandboxLike {
  return {
    commands: { run },
    files: {
      async list(path) {
        return [{ name: 'example.txt', path, size: 12, type: 'file' }];
      },
      async read() {
        return 'file content';
      },
      async remove() {
        return {};
      },
      async write() {
        return {};
      },
    },
    async kill() {},
    sandboxId: 'sandbox-test',
  };
}

describe('E2B sandbox setup', () => {
  it('installs common Python packages at sandbox startup', async () => {
    const commands: string[] = [];
    const sandbox = createSandbox(async (command) => {
      commands.push(command);
      return { exitCode: 0, stderr: '', stdout: '' };
    });

    await installCommonPythonPackages(sandbox);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('python3 -m pip install');
    for (const packageName of commonPythonPackages) {
      expect(commands[0]).toContain(packageName);
    }
  });

  it('fails fast when common Python package installation fails', async () => {
    const sandbox = createSandbox(async () => ({
      exitCode: 1,
      stderr: 'pip failed',
      stdout: '',
    }));

    await expect(installCommonPythonPackages(sandbox)).rejects.toThrow('pip failed');
  });

  it('implements ExecutionBackend by delegating file and shell operations to the sandbox', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const writes: Array<{ content: string; path: string }> = [];
    const removes: string[] = [];
    const sandbox = createSandbox(async (_command, opts) => {
      await opts?.onStdout?.('hello');
      await opts?.onStderr?.('warn');
      return { exitCode: 0, stderr: 'warn', stdout: 'hello' };
    });
    sandbox.files.write = async (path, content) => {
      writes.push({ content, path });
      return {};
    };
    sandbox.files.remove = async (path) => {
      removes.push(path);
      return {};
    };

    const backend = new E2BBackend({ sandbox });
    await backend.initialize('task-e2b');

    await backend.fileWrite('/tmp/example.txt', 'abc');
    await backend.fileDelete('/tmp/example.txt');
    await expect(backend.fileRead('/tmp/example.txt')).resolves.toBe('file content');
    await expect(backend.fileList('/tmp')).resolves.toEqual([{ isDir: false, name: 'example.txt', size: 12 }]);
    await expect(
      backend.shellExec('printf hello', {
        onStderr: (line) => stderr.push(line),
        onStdout: (line) => stdout.push(line),
      }),
    ).resolves.toEqual({ exitCode: 0, stderr: 'warn', stdout: 'hello' });

    expect(writes).toEqual([{ content: 'abc', path: '/tmp/example.txt' }]);
    expect(removes).toEqual(['/tmp/example.txt']);
    expect(stdout).toEqual(['hello']);
    expect(stderr).toEqual(['warn']);
  });

  it('kills the sandbox on shutdown', async () => {
    const sandbox = createSandbox(async () => ({ exitCode: 0, stderr: '', stdout: '' }));
    sandbox.kill = vi.fn(async () => {});
    const backend = new E2BBackend({ sandbox });

    await backend.initialize('task-e2b');
    await backend.shutdown('task-e2b');

    expect(sandbox.kill).toHaveBeenCalledOnce();
  });
});
