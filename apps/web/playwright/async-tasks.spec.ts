import { expect, test, type Page, type Route } from "@playwright/test";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function mockAsyncTasksApi(page: Page) {
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
      await jsonRoute(route, 200, {
        providerId: "openai",
        status: {
          accountId: null,
          email: null,
          expires: null,
          flowError: null,
          flowState: null,
          planType: null,
          port: null,
          signedIn: false,
        },
      });
      return;
    }
    await jsonRoute(route, 404, { error: "Unhandled settings route" });
  });
  await page.route("**/api/async/tasks", async (route) => {
    await jsonRoute(route, 200, {
      tasks: [
        {
          asyncMode: true,
          conversationId: "conversation-1",
          goal: "Build the weekly release report",
          id: "run-1",
          projectName: "Personal",
          queuedAt: "2026-05-04T00:00:00.000Z",
          status: "QUEUED",
          workflowStatus: "queued",
        },
        {
          asyncMode: true,
          conversationId: "conversation-2",
          goal: "Waiting for Gmail send approval",
          id: "run-2",
          projectName: "Ops",
          status: "WAITING",
          workflowStatus: "awaiting_approval",
        },
      ],
    });
  });
}

test("tasks page shows async background runs", async ({ page }) => {
  await mockAsyncTasksApi(page);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue as smoke user" }).click();
  await page.getByRole("link", { name: "Tasks" }).click();

  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText("Build the weekly release report")).toBeVisible();
  await expect(page.getByText("Waiting for Gmail send approval")).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting", { exact: true })).toBeVisible();
});
