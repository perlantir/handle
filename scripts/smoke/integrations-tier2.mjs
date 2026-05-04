import assert from "node:assert/strict";
import { createTier1IntegrationToolDefinitions } from "../../apps/api/src/agent/integrationTools.ts";

function tool(name) {
  const definition = createTier1IntegrationToolDefinitions().find(
    (item) => item.name === name,
  );
  assert(definition, `Missing tool ${name}`);
  return definition;
}

function context({ request, requestApproval, permissionMode = "ASK" }) {
  return {
    backend: { getWorkspaceDir: () => "/home/user", id: "e2b" },
    integrationRuntime: { request },
    projectId: "project-integrations-tier2-smoke",
    projectPermissionMode: permissionMode,
    requestApproval,
    sandbox: { sandboxId: "sandbox-integrations-tier2-smoke" },
    taskId: "smoke-integrations-tier2",
    userId: "user-integrations-tier2-smoke",
  };
}

for (const expected of [
  "calendar_list_events",
  "calendar_create_event",
  "calendar_delete_event",
  "cloudflare_list_dns_records",
  "cloudflare_create_dns_record",
  "cloudflare_purge_cache",
  "vercel_list_projects",
  "vercel_create_deployment",
  "linear_search_issues",
  "linear_create_issue",
]) {
  tool(expected);
}

let readCalled = false;
const readOutput = await tool("linear_search_issues").implementation(
  { query: "audit", maxResults: 3 },
  context({
    request: async (input) => {
      readCalled = true;
      assert.equal(input.connectorId, "linear");
      assert.equal(input.endpoint, "/graphql");
      assert.equal(input.method, "POST");
      return {
        accountAlias: "default",
        connectorId: "linear",
        data: { data: { issues: { nodes: [{ identifier: "HAN-1", title: "Audit" }] } } },
        endpoint: input.endpoint,
        method: input.method,
      };
    },
    requestApproval: async () => {
      throw new Error("read tools must not request approval");
    },
  }),
);
assert(readCalled, "Expected Linear read provider call");
assert.match(readOutput, /HAN-1/);

let approvalPayload;
const deleteOutput = await tool("calendar_delete_event").implementation(
  { calendarId: "primary", eventId: "event-1" },
  context({
    permissionMode: "FULL_ACCESS",
    request: async () => {
      throw new Error("destructive delete should not run when denied");
    },
    requestApproval: async (_taskId, payload) => {
      approvalPayload = payload;
      return "denied";
    },
  }),
);
assert.match(deleteOutput, /denied/i);
assert.equal(approvalPayload?.type, "destructive_integration_action");

const cloudflareDenied = await tool("cloudflare_create_dns_record").implementation(
  { record: { name: "example.com", nameserver: "ns1.example.com" }, zoneId: "zone-1" },
  context({
    permissionMode: "FULL_ACCESS",
    request: async () => {
      throw new Error("forbidden Cloudflare change should not call provider");
    },
    requestApproval: async () => "approved",
  }),
);
assert.match(cloudflareDenied, /forbidden pattern/i);

console.log("PASS: Tier 2 integration tools registered with read/write gates.");
