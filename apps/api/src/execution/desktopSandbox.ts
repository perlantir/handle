import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { Sandbox as E2BDesktopSandbox } from '@e2b/desktop';
import { logger } from '../lib/logger';

export interface DesktopSandboxCreateOptions {
  resolution?: [number, number];
  timeoutMs?: number;
  sdk?: DesktopSandboxFactory;
  logger?: DesktopSandboxLogger;
}

export interface DesktopSandboxHandle {
  sandboxId: string;
  screenshot(): Promise<Buffer>;
  click(x: number, y: number): Promise<void>;
  type(text: string): Promise<void>;
  key(name: string): Promise<void>;
  kill(): Promise<void>;
}

export interface DesktopSandboxFactory {
  create(options?: { resolution?: [number, number]; timeoutMs?: number }): Promise<DesktopSandboxLike>;
}

export interface DesktopSandboxLike {
  sandboxId?: string;
  commands?: {
    run(command: string): Promise<{ exitCode?: number; error?: string; stdout?: string; stderr?: string }>;
  };
  files?: {
    read(path: string, opts: { format: 'bytes' }): Promise<Uint8Array>;
    remove(path: string): Promise<void>;
  };
  screenshot(): Promise<Uint8Array>;
  moveMouse(x: number, y: number): Promise<void>;
  leftClick(x?: number, y?: number): Promise<void>;
  write(text: string): Promise<void>;
  press(key: string | string[]): Promise<void>;
  kill(): Promise<void>;
}

