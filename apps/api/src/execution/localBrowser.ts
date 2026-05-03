import type { ApprovalPayload } from '@handle/shared';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, BrowserType, Page } from 'playwright';
import { logger } from '../lib/logger';
import type { ApprovalDecision } from '../approvals/approvalWaiter';
import {
  classifyBrowserAction,
  hostMatchesTrustedDomains,
  type BrowserPageContext,
  type RiskClassification,
} from './browserRiskClassifier';
import type {
  BrowserActionApproval,
  BrowserActionApprovalRequest,
  BrowserActionResult,
  BrowserNavigateResult,
  BrowserSelectorOptions,
  BrowserSession,
  BrowserSessionLogger,
  BrowserTimeoutOptions,
} from './browserSession';
import type { SafetyGovernor } from './safetyGovernor';

export type LocalBrowserMode = 'separate-profile' | 'actual-chrome';

export type ActualChromeApprovalRequester = (
  taskId: string,
  request: ApprovalPayload,
  options?: { timeoutMs?: number },
) => Promise<ApprovalDecision>;

export interface LocalBrowserSessionOptions {
  approval?: BrowserActionApproval;
  approvalTimeoutMs?: number;
  actualChromeEndpoint?: string;
  browserChannel?: string;
  chromium?: Pick<BrowserType, 'connectOverCDP' | 'launchPersistentContext'>;
  logger?: BrowserSessionLogger;
  mode?: LocalBrowserMode;
  profileDir?: string;
  requestApproval?: ActualChromeApprovalRequester;
  safetyGovernor?: SafetyGovernor;
  testActualChromeConnection?: typeof testActualChromeConnection;
  taskId: string;
  userAgent?: string;
  viewport?: { height: number; width: number };
}

interface ActionSummary {
  screenshot?: Buffer;
  text?: string;
  title?: string;
  url?: string;
}

const DEFAULT_VIEWPORT = { height: 800, width: 1280 };
export const DEFAULT_ACTUAL_CHROME_ENDPOINT = 'http://127.0.0.1:9222';
const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ACTUAL_CHROME_REASON =
  'Connect to your actual Chrome? Agent will see your open tabs, logged-in sessions, saved passwords visible to extensions, and browsing history.';

export function defaultLocalBrowserProfileDir() {
  return join(homedir(), '.config', 'handle', 'chrome-profile');
}

export interface ActualChromeConnectionResult {
  connected: boolean;
  detail: string | null;
}

function actualChromeSetupHint(endpoint: string) {
  return `Couldn't connect to Chrome at ${endpoint}. Verify Chrome was started with --remote-debugging-port=9222 and that port 9222 is reachable.`;
}

function errorMessage(err: unknown) {
  if (err instanceof Error) {
    if (err.cause instanceof Error) return err.cause.message;
    if (typeof err.cause === 'string') return err.cause;
    return err.message;
  }
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

export async function testActualChromeConnection(
  endpoint = DEFAULT_ACTUAL_CHROME_ENDPOINT,
  fetchImpl: typeof fetch = fetch,
): Promise<ActualChromeConnectionResult> {
  const normalizedEndpoint = endpoint.replace(/\/$/, '');
  const url = `${normalizedEndpoint}/json/version`;
  const startedAt = Date.now();

  logger.info({ endpoint: normalizedEndpoint, url }, 'Actual Chrome connection test started');

  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_500),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const detail = `Chrome debug endpoint returned HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`;
      logger.warn({ detail, durationMs: durationSince(startedAt), endpoint: normalizedEndpoint, status: response.status }, 'Actual Chrome connection test failed');
      return { connected: false, detail };
    }

    const body = (await response.json().catch(() => null)) as {
      Browser?: string;
      webSocketDebuggerUrl?: string;
    } | null;

    if (!body?.webSocketDebuggerUrl) {
      const detail = 'Chrome debug endpoint is reachable but did not expose webSocketDebuggerUrl.';
      logger.warn({ body, detail, durationMs: durationSince(startedAt), endpoint: normalizedEndpoint }, 'Actual Chrome connection test failed');
      return { connected: false, detail };
    }

    const detail = body.Browser ?? 'Chrome debug endpoint reachable';
    logger.info({ detail, durationMs: durationSince(startedAt), endpoint: normalizedEndpoint }, 'Actual Chrome connection test complete');
    return { connected: true, detail };
  } catch (err) {
    const detail = `${actualChromeSetupHint(normalizedEndpoint)} ${errorMessage(err)}`;
    logger.warn({ detail, durationMs: durationSince(startedAt), endpoint: normalizedEndpoint, err }, 'Actual Chrome connection test failed');
    return { connected: false, detail };
  }
}

