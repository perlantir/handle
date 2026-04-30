import { Sandbox } from 'e2b';
import type { E2BSandboxLike } from './types';

export async function createE2BSandbox(): Promise<E2BSandboxLike> {
  return Sandbox.create();
}
