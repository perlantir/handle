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

function streamBody(taskId: string, approvalRequest: ApprovalPayload) {
  const screenshot = {
    byteCount: Buffer.from(pngBase64, "base64").byteLength,
    callId: "call-approval-types",
    height: 800,
    imageBase64: pngBase64,
    source: "browser_tools",
    taskId,
    timestamp: new Date().toISOString(),
    type: "browser_screenshot",
    width: 1280,
  };
  const approval = {
    approvalId: "approval-type-test",
    request: approvalRequest,
    taskId,
    type: "approval_request",
  };

  return `data: ${JSON.stringify(screenshot)}\n\ndata: ${JSON.stringify(approval)}\n\n`;
}

async function mockWorkspaceApis(
  page: Page,
  taskId: string,
  approvalRequest: ApprovalPayload,
) {
  const responses: unknown[] = [];

  await page.route("**/api/tasks/*", async (route) => {
    await jsonRoute(route, 200, {
      backend: "local",
      goal: "Approval modal test",
      id: taskId,
      messages: [
        { content: "Approval modal test", id: "message-1", role: "USER" },
      ],
      status: "WAITING",
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

test.describe("Approval modal types", () => {
  test("renders shell_exec approval copy and sends deny", async ({ page }) => {
    const { responses } = await mockWorkspaceApis(page, "task-shell-approval", {
      command: "echo hello && cat /etc/passwd",
      reason: "Shell command requires approval because it chains commands",
      type: "shell_exec",
    });

    await page.goto("/tasks/task-shell-approval");

    await expect(
      page.getByRole("heading", {
        name: "Run command: echo hello && cat /etc/passwd?",
      }),
    ).toBeVisible();
    await expect(page.getByText("Shell · execute")).toBeVisible();

    await page.getByRole("button", { name: "Deny" }).click();
    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-type-test", decision: "denied" });
  });

  test("renders file_write_outside_workspace approval copy", async ({ page }) => {
    const { responses } = await mockWorkspaceApis(page, "task-file-write", {
      path: "/Users/perlantir/Desktop/handle-test.txt",
      reason:
        "Write to /Users/perlantir/Desktop/handle-test.txt? This is outside the task workspace.",
      type: "file_write_outside_workspace",
    });

    await page.goto("/tasks/task-file-write");

    await expect(
      page.getByRole("heading", {
        name: "Write to /Users/perlantir/Desktop/handle-test.txt? This is outside the task workspace.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Files · write")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-type-test", decision: "approved" });
  });

  test("renders file_delete approval copy", async ({ page }) => {
    const { responses } = await mockWorkspaceApis(page, "task-file-delete", {
      path: "/Users/perlantir/Documents/Handle/workspaces/task/file.txt",
      reason:
        "Delete /Users/perlantir/Documents/Handle/workspaces/task/file.txt?",
      type: "file_delete",
    });

    await page.goto("/tasks/task-file-delete");

    await expect(
      page.getByRole("heading", {
        name: "Delete /Users/perlantir/Documents/Handle/workspaces/task/file.txt?",
      }),
    ).toBeVisible();
    await expect(page.getByText("Files · delete")).toBeVisible();

    await page.getByRole("button", { name: "Deny" }).click();
    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-type-test", decision: "denied" });
  });

  test("requires checkbox for browser_use_actual_chrome", async ({ page }) => {
    const { responses } = await mockWorkspaceApis(page, "task-actual-chrome", {
      reason:
        "Connect to your actual Chrome? Agent will see your open tabs, logged-in sessions, saved passwords visible to extensions, and browsing history.",
      type: "browser_use_actual_chrome",
    });

    await page.goto("/tasks/task-actual-chrome");

    await expect(
      page.getByRole("heading", { name: "Connect to your actual Chrome?" }),
    ).toBeVisible();
    await expect(page.getByText("Agent will see: any tab you have open")).toBeVisible();
    await expect(
      page.getByText("Agent will see: your logged-in sessions to all sites"),
    ).toBeVisible();
    await expect(
      page.getByText("Agent will see: saved passwords visible to extensions"),
    ).toBeVisible();
    await expect(page.getByText("Agent will see: browsing history")).toBeVisible();

    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeDisabled();
    await page
      .getByRole("switch", { name: "I understand actual Chrome access risks" })
      .click();
    await approve.click();
    await expect
      .poll(() => responses)
      .toContainEqual({ approvalId: "approval-type-test", decision: "approved" });
  });
});
