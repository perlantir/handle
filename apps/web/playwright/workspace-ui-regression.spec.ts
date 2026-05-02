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
          permissionMode: "ASK",
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

async function mockHomeProjectControls(page: Page) {
  const requests: Array<{ body: unknown; method: string; path: string }> = [];
  let project = {
    browserMode: "SEPARATE_PROFILE",
    customScopePath: null as string | null,
    defaultBackend: "LOCAL",
    id: "project-ui",
    name: "Personal",
    permissionMode: "ASK",
    workspaceScope: "DEFAULT_WORKSPACE",
  };

  await page.route("**/api/settings/execution", async (route) => {
    await jsonRoute(route, 200, {
      execution: {
        cleanupPolicy: "keep-all",
        defaultBackend: "local",
        updatedAt: "2026-05-02T00:00:00.000Z",
        workspaceBaseDir: "/Users/perlantir/Documents/Handle/workspaces",
      },
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

  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const rawBody = request.postData();
    const body = rawBody ? JSON.parse(rawBody) : null;
    requests.push({ body, method, path });

    if (method === "POST" && path === "/api/projects/pick-folder") {
      await jsonRoute(route, 200, { path: "/Users/perlantir/Projects/handle" });
      return;
    }

    if (method === "PUT" && path === "/api/projects/project-ui") {
      project = { ...project, ...(body as Partial<typeof project>) };
      await jsonRoute(route, 200, { project });
      return;
    }

    if (method === "GET" && path === "/api/projects") {
      await jsonRoute(route, 200, { projects: [project] });
      return;
    }

    await jsonRoute(route, 200, { conversations: [] });
  });

  return { requests };
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

    const chatBox = await page.getByTestId("workspace-chat-shell").boundingBox();
    const composerBox = await page.getByTestId("workspace-bottom-composer").boundingBox();
    expect(chatBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(Math.abs((chatBox?.width ?? 0) - (composerBox?.width ?? 0))).toBeLessThan(2);
  });
});

test.describe("Project control regressions", () => {
  test("uses folder picker flow and saves permission level separately", async ({ page }) => {
    const { requests } = await mockHomeProjectControls(page);

    await page.goto("/");

    await page.getByLabel("Project scope").selectOption("CUSTOM_FOLDER");
    await expect(page.getByLabel("Specific folder path")).toHaveValue("/Users/perlantir/Projects/handle");
    await expect
      .poll(() => requests)
      .toContainEqual({ body: null, method: "POST", path: "/api/projects/pick-folder" });
    await expect
      .poll(() => requests)
      .toContainEqual({
        body: {
          customScopePath: "/Users/perlantir/Projects/handle",
          workspaceScope: "CUSTOM_FOLDER",
        },
        method: "PUT",
        path: "/api/projects/project-ui",
      });

    await page.getByLabel("Permission level").selectOption("FULL_ACCESS");
    await expect
      .poll(() => requests)
      .toContainEqual({
        body: { permissionMode: "FULL_ACCESS" },
        method: "PUT",
        path: "/api/projects/project-ui",
      });
  });
});
