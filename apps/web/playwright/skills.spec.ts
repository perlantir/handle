import { expect, test, type Page, type Route } from "@playwright/test";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

const skill = {
  activationExamples: ["Research Acme"],
  approvalPolicy: { requireBeforeWrites: true },
  category: "research",
  createdAt: "2026-05-04T00:00:00.000Z",
  description: "Deep company research with cited report and source-set artifacts.",
  enabled: true,
  evalFixtures: [],
  icon: { kind: "letter", tone: "violet", value: "R" },
  id: "skill-1",
  inputSlots: [
    { id: "company", label: "Company name or URL", required: true, type: "text" },
    { defaultValue: "standard", id: "depth", label: "Depth", options: [{ label: "Quick", value: "quick" }, { label: "Standard", value: "standard" }], required: true, type: "select" },
  ],
  markdownSections: [
    { content: "Produce a cited company research report.", title: "Overview" },
    { content: "Use for company research.", title: "Activation" },
  ],
  missingIntegrations: [],
  name: "Research a Company",
  negativeActivationExamples: ["What is 2+2?"],
  optionalIntegrations: [],
  outputArtifactContract: { required: [{ kind: "REPORT", title: "Report", mimeType: "text/markdown" }] },
  packageMetadata: {},
  recentRun: null,
  recentRuns: [],
  requiredIntegrations: [],
  reusableResources: [],
  runCount: 0,
  runtimePolicy: { filesystem: "PROJECT_WORKSPACE", maxDurationMinutes: 45 },
  schedulingConfig: {},
  skillMd: "## Overview\nProduce a cited company research report.",
  slug: "research-company",
  sourceCitationPolicy: { required: true },
  sourceType: "BUILTIN",
  status: "ready",
  toolPolicy: { allowedConnectors: [], allowedTools: ["web_search"] },
  uiTemplate: "wide-research",
  updatedAt: "2026-05-04T00:00:00.000Z",
  version: "1.0.0",
  visibility: "BUILTIN",
};

const run = {
  artifacts: [
    {
      citations: [{ title: "Source", url: "https://example.com" }],
      createdAt: "2026-05-04T00:01:00.000Z",
      id: "artifact-1",
      inlineContent: "# Acme Research Report\n\nA cited report.",
      kind: "REPORT",
      metadata: {},
      mimeType: "text/markdown",
      skillRunId: "run-1",
      title: "Acme research report",
      updatedAt: "2026-05-04T00:01:00.000Z",
    },
  ],
  completedAt: "2026-05-04T00:01:00.000Z",
  createdAt: "2026-05-04T00:00:00.000Z",
  effectivePolicies: {},
  id: "run-1",
  inputs: { company: "Acme", depth: "quick" },
  resultSummary: "Created cited research report for Acme.",
  skill,
  skillId: "skill-1",
  skillName: "Research a Company",
  skillSlug: "research-company",
  startedAt: "2026-05-04T00:00:00.000Z",
  status: "COMPLETED",
  steps: [
    {
      completedAt: "2026-05-04T00:00:10.000Z",
      id: "step-1",
      index: 0,
      metadata: {},
      safeSummary: "Validated inputs and policy.",
      startedAt: "2026-05-04T00:00:00.000Z",
      status: "completed",
      title: "Validate inputs and policy",
      type: "PLAN",
    },
  ],
  trigger: "MANUAL",
  updatedAt: "2026-05-04T00:01:00.000Z",
};

async function mockSkillsApi(page: Page) {
  await page.route("**/api/skills**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/api/skills") {
      await jsonRoute(route, 200, { skills: [skill] });
      return;
    }
    if (request.method() === "GET" && url.pathname === "/api/skills/research-company") {
      await jsonRoute(route, 200, { skill });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/skills/skill-1/run") {
      await jsonRoute(route, 201, { run });
      return;
    }
    await jsonRoute(route, 404, { error: "Unhandled Skills route" });
  });
  await page.route("**/api/skill-runs/run-1", async (route) => {
    await jsonRoute(route, 200, { run });
  });
}

test.describe("Skills", () => {
  test("lists Skills, runs one, and opens trace artifacts", async ({ page }) => {
    await mockSkillsApi(page);

    await page.goto("/skills");
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
    await expect(page.getByText("Research a Company")).toBeVisible();

    await page.getByText("Research a Company").click();
    await expect(page.getByRole("heading", { name: "Research a Company" })).toBeVisible();
    await page.getByLabel("Company name or URL *").fill("Acme");
    await page.getByRole("button", { name: "Run Skill" }).click();
    await expect(page.getByText("completed · open trace")).toBeVisible();

    await page.getByText("completed · open trace").click();
    await expect(page.getByRole("heading", { name: "Skill Run Trace" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Acme research report/ })).toBeVisible();
    await expect(page.getByText("# Acme Research Report")).toBeVisible();
  });
});
