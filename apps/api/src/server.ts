import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import {
  isTestAuthBypassEnabled,
  requireClerkAuth,
} from "./auth/clerkMiddleware";
import {
  corsAllowedHeaders,
  corsMethods,
  corsOptions,
  corsOrigins,
} from "./lib/cors";
import { getLogFilePath, logger } from "./lib/logger";
import { approvalsRouter } from "./routes/approvals";
import { agentRunsRouter } from "./routes/agentRuns";
import { actionsRouter } from "./routes/actions";
import { healthRouter } from "./routes/health";
import { integrationsRouter } from "./routes/integrations";
import { memoryRouter } from "./routes/memory";
import { projectsRouter } from "./routes/projects";
import { settingsRouter } from "./routes/settings";
import { sharedMemoryRouter } from "./routes/sharedMemory";
import { skillsRouter } from "./routes/skills";
import { streamRouter } from "./routes/stream";
import { tasksRouter } from "./routes/tasks";

export async function createServer() {
  const app = express();

  app.use(express.json({ limit: "10mb" }));
  logger.info(
    {
      allowedHeaders: corsAllowedHeaders,
      credentials: true,
      methods: corsMethods,
      origins: corsOrigins,
    },
    "CORS configured",
  );
  app.use(cors(corsOptions));

  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, "request");
    next();
  });

  app.use("/health", healthRouter);

  if (isTestAuthBypassEnabled()) {
    logger.warn("Clerk auth bypass enabled for smoke test mode");
    app.use("/api", requireClerkAuth);
  } else {
    app.use("/api", clerkMiddleware(), requireClerkAuth);
  }
  app.use("/api", agentRunsRouter);
  app.use("/api", actionsRouter);
  app.use("/api/approvals", approvalsRouter);
  app.use("/api", integrationsRouter);
  app.use("/api", memoryRouter);
  app.use("/api", projectsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api", sharedMemoryRouter);
  app.use("/api", skillsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/tasks", streamRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error({ err, url: req.url }, "unhandled error");
      res.status(500).json({
        error: "Internal server error",
        logPath: getLogFilePath(),
      });
    },
  );

  return app;
}
