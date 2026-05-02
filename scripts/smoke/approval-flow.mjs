import { randomUUID } from "node:crypto";
import process from "node:process";
import { config as loadDotenv } from "dotenv";
import {
  createBrowserDesktopSandbox,
  createBrowserSession,
} from "../../apps/api/src/execution/browserSession.ts";
import { emitTaskEvent, subscribeToTask } from "../../apps/api/src/lib/eventBus.ts";

const ROOT = new URL("../..", import.meta.url);

loadDotenv({ path: new URL(".env", ROOT) });

if (!process.env.E2B_API_KEY) {
  throw new Error("smoke:approval-flow requires E2B_API_KEY in the root .env or environment");
}

const taskId = `smoke-approval-${Date.now()}`;
const events = [];
const unsubscribe = subscribeToTask(taskId, (event) => events.push(event));
let sandbox;
let session;

function assertApprovalEvent() {
  const approval = events.find((event) => event.type === "approval_request");
  if (!approval) {
    throw new Error(`Expected approval_request event, saw: ${events.map((event) => event.type).join(", ")}`);
  }

  if (approval.request.type !== "risky_browser_action") {
    throw new Error(`Expected risky_browser_action approval, got ${approval.request.type}`);
  }

  if (!/destructive/i.test(approval.request.reason)) {
    throw new Error(`Expected destructive approval reason, got: ${approval.request.reason}`);
  }

  return approval;
}

try {
  console.log("[approval-flow] creating E2B Desktop sandbox");
  sandbox = await createBrowserDesktopSandbox({
    resolution: [1280, 800],
    timeoutMs: 300_000,
  });
  console.log(`[approval-flow] sandbox created: ${sandbox.sandboxId ?? "unknown"}`);

  session = createBrowserSession({
    approval: {
      async requestApproval({ request, taskId }) {
        const approvalId = randomUUID();
        emitTaskEvent({ approvalId, request, taskId, type: "approval_request" });
        console.log(`[approval-flow] auto-approving ${approvalId}: ${request.reason}`);
        return "approved";
      },
      taskId,
    },
    sandbox,
  });

  const html =
    '<!doctype html><title>Approval Smoke</title><button id="delete" onclick="this.textContent = \'Deleted\'; document.body.dataset.clicked = \'true\';">Delete Account</button>';
  const dataUrl = `data:text/html,${encodeURIComponent(html)}`;

  console.log("[approval-flow] navigating to deterministic destructive-action page");
  await session.navigate(dataUrl);

  console.log("[approval-flow] attempting risky click");
  await session.click("#delete");
  const approval = assertApprovalEvent();

  const bodyText = await session.extractText("body");
  if (!/Deleted/.test(bodyText)) {
    throw new Error(`Expected click side effect after approval, got body text: ${bodyText}`);
  }

  console.log("[approval-flow] PASS");
  console.log(`[approval-flow] approval id: ${approval.approvalId}`);
  console.log(`[approval-flow] reason: ${approval.request.reason}`);
} finally {
  unsubscribe();

  if (session) {
    console.log("[approval-flow] destroying browser session");
    await session.destroy();
  }

  if (sandbox) {
    console.log("[approval-flow] killing sandbox");
    await sandbox.kill();
  }
}
