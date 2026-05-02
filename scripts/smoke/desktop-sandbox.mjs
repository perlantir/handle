import { Buffer } from 'node:buffer';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { config as loadDotenv } from 'dotenv';
import { createDesktopSandbox } from '../../apps/api/src/execution/desktopSandbox.ts';

const ROOT = new URL('../..', import.meta.url);
const FIRST_SCREENSHOT = '/tmp/desktop-sandbox-test.png';
const SECOND_SCREENSHOT = '/tmp/desktop-sandbox-test-after-click.png';

loadDotenv({ path: new URL('.env', ROOT) });

function assertScreenshot(path) {
  if (!existsSync(path)) {
    throw new Error(`${path} was not created`);
  }

  const size = statSync(path).size;
  if (size <= 0) {
    throw new Error(`${path} is empty`);
  }

  return size;
}

function assertDifferent(before, after) {
  if (Buffer.compare(before, after) === 0) {
    throw new Error('Second desktop screenshot matched the first screenshot after click');
  }
}

if (!process.env.E2B_API_KEY) {
  throw new Error('smoke:desktop-sandbox requires E2B_API_KEY in the root .env or environment');
}

let sandbox;

try {
  console.log('[desktop-sandbox] creating E2B Desktop sandbox');
  sandbox = await createDesktopSandbox();

  console.log('[desktop-sandbox] taking initial screenshot');
  const first = await sandbox.screenshot();
  writeFileSync(FIRST_SCREENSHOT, first);
  const firstSize = assertScreenshot(FIRST_SCREENSHOT);
  console.log(`[desktop-sandbox] saved ${FIRST_SCREENSHOT} (${firstSize} bytes)`);

  console.log('[desktop-sandbox] clicking coordinate 100,100');
  await sandbox.click(100, 100);

  console.log('[desktop-sandbox] taking screenshot after click');
  const second = await sandbox.screenshot();
  writeFileSync(SECOND_SCREENSHOT, second);
  const secondSize = assertScreenshot(SECOND_SCREENSHOT);
  assertDifferent(first, second);
  console.log(`[desktop-sandbox] saved ${SECOND_SCREENSHOT} (${secondSize} bytes)`);

  console.log('[desktop-sandbox] PASS');
} finally {
  if (sandbox) {
    console.log('[desktop-sandbox] killing sandbox');
    await sandbox.kill();
  }
}
