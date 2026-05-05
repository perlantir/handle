import { expect, test, type Page, type Route } from "@playwright/test";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

const schedule = {
  approvalPolicy: {},
  catchupPolicy: "SKIP_MISSED",
  changeDetectionPolicy: {},
  cronExpression: "0 9 * * 1-5",
  enabled: false,
  id: "schedule-1",
  input: { company: "Anthropic", depth: "standard" },
  lastRun: null,
  metadata: {},
  name: "Research Anthropic every weekday",
  naturalLanguage: "every weekday at 9am",
  notificationPolicy: {},
  overlapPolicy: "SKIP",
  projectId: null,
  quotaPolicy: {},
  runAt: null,
  status: "PAUSED",
  targetRef: { skillSlug: "research-company" },
  targetType: "WIDE_RESEARCH",
  temporalScheduleId: null,
  timezone: "America/Chicago",
};

const run = {
  approvalState: {},
  artifacts: [{ kind: "REPORT", title: "Anthropic report" }],
  changeDetected: false,
  healthChecks: [],
  id: "schedule-run-1",
  input: { company: "Anthropic", depth: "standard" },
  outputSummary: "Created cited research report for Anthropic.",
  quotaSnapshot: { maxRunsPerDay: 25, runsToday: 1 },
  runMode: "test",
  scheduleId: "schedule-1",
  sources: [{ title: "Anthropic", url: "https://www.anthropic.com/" }],
  status: "TEST_PASSED",
  trace: [{ status: "completed", title: "Dry run completed", type: "TEST" }],
};

async function mockSchedulesApi(page: Page) {
  await page.route("**/api/schedule-templates**", async (route) => {
    if (route.request().method() === "GET") {
      await jsonRoute(route, 200, {
        templates: [
          {
            category: "Research",
            description: "Create a daily source-backed research report.",
            enabled: true,
            id: "template-1",
            inputDefaults: { company: "Anthropic", depth: "standard" },
            name: "Daily News Digest",
            policyDefaults: {},
            requiredConnectors: [],
            scheduleDefaults: { cronExpression: "0 9 * * 1-5", timezone: "America/Chicago" },
            slug: "daily-news-digest",
            targetRef: { skillSlug: "research-company" },
            targetType: "WIDE_RESEARCH",
          },
        ],
      });
      return;
    }
    await jsonRoute(route, 404, { error: "Unhandled template route" });
  });

  await page.route("**/api/schedules**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/schedules/parse") {
      let payload: Record<string, unknown> = {};
      try {
        payload = request.postDataJSON() as Record<string, unknown>;
      } catch {
        payload = {};
      }
      if (typeof payload.text === "string" && payload.text.includes("4:09PM")) {
        await jsonRoute(route, 200, {
          preview: {
            confidence: 0.86,
            cronExpression: "9 16 * * *",
            explanation: "Every day at 4:09 PM",
            input: { goal: "Hello" },
            name: "Daily Hello email",
            nextRuns: ["2026-05-06T21:09:00.000Z", "2026-05-07T21:09:00.000Z", "2026-05-08T21:09:00.000Z"],
            outputTarget: { channel: "EMAIL", label: "Email via configured notification address" },
            runAt: null,
            targetRef: { goal: "Hello" },
            targetType: "TASK",
            timezone: "America/Chicago",
          },
        });
        return;
      }
      await jsonRoute(route, 200, {
        preview: {
          confidence: 0.9,
          cronExpression: "0 9 * * 1-5",
          explanation: "Every weekday at 09:00",
          nextRuns: ["2026-05-05T14:00:00.000Z", "2026-05-06T14:00:00.000Z", "2026-05-07T14:00:00.000Z"],
          runAt: null,
          timezone: "America/Chicago",
        },
      });
      return;
    }
    if (request.method() === "GET" && url.pathname === "/api/schedules") {
      await jsonRoute(route, 200, { schedules: [] });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/schedules") {
      await jsonRoute(route, 201, { schedule });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/schedules/schedule-1/run-now") {
      await jsonRoute(route, 201, { run });
      return;
    }
    await jsonRoute(route, 404, { error: "Unhandled schedules route" });
  });
}

test("creates and test-runs a unified schedule from the browser UI", async ({ page }) => {
  await mockSchedulesApi(page);
  await page.goto("/schedules");

  await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible();
  await page.getByLabel("Describe what you want to schedule").fill("every weekday at 9am, research Anthropic");
  await page.getByRole("button", { name: "Parse and preview" }).click();
  await expect(page.getByText("Parsed:")).toBeVisible();
  await expect(page.getByText("Every weekday at 09:00")).toBeVisible();

  await page.getByRole("button", { name: "Daily News Digest" }).click();
  await page.getByRole("button", { name: "Save & Pause" }).click();
  await expect(page.getByRole("heading", { name: "Research Anthropic every weekday" })).toBeVisible();

  await page.getByRole("button", { name: "Test Run" }).click();
  await expect(page.getByText("test_passed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Created cited research report for Anthropic.", { exact: true }).first()).toBeVisible();
});

test("parses simple daily email automations into a concise user-facing preview", async ({ page }) => {
  await mockSchedulesApi(page);
  await page.goto("/automations");

  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  await page
    .getByLabel("What should Handle do, and when?")
    .fill("everyday at 4:09PM Central standard time email me hello");
  await page.getByRole("button", { name: "Parse and preview" }).click();

  await expect(page.getByText("Parsed: Every day at 4:09 PM")).toBeVisible();
  await expect(page.getByText("Daily Hello email").first()).toBeVisible();
  await expect(page.getByText("Hello", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Daily at 4:09 PM").first()).toBeVisible();
  await expect(page.getByText("Email via configured notification address").first()).toBeVisible();
});
