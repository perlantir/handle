import { expect, test, type Page, type Route } from "@playwright/test";

interface RecordedRequest {
  body: unknown;
  method: string;
  path: string;
}

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function requestBody(route: Route) {
  const text = route.request().postData();
  if (!text) return null;
  return JSON.parse(text);
}

async function mockTaskApis(page: Page) {
  const requests: RecordedRequest[] = [];

  await page.route("**/api/settings/execution", async (route) => {
    const request = route.request();
    const body = await requestBody(route);
    requests.push({
      body,
      method: request.method(),
      path: new URL(request.url()).pathname,
    });
    await jsonRoute(route, 200, {
      execution: {
        cleanupPolicy: "keep-all",
        defaultBackend: "local",
        updatedAt: "2026-05-02T12:00:00.000Z",
        workspaceBaseDir: "/Users/perlantir/Documents/Handle/workspaces",
      },
    });
  });

  await page.route("**/api/projects", async (route) => {
    const request = route.request();
    const body = await requestBody(route);
    requests.push({
      body,
      method: request.method(),
      path: new URL(request.url()).pathname,
    });
    await jsonRoute(route, 200, {
      projects: [
        {
          browserMode: "SEPARATE_PROFILE",
          customScopePath: null,
          defaultBackend: "LOCAL",
          id: "project-local-ui",
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
          updatedAt: "2026-05-02T12:00:00.000Z",
        },
      ],
    });
  });

  await page.route("**/api/projects/*/conversations", async (route) => {
    const request = route.request();
    const body = await requestBody(route);
    requests.push({
      body,
      method: request.method(),
      path: new URL(request.url()).pathname,
    });
    if (request.method() === "POST") {
      await jsonRoute(route, 201, {
        conversation: {
          id: "conversation-local-ui",
          projectId: "project-local-ui",
          title: body?.title ?? "Use local backend",
        },
      });
      return;
    }
    await jsonRoute(route, 200, { conversations: [] });
  });

  await page.route("**/api/conversations/*/messages", async (route) => {
    const request = route.request();
    const body = await requestBody(route);
    requests.push({
      body,
      method: request.method(),
      path: new URL(request.url()).pathname,
    });
    await jsonRoute(route, 200, {
      agentRunId: "task-local-ui",
      conversationId: "conversation-local-ui",
      messageId: "message-local-ui",
    });
  });

  await page.route("**/api/tasks/*", async (route) => {
    const taskId = new URL(route.request().url()).pathname.split("/").pop();
    await jsonRoute(route, 200, {
      backend: taskId === "task-e2b-ui" ? "e2b" : "local",
      conversationId: "conversation-local-ui",
      conversationTitle: taskId === "task-e2b-ui" ? "Use E2B" : "Use Local",
      goal: taskId === "task-e2b-ui" ? "Use E2B" : "Use Local",
      id: taskId,
      messages: [
        {
          content: taskId === "task-e2b-ui" ? "Use E2B" : "Use Local",
          id: "message-1",
          role: "USER",
        },
      ],
      projectId: "project-local-ui",
      projectName: "Personal",
      providerId: taskId === "task-e2b-ui" ? "openai" : "anthropic",
      providerModel: taskId === "task-e2b-ui" ? "gpt-4o" : "claude-opus-4-7",
      status: "RUNNING",
    });
  });

  await page.route("**/api/approvals/pending", async (route) => {
    await jsonRoute(route, 200, { approvals: [] });
  });

  await page.route("**/api/stream/*", async (route) => {
    await route.fulfill({
      body: "",
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      },
      status: 200,
    });
  });

  return { requests };
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue as smoke user" }).click();
}

test.describe("Workspace backend pill", () => {
  test("composer sends backend override and workspace shows Local pill", async ({
    page,
  }) => {
    const { requests } = await mockTaskApis(page);
    await signIn(page);

    await expect(page.getByRole("group", { name: "Task backend" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Local" })).toBeVisible();

    await page
      .getByPlaceholder("What would you like to do?")
      .fill("Use local backend");
    await page.getByRole("button", { name: "Start task" }).click();

    await expect(page).toHaveURL(/\/tasks\/task-local-ui$/);
    await expect(page.getByText("Local").first()).toBeVisible();
    await expect(page.getByText("Anthropic · claude-opus-4-7").first()).toBeVisible();
    expect(
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/conversations/conversation-local-ui/messages",
      )?.body,
    ).toEqual({
      backend: "local",
      content: "Use local backend",
      modelName: "claude-opus-4-7",
      providerId: "anthropic",
    });
  });

  test("workspace shows E2B pill for cloud tasks", async ({ page }) => {
    await mockTaskApis(page);
    await page.goto("/tasks/task-e2b-ui");

    await expect(page.getByText("Use E2B").first()).toBeVisible();
    await expect(page.getByText("E2B").first()).toBeVisible();
    await expect(page.getByText("OpenAI · gpt-4o")).toBeVisible();
  });
});
