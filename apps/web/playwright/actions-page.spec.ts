import type { ActionLogSummary } from "@handle/shared";
import { expect, test, type Page, type Route } from "@playwright/test";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function mockActionsApi(page: Page) {
  const undos: string[] = [];
  const actions: ActionLogSummary[] = [
    {
      conversationId: "conversation-1",
      description: "Created file /Users/perlantir/Documents/Handle/workspaces/project-1/test.txt",
      id: "0",
      metadata: { byteCount: 5 },
      outcomeType: "file_created",
      projectId: "project-1",
      reversible: true,
      target: "/Users/perlantir/Documents/Handle/workspaces/project-1/test.txt",
      taskId: "run-1",
      timestamp: "2026-05-02T12:00:00.000Z",
      undoCommand: "rm /Users/perlantir/Documents/Handle/workspaces/project-1/test.txt",
    },
    {
      conversationId: "conversation-1",
      description: "Ran shell command: echo hello",
      id: "1",
      metadata: { exitCode: 0 },
      outcomeType: "shell_command_executed",
      projectId: "project-1",
      reversible: false,
      target: "echo hello",
      taskId: "run-1",
      timestamp: "2026-05-02T12:01:00.000Z",
    },
  ];

  await page.route("**/api/projects", async (route) => {
    await jsonRoute(route, 200, { projects: [{ id: "project-1", name: "Project One" }] });
  });
  await page.route("**/api/projects/*/conversations", async (route) => {
    await jsonRoute(route, 200, { conversations: [] });
  });
  await page.route("**/api/actions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/undo")) {
      undos.push(url.pathname);
      actions.unshift({
        conversationId: "conversation-1",
        description: "Deleted file /Users/perlantir/Documents/Handle/workspaces/project-1/test.txt",
        id: "2",
        metadata: { undoOf: "0" },
        outcomeType: "file_deleted",
        projectId: "project-1",
        reversible: false,
        target: "/Users/perlantir/Documents/Handle/workspaces/project-1/test.txt",
        taskId: "run-1",
        timestamp: "2026-05-02T12:02:00.000Z",
      });
      await jsonRoute(route, 200, { undone: true });
      return;
    }
    await jsonRoute(route, 200, { actions });
  });

  return { undos };
}

test.describe("Actions page", () => {
  test("renders action log rows, filters, and undoes reversible actions", async ({ page }) => {
    const { undos } = await mockActionsApi(page);

    await page.goto("/actions");

    await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
    await expect(page.getByText("Created file").first()).toBeVisible();
    await expect(page.getByText("shell command executed")).toBeVisible();

    await page.getByLabel("Filter by outcome").selectOption("file_created");
    await expect(page.getByText("Created file").first()).toBeVisible();

    await page.getByRole("button", { name: "By Project" }).click();
    await expect(page.getByText("Project project-1")).toBeVisible();

    await page.getByRole("button", { name: /Undo Created file/ }).click();
    await expect.poll(() => undos).toContain("/api/actions/0/undo");
    await expect(page.getByText("Deleted file").first()).toBeVisible();
  });
});
