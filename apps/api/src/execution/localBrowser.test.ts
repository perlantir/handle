import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLocalBrowserSession, defaultLocalBrowserProfileDir } from './localBrowser';
import type { BrowserSessionLogger } from './browserSession';
import { SafetyGovernor } from './safetyGovernor';

function noopLogger(): BrowserSessionLogger {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function fakePlaywrightPage(options: { html?: string; text?: string } = {}) {
  const screenshot = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  let locator: any;
  const page: any = {
    bringToFront: vi.fn(async () => undefined),
    content: vi.fn(async () => options.html ?? '<html><body>Safe page</body></html>'),
    currentUrl: 'about:blank',
    goBack: vi.fn(async () => undefined),
    goto: vi.fn(async (url: string) => {
      page.currentUrl = url;
    }),
    keyboard: { type: vi.fn(async () => undefined) },
    locator: vi.fn(() => locator),
    mouse: { wheel: vi.fn(async () => undefined) },
    screenshot: vi.fn(async () => screenshot),
    title: vi.fn(async () => 'Handle Browser Test'),
    url: vi.fn(() => page.currentUrl),
  };
  locator = {
    click: vi.fn(async () => undefined),
    first: vi.fn(() => locator),
    innerText: vi.fn(async () => options.text ?? 'First story'),
    waitFor: vi.fn(async () => undefined),
  };

  return { locator, page, screenshot };
}

function fakeChromium(page: ReturnType<typeof fakePlaywrightPage>['page']) {
  let context: any;
  const browser: any = {
    close: vi.fn(async () => undefined),
    contexts: vi.fn(() => [context]),
  };
  context = {
    browser: vi.fn(() => browser),
    close: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    pages: vi.fn(() => [page]),
  };
  const chromium = {
    connectOverCDP: vi.fn(async () => browser),
    launchPersistentContext: vi.fn(async () => context),
  };

  return { browser, chromium, context };
}

describe('LocalBrowserSession separate profile mode', () => {
  it('launches headed Chrome with the Handle profile directory', async () => {
    const { page, screenshot } = fakePlaywrightPage();
    const { chromium, context } = fakeChromium(page);
    const logger = noopLogger();
    const session = await createLocalBrowserSession({
      chromium: chromium as never,
      logger,
      taskId: 'task-local-browser-test',
    });

    const result = await session.navigate('https://news.ycombinator.com');

    expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
      defaultLocalBrowserProfileDir(),
      expect.objectContaining({
        channel: 'chrome',
        headless: false,
        viewport: { height: 800, width: 1280 },
      }),
    );
    expect(result).toEqual({
      screenshot,
      title: 'Handle Browser Test',
      url: 'https://news.ycombinator.com',
    });

    await session.destroy();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('uses the Phase 3 risky browser approval flow before destructive clicks', async () => {
    const { page } = fakePlaywrightPage({
      html: '<html><body><button>Delete Account</button></body></html>',
    });
    const { chromium } = fakeChromium(page);
    const requestApproval = vi.fn(async () => 'approved' as const);
    const session = await createLocalBrowserSession({
      approval: {
        requestApproval,
        taskId: 'task-risky-click-test',
      },
      chromium: chromium as never,
      logger: noopLogger(),
      taskId: 'task-risky-click-test',
    });

    await session.click('button');

    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          reason: 'Click appears to trigger destructive action: Delete Account',
          target: 'button',
          type: 'risky_browser_action',
        }),
        taskId: 'task-risky-click-test',
      }),
    );
  });

  it('blocks risky browser actions when approval is denied', async () => {
    const { page } = fakePlaywrightPage({
      html: '<html><body><button>Delete Account</button></body></html>',
    });
    const { chromium } = fakeChromium(page);
    const session = await createLocalBrowserSession({
      approval: {
        requestApproval: vi.fn(async () => 'denied' as const),
        taskId: 'task-risky-deny-test',
      },
      chromium: chromium as never,
      logger: noopLogger(),
      taskId: 'task-risky-deny-test',
    });

    await expect(session.click('button')).rejects.toThrow('Risky browser action denied');
  });

  it('requires approval and writes an audit log before connecting to actual Chrome', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handle-local-browser-actual-'));
    const auditLogPath = join(dir, 'audit.log');
    const { page } = fakePlaywrightPage();
    const { browser, chromium } = fakeChromium(page);
    const requestApproval = vi.fn(async () => 'approved' as const);
    const session = await createLocalBrowserSession({
      chromium: chromium as never,
      logger: noopLogger(),
      mode: 'actual-chrome',
      requestApproval,
      safetyGovernor: new SafetyGovernor({
        auditLogPath,
        taskId: 'task-actual-chrome-test',
        workspaceDir: dir,
      }),
      taskId: 'task-actual-chrome-test',
    });

    const screenshot = await session.screenshot();

    expect(screenshot.byteLength).toBeGreaterThan(0);
    expect(requestApproval).toHaveBeenCalledWith(
      'task-actual-chrome-test',
      expect.objectContaining({
        reason: expect.stringContaining('Agent will see your open tabs'),
        type: 'browser_use_actual_chrome',
      }),
      { timeoutMs: 300_000 },
    );
    expect(chromium.connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9222', { timeout: 10_000 });

    await session.destroy();
    expect(browser.close).toHaveBeenCalledTimes(1);

    const entries = (await readFile(auditLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(entries).toContainEqual(
      expect.objectContaining({
        action: 'browser_use_actual_chrome',
        approved: true,
        decision: 'approve',
        target: 'http://127.0.0.1:9222',
      }),
    );

    await rm(dir, { force: true, recursive: true });
  });

  it('does not carry actual Chrome approval across sessions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handle-local-browser-repeat-'));
    const { page } = fakePlaywrightPage();
    const { chromium } = fakeChromium(page);
    const requestApproval = vi.fn(async () => 'approved' as const);
    const safetyGovernor = new SafetyGovernor({
      auditLogPath: join(dir, 'audit.log'),
      taskId: 'task-repeat-approval-test',
      workspaceDir: dir,
    });

    for (let index = 0; index < 2; index += 1) {
      const session = await createLocalBrowserSession({
        chromium: chromium as never,
        logger: noopLogger(),
        mode: 'actual-chrome',
        requestApproval,
        safetyGovernor,
        taskId: 'task-repeat-approval-test',
      });
      await session.screenshot();
      await session.destroy();
    }

    expect(requestApproval).toHaveBeenCalledTimes(2);
    await rm(dir, { force: true, recursive: true });
  });

  it('denies actual Chrome connection when approval is denied and still writes audit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handle-local-browser-deny-'));
    const auditLogPath = join(dir, 'audit.log');
    const { page } = fakePlaywrightPage();
    const { chromium } = fakeChromium(page);
    const session = await createLocalBrowserSession({
      chromium: chromium as never,
      logger: noopLogger(),
      mode: 'actual-chrome',
      requestApproval: vi.fn(async () => 'denied' as const),
      safetyGovernor: new SafetyGovernor({
        auditLogPath,
        taskId: 'task-actual-chrome-deny-test',
        workspaceDir: dir,
      }),
      taskId: 'task-actual-chrome-deny-test',
    });

    await expect(session.screenshot()).rejects.toThrow('User denied actual Chrome connection');
    expect(chromium.connectOverCDP).not.toHaveBeenCalled();
    const entries = (await readFile(auditLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(entries[0]).toEqual(
      expect.objectContaining({
        action: 'browser_use_actual_chrome',
        approved: false,
        decision: 'approve',
      }),
    );

    await rm(dir, { force: true, recursive: true });
  });
});
