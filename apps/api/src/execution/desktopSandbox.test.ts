import { describe, expect, it, vi } from 'vitest';
import { createDesktopSandbox, type DesktopSandboxLike } from './desktopSandbox';

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
  };
}

function createMockSandbox(overrides: Partial<DesktopSandboxLike> = {}): DesktopSandboxLike {
  return {
    commands: {
      run: vi.fn(async () => ({ exitCode: 0, stderr: '', stdout: '' })),
    },
    files: {
      read: vi.fn(async () => Uint8Array.from([137, 80, 78, 71])),
      remove: vi.fn(async () => {}),
    },
    async kill() {},
    async leftClick() {},
    async moveMouse() {},
    async press() {},
    sandboxId: 'desktop-test',
    async screenshot() {
      return Uint8Array.from([137, 80, 78, 71]);
    },
    async write() {},
    ...overrides,
  };
}

describe('desktop sandbox wrapper', () => {
  it('creates an E2B Desktop sandbox with default resolution and logs lifecycle', async () => {
    const logger = createLogger();
    const sandbox = createMockSandbox();
    const sdk = {
      create: vi.fn(async () => sandbox),
    };

    const handle = await createDesktopSandbox({ logger, sdk });

    expect(sdk.create).toHaveBeenCalledWith({
      resolution: [1024, 768],
      timeoutMs: 300_000,
    });
    expect(handle.sandboxId).toBe('desktop-test');
    expect(logger.info).toHaveBeenCalledWith(
      { resolution: [1024, 768], timeoutMs: 300_000 },
      'Desktop sandbox creation started',
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'desktop-test' }),
      'Desktop sandbox creation complete',
    );
  });

  it('exposes screenshot, click, type, key, and kill operations', async () => {
    const logger = createLogger();
    const sandbox = createMockSandbox({
      commands: {
        run: vi.fn(async () => ({ exitCode: 0, stderr: '', stdout: '' })),
      },
      files: {
        read: vi.fn(async () => Uint8Array.from([1, 2, 3])),
        remove: vi.fn(async () => {}),
      },
      kill: vi.fn(async () => {}),
      leftClick: vi.fn(async () => {}),
      moveMouse: vi.fn(async () => {}),
      press: vi.fn(async () => {}),
      screenshot: vi.fn(async () => Uint8Array.from([9])),
      write: vi.fn(async () => {}),
    });
    const sdk = { create: vi.fn(async () => sandbox) };

    const handle = await createDesktopSandbox({ logger, sdk });
    const image = await handle.screenshot();
    await handle.click(100, 120);
    await handle.type('hello');
    await handle.key('Enter');
    await handle.kill();

    expect(image.byteLength).toBe(3);
    expect(sandbox.commands?.run).toHaveBeenCalledWith(expect.stringContaining('scrot --pointer'));
    expect(sandbox.files?.read).toHaveBeenCalledWith(expect.stringContaining('/tmp/handle-screenshot-'), {
      format: 'bytes',
    });
    expect(sandbox.files?.remove).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/handle-screenshot-'),
    );
    expect(sandbox.screenshot).not.toHaveBeenCalled();
    expect(sandbox.moveMouse).toHaveBeenCalledWith(100, 120);
    expect(sandbox.leftClick).toHaveBeenCalledOnce();
    expect(sandbox.write).toHaveBeenCalledWith('hello');
    expect(sandbox.press).toHaveBeenCalledWith('enter');
    expect(sandbox.kill).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ byteCount: 3, sandboxId: 'desktop-test' }),
      'Desktop sandbox screenshot complete',
    );
  });

  it('logs and rethrows operation failures with stack-bearing error objects', async () => {
    const logger = createLogger();
    const err = new Error('screenshot failed');
    const sandbox = createMockSandbox({
      files: {
        read: vi.fn(async () => {
          throw err;
        }),
        remove: vi.fn(async () => {}),
      },
    });
    const sdk = { create: vi.fn(async () => sandbox) };

    const handle = await createDesktopSandbox({ logger, sdk });
    await expect(handle.screenshot()).rejects.toThrow('screenshot failed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err, sandboxId: 'desktop-test' }),
      'Desktop sandbox screenshot failed',
    );
  });

  it('logs and rethrows creation failures', async () => {
    const logger = createLogger();
    const err = new Error('create failed');
    const sdk = {
      create: vi.fn(async () => {
        throw err;
      }),
    };

    await expect(createDesktopSandbox({ logger, sdk })).rejects.toThrow('create failed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err, resolution: [1024, 768], timeoutMs: 300_000 }),
      'Desktop sandbox creation failed',
    );
  });
});
