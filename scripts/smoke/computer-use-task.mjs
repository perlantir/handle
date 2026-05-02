import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { runAnthropicComputerUseTask } from "../../apps/api/src/providers/anthropicComputerUse.ts";

const ROOT = new URL("../..", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const ARTIFACT_DIR = join(ROOT_PATH, "smoke-artifacts", "computer-use");

loadDotenv({ path: new URL(".env", ROOT) });

const taskArg =
  process.argv
    .find((value) => value.startsWith("--task="))
    ?.slice("--task=".length) ?? "basic";

const TASKS = {
  basic: {
    maxIterations: 4,
    prompt:
      "Take a screenshot of the current desktop. Tell me what you see in exactly three sentences.",
    validate(text) {
      const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      const lower = text.toLowerCase();
      const hasVisualKeyword = ["desktop", "screen", "panel", "empty", "blank"].some(
        (keyword) => lower.includes(keyword),
      );

      if (sentences.length !== 3) {
        throw new Error(`Expected exactly 3 sentences, got ${sentences.length}: ${text}`);
      }

      if (!hasVisualKeyword) {
        throw new Error(
          `Expected visual desktop wording (desktop/screen/panel/empty/blank), got: ${text}`,
        );
      }
    },
  },
  firefox: {
    maxIterations: 12,
    prompt:
      "Using only the computer tool, open Firefox in the desktop sandbox, navigate to https://news.ycombinator.com, take a screenshot, and return the title of the first story. If bash or text editor tools are offered, do not use them.",
    validate(text) {
      if (text.trim().length < 5) {
        throw new Error(`Expected a non-empty Firefox/Hacker News result, got: ${text}`);
      }
    },
  },
};

if (!Object.hasOwn(TASKS, taskArg)) {
  throw new Error(`Unknown --task=${taskArg}. Expected one of: ${Object.keys(TASKS).join(", ")}`);
}

const task = TASKS[taskArg];
let screenshotCount = 0;

mkdirSync(ARTIFACT_DIR, { recursive: true });

console.log(`[computer-use] running ${taskArg} task`);
console.log(`[computer-use] screenshots will be saved under ${ARTIFACT_DIR}`);
console.log(
  "[computer-use] expected step-2 behavior: bash_20250124 and text_editor_20250728 return explicit unsupported tool_result errors if Claude tries them.",
);

const result = await runAnthropicComputerUseTask({
  maxIterations: task.maxIterations,
  onScreenshot({ action, image, iteration }) {
    screenshotCount += 1;
    const path = join(
      ARTIFACT_DIR,
      `${taskArg}-${String(screenshotCount).padStart(2, "0")}-iteration-${iteration}-${action}.png`,
    );
    writeFileSync(path, image);
    console.log(`[computer-use] saved screenshot ${path} (${image.byteLength} bytes)`);
  },
  prompt: task.prompt,
  taskLabel: `smoke:${taskArg}`,
});

if (result.screenshots.length < 1) {
  throw new Error("Expected at least one screenshot tool result");
}

task.validate(result.finalText);

console.log(`[computer-use] PASS ${taskArg}`);
console.log(`[computer-use] iterations: ${result.iterations}`);
console.log(`[computer-use] screenshots: ${result.screenshots.length}`);
console.log(`[computer-use] final response: ${result.finalText}`);
