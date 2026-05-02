import process from "node:process";
import { config as loadDotenv } from "dotenv";
import {
  createBrowserDesktopSandbox,
} from "../../apps/api/src/execution/browserSession.ts";
import { createBrowserToolDefinitions } from "../../apps/api/src/agent/browserTools.ts";
import { subscribeToTask } from "../../apps/api/src/lib/eventBus.ts";
import { resetBrowserScreenshotThrottleForTest } from "../../apps/api/src/lib/browserScreenshotEvents.ts";

const ROOT = new URL("../..", import.meta.url);

loadDotenv({ path: new URL(".env", ROOT) });

if (!process.env.E2B_API_KEY) {
  throw new Error("smoke:screenshot-stream requires E2B_API_KEY in the root .env or environment");
}

function tool(name) {
  const definition = createBrowserToolDefinitions().find((item) => item.name === name);
  if (!definition) throw new Error(`Missing browser tool ${name}`);
  return definition;
}

function assertPngBase64(event) {
  const image = Buffer.from(event.imageBase64, "base64");
  const magic = image.subarray(0, 8).toString("hex");
  if (magic !== "89504e470d0a1a0a") {
    throw new Error(`Expected PNG magic bytes, got ${magic}`);
  }
  if (event.imageBase64.length <= 1000) {
    throw new Error(`Expected real screenshot base64 length > 1000, got ${event.imageBase64.length}`);
  }
}

const taskId = `smoke-screenshot-${Date.now()}`;
const events = [];
const unsubscribe = subscribeToTask(taskId, (event) => events.push(event));
let sandbox;
let context;

try {
  console.log("[screenshot-stream] creating E2B Desktop sandbox");
  sandbox = await createBrowserDesktopSandbox({
    resolution: [1280, 800],
    timeoutMs: 300_000,
  });
  console.log(`[screenshot-stream] sandbox created: ${sandbox.sandboxId ?? "unknown"}`);

  context = { sandbox, taskId };
  console.log("[screenshot-stream] navigating to https://news.ycombinator.com");
  await tool("browser_navigate").implementation({ url: "https://news.ycombinator.com" }, context);

  console.log("[screenshot-stream] clicking first HN story");
  await tool("browser_click").implementation({ selector: ".titleline > a", timeoutMs: 30_000 }, context);

  await new Promise((resolve) => setTimeout(resolve, 2_000));

  const screenshots = events.filter((event) => event.type === "browser_screenshot");
  if (screenshots.length < 2) {
    throw new Error(`Expected at least 2 browser_screenshot events, saw ${screenshots.length}`);
  }

  for (const event of screenshots) assertPngBase64(event);

  console.log("[screenshot-stream] PASS");
  console.log(`[screenshot-stream] screenshots: ${screenshots.length}`);
  console.log(
    `[screenshot-stream] byteCounts: ${screenshots.map((event) => event.byteCount).join(", ")}`,
  );
} finally {
  unsubscribe();
  resetBrowserScreenshotThrottleForTest(taskId);

  if (sandbox) {
    await context?.browserSession?.destroy?.();
    console.log("[screenshot-stream] killing sandbox");
    await sandbox.kill();
  }
}
