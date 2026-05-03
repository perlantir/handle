import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const composeArgs = ["compose", "-f", "docker-compose.zep.yaml"];
const baseUrl = process.env.ZEP_BASE_URL ?? "http://127.0.0.1:8000";
const deadlineMs = Number(process.env.HANDLE_ZEP_SMOKE_TIMEOUT_MS ?? 180_000);
const healthPaths = ["/healthz", "/api/v1/health", "/health", "/"];
const dockerConfigDir = process.env.DOCKER_CONFIG ?? "/tmp/handle-docker-config";
await mkdir(dockerConfigDir, { recursive: true });
await mkdir(`${dockerConfigDir}/cli-plugins`, { recursive: true });
try {
  await symlink(
    `${homedir()}/.docker/cli-plugins/docker-compose`,
    `${dockerConfigDir}/cli-plugins/docker-compose`,
  );
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
    await copyFile(
      `${homedir()}/.docker/cli-plugins/docker-compose`,
      `${dockerConfigDir}/cli-plugins/docker-compose`,
    );
  }
}

async function docker(args, options = {}) {
  return execFileAsync("docker", args, {
    cwd: new URL("../..", import.meta.url).pathname,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, DOCKER_CONFIG: dockerConfigDir },
    ...options,
  });
}

async function dockerStreaming(args) {
  console.log(`[zep-self-hosted-up] docker ${args.join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: new URL("../..", import.meta.url).pathname,
      env: { ...process.env, DOCKER_CONFIG: dockerConfigDir },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`docker ${args.join(" ")} exited with ${code ?? signal}`));
    });
  });
}

async function waitForZep() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < deadlineMs) {
    for (const path of healthPaths) {
      try {
        const response = await fetch(`${baseUrl}${path}`);
        const body = await response.text();
        if (response.ok || response.status === 401 || response.status === 404) {
          return { path, status: response.status, body: body.slice(0, 120) };
        }
        lastError = `${path} returned ${response.status}: ${body.slice(0, 120)}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    await sleep(5_000);
  }
  throw new Error(`Timed out waiting for Zep at ${baseUrl}. Last error: ${lastError}`);
}

console.log(
  `[zep-self-hosted-up] starting Zep docker compose stack with DOCKER_CONFIG=${dockerConfigDir}`,
);
await dockerStreaming([...composeArgs, "up", "-d"]);

console.log("[zep-self-hosted-up] waiting for Zep API");
const health = await waitForZep();

const { stdout } = await docker([...composeArgs, "ps"]);
console.log(stdout.trim());
console.log(
  `[zep-self-hosted-up] PASS ${baseUrl}${health.path} responded with ${health.status}`,
);
