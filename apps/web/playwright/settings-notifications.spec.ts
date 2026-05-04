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

async function mockSettingsApi(page: Page) {
  const requests: unknown[] = [];
  const notifications = {
    emailEnabled: false,
    emailRecipient: null,
    eventTypes: ["TASK_COMPLETED", "TASK_FAILED", "APPROVAL_NEEDED", "CRITIC_FLAGGED"],
    slackChannelId: null,
    slackEnabled: false,
    updatedAt: "2026-05-04T00:00:00.000Z",
    webhookEnabled: false,
    webhookUrl: null,
  };

  await page.route("**/api/projects**", async (route) => {
    await jsonRoute(route, 200, { projects: [] });
  });

  await page.route("**/api/settings/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

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

    if (path === "/api/settings/notifications" && method === "GET") {
      await jsonRoute(route, 200, {
        notifications,
        temporal: {
          address: "127.0.0.1:7233",
          enabled: true,
          health: {
            checkedAt: "2026-05-04T00:00:00.000Z",
            detail: "Temporal reachable at 127.0.0.1:7233",
            status: "online",
          },
          namespace: "default",
          taskQueue: "handle-agent-runs",
        },
      });
      return;
    }

    if (path === "/api/settings/notifications" && method === "PUT") {
      const body = await requestBody(route);
      requests.push(body);
      Object.assign(notifications, body);
      await jsonRoute(route, 200, { notifications });
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
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("Settings Notifications renders Temporal status and saves opt-in channels", async ({ page }) => {
  const { requests } = await mockSettingsApi(page);
  await openSettings(page);

  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Temporal worker")).toBeVisible();
  await expect(page.getByText("online")).toBeVisible();

  await page.getByLabel("Webhook enabled").click();
  await page.getByLabel("Webhook notification URL").fill("https://example.com/handle-webhook");
  await page.getByLabel("Email enabled").click();
  await page.getByLabel("Email notification recipient").fill("user@example.com");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Notifications saved")).toBeVisible();
  expect(requests.at(-1)).toMatchObject({
    emailEnabled: true,
    emailRecipient: "user@example.com",
    webhookEnabled: true,
    webhookUrl: "https://example.com/handle-webhook",
  });
});
