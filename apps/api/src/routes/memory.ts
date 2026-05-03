import { Router } from "express";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { redactSecrets } from "../lib/redact";
import { listProcedureTemplates } from "../memory/proceduralMemory";
import { getZepClient } from "../memory/zepClient";

export interface MemoryFactRow {
  id: string;
  confidence: number;
  content: string;
  lastUpdated: string;
  invalidAt?: string | null;
  source: "global" | "project";
  sourceLabel: string;
  sessionId: string;
  type: string;
  validAt?: string | null;
}

export function createMemoryRouter({
  getUserId = getAuthenticatedUserId,
  zepClient = getZepClient(),
} = {}) {
  const router = Router();

  router.get(
    "/memory/facts",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const status = await zepClient.checkConnection();
      if (status.status !== "online") {
        return res.json({
          facts: [],
          status: { provider: status.provider, status: "offline", detail: status.detail },
        });
      }

      const sessions = await zepClient.listSessions();
      if (!sessions.ok || !sessions.value) {
        return res.json({
          facts: [],
          status: { provider: status.provider, status: "offline", detail: sessions.detail },
        });
      }

      const scope = typeof req.query.scope === "string" ? req.query.scope : "all";
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
      const facts: MemoryFactRow[] = [];
      for (const session of sessions.value.filter((item) =>
        shouldIncludeSession(item.sessionId, scope, projectId),
      )) {
        const memory = await zepClient.getSessionMemory({ sessionId: session.sessionId });
        if (!memory.ok || !memory.value) continue;
        for (const [index, message] of memory.value.entries()) {
          const fact: MemoryFactRow = {
            confidence: 0.8,
            content: redactSecrets(message.content),
            id: `${session.sessionId}:${index}`,
            lastUpdated: new Date().toISOString(),
            sessionId: session.sessionId,
            source: session.sessionId.startsWith("global_") ? "global" : "project",
            sourceLabel: sourceLabel(session.sessionId),
            type: memoryType(message.metadata),
          };
          if (typeof message.metadata?.valid_at === "string") fact.validAt = message.metadata.valid_at;
          if (typeof message.metadata?.invalid_at === "string") fact.invalidAt = message.metadata.invalid_at;
          facts.push(fact);
        }
      }

      return res.json({
        facts,
        status: { provider: status.provider, status: "online" },
      });
    }),
  );

  router.delete(
    "/memory/facts/:sessionId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { sessionId } = req.params;
      if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

      const result = await zepClient.deleteSessionMemory({
        sessionId,
      });
      if (!result.ok) {
        return res.status(503).json({ error: result.detail ?? "Memory unavailable" });
      }
      return res.json({ deleted: true, sessionId });
    }),
  );

  router.get(
    "/memory/procedures",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const procedures = await listProcedureTemplates();
      return res.json({ procedures });
    }),
  );

  return router;
}

function shouldIncludeSession(sessionId: string, scope: string, projectId: string | null) {
  if (sessionId.startsWith("conv_")) return false;
  if (scope === "global") return sessionId.startsWith("global_");
  if (scope === "project") {
    return projectId ? sessionId === `project_${projectId}` : sessionId.startsWith("project_");
  }
  return sessionId.startsWith("global_") || sessionId.startsWith("project_");
}

function sourceLabel(sessionId: string) {
  if (sessionId.startsWith("global_")) return "Global";
  if (sessionId.startsWith("project_")) return sessionId.replace(/^project_/, "Project ");
  return sessionId;
}

function memoryType(metadata: Record<string, unknown> | undefined) {
  const role = metadata?.role;
  if (typeof role === "string" && role.toLowerCase() === "assistant") return "Idea";
  if (typeof role === "string") return "Preference";
  return "Fact";
}

export const memoryRouter = createMemoryRouter();
