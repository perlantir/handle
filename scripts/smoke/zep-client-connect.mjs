import { HandleZepClient } from "../../apps/api/src/memory/zepClient.ts";

const baseUrl = process.env.ZEP_BASE_URL ?? "http://127.0.0.1:8000";
const userId = `handle-smoke-zep-${Date.now()}`;

const client = new HandleZepClient({ baseUrl, provider: "self-hosted" });

const status = await client.checkConnection();
if (status.status !== "online") {
  throw new Error(`Expected Zep online at ${baseUrl}; got ${status.status}: ${status.detail}`);
}

const result = await client.ensureUser({
  userId,
  email: `${userId}@handle.local`,
  firstName: "Handle",
  lastName: "Smoke",
  metadata: { source: "smoke:zep-client-connect" },
});

if (!result.ok) {
  throw new Error(`ensureUser failed: ${result.detail}`);
}

console.log(`[zep-client-connect] PASS connected to ${baseUrl} and ensured ${userId}`);
