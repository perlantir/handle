import { describe, expect, it } from 'vitest';
import { commonPythonPackages, installCommonPythonPackages } from './e2bBackend';
import type { E2BSandboxLike } from './types';

function createSandbox(run: E2BSandboxLike['commands']['run']): E2BSandboxLike {
  return {
    commands: { run },
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
});
