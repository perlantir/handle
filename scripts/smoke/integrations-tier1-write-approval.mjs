import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTier1IntegrationToolDefinitions } from "../../apps/api/src/agent/integrationTools.ts";

process.env.HANDLE_LOG_DIR = await mkdtemp(join(tmpdir(), "handle-integrations-write-smoke-"));

function tool(name) {
  const definition = createTier1IntegrationToolDefinitions().find(
    (item) => item.name === name,
  );
  assert(definition, `Missing tool ${name}`);
  return definition;
}

function context({ permissionMode = "ASK", request, requestApproval }) {
  return {
    backend: { getWorkspaceDir: () => "/home/user", id: "e2b" },
    integrationRuntime: { request },
    projectId: "project-integrations-write-smoke",
    projectPermissionMode: permissionMode,
    requestApproval,
    sandbox: { sandboxId: "sandbox-integrations-write-smoke" },
    taskId: "smoke-integrations-tier1-write",
    userId: "user-integrations-write-smoke",
  };
}

const request = async () => {
  throw new Error("provider call should not run before approval");
};
let approvalPayload;
const denied = await tool("github_create_issue").implementation(
  { owner: "perlantir", repo: "handle", title: "Smoke issue" },
  context({
    request,
    requestApproval: async (_taskId, payload) => {
      approvalPayload = payload;
      return "denied";
    },
  }),
);
assert.match(denied, /denied/i);
assert.equal(approvalPayload?.type, "destructive_integration_action");
assert.equal(approvalPayload?.integration, "GitHub");

let providerCalled = false;
const fullAccessOutput = await tool("github_create_issue").implementation(
  { owner: "perlantir", repo: "handle", title: "Smoke issue" },
  context({
    permissionMode: "FULL_ACCESS",
    request: async (input) => {
      providerCalled = true;
      assert.equal(input.endpoint, "/repos/perlantir/handle/issues");
      assert.equal(input.method, "POST");
      return {
        accountAlias: "default",
        connectorId: "github",
        data: { number: 123, title: "Smoke issue" },
        endpoint: input.endpoint,
        method: input.method,
      };
    },
    requestApproval: async () => {
      throw new Error("full access should not request approval");
    },
  }),
);
assert(providerCalled, "Expected Full Access write provider call");
assert.match(fullAccessOutput, /Smoke issue/);

const forbidden = await tool("slack_send_message").implementation(
  { channelId: "C123", text: "@channel hello" },
  context({
    permissionMode: "FULL_ACCESS",
    request: async () => {
      throw new Error("forbidden Slack broadcast should not call provider");
    },
    requestApproval: async () => "approved",
  }),
);
assert.match(forbidden, /forbidden pattern/i);

console.log("PASS: Tier 1 write tools honor approval gates and forbidden patterns.");
