import type { ApprovalPayload } from "@handle/shared";
import { expect, test, type Page, type Route } from "@playwright/test";

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAWElEQVR4nO3PQQ0AIBDAMMC/5+ONAvZoFSzZnplZ3gkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC8G2AAAQABJzQnCgAAAABJRU5ErkJggg==";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

function streamBody(
  taskId: string,
  approvalRequest: ApprovalPayload = {
    action: "browser_click",
    reason: "Click appears to trigger destructive action: Delete Account",
    target: "#delete",
    type: "risky_browser_action",
  },
) {
  const screenshot = {
    byteCount: Buffer.from(pngBase64, "base64").byteLength,
    callId: "call-browser-1",
    height: 800,
    imageBase64: pngBase64,
    source: "browser_tools",
    taskId,
    timestamp: new Date().toISOString(),
    type: "browser_screenshot",
    width: 1280,
  };
  const approval = {
    approvalId: "approval-browser-1",
    request: approvalRequest,
    taskId,
    type: "approval_request",
  };

  return `data: ${JSON.stringify(screenshot)}\n\ndata: ${JSON.stringify(approval)}\n\n`;
}

async function mockWorkspaceApis(
  page: Page,
  taskId: string,
  approvalRequest?: Parameters<typeof streamBody>[1],
) {
  const responses: unknown[] = [];

  await page.route("**/api/tasks/*", async (route) => {
    await jsonRoute(route, 200, {
      goal: "Use browser tools",
      id: taskId,
      messages: [{ content: "Use browser tools", id: "message-1", role: "USER" }],
      status: "RUNNING",
    });
  });

  await page.route("**/api/approvals/pending", async (route) => {
    await jsonRoute(route, 200, { approvals: [] });
  });

  await page.route("**/api/approvals/respond", async (route) => {
    const body = route.request().postDataJSON();
    responses.push(body);
    await jsonRoute(route, 200, {
      approvalId: body.approvalId,
      status: body.decision,
    });
  });

  await page.route(`**/api/stream/${taskId}`, async (route) => {
    await route.fulfill({
      body: streamBody(taskId, approvalRequest),
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      },
      status: 200,
    });
  });

  return { responses };
}

test.describe("Workspace Browser Pane", () => {
  test("renders screenshot history and approves risky browser actions", async ({ page }) => {
    const taskId = "task-browser-ui";
    const { responses } = await mockWorkspaceApis(page, taskId);

    await page.goto(`/tasks/${taskId}`);

    await expect(page.getByText("Use browser tools").first()).toBeVisible();
    await expect(page.getByText("Screenshot history")).toBeVisible();
    await expect(page.getByAltText("Browser screenshot")).toBeVisible();
    await expect(page.getByAltText("browser_tools thumbnail")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approve action?" })).toBeVisible();
    await expect(
      page.getByText("Click appears to trigger destructive action").first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-browser-1", decision: "approved" });
  });

  test("sends denial for risky browser action approval", async ({ page }) => {
    const taskId = "task-browser-deny-ui";
    const { responses } = await mockWorkspaceApis(page, taskId);

    await page.goto(`/tasks/${taskId}`);

    await expect(page.getByRole("heading", { name: "Approve action?" })).toBeVisible();
    await page.getByRole("button", { name: "Deny" }).click();
    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-browser-1", decision: "denied" });
  });

  test("renders Phase 4 file delete approval copy", async ({ page }) => {
    const taskId = "task-file-delete-ui";
    const { responses } = await mockWorkspaceApis(page, taskId, {
      path: "/tmp/handle-local-test/delete-me.txt",
      reason: "Delete /tmp/handle-local-test/delete-me.txt?",
      type: "file_delete",
    });

    await page.goto(`/tasks/${taskId}`);

    await expect(
      page.getByRole("heading", {
        name: "Delete /tmp/handle-local-test/delete-me.txt?",
      }),
    ).toBeVisible();
    await expect(page.getByText("Files · delete")).toBeVisible();

    await page.getByRole("button", { name: "Approve & run" }).click();
    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-browser-1", decision: "approved" });
  });

  test("requires explicit understanding before approving actual Chrome access", async ({ page }) => {
    const taskId = "task-actual-chrome-ui";
    const { responses } = await mockWorkspaceApis(page, taskId, {
      reason:
        "Connect to your actual Chrome? Agent will see your open tabs, logged-in sessions, saved passwords visible to extensions, and browsing history.",
      type: "browser_use_actual_chrome",
    });

    await page.goto(`/tasks/${taskId}`);

    await expect(page.getByRole("heading", { name: "Connect to your actual Chrome?" })).toBeVisible();
    await expect(page.getByText("Agent will see: any tab you have open")).toBeVisible();
    await expect(page.getByText("Agent will see: your logged-in sessions to all sites")).toBeVisible();
    await expect(page.getByText("Agent will see: saved passwords visible to extensions")).toBeVisible();
    await expect(page.getByText("Agent will see: browsing history")).toBeVisible();

    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeDisabled();

    await page.getByRole("switch", { name: "I understand actual Chrome access risks" }).click();
    await expect(approve).toBeEnabled();
    await approve.click();

    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-browser-1", decision: "approved" });
  });
});
