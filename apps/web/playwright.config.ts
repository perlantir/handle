import { defineConfig, devices } from "@playwright/test";

const webUrl =
  process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
const webPort = new URL(webUrl).port || "3000";
const apiUrl =
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";

function inheritedEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  testDir: "./playwright",
  timeout: 45_000,
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm --filter @handle/web exec dotenv -e ../../.env -- next dev --hostname 127.0.0.1 --port ${webPort}`,
    env: {
      ...inheritedEnv(),
      HANDLE_TEST_AUTH_BYPASS: "1",
      NEXT_PUBLIC_HANDLE_API_BASE_URL: apiUrl,
      NEXT_PUBLIC_HANDLE_TEST_AUTH_BYPASS: "1",
      NEXT_PUBLIC_HANDLE_WEB_BASE_URL: webUrl,
    },
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1",
    timeout: 45_000,
    url: `${webUrl}/sign-in`,
  },
});
