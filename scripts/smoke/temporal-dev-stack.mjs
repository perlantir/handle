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

await run("pnpm", ["temporal:up"]);
await waitForPort(7233);
await waitForPort(8233);
console.log("PASS temporal dev stack reachable on 7233 and 8233");
