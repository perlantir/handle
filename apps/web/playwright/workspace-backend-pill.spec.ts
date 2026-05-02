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

  await page.route("**/api/tasks", async (route) => {
    const request = route.request();
    const body = await requestBody(route);
    requests.push({
      body,
      method: request.method(),
      path: new URL(request.url()).pathname,
    });
    await jsonRoute(route, 200, { taskId: "task-local-ui" });
  });

  await page.route("**/api/tasks/*", async (route) => {
    const taskId = new URL(route.request().url()).pathname.split("/").pop();
    await jsonRoute(route, 200, {
      backend: taskId === "task-e2b-ui" ? "e2b" : "local",
      goal: taskId === "task-e2b-ui" ? "Use E2B" : "Use Local",
      id: taskId,
      messages: [
        {
          content: taskId === "task-e2b-ui" ? "Use E2B" : "Use Local",
          id: "message-1",
          role: "USER",
        },
      ],
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
      .getByPlaceholder("Describe what you'd like Handle to do...")
      .fill("Use local backend");
    await page.getByRole("button", { name: "Start task" }).click();

    await expect(page).toHaveURL(/\/tasks\/task-local-ui$/);
    await expect(page.getByText("Local").first()).toBeVisible();
    expect(
      requests.find(
        (request) =>
          request.method === "POST" && request.path === "/api/tasks",
      )?.body,
    ).toEqual({ backend: "local", goal: "Use local backend" });
  });

  test("workspace shows E2B pill for cloud tasks", async ({ page }) => {
    await mockTaskApis(page);
    await page.goto("/tasks/task-e2b-ui");

    await expect(page.getByText("Use E2B").first()).toBeVisible();
    await expect(page.getByText("E2B").first()).toBeVisible();
  });
});
