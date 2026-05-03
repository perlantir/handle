import { expect, test, type Page, type Route } from "@playwright/test";

interface RecordedRequest {
  body: unknown;
  method: string;
  path: string;
}

const executionFixture = {
  cleanupPolicy: "keep-all",
  defaultBackend: "e2b",
  updatedAt: "2026-05-02T12:00:00.000Z",
  workspaceBaseDir: "/Users/perlantir/Documents/Handle/workspaces",
};

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

async function mockSettingsApi(page: Page) {
  const requests: RecordedRequest[] = [];
  const execution = { ...executionFixture };

  await page.route("**/api/projects**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/projects") {
      await jsonRoute(route, 200, { projects: [] });
      return;
    }

    await jsonRoute(route, 200, { conversations: [] });
  });

  await page.route("**/api/settings/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const body = await requestBody(route);
    requests.push({ body, method, path });

    if (method === "GET" && path === "/api/settings/providers") {
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

    if (method === "GET" && path === "/api/settings/execution") {
      await jsonRoute(route, 200, { execution });
      return;
    }

    if (method === "PUT" && path === "/api/settings/execution") {
      Object.assign(execution, body);
      await jsonRoute(route, 200, { execution });
      return;
    }

    if (
      method === "POST" &&
      path === "/api/settings/execution/open-workspace"
    ) {
      await jsonRoute(route, 200, {
        opened: true,
        path: execution.workspaceBaseDir,
      });
      return;
    }

    await jsonRoute(route, 404, { error: "Unhandled settings route" });
  });

  return { requests };
}

async function openSettings(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue as smoke user" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

async function openSettingsSection(page: Page, section: string) {
  const navButton = page.getByRole("button", {
    name: new RegExp(`^${section}$`),
  });
  await expect(navButton).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await navButton.click();
    try {
      await expect(navButton).toHaveAttribute("aria-current", "page", {
        timeout: 2_000,
      });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await expect(navButton).toHaveAttribute("aria-current", "page");
}

test.describe("Settings Execution", () => {
  test("renders, saves, and opens the workspace folder", async ({ page }) => {
    const { requests } = await mockSettingsApi(page);
    await openSettings(page);

    await openSettingsSection(page, "Execution");

    await expect(page.getByText("Default backend")).toBeVisible();
    await expect(page.getByLabel("E2B Cloud")).toBeChecked();
    await expect(page.getByLabel("Local Mac")).toBeVisible();
    await expect(
      page.getByText("/Users/perlantir/Documents/Handle/workspaces"),
    ).toBeVisible();
    await expect(page.getByLabel("Cleanup policy")).toHaveValue("keep-all");

    await page.getByLabel("Local Mac").check();
    await page.getByRole("button", { name: "Save execution settings" }).click();
    await expect(page.getByText("Execution settings saved")).toBeVisible();

    expect(
      requests.find(
        (request) =>
          request.method === "PUT" &&
          request.path === "/api/settings/execution",
      )?.body,
    ).toEqual({ cleanupPolicy: "keep-all", defaultBackend: "local" });

    await page.getByRole("button", { name: "Open Workspace Folder" }).click();
    await expect(page.getByText("Workspace opened in Finder")).toBeVisible();
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/execution/open-workspace",
      ),
    ).toBe(true);
  });
});
