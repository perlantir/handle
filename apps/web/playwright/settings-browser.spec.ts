import { expect, test, type Page, type Route } from "@playwright/test";

interface RecordedRequest {
  body: unknown;
  method: string;
  path: string;
}

const browserFixture = {
  actualChromeEndpoint: "http://127.0.0.1:9222",
  mode: "separate-profile",
  profileDir: "/Users/perlantir/.config/handle/chrome-profile",
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
  const browser = { ...browserFixture };

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

    if (method === "GET" && path === "/api/settings/browser") {
      await jsonRoute(route, 200, { browser });
      return;
    }

    if (method === "PUT" && path === "/api/settings/browser") {
      Object.assign(browser, body);
      await jsonRoute(route, 200, { browser });
      return;
    }

    if (method === "POST" && path === "/api/settings/browser/reset-profile") {
      await jsonRoute(route, 200, {
        profileDir: browser.profileDir,
        reset: true,
      });
      return;
    }

    if (
      method === "POST" &&
      path === "/api/settings/browser/test-actual-chrome"
    ) {
      await jsonRoute(route, 200, {
        connected: true,
        detail: "Chrome/147",
        endpoint: browser.actualChromeEndpoint,
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

test.describe("Settings Browser", () => {
  test("renders, saves, resets profile, and tests actual Chrome", async ({
    page,
  }) => {
    const { requests } = await mockSettingsApi(page);
    await openSettings(page);

    await page.getByRole("button", { name: "Browser" }).click();

    await expect(page.getByText("Browser mode")).toBeVisible();
    await expect(page.getByLabel("Separate profile")).toBeChecked();
    await expect(page.getByLabel("Use my actual Chrome")).toBeVisible();
    await expect(
      page.getByText("/Users/perlantir/.config/handle/chrome-profile"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222",
      ),
    ).toBeVisible();

    await page.getByLabel("Use my actual Chrome").check();
    await page.getByRole("button", { name: "Save browser settings" }).click();
    await expect(page.getByText("Browser settings saved")).toBeVisible();

    expect(
      requests.find(
        (request) =>
          request.method === "PUT" &&
          request.path === "/api/settings/browser",
      )?.body,
    ).toEqual({ mode: "actual-chrome" });

    await page.getByRole("button", { name: "Reset profile" }).click();
    await page.getByRole("button", { name: "Confirm reset" }).click();
    await expect(page.getByText("Separate profile reset")).toBeVisible();
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/browser/reset-profile",
      ),
    ).toBe(true);

    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Actual Chrome connected: Chrome/147")).toBeVisible();
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/browser/test-actual-chrome",
      ),
    ).toBe(true);
  });
});
