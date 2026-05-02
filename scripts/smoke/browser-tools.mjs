import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import {
  createBrowserDesktopSandbox,
  createBrowserSession,
} from "../../apps/api/src/execution/browserSession.ts";

const ROOT = new URL("../..", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const ARTIFACT_DIR = join(ROOT_PATH, "smoke-artifacts", "browser-tools");
const SCREENSHOT_PATH = join(ARTIFACT_DIR, "browser-tools-hn.png");

loadDotenv({ path: new URL(".env", ROOT) });

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

function assertLooksLikeHnTitle(text) {
  const value = text.trim();
  if (value.length < 5) {
    throw new Error(`Expected a non-empty Hacker News title, got: ${text}`);
  }

  if (/error|exception|traceback|selector not found/i.test(value)) {
    throw new Error(`Extracted text looked like an error, got: ${text}`);
  }

  if (!/[A-Za-z]/.test(value)) {
    throw new Error(`Expected title text with letters, got: ${text}`);
  }
}

if (!process.env.E2B_API_KEY) {
  throw new Error("smoke:browser-tools requires E2B_API_KEY in the root .env or environment");
}

let sandbox;
let session;

try {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  console.log("[browser-tools] creating E2B Desktop sandbox");
  sandbox = await createBrowserDesktopSandbox({
    resolution: [1280, 800],
    timeoutMs: 300_000,
  });
  console.log(`[browser-tools] sandbox created: ${sandbox.sandboxId ?? "unknown"}`);

  session = createBrowserSession({ sandbox });

  console.log("[browser-tools] navigating to https://news.ycombinator.com");
  const navigation = await session.navigate("https://news.ycombinator.com");
  writeFileSync(SCREENSHOT_PATH, navigation.screenshot);
  const screenshotSize = assertScreenshot(SCREENSHOT_PATH);
  console.log(`[browser-tools] saved screenshot ${SCREENSHOT_PATH} (${screenshotSize} bytes)`);
  console.log(`[browser-tools] page title: ${navigation.title}`);

  console.log("[browser-tools] waiting for .titleline > a");
  await session.waitForSelector(".titleline > a");

  console.log("[browser-tools] extracting first story title");
  const firstTitle = await session.extractText(".titleline > a");
  assertLooksLikeHnTitle(firstTitle);

  console.log("[browser-tools] PASS");
  console.log(`[browser-tools] first title: ${firstTitle.trim()}`);
} finally {
  if (session) {
    console.log("[browser-tools] destroying browser session");
    await session.destroy();
  }

  if (sandbox) {
    console.log("[browser-tools] killing sandbox");
    await sandbox.kill();
  }
}