export interface DesktopSandboxLogger {
  info(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

const DEFAULT_RESOLUTION: [number, number] = [1024, 768];
const DEFAULT_TIMEOUT_MS = 300_000;
const defaultDesktopSandboxFactory: DesktopSandboxFactory = {
  async create(options) {
    return E2BDesktopSandbox.create(options);
  },
};

function durationSince(startedAt: number) {
  return Date.now() - startedAt;
}

function normalizeKey(name: string) {
  const normalized = name.trim().toLowerCase();
  const aliases: Record<string, string> = {
    enter: 'enter',
    escape: 'escape',
    esc: 'escape',
    tab: 'tab',
    space: 'space',
    backspace: 'backspace',
    delete: 'delete',
    del: 'delete',
  };

  return aliases[normalized] ?? normalized;
}

class E2BDesktopSandboxHandle implements DesktopSandboxHandle {
  readonly sandboxId: string;

  constructor(
    private readonly sandbox: DesktopSandboxLike,
    private readonly log: DesktopSandboxLogger,
  ) {
    this.sandboxId = sandbox.sandboxId ?? 'unknown';
  }

  async screenshot() {
    const startedAt = Date.now();
    this.log.info({ sandboxId: this.sandboxId }, 'Desktop sandbox screenshot started');

    try {
      const bytes = await this.takeScreenshotBytes();
      const image = Buffer.from(bytes);
      this.log.info(
        {
          byteCount: image.byteLength,
          durationMs: durationSince(startedAt),
          sandboxId: this.sandboxId,
        },
        'Desktop sandbox screenshot complete',
      );
      return image;
    } catch (err) {
      this.log.error(
        { durationMs: durationSince(startedAt), err, sandboxId: this.sandboxId },
        'Desktop sandbox screenshot failed',
      );
      throw err;
    }
  }

  private async takeScreenshotBytes() {
    if (!this.sandbox.commands || !this.sandbox.files) {
      return this.sandbox.screenshot();
    }

    // @e2b/desktop@2.2.x screenshots fire-and-forget temp file removal.
    // Await cleanup here so kill() cannot race the SDK's internal remove().
    const path = `/tmp/handle-screenshot-${randomUUID()}.png`;
    const result = await this.sandbox.commands.run(`scrot --pointer ${path}`);

    if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
      throw new Error(
        `Desktop screenshot command failed: ${result.stderr || result.stdout || result.error || `exit ${result.exitCode}`}`,
      );
    }

    let readError: unknown;
    try {
      return await this.sandbox.files.read(path, { format: 'bytes' });
    } catch (err) {
      readError = err;
      throw err;
    } finally {
      try {
        await this.sandbox.files.remove(path);
      } catch (err) {
        this.log.error(
          { err, path, readFailed: Boolean(readError), sandboxId: this.sandboxId },
          'Desktop sandbox screenshot cleanup failed',
        );
      }
    }
  }

  async click(x: number, y: number) {
    const startedAt = Date.now();
    this.log.info({ sandboxId: this.sandboxId, x, y }, 'Desktop sandbox click started');

    try {
      await this.sandbox.moveMouse(x, y);
      await this.sandbox.leftClick();
      this.log.info(
        { durationMs: durationSince(startedAt), sandboxId: this.sandboxId, x, y },
        'Desktop sandbox click complete',
      );
    } catch (err) {
      this.log.error(
        { durationMs: durationSince(startedAt), err, sandboxId: this.sandboxId, x, y },
        'Desktop sandbox click failed',
      );
      throw err;
    }
  }

  async type(text: string) {
    const startedAt = Date.now();
    this.log.info(
      { charCount: text.length, sandboxId: this.sandboxId },
      'Desktop sandbox type started',
    );

    try {
      await this.sandbox.write(text);
      this.log.info(
        { charCount: text.length, durationMs: durationSince(startedAt), sandboxId: this.sandboxId },
        'Desktop sandbox type complete',
      );
    } catch (err) {
      this.log.error(
        {
          charCount: text.length,
          durationMs: durationSince(startedAt),
          err,
          sandboxId: this.sandboxId,
        },
        'Desktop sandbox type failed',
      );
      throw err;
    }
  }

  async key(name: string) {
    const key = normalizeKey(name);
    const startedAt = Date.now();
    this.log.info({ key, sandboxId: this.sandboxId }, 'Desktop sandbox key started');

    try {
      await this.sandbox.press(key);
      this.log.info(
        { durationMs: durationSince(startedAt), key, sandboxId: this.sandboxId },
        'Desktop sandbox key complete',
      );
    } catch (err) {
      this.log.error(
        { durationMs: durationSince(startedAt), err, key, sandboxId: this.sandboxId },
        'Desktop sandbox key failed',
      );
      throw err;
    }
  }

  async kill() {
    const startedAt = Date.now();
    this.log.info({ sandboxId: this.sandboxId }, 'Desktop sandbox kill started');

    try {
      await this.sandbox.kill();
      this.log.info(
        { durationMs: durationSince(startedAt), sandboxId: this.sandboxId },
        'Desktop sandbox kill complete',
      );
    } catch (err) {
      this.log.error(
        { durationMs: durationSince(startedAt), err, sandboxId: this.sandboxId },
        'Desktop sandbox kill failed',
      );
      throw err;
    }
  }
}

export async function createDesktopSandbox(
  options: DesktopSandboxCreateOptions = {},
): Promise<DesktopSandboxHandle> {
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sdk = options.sdk ?? defaultDesktopSandboxFactory;
  const log = options.logger ?? logger;
  const startedAt = Date.now();

  log.info({ resolution, timeoutMs }, 'Desktop sandbox creation started');

  try {
    const sandbox = await sdk.create({ resolution, timeoutMs });
    const handle = new E2BDesktopSandboxHandle(sandbox, log);
    log.info(
      {
        durationMs: durationSince(startedAt),
        resolution,
        sandboxId: handle.sandboxId,
        timeoutMs,
      },
      'Desktop sandbox creation complete',
    );
    return handle;
  } catch (err) {
    log.error(
      { durationMs: durationSince(startedAt), err, resolution, timeoutMs },
      'Desktop sandbox creation failed',
    );
    throw err;
  }
}

export const desktopSandbox = {
  create: createDesktopSandbox,
};
