import { Sandbox } from 'e2b';
import type { E2BSandboxLike } from './types';

export const commonPythonPackages = ['requests', 'beautifulsoup4', 'httpx', 'pandas'] as const;

export async function installCommonPythonPackages(sandbox: E2BSandboxLike) {
  const result = await sandbox.commands.run(
    `python3 -m pip install --quiet --disable-pip-version-check ${commonPythonPackages.join(' ')}`,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to install common Python packages: ${result.stderr || result.stdout}`);
  }
}

export async function createE2BSandbox(): Promise<E2BSandboxLike> {
  const sandbox = await Sandbox.create();
  await installCommonPythonPackages(sandbox);

  return sandbox;
}
