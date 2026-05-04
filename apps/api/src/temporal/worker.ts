import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as activities from "./activities";
import { loadTemporalSettings } from "./client";
import { logger } from "../lib/logger";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const settings = await loadTemporalSettings();
  const connection = await NativeConnection.connect({
    address: settings.address,
  });
  const worker = await Worker.create({
    activities,
    connection,
    namespace: settings.namespace,
    taskQueue: settings.taskQueue,
    workflowsPath: join(__dirname, "workflows", "agentRunWorkflow.ts"),
  });

  logger.info(
    {
      namespace: settings.namespace,
      taskQueue: settings.taskQueue,
      temporalAddress: settings.address,
    },
    "Temporal worker started",
  );
  await worker.run();
}

main().catch((err) => {
  logger.error({ err }, "Temporal worker crashed");
  process.exitCode = 1;
});
