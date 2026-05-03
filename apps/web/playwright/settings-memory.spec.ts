import { expect, test, type Page, type Route } from "@playwright/test";

interface RecordedRequest {
  body: unknown;
  method: string;
  path: string;
}

const memoryFixture = {
  cloudBaseURL: "https://api.getzep.com",
  defaultScopeForNewProjects: "GLOBAL_AND_PROJECT",
  hasCloudApiKey: false,
  provider: "self-hosted",
  selfHostedBaseURL: "http://127.0.0.1:8000",
  status: {
    checkedAt: "2026-05-02T12:00:00.000Z",
    detail: "Zep API reachable",
    provider: "self-hosted",
    status: "online",
  },
  updatedAt: "2026-05-02T12:00:00.000Z",
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
  const memory = { ...memoryFixture };

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
    const path = new URL(request.url()).pathname;
    const method = request.method();
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

    if (method === "GET" && path === "/api/settings/memory") {
      await jsonRoute(route, 200, { memory });
      return;
    }

    if (method === "PUT" && path === "/api/settings/memory") {
      Object.assign(memory, body);
      await jsonRoute(route, 200, { memory });
      return;
    }

    if (method === "POST" && path === "/api/settings/memory/cloud-key") {
      memory.hasCloudApiKey = true;
      await jsonRoute(route, 200, { saved: true });
      return;
    }

    if (method === "POST" && path === "/api/settings/memory/start") {
      memory.status = {
        ...memory.status,
        detail: "Zep API reachable",
        status: "online",
      };
      await jsonRoute(route, 200, { started: true, stderr: "", stdout: "ok" });
      return;
    }

    if (method === "POST" && path === "/api/settings/memory/stop") {
      memory.status = {
        ...memory.status,
        detail: "Memory offline",
        status: "offline",
      };
      await jsonRoute(route, 200, { stopped: true, stderr: "", stdout: "ok" });
      return;
    }

    if (method === "POST" && path === "/api/settings/memory/reset") {
      await jsonRoute(route, 200, { deleted: 2, reset: true });
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

test.describe("Settings Memory", () => {
  test("renders, saves, manages Zep, and resets memory", async ({ page }) => {
    const { requests } = await mockSettingsApi(page);
    await openSettings(page);

    await page.getByRole("button", { name: "Memory" }).click();

    await expect(page.getByText("Memory provider")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Self-hosted/ })).toBeChecked();
    await expect(page.getByText("Connected")).toBeVisible();
    await expect(page.locator('input[value="http://127.0.0.1:8000"]')).toBeVisible();

    await page.getByRole("radio", { name: /Cloud/ }).check();
    await page.getByLabel("Zep Cloud API key").fill("zep-test-key-not-real");
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(page.getByText("Zep Cloud key saved")).toBeVisible();

    await page.getByRole("radio", { name: /Cloud/ }).check();
    await page.getByLabel("Default scope for new projects").selectOption("PROJECT_ONLY");
    await page.getByRole("button", { exact: true, name: "Save" }).click();
    await expect(page.getByText("Memory settings saved")).toBeVisible();
    expect(
      requests.find(
        (request) =>
          request.method === "PUT" &&
          request.path === "/api/settings/memory",
      )?.body,
    ).toMatchObject({
      defaultScopeForNewProjects: "PROJECT_ONLY",
      provider: "cloud",
    });

    await page.getByRole("button", { name: "Start self-hosted" }).click();
    await expect(page.getByText("Self-hosted memory started")).toBeVisible();
    await page.getByRole("button", { name: "Stop self-hosted" }).click();
    await expect(page.getByText("Self-hosted memory stopped")).toBeVisible();

    await page.getByLabel("Reset memory confirmation").fill("delete");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByText("Memory reset (2 namespaces cleared)")).toBeVisible();

    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/memory/cloud-key",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/memory/start",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/memory/reset",
      ),
    ).toBe(true);
  });
});
