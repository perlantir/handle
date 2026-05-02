import { Buffer } from 'node:buffer';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LocalBackend } from '../../apps/api/src/execution/localBackend.ts';

const CDP_ENDPOINT = process.env.HANDLE_ACTUAL_CHROME_CDP_ENDPOINT ?? 'http://127.0.0.1:9222';
const taskId = `smoke-local-actual-chrome-${Date.now()}`;
const workspaceDir = join(homedir(), 'Documents', 'Handle', 'workspaces', taskId);

async function cdpIsReachable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${CDP_ENDPOINT.replace(/\/$/, '')}/json/version`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function assertPng(buffer, label) {
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  if (!buffer.subarray(0, 4).equals(magic)) {
    throw new Error(`${label} is not a PNG`);
  }
  if (buffer.byteLength < 1000) {
    throw new Error(`${label} is too small: ${buffer.byteLength} bytes`);
  }
}

if (!(await cdpIsReachable())) {
  console.log(
    `[local-browser-actual-chrome] SKIP ${CDP_ENDPOINT} is not reachable. Start Chrome yourself with --remote-debugging-port=9222 to run this smoke.`,
  );
  process.exit(0);
}

const approvals = [];
const backend = new LocalBackend(taskId, {
  browserMode: 'actual-chrome',
  requestApproval: async (_taskId, request) => {
    approvals.push(request);
    console.log(`[local-browser-actual-chrome] auto-approving ${request.type}: ${request.reason}`);
    return 'approved';
  },
  workspaceDir,
});

try {
  await backend.initialize();
  const browser = await backend.browserSession();
  const screenshot = await browser.screenshot();
  assertPng(screenshot, 'actual Chrome screenshot');

  if (!approvals.some((request) => request.type === 'browser_use_actual_chrome')) {
    throw new Error('Actual Chrome connection did not request approval');
  }

  console.log(
    `[local-browser-actual-chrome] PASS captured current Chrome screenshot (${screenshot.byteLength} bytes) after approval`,
  );
} finally {
  await backend.shutdown();
}
