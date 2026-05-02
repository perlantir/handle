import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { createLocalBrowserSession, defaultLocalBrowserProfileDir } from './localBrowser';
import type { BrowserSessionLogger } from './browserSession';

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
  const context = {
    browser: vi.fn(() => ({ close: vi.fn(async () => undefined) })),
    close: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    pages: vi.fn(() => [page]),
  };
  const chromium = {
    launchPersistentContext: vi.fn(async () => context),
  };

  return { chromium, context };
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
});
