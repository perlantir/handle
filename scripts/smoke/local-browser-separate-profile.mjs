import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalBackend } from '../../apps/api/src/execution/localBackend.ts';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const artifactDir = join(repoRoot, 'smoke-artifacts', 'local-browser');
const screenshotPath = join(artifactDir, 'local-browser-separate-profile.png');
const taskId = `smoke-local-browser-${Date.now()}`;
const workspaceDir = join(homedir(), 'Documents', 'Handle', 'workspaces', taskId);

function assertPng(buffer, label) {
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  if (!buffer.subarray(0, 4).equals(magic)) {
    throw new Error(`${label} is not a PNG`);
  }
  if (buffer.byteLength < 1000) {
    throw new Error(`${label} is too small: ${buffer.byteLength} bytes`);
  }
}

const backend = new LocalBackend(taskId, {
  browserMode: 'separate-profile',
  workspaceDir,
});

try {
  await mkdir(artifactDir, { recursive: true });
  console.log('[local-browser-separate-profile] initializing backend');
  await backend.initialize();

  console.log('[local-browser-separate-profile] launching separate Chrome profile');
  const browser = await backend.browserSession();

  console.log('[local-browser-separate-profile] navigating to https://news.ycombinator.com');
  const navigateResult = await browser.navigate('https://news.ycombinator.com', { timeoutMs: 45_000 });
  assertPng(navigateResult.screenshot, 'navigate screenshot');
  await writeFile(screenshotPath, navigateResult.screenshot);

  await browser.waitForSelector('.titleline > a', { timeoutMs: 30_000 });
  const firstTitle = (await browser.extractText('.titleline > a')).trim();
  if (firstTitle.length < 2) {
    throw new Error('First Hacker News title was empty');
  }

  const screenshot = await browser.screenshot();
  assertPng(screenshot, 'current screenshot');

  console.log(`[local-browser-separate-profile] PASS first title: ${firstTitle}`);
  console.log(`[local-browser-separate-profile] screenshot: ${screenshotPath} (${navigateResult.screenshot.byteLength} bytes)`);
} finally {
  await backend.shutdown();
}
