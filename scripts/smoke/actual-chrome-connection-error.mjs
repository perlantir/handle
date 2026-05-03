import { testActualChromeConnection } from "../../apps/api/src/execution/localBrowser";

const endpoint = process.env.HANDLE_ACTUAL_CHROME_CDP_ENDPOINT ?? "http://127.0.0.1:9222";
const result = await testActualChromeConnection(endpoint);

if (result.connected) {
  console.log(
    `[actual-chrome-connection-error] SKIP ${endpoint} is currently reachable (${result.detail}). Stop Chrome on port 9222 to exercise the disconnected path.`,
  );
  process.exit(0);
}

if (!result.detail?.includes(`Couldn't connect to Chrome at ${endpoint.replace(/\/$/, "")}`)) {
  throw new Error(`Expected actionable Chrome setup error, got: ${result.detail}`);
}

if (result.detail.includes("fetch failed")) {
  throw new Error(`Expected non-generic connection error, got: ${result.detail}`);
}

console.log(`[actual-chrome-connection-error] PASS clean disconnected error: ${result.detail}`);
