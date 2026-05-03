import { expect, test, type Page, type Route } from "@playwright/test";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function mockMemoryApi(page: Page) {
  const deletes: string[] = [];
  await page.route("**/api/projects", async (route) => {
    await jsonRoute(route, 200, {
      projects: [{ id: "project-1", name: "Project One", memoryScope: "GLOBAL_AND_PROJECT" }],
    });
  });
  await page.route("**/api/memory/facts**", async (route) => {
    if (route.request().method() === "DELETE") {
      deletes.push(route.request().url());
      await jsonRoute(route, 200, { deleted: true });
      return;
    }
    await jsonRoute(route, 200, {
      facts: [
        {
          confidence: 0.86,
          content: "Favorite color is teal",
          id: "global_handle-local-user:0",
          lastUpdated: "2026-05-02T00:00:00.000Z",
          sessionId: "global_handle-local-user",
          source: "global",
          sourceLabel: "Global",
          type: "Preference",
        },
      ],
      status: { provider: "self-hosted", status: "online" },
    });
  });
  return { deletes };
}

test.describe("Memory page", () => {
  test("renders list and graph views with fact details", async ({ page }) => {
    await mockMemoryApi(page);

    await page.goto("/memory");

    await expect(page.getByRole("heading", { name: "Memory" })).toBeVisible();
    await expect(page.getByText("Memory online")).toBeVisible();
    await expect(page.getByText("Favorite color is teal").first()).toBeVisible();
    await page.getByRole("button", { name: "Graph" }).click();
    await expect(page.getByText("Global").first()).toBeVisible();
  });

  test("deletes a memory namespace from the list", async ({ page }) => {
    const { deletes } = await mockMemoryApi(page);
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/memory");
    await page.getByRole("button", { exact: true, name: "Delete memory Global" }).click();

    await expect.poll(() => deletes.length).toBe(1);
    expect(deletes[0]).toContain("global_handle-local-user");
  });
});
