import { expect, test, type Page, type Route } from "@playwright/test";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function requestBody(route: Route) {
  const text = route.request().postData();
  return text ? JSON.parse(text) : null;
}

async function mockApi(page: Page) {
  const workflows: any[] = [];
  const requests: any[] = [];

  await page.route("**/api/projects**", async (route) => {
    await jsonRoute(route, 200, { projects: [] });
  });
  await page.route("**/api/settings/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings/providers") {
      await jsonRoute(route, 200, { providers: [] });
      return;
    }
    if (path === "/api/settings/providers/openai/oauth/status") {
      await jsonRoute(route, 200, { providerId: "openai", status: { signedIn: false } });
      return;
    }
    await jsonRoute(route, 404, { error: "Unhandled settings route" });
  });
  await page.route("**/api/workflows**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = await requestBody(route);
    requests.push({ body, method, path });

    if (method === "GET" && path === "/api/workflows") {
      await jsonRoute(route, 200, { workflows });
      return;
    }
    if (method === "POST" && path === "/api/workflows") {
      const workflow = { ...body, id: "workflow-1", createdAt: "2026-05-04T00:00:00.000Z" };
      workflows.unshift(workflow);
      await jsonRoute(route, 201, { workflow });
      return;
    }
    if (method === "POST" && path === "/api/workflows/workflow-1/run") {
      await jsonRoute(route, 200, { runId: "run-1", status: "COMPLETED" });
      return;
    }
    await jsonRoute(route, 404, { error: "Unhandled workflow route" });
  });

  return { requests };
}

async function openSettings(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue as smoke user" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("Settings Workflows creates and runs a workflow", async ({ page }) => {
  const { requests } = await mockApi(page);
  await openSettings(page);
  await page.getByRole("button", { name: "Workflows" }).click();

  await page.getByLabel("Workflow name").fill("Post release PRs");
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expect(page.getByText("Workflow saved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Post release PRs" })).toBeVisible();

  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Workflow run completed")).toBeVisible();

  expect(requests.find((request) => request.method === "POST" && request.path === "/api/workflows")?.body).toMatchObject({
    name: "Post release PRs",
    triggerConnectorId: "github",
    triggerEventType: "pull_request.merged",
  });
});
