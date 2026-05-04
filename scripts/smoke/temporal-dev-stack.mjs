import net from "node:net";
import { spawn } from "node:child_process";

const root = new URL("../..", import.meta.url).pathname;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

function canConnect(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await canConnect(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Temporal port ${port} did not become reachable`);
}

async function waitForHttpOk(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry while the dev server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Temporal HTTP endpoint ${url} did not return 2xx`);
}

function output(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}

await run("pnpm", ["temporal:up"]);
await waitForPort(7233);
await waitForPort(8233);
await waitForHttpOk("http://127.0.0.1:8233");

const processList = await output("docker", [
  "exec",
  "handle-temporal",
  "sh",
  "-c",
  "ps aux",
]);

if (!processList.includes("temporal server start-dev")) {
  throw new Error(`Temporal server process not found:\n${processList}`);
}

if (processList.includes("sleep infinity temporal server start-dev")) {
  throw new Error(`Temporal compose is still passing server args to sleep:\n${processList}`);
}

console.log("PASS temporal dev stack serves gRPC and UI with temporal server start-dev running");
