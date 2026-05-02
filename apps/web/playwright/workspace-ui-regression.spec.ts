import { expect, test, type Page, type Route } from "@playwright/test";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

function streamBody(taskId: string) {
  return [
    { type: "thought", taskId, content: "Done [[HANDLE_RESULT:SUCCESS]]" },
    { type: "message", taskId, role: "assistant", content: "Done" },
    { type: "status_update", taskId, status: "STOPPED" },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
}

async function mockWorkspace(page: Page, taskId: string) {
  await page.route("**/api/tasks/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stream")) {
      await route.fallback();
      return;
    }

    await jsonRoute(route, 200, {
      backend: "local",
      conversationId: "conversation-ui",
      conversationTitle: "what's the sqrt of 1072?",
      goal: "what's the sqrt of 1072?",
      id: taskId,
      messages: [
        {
          content: "what's the sqrt of 1072?",
          id: "message-user",
          role: "USER",
        },
      ],
      projectId: "project-ui",
      projectName: "Personal",
      providerId: "anthropic",
      providerModel: "claude-opus-4-7",
      status: "RUNNING",
    });
  });

  await page.route("**/api/stream/*", async (route) => {
    await route.fulfill({
      body: streamBody(taskId),
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      },
      status: 200,
    });
  });

  await page.route("**/api/approvals/pending", async (route) => {
    await jsonRoute(route, 200, { approvals: [] });
  });

  await page.route("**/api/projects", async (route) => {
    await jsonRoute(route, 200, {
      projects: [
        {
          browserMode: "SEPARATE_PROFILE",
          customScopePath: null,
          defaultBackend: "LOCAL",
          id: "project-ui",
          name: "Personal",
          workspaceScope: "DEFAULT_WORKSPACE",
        },
      ],
    });
  });

  await page.route("**/api/settings/providers", async (route) => {
    await jsonRoute(route, 200, {
      providers: [
        {
          authMode: "apiKey",
          baseURL: null,
          description: "Anthropic",
          enabled: true,
          fallbackOrder: 1,
          hasApiKey: true,
          id: "anthropic",
          modelName: null,
          primaryModel: "claude-opus-4-7",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
      ],
    });
  });
}

test.describe("Workspace UI regressions", () => {
  test("keeps Chat selected, dedupes final message, shows project title, and resizes panes", async ({
    page,
  }) => {
    const taskId = "task-ui-regression";
    await mockWorkspace(page, taskId);

    await page.goto(`/tasks/${taskId}`);

    await expect(page.locator("header h1")).toHaveText("Personal");
    await expect(page.getByRole("button", { exact: true, name: "Chat" })).toHaveClass(/bg-bg-surface/);
    await expect(page.getByText("[[HANDLE_RESULT:SUCCESS]]")).toHaveCount(0);
    await expect(page.getByText("Done", { exact: true })).toHaveCount(1);

    const divider = page.getByRole("button", { name: "Resize chat pane" });
    const box = await divider.boundingBox();
    if (!box) throw new Error("Resize divider was not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 90, box.y + box.height / 2);
    await page.mouse.up();

    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("handle.workspace.chatWidth")),
      )
      .not.toBeNull();
  });
});
