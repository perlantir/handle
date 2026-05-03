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

  await page.route("**/api/projects/*/conversations", async (route) => {
    await jsonRoute(route, 200, { conversations: [] });
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

async function mockSidebarManagement(page: Page) {
  const requests: Array<{ body: unknown; method: string; path: string }> = [];
  let projects = [
    {
      browserMode: "SEPARATE_PROFILE",
      customScopePath: null as string | null,
      defaultBackend: "LOCAL",
      id: "project-alpha",
      name: "Personal",
      permissionMode: "ASK",
      workspaceScope: "DEFAULT_WORKSPACE",
    },
    {
      browserMode: "SEPARATE_PROFILE",
      customScopePath: null as string | null,
      defaultBackend: "E2B",
      id: "project-beta",
      name: "Website Work",
      permissionMode: "ASK",
      workspaceScope: "DEFAULT_WORKSPACE",
    },
  ];
  let conversations: Record<string, Array<{ id: string; latestAgentRunId: string | null; projectId: string; title: string }>> = {
    "project-alpha": [
      { id: "chat-alpha", latestAgentRunId: "run-alpha", projectId: "project-alpha", title: "Prime numbers" },
      { id: "chat-beta", latestAgentRunId: "run-beta", projectId: "project-alpha", title: "HN scraper" },
    ],
    "project-beta": [
      { id: "chat-gamma", latestAgentRunId: "run-gamma", projectId: "project-beta", title: "Landing page" },
    ],
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
    await jsonRoute(route, 200, { providers: [] });
  });
  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const rawBody = request.postData();
    const body = rawBody ? JSON.parse(rawBody) : null;
    requests.push({ body, method, path });

    const conversationMatch = path.match(/^\/api\/projects\/([^/]+)\/conversations$/);
    if (method === "GET" && conversationMatch?.[1]) {
      await jsonRoute(route, 200, { conversations: conversations[conversationMatch[1]] ?? [] });
      return;
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (method === "PUT" && projectMatch?.[1]) {
      projects = projects.map((project) =>
        project.id === projectMatch[1] ? { ...project, ...(body as Partial<(typeof projects)[number]>) } : project,
      );
      await jsonRoute(route, 200, { project: projects.find((project) => project.id === projectMatch[1]) });
      return;
    }
    if (method === "DELETE" && projectMatch?.[1]) {
      projects = projects.filter((project) => project.id !== projectMatch[1]);
      delete conversations[projectMatch[1]];
      await route.fulfill({ status: 204 });
      return;
    }

    if (method === "GET" && path === "/api/projects") {
      await jsonRoute(route, 200, { projects });
      return;
    }

    await jsonRoute(route, 404, { error: "Unexpected project route" });
  });

  await page.route("**/api/conversations/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const rawBody = request.postData();
    const body = rawBody ? JSON.parse(rawBody) : null;
    requests.push({ body, method, path });
    const conversationId = path.split("/").at(-1);
    if (!conversationId) {
      await jsonRoute(route, 404, { error: "Missing conversation id" });
      return;
    }

    if (method === "PUT") {
      let updated = null;
      conversations = Object.fromEntries(
        Object.entries(conversations).map(([projectId, items]) => [
          projectId,
          items.map((conversation) => {
            if (conversation.id !== conversationId) return conversation;
            updated = { ...conversation, title: body.title };
            return updated;
          }),
        ]),
      );
      await jsonRoute(route, 200, { conversation: updated });
      return;
    }

    if (method === "DELETE") {
      conversations = Object.fromEntries(
        Object.entries(conversations).map(([projectId, items]) => [
          projectId,
          items.filter((conversation) => conversation.id !== conversationId),
        ]),
      );
      await route.fulfill({ status: 204 });
      return;
    }

    await jsonRoute(route, 404, { error: "Unexpected conversation route" });
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

  test("shows pause and resume controls for active and paused runs", async ({ page }) => {
    const taskId = "task-ui-pause";
    const requests: Array<{ body: unknown; method: string; path: string }> = [];
    let taskStatus = "RUNNING";

    await page.route("**/api/tasks/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/stream")) {
        await route.fallback();
        return;
      }
      await jsonRoute(route, 200, {
        backend: "local",
        conversationId: "conversation-ui",
        conversationTitle: "Pause smoke",
        goal: "Pause smoke",
        id: taskId,
        messages: [{ content: "Pause smoke", id: "message-user", role: "USER" }],
        projectId: "project-ui",
        projectName: "Personal",
        providerId: "anthropic",
        providerModel: "claude-opus-4-7",
        status: taskStatus,
      });
    });
    await page.route("**/api/stream/*", async (route) => {
      await route.fulfill({
        body: "",
        headers: { "Cache-Control": "no-cache", "Content-Type": "text/event-stream" },
        status: 200,
      });
    });
    await page.route("**/api/agent-runs/*/pause", async (route) => {
      const request = route.request();
      requests.push({
        body: request.postData() ? JSON.parse(request.postData() ?? "{}") : null,
        method: request.method(),
        path: new URL(request.url()).pathname,
      });
      taskStatus = "PAUSED";
      await jsonRoute(route, 200, { active: true, paused: true, status: "PAUSED" });
    });
    await page.route("**/api/agent-runs/*/resume", async (route) => {
      const request = route.request();
      requests.push({
        body: request.postData() ? JSON.parse(request.postData() ?? "{}") : null,
        method: request.method(),
        path: new URL(request.url()).pathname,
      });
      taskStatus = "RUNNING";
      await jsonRoute(route, 200, { resumed: true, status: "RUNNING" });
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
            memoryScope: "GLOBAL_AND_PROJECT",
            name: "Personal",
            permissionMode: "ASK",
            workspaceScope: "DEFAULT_WORKSPACE",
          },
        ],
      });
    });
    await page.route("**/api/projects/*/conversations", async (route) => {
      await jsonRoute(route, 200, { conversations: [] });
    });
    await page.route("**/api/settings/providers", async (route) => {
      await jsonRoute(route, 200, { providers: [] });
    });

    await page.goto(`/tasks/${taskId}`);
    await page.getByRole("button", { name: "Pause active run" }).click();
    await expect
      .poll(() => requests)
      .toContainEqual({
        body: { reason: "Paused by user" },
        method: "POST",
        path: `/api/agent-runs/${taskId}/pause`,
      });

    await page.reload();
    await page.getByRole("button", { name: "Resume paused run" }).click();
    await expect
      .poll(() => requests)
      .toContainEqual({
        body: {},
        method: "POST",
        path: `/api/agent-runs/${taskId}/resume`,
      });
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

  test("shows all project chat titles and supports project/chat rename and delete menus", async ({ page }) => {
    const { requests } = await mockSidebarManagement(page);
    page.on("dialog", (dialog) => void dialog.accept());

    await page.goto("/?projectId=project-alpha");

    await expect(page.getByText("Personal")).toBeVisible();
    await expect(page.getByText("Website Work")).toBeVisible();
    await expect(page.getByText("Prime numbers")).toBeVisible();
    await expect(page.getByText("HN scraper")).toBeVisible();
    await expect(page.getByText("Landing page")).toBeVisible();

    await page.getByLabel("Project actions for Personal").click();
    await page.getByRole("button", { exact: true, name: "Rename" }).click();
    await page.getByRole("textbox", { name: "Project name" }).fill("Renamed Personal");
    await page.getByLabel("Save project name").click();
    await expect
      .poll(() => requests)
      .toContainEqual({ body: { name: "Renamed Personal" }, method: "PUT", path: "/api/projects/project-alpha" });

    await page.getByLabel("Chat actions for Prime numbers").click();
    await page.getByRole("button", { exact: true, name: "Rename" }).click();
    await page.getByRole("textbox", { name: "Chat title" }).fill("Prime checklist");
    await page.getByLabel("Save chat title").click();
    await expect
      .poll(() => requests)
      .toContainEqual({ body: { title: "Prime checklist" }, method: "PUT", path: "/api/conversations/chat-alpha" });

    await page.getByLabel("Chat actions for HN scraper").click();
    await page.getByRole("button", { exact: true, name: "Delete" }).click();
    await expect
      .poll(() => requests)
      .toContainEqual({ body: null, method: "DELETE", path: "/api/conversations/chat-beta" });

    await page.getByLabel("Project actions for Website Work").click();
    await page.getByRole("button", { exact: true, name: "Delete" }).click();
    await expect
      .poll(() => requests)
      .toContainEqual({ body: null, method: "DELETE", path: "/api/projects/project-beta" });
  });
});
