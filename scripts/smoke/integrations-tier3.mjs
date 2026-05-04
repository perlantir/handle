import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTier1IntegrationToolDefinitions } from "../../apps/api/src/agent/integrationTools.ts";

function tool(name) {
  const definition = createTier1IntegrationToolDefinitions().find(
    (item) => item.name === name,
  );
  assert(definition, `Missing tool ${name}`);
  return definition;
}

function context(overrides = {}) {
  return {
    backend: { getWorkspaceDir: () => "/home/user", id: "e2b" },
    integrationRuntime: {
      request: async (input) => ({
        accountAlias: "default",
        connectorId: input.connectorId,
        data: { ok: true, endpoint: input.endpoint, method: input.method },
        endpoint: input.endpoint,
        method: input.method,
      }),
    },
    projectId: "project-integrations-tier3-smoke",
    projectPermissionMode: "FULL_ACCESS",
    requestApproval: async () => "approved",
    sandbox: { sandboxId: "sandbox-integrations-tier3-smoke" },
    taskId: "smoke-integrations-tier3",
    userId: "user-integrations-tier3-smoke",
    ...overrides,
  };
}

for (const expected of [
  "sheets_get_values",
  "sheets_update_values",
  "docs_get_document",
  "docs_insert_text",
  "zapier_list_zaps",
  "zapier_trigger_zap",
  "obsidian_search",
  "obsidian_create_note",
]) {
  tool(expected);
}

const sheets = await tool("sheets_get_values").implementation(
  { spreadsheetId: "sheet-1", range: "A1:B2" },
  context(),
);
assert.match(sheets, /sheet-1/);

const zapier = await tool("zapier_trigger_zap").implementation(
  { zapId: "zap-1", payload: { smoke: true } },
  context(),
);
assert.match(zapier, /trigger/);

const vaultPath = await mkdtemp(join(tmpdir(), "handle-obsidian-smoke-"));
await writeFile(join(vaultPath, "existing.md"), "teal project note");
const search = await tool("obsidian_search").implementation(
  { query: "teal" },
  context({ obsidianVaultPath: vaultPath }),
);
assert.match(search, /existing.md/);

await tool("obsidian_create_note").implementation(
  { content: "created by smoke", path: "new.md" },
  context({ obsidianVaultPath: vaultPath }),
);
assert.equal(await readFile(join(vaultPath, "new.md"), "utf8"), "created by smoke");

await assert.rejects(
  tool("obsidian_read_note").implementation(
    { path: "../outside.md" },
    context({ obsidianVaultPath: vaultPath }),
  ),
  /escapes the configured vault/,
);

console.log("PASS: Tier 3 integration tools and Obsidian vault containment work.");