function durationSince(startedAt: number) {
  return Date.now() - startedAt;
}

function classifyOutput(action: string, summary: ActionSummary) {
  if (summary.screenshot && summary.screenshot.byteLength > 0) return 'visual_state_captured';
  if (typeof summary.text === 'string') return summary.text.length > 0 ? 'text_extracted' : 'empty_text';
  if (action === 'click') return 'click_executed';
  if (action === 'type') return 'type_executed';
  if (action === 'waitForSelector') return 'selector_found';
  return 'action_executed';
}

export class LocalBrowserSession implements BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private destroyed = false;
  private page: Page | null = null;
  private ready = false;
  private actualChromeApprovedForSession = false;

  private readonly browserChannel: string;
  private readonly actualChromeEndpoint: string;
  private readonly approvalTimeoutMs: number;
  private readonly chromium: Pick<BrowserType, 'connectOverCDP' | 'launchPersistentContext'>;
  private readonly logger: BrowserSessionLogger;
  private readonly mode: LocalBrowserMode;
  private readonly profileDir: string;
  private readonly taskId: string;
  private readonly userAgent: string;
  private readonly viewport: { height: number; width: number };

  constructor(private readonly options: LocalBrowserSessionOptions) {
    this.browserChannel = options.browserChannel ?? 'chrome';
    this.actualChromeEndpoint = options.actualChromeEndpoint ?? DEFAULT_ACTUAL_CHROME_ENDPOINT;
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    this.chromium = options.chromium ?? chromium;
    this.logger = options.logger ?? logger;
    this.mode = options.mode ?? 'separate-profile';
    this.profileDir = options.profileDir ?? defaultLocalBrowserProfileDir();
    this.taskId = options.taskId;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.viewport = options.viewport ?? DEFAULT_VIEWPORT;
  }

  async navigate(url: string, options: BrowserTimeoutOptions = {}): Promise<BrowserNavigateResult> {
    const result = await this.runAction(
      'navigate',
      { timeoutMs: options.timeoutMs, url },
      { idempotent: true, target: url },
      async (page) => {
        await page.goto(url, {
          timeout: options.timeoutMs ?? 30_000,
          waitUntil: 'domcontentloaded',
        });
        return this.pageState(page, { includeScreenshot: true });
      },
    );

    return {
      screenshot: result.screenshot ?? Buffer.alloc(0),
      title: result.title ?? '',
      url: result.url ?? '',
    };
  }

  async click(selector: string, options: BrowserSelectorOptions = {}): Promise<BrowserActionResult> {
    const result = await this.runAction(
      'click',
      { includeScreenshot: options.includeScreenshot, selector, timeoutMs: options.timeoutMs },
      { idempotent: false, target: selector },
      async (page) => {
        await page.locator(selector).first().click({ timeout: options.timeoutMs ?? 30_000 });
        return this.pageState(page, { includeScreenshot: Boolean(options.includeScreenshot) });
      },
    );
    return this.browserActionResult(result);
  }

  async type(selector: string, text: string, options: BrowserSelectorOptions = {}): Promise<BrowserActionResult> {
    const result = await this.runAction(
      'type',
      { includeScreenshot: options.includeScreenshot, selector, text, timeoutMs: options.timeoutMs },
      { idempotent: false, target: selector },
      async (page) => {
        await page.locator(selector).first().click({ timeout: options.timeoutMs ?? 30_000 });
        await page.keyboard.type(text);
        return this.pageState(page, { includeScreenshot: Boolean(options.includeScreenshot) });
      },
    );
    return this.browserActionResult(result);
  }

  async extractText(selector?: string): Promise<string> {
    const result = await this.runAction(
      'extractText',
      { selector },
      { idempotent: true, target: selector ?? 'body' },
      async (page) => {
        const text = await page.locator(selector ?? 'body').first().innerText({ timeout: 30_000 });
        return { text, ...(await this.pageState(page, { includeScreenshot: false })) };
      },
    );
    return result.text ?? '';
  }

  async screenshot(): Promise<Buffer> {
    const result = await this.runAction(
      'screenshot',
      {},
      { idempotent: true, target: 'viewport' },
      async (page) => {
        const screenshot = await page.screenshot({ type: 'png' });
        return { screenshot, ...(await this.pageState(page, { includeScreenshot: false })) };
      },
    );
    return result.screenshot ?? Buffer.alloc(0);
  }

  async goBack(options: BrowserTimeoutOptions = {}): Promise<BrowserActionResult> {
    const result = await this.runAction(
      'goBack',
      { timeoutMs: options.timeoutMs },
      { idempotent: true, target: 'history' },
      async (page) => {
        await page.goBack({
          timeout: options.timeoutMs ?? 30_000,
          waitUntil: 'domcontentloaded',
        });
        return this.pageState(page, { includeScreenshot: true });
      },
    );
    return this.browserActionResult(result);
  }

  async scroll(direction: 'up' | 'down', amount = 600): Promise<BrowserActionResult> {
    const result = await this.runAction(
      'scroll',
      { amount, direction },
      { idempotent: true, target: direction },
      async (page) => {
        const deltaY = direction === 'up' ? -amount : amount;
        await page.mouse.wheel(0, deltaY);
        return this.pageState(page, { includeScreenshot: true });
      },
    );
    return this.browserActionResult(result);
  }

  async waitForSelector(selector: string, options: BrowserSelectorOptions = {}): Promise<BrowserActionResult> {
    const result = await this.runAction(
      'waitForSelector',
      { includeScreenshot: options.includeScreenshot, selector, timeoutMs: options.timeoutMs },
      { idempotent: true, target: selector },
      async (page) => {
        await page.locator(selector).first().waitFor({ timeout: options.timeoutMs ?? 30_000 });
        return this.pageState(page, { includeScreenshot: Boolean(options.includeScreenshot) });
      },
    );
    return this.browserActionResult(result);
  }

  async destroy() {
    if (this.destroyed) return;

    const startedAt = Date.now();
    this.destroyed = true;
    this.logger.info(
      { mode: this.mode, profileDir: this.profileDir, taskId: this.taskId },
      'Local browser session destroy started',
    );

    try {
      if (this.mode === 'actual-chrome') {
        await this.browser?.close({ reason: 'Handle actual Chrome session disconnected' });
      } else {
        await this.context?.close();
      }
      this.browser = null;
      this.context = null;
      this.page = null;
      this.ready = false;
      this.logger.info(
        { durationMs: durationSince(startedAt), mode: this.mode, taskId: this.taskId },
        'Local browser session destroy complete',
      );
    } catch (err) {
      this.logger.error(
        { durationMs: durationSince(startedAt), err, mode: this.mode, taskId: this.taskId },
        'Local browser session destroy failed',
      );
      throw err;
    }
  }

  private async ensureReady() {
    if (this.destroyed) {
      throw new Error('Local browser session has already been destroyed');
    }
    if (this.ready && this.page) return this.page;

    const startedAt = Date.now();
    this.logger.info(
      {
        mode: this.mode,
        profileDir: this.profileDir,
        taskId: this.taskId,
        viewport: this.viewport,
      },
      'Local browser session creation started',
    );

    if (this.mode === 'actual-chrome') {
      await this.requireActualChromeApproval();
      const connection = await (this.options.testActualChromeConnection ?? testActualChromeConnection)(
        this.actualChromeEndpoint,
      );
      if (!connection.connected) {
        throw new Error(connection.detail ?? actualChromeSetupHint(this.actualChromeEndpoint));
      }
      try {
        this.browser = await this.chromium.connectOverCDP(this.actualChromeEndpoint, { timeout: 10_000 });
        this.context = this.browser.contexts()[0] ?? null;
        if (!this.context) {
          throw new Error('Actual Chrome CDP connection exposed no browser contexts');
        }
      } catch (err) {
        throw new Error(`${actualChromeSetupHint(this.actualChromeEndpoint)} ${errorMessage(err)}`, { cause: err });
      }
    } else {
      await fs.mkdir(this.profileDir, { recursive: true });
      this.context = await this.chromium.launchPersistentContext(this.profileDir, {
        args: [`--window-size=${this.viewport.width},${this.viewport.height}`],
        channel: this.browserChannel,
        headless: false,
        userAgent: this.userAgent,
        viewport: this.viewport,
      });
      this.browser = this.context.browser();
    }
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    await this.page.bringToFront().catch(() => undefined);
    this.ready = true;

    this.logger.info(
      {
        browserChannel: this.browserChannel,
        cdpEndpoint: this.mode === 'actual-chrome' ? this.actualChromeEndpoint : undefined,
        durationMs: durationSince(startedAt),
        mode: this.mode,
        profileDir: this.profileDir,
        taskId: this.taskId,
      },
      'Local browser session creation complete',
    );
    return this.page;
  }

  private async runAction(
    action: string,
    args: Record<string, unknown>,
    options: { idempotent: boolean; target: string },
    execute: (page: Page) => Promise<ActionSummary>,
  ) {
    const startedAt = Date.now();
    this.logger.info(
      {
        action,
        mode: this.mode,
        target: options.target,
        taskId: this.taskId,
      },
      'Local browser action started',
    );

    try {
      await this.requireApprovalIfNeeded(action, args, options.target);
      const page = await this.ensureReady();
      const result = await execute(page);
      this.logActionComplete(action, options.target, startedAt, result);
      return result;
    } catch (err) {
      this.logger.error(
        {
          action,
          durationMs: durationSince(startedAt),
          err,
          idempotent: options.idempotent,
          mode: this.mode,
          target: options.target,
          taskId: this.taskId,
        },
        'Local browser action failed',
      );

      if (!options.idempotent || this.mode === 'actual-chrome') throw err;

      this.logger.warn?.(
        { action, mode: this.mode, target: options.target, taskId: this.taskId },
        'Retrying idempotent local browser action after session restart',
      );
      await this.restart();
      await this.requireApprovalIfNeeded(action, args, options.target);
      const page = await this.ensureReady();
      const result = await execute(page);
      this.logActionComplete(action, options.target, startedAt, result, true);
      return result;
    }
  }

  private async requireApprovalIfNeeded(action: string, args: Record<string, unknown>, target: string) {
    const approval = this.options.approval;
    if (!approval) return;

    const startedAt = Date.now();
    const pageContext = await this.pageContextForRisk(action, args, target);
    let classification = classifyBrowserAction(action, target, pageContext);
    const actionUrl = action === 'navigate' && typeof args.url === 'string' ? args.url : pageContext.url;

    if (
      classification.level === 'approve' &&
      hostMatchesTrustedDomains(actionUrl, approval.trustedDomains ?? [])
    ) {
      classification = {
        level: 'safe',
        reason: `Trusted domain allowed action that would otherwise require approval: ${classification.reason}`,
        ...(classification.matchedRule ? { matchedRule: classification.matchedRule } : {}),
      };
    }

    let approvalDecision: 'approved' | 'denied' | 'timeout' | undefined;
    let approvalRequested = false;

    try {
      if (classification.level === 'safe') return;

      if (classification.level === 'deny') {
        throw new Error(classification.reason);
      }

      approvalRequested = true;
      const request = {
        action: `browser_${action}`,
        reason: classification.reason,
        target,
        type: 'risky_browser_action',
      } satisfies ApprovalPayload;

      approvalDecision = await approval.requestApproval(
        this.browserActionApprovalRequest(classification, request, approval.taskId),
      );

      if (approvalDecision !== 'approved') {
        throw new Error(`Risky browser action ${approvalDecision}: ${classification.reason}`);
      }
    } finally {
      this.logger.info(
        {
          action,
          approvalDecision,
          approvalDurationMs: durationSince(startedAt),
          approvalRequested,
          classification,
          mode: this.mode,
          target,
          taskId: this.taskId,
        },
        'Local browser action risk classification complete',
      );
    }
  }

  private async requireActualChromeApproval() {
    if (this.actualChromeApprovedForSession) return;

    const requestApproval = this.options.requestApproval;
    const safetyGovernor = this.options.safetyGovernor;
    if (!requestApproval || !safetyGovernor) {
      throw new Error('Actual Chrome mode requires approval and audit-log configuration');
    }

    const startedAt = Date.now();
    let decision: ApprovalDecision | undefined;
    let approved = false;

    try {
      decision = await requestApproval(
        this.taskId,
        {
          reason: ACTUAL_CHROME_REASON,
          type: 'browser_use_actual_chrome',
        },
        { timeoutMs: this.approvalTimeoutMs },
      );
      approved = decision === 'approved';
    } finally {
      await safetyGovernor.writeAuditEntry({
        action: 'browser_use_actual_chrome',
        approvalDurationMs: durationSince(startedAt),
        approved,
        decision: 'approve',
        target: this.actualChromeEndpoint,
      });
    }

    if (!approved) {
      throw new Error(decision === 'timeout' ? 'Actual Chrome approval timed out' : 'User denied actual Chrome connection');
    }

    this.actualChromeApprovedForSession = true;
  }

  private browserActionApprovalRequest(
    classification: RiskClassification,
    request: ApprovalPayload,
    taskId: string,
  ): BrowserActionApprovalRequest {
    return {
      classification,
      request,
      taskId,
    };
  }

  private async pageContextForRisk(
    action: string,
    args: Record<string, unknown>,
    target: string,
  ): Promise<BrowserPageContext> {
    if (action === 'navigate') {
      return { html: '', url: typeof args.url === 'string' ? args.url : target };
    }

    const page = await this.ensureReady();
    return {
      html: await page.content(),
      url: page.url(),
    };
  }

  private async pageState(page: Page, { includeScreenshot }: { includeScreenshot: boolean }) {
    const result: ActionSummary = {
      title: await page.title(),
      url: page.url(),
    };

    if (includeScreenshot) {
      result.screenshot = await page.screenshot({ type: 'png' });
    }

    return result;
  }

  private browserActionResult(result: ActionSummary): BrowserActionResult {
    return {
      ...(result.screenshot ? { screenshot: result.screenshot } : {}),
      title: result.title ?? '',
      url: result.url ?? '',
    };
  }

  private logActionComplete(
    action: string,
    target: string,
    startedAt: number,
    summary: ActionSummary,
    retried = false,
  ) {
    this.logger.info(
      {
        action,
        durationMs: durationSince(startedAt),
        mode: this.mode,
        outputClassification: classifyOutput(action, summary),
        retried,
        screenshotByteCount: summary.screenshot?.byteLength ?? 0,
        target,
        taskId: this.taskId,
        textByteCount: Buffer.byteLength(summary.text ?? ''),
      },
      'Local browser action complete',
    );
  }

  private async restart() {
    this.destroyed = false;
    if (this.ready) {
      await this.destroy().catch(() => undefined);
    }
    this.destroyed = false;
    this.ready = false;
    await this.ensureReady();
  }
}

export async function createLocalBrowserSession(options: LocalBrowserSessionOptions): Promise<BrowserSession> {
  return new LocalBrowserSession(options);
}
