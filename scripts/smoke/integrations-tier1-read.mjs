import assert from "node:assert/strict";
import { prisma } from "../../apps/api/src/lib/prisma.ts";
import { createTier1IntegrationToolDefinitions } from "../../apps/api/src/agent/integrationTools.ts";
import { createDefaultIntegrationToolRuntime } from "../../apps/api/src/integrations/toolRuntime.ts";

function backend() {
  return {
    getWorkspaceDir: () => "/home/user",
    id: "e2b",
  };
}

function sandbox() {
  return { sandboxId: "sandbox-integrations-tier1-read-smoke" };
}

function tool(name) {
  const definition = createTier1IntegrationToolDefinitions().find(
    (item) => item.name === name,
  );
  assert(definition, `Missing tool ${name}`);
  return definition;
}

const tier1Tools = createTier1IntegrationToolDefinitions();
for (const expected of [
  "gmail_search",
  "gmail_get_message",
  "gmail_get_thread",
  "gmail_list_labels",
  "gmail_execute",
  "slack_search",
  "slack_list_channels",
  "slack_read_dms",
  "slack_execute",
  "notion_search",
  "notion_get_page",
  "notion_list_databases",
  "notion_execute",
  "drive_search",
  "drive_get_file",
  "drive_export",
  "drive_execute",
  "github_list_issues",
  "github_get_issue",
  "github_search_code",
  "github_list_pull_requests",
  "github_execute",
]) {
  assert(
    tier1Tools.some((definition) => definition.name === expected),
    `Expected ${expected} to be registered`,
  );
}

const github = await prisma.integration.findFirst({
  orderBy: [{ defaultAccount: "desc" }, { updatedAt: "desc" }],
  where: { connectorId: "GITHUB", status: "CONNECTED" },
});

if (!github) {
  console.log(
    "SKIP: No connected GitHub account found. Tier 1 read tools are registered; live provider call needs Settings -> Integrations GitHub connection.",
  );
  process.exit(0);
}

const runtime = createDefaultIntegrationToolRuntime();
const context = {
  backend: backend(),
  integrationRuntime: runtime,
  sandbox: sandbox(),
  taskId: "smoke-integrations-tier1-read",
  userId: github.userId,
};

const userProfile = await runtime.request({
  connectorId: "github",
  endpoint: "/user",
  method: "GET",
  userId: github.userId,
});
assert(userProfile.data, "Expected GitHub /user response data");

const issuesOutput = await tool("github_list_issues").implementation(
  { accountAlias: github.accountAlias, state: "open" },
  context,
);
assert.match(issuesOutput, /^\[|\{/, "Expected JSON output from github_list_issues");

const executeOutput = await tool("github_execute").implementation(
  { instruction: "create a pull request" },
  context,
);
assert.match(executeOutput, /write actions are not enabled/i);

console.log("PASS: Tier 1 integration read tools registered and GitHub live read path works.");

await prisma.$disconnect();
