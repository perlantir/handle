import { Sandbox } from 'e2b';
import { createBrowserSession, type BrowserSession } from './browserSession';
import type {
  E2BSandboxLike,
  ExecutionBackend,
  ExecutionBrowserSessionOptions,
  ExecutionCommandOptions,
  ExecutionCommandResult,
  ExecutionFileEntry,
} from './types';
import { logger } from '../lib/logger';
import { redactSecrets } from '../lib/redact';

export const commonPythonPackages = ['requests', 'beautifulsoup4', 'httpx', 'pandas'] as const;
const E2B_WORKSPACE_DIR = '/home/user';

export interface E2BBackendOptions {
  installCommonPackages?: boolean;
  sandbox?: E2BSandboxLike;
  sandboxFactory?: () => Promise<E2BSandboxLike>;
}

export async function installCommonPythonPackages(sandbox: E2BSandboxLike) {
  const result = await sandbox.commands.run(
    `python3 -m pip install --quiet --disable-pip-version-check ${commonPythonPackages.join(' ')}`,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to install common Python packages: ${result.stderr || result.stdout}`);
  }
}

function normalizeFileEntry(entry: unknown): ExecutionFileEntry {
  if (typeof entry !== 'object' || entry === null) {
    return { isDir: false, name: String(entry), size: 0 };
  }

  const candidate = entry as Record<string, unknown>;
  const name =
    typeof candidate.name === 'string'
      ? candidate.name
      : typeof candidate.path === 'string'
        ? candidate.path
        : JSON.stringify(candidate);
  const type = typeof candidate.type === 'string' ? candidate.type.toLowerCase() : '';
  const isDir =
    typeof candidate.isDir === 'boolean'
      ? candidate.isDir
      : typeof candidate.isDirectory === 'boolean'
        ? candidate.isDirectory
        : type === 'dir' || type === 'directory';
  const size = typeof candidate.size === 'number' && Number.isFinite(candidate.size) ? candidate.size : 0;

  return { isDir, name, size };
}

function diagnosticErrorFields(err: unknown) {
  if (!(err instanceof Error)) {
    return { errorMessage: redactSecrets(String(err)), errorType: typeof err };
  }

  const record = err as Error & Record<string, unknown>;
  const fieldNames = Object.getOwnPropertyNames(err).filter((name) => name !== 'stack');
  const result: Record<string, unknown> = {
    errorMessage: redactSecrets(err.message),
    errorName: err.name,
    fieldNames,
  };

  for (const name of fieldNames) {
    const value = record[name];
    if (typeof value === 'string') {
      result[name] = redactSecrets(value);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[name] = value;
    } else if (value !== undefined) {
      try {
        result[name] = redactSecrets(JSON.stringify(value));
      } catch {
        result[name] = `[unserializable ${typeof value}]`;
      }
    }
  }

  return result;
}

export class E2BBackend implements ExecutionBackend {
  readonly id = 'e2b' as const;
  private browser: BrowserSession | null = null;
  private sandbox: E2BSandboxLike | null;

  constructor(private readonly options: E2BBackendOptions = {}) {
    this.sandbox = options.sandbox ?? null;
  }

  async initialize(_taskId: string) {
    if (!this.sandbox) {
      const factory = this.options.sandboxFactory ?? (() => Sandbox.create() as Promise<E2BSandboxLike>);
      this.sandbox = await factory();
    }

    if (this.options.installCommonPackages !== false) {
      await installCommonPythonPackages(this.sandbox);
    }
  }

  async shutdown(_taskId: string) {
    await this.browser?.destroy();
    this.browser = null;
    await this.sandbox?.kill();
    this.sandbox = null;
  }

  getSandbox(): E2BSandboxLike {
    if (!this.sandbox) {
      throw new Error('E2B backend has not been initialized');
    }

    return this.sandbox;
  }

  getWorkspaceDir() {
    return E2B_WORKSPACE_DIR;
  }

  async fileDelete(path: string) {
    const sandbox = this.getSandbox();
    if (!sandbox.files.remove) {
      throw new Error('E2B sandbox does not support file deletion');
    }

    await sandbox.files.remove(path);
  }

  async fileList(path: string): Promise<ExecutionFileEntry[]> {
    const entries = await this.getSandbox().files.list(path);
    return entries.map(normalizeFileEntry);
  }

  async fileRead(path: string) {
    return this.getSandbox().files.read(path, { format: 'text' });
  }

  async fileWrite(path: string, content: string) {
    await this.getSandbox().files.write(path, content);
  }

  async browserSession(options: ExecutionBrowserSessionOptions = {}) {
    if (!this.browser) {
      this.browser = createBrowserSession({
        ...(options.approval ? { approval: options.approval } : {}),
        sandbox: this.getSandbox(),
      });
    }

    return this.browser;
  }

  async shellExec(command: string, opts: ExecutionCommandOptions): Promise<ExecutionCommandResult> {
    let streamedStdout = '';
    let streamedStderr = '';
    let result: Awaited<ReturnType<E2BSandboxLike['commands']['run']>>;

    try {
      result = await this.getSandbox().commands.run(command, {
        async onStderr(data) {
          streamedStderr += data;
          await opts.onStderr(data);
        },
        async onStdout(data) {
          streamedStdout += data;
          await opts.onStdout(data);
        },
      });
    } catch (err) {
      logger.error(
        {
          command: redactSecrets(command),
          diagnostics: diagnosticErrorFields(err),
          streamedStderr: redactSecrets(streamedStderr),
          streamedStdout: redactSecrets(streamedStdout),
        },
        'E2B shell command failed before returning a result',
      );
      throw err;
    }

    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }
}

export async function createE2BSandbox(): Promise<E2BSandboxLike> {
  const backend = new E2BBackend();
  await backend.initialize('legacy-e2b-sandbox');

  return backend.getSandbox();
}
