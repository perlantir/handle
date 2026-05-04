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
  const agents: any[] = [];
  const requests: any[] = [];

  await page.route("**/api/projects**", async (route) => {
    await jsonRoute(route, 200, { projects: [] });
  });

  await page.route("**/api/settings/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings/integrations") {
      await jsonRoute(route, 200, {
        connectors: [
          { connectorId: "gmail", displayName: "Gmail", tier: 1 },
          { connectorId: "slack", displayName: "Slack", tier: 1 },
          { connectorId: "notion", displayName: "Notion", tier: 1 },
          { connectorId: "github", displayName: "GitHub", tier: 1 },
        ],
        connections: [
          { connectorId: "gmail", id: "gmail-1", status: "CONNECTED" },
          { connectorId: "slack", id: "slack-1", status: "CONNECTED" },
        ],
        connectorSettings: [],
        nango: { configured: true, host: "https://api.nango.dev" },
      });
      return;
    }
    if (path === "/api/settings/providers") {
      await jsonRoute(route, 200, { providers: [] });
      return;
    }
    if (path === "/api/settings/providers/openai/oauth/status") {
      await jsonRoute(route, 200, {
        providerId: "openai",
        status: { signedIn: false },
      });
      return;
    }
    await jsonRoute(route, 404, { error: "Unhandled settings route" });
  });

  await page.route("**/api/saved-agents**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = await requestBody(route);
    requests.push({ body, method, path });

    if (method === "GET" && path === "/api/saved-agents") {
      await jsonRoute(route, 200, { agents });
      return;
    }

    if (method === "POST" && path === "/api/saved-agents") {
      const agent = {
        ...body,
        createdAt: "2026-05-04T00:00:00.000Z",
        id: "agent-1",
        updatedAt: "2026-05-04T00:00:00.000Z",
      };
      agents.unshift(agent);
      await jsonRoute(route, 201, { agent });
      return;
    }

    if (method === "POST" && path === "/api/saved-agents/agent-1/run") {
      await jsonRoute(route, 200, {
        agentRunId: "run-1",
        conversationId: "conversation-1",
        savedAgentRunId: "saved-run-1",
        status: "QUEUED",
      });
      return;
    }

    await jsonRoute(route, 404, { error: "Unhandled saved agents route" });
  });

  return { requests };
}

async function openSettings(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue as smoke user" }).click();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("Settings Saved Agents creates and queues a saved agent", async ({
  page,
}) => {
  const { requests } = await mockApi(page);
  await openSettings(page);
  await page.getByRole("button", { name: "Saved Agents" }).click();
  await expect(page.getByRole("button", { name: "Saved Agents" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("Saved agent name").fill("Urgent digest");
  await page.getByLabel("Saved agent connector Notion").uncheck();
  await page.getByLabel("Saved agent connector GitHub").uncheck();
  await page.getByText("Scheduled").click();
  await page.getByLabel("Saved agent schedule").fill("0 8 * * 1-5");
  await page.getByLabel("Saved agent output target").selectOption("slack");
  await page.getByLabel("Saved agent Slack output channel").fill("#updates");
  await page
    .getByLabel("Saved agent memory scope")
    .selectOption("PROJECT_ONLY");
  await page.getByRole("button", { name: "Save agent" }).click();

  await expect(page.getByText("Saved agent created")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Urgent digest" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText(/Saved agent queued/)).toBeVisible();

  expect(
    requests.find(
      (request) =>
        request.method === "POST" && request.path === "/api/saved-agents",
    )?.body,
  ).toMatchObject({
    connectorAccess: ["gmail", "slack"],
    memoryScope: "PROJECT_ONLY",
    name: "Urgent digest",
    outputTarget: { channel: "#updates", type: "slack" },
    schedule: "0 8 * * 1-5",
    trigger: "schedule",
  });
});
