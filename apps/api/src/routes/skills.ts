import { Router } from "express";
import { z } from "zod";
import type { CreateSkillRequest, CreateSkillScheduleRequest, CreateSkillWorkflowRequest, RunSkillRequest, SkillImportBundle, UpdateSkillRequest } from "@handle/shared";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { createDefaultIntegrationToolRuntime } from "../integrations/toolRuntime";
import { appendActionLog } from "../lib/actionLog";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { createCustomSkill, updateCustomSkill } from "../skills/customSkills";
import { exportSkillBundle, importSkillBundle } from "../skills/importExport";
import { createSkillSchedule, listSkillSchedules, runSkillScheduleNow } from "../skills/schedules";
import {
  getSkillForUser,
  listSkillsForUser,
  syncBuiltinSkills,
} from "../skills/skillRegistry";
import { runSkill } from "../skills/skillRunner";
import { serializeSkillRunDetail, serializeSkillRunSummary } from "../skills/serializer";
import { createSkillWorkflow, listSkillWorkflows, runSkillWorkflow } from "../skills/workflows";

const runSkillSchema = z.object({
  backend: z.enum(["e2b", "local"]).optional(),
  conversationId: z.string().optional(),
  inputs: z.record(z.unknown()).default({}),
  memoryEnabled: z.boolean().optional(),
  modelName: z.string().optional(),
  projectId: z.string().optional(),
  providerId: z.string().optional(),
  runtimeMode: z.enum(["standard", "server_browser", "local_browser", "computer_use", "wide_research"]).optional(),
  trigger: z.enum(["MANUAL", "SCHEDULED", "WORKFLOW", "API", "SUGGESTED"]).optional(),
});

const customSkillSchema = z.object({
  activationExamples: z.array(z.string()).optional(),
  approvalPolicy: z.record(z.unknown()).optional(),
  category: z.string().min(1),
  customMetadata: z.record(z.unknown()).optional(),
  description: z.string().min(1),
  evalFixtures: z.array(z.unknown()).optional(),
  icon: z.object({ kind: z.enum(["letter", "icon"]), tone: z.string().optional(), value: z.string().min(1) }).optional(),
  inputSlots: z.array(z.record(z.unknown())).optional(),
  name: z.string().min(1),
  negativeActivationExamples: z.array(z.string()).optional(),
  optionalIntegrations: z.array(z.string()).optional(),
  outputArtifactContract: z.record(z.unknown()).optional(),
  packageMetadata: z.record(z.unknown()).optional(),
  projectId: z.string().optional(),
  requiredIntegrations: z.array(z.string()).optional(),
  reusableResources: z.array(z.unknown()).optional(),
  runtimePolicy: z.record(z.unknown()).optional(),
  schedulingConfig: z.record(z.unknown()).optional(),
  skillMd: z.string().min(1),
  slug: z.string().optional(),
  sourceCitationPolicy: z.record(z.unknown()).optional(),
  suggestedModel: z.string().optional(),
  suggestedProvider: z.string().optional(),
  toolPolicy: z.record(z.unknown()).optional(),
  uiTemplate: z.string().optional(),
  version: z.string().optional(),
  visibility: z.enum(["PERSONAL", "PROJECT"]),
});

const updateSkillSchema = customSkillSchema.partial().extend({
  enabled: z.boolean().optional(),
});

const workflowSchema = z.object({
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  graph: z.object({
    artifactBindings: z.array(z.record(z.unknown())).default([]),
    nodes: z.array(z.object({
      dependsOn: z.array(z.string()).default([]),
      id: z.string().min(1),
      inputs: z.record(z.unknown()).default({}),
      optional: z.boolean().optional(),
      parallelGroup: z.string().optional(),
      skillId: z.string().min(1),
    })).min(1),
  }),
  name: z.string().min(1),
  projectId: z.string().optional(),
  visibility: z.enum(["PERSONAL", "PROJECT"]).optional(),
});

const scheduleSchema = z.object({
  cronExpression: z.string().optional(),
  enabled: z.boolean().optional(),
  inputs: z.record(z.unknown()).default({}),
  name: z.string().min(1),
  projectId: z.string().optional(),
  runAt: z.string().optional(),
  skillId: z.string().min(1),
  timezone: z.string().optional(),
});

const skillSendApprovalSchema = z.object({
  decision: z.enum(["approved", "denied"]),
});

interface CreateSkillsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  store?: typeof prisma;
}

export function createSkillsRouter({
  getUserId = getAuthenticatedUserId,
  store = prisma,
}: CreateSkillsRouterOptions = {}) {
  const router = Router();

  router.get(
    "/skills",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const skills = await listSkillsForUser({
        ...stringQuery("projectId", req.query.projectId),
        store,
        userId,
      });
      const category = typeof req.query.category === "string" ? req.query.category : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      return res.json({
        skills: skills.filter((skill) => {
          if (category && skill.category !== category) return false;
          if (q && !`${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(q)) return false;
          return true;
        }),
      });
    }),
  );

  router.post(
    "/skills",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = customSkillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid custom Skill", details: parsed.error.flatten() });
      }
      const skill = await createCustomSkill({
        input: JSON.parse(JSON.stringify(parsed.data)) as CreateSkillRequest,
        ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
        store,
        userId,
      });
      return res.status(201).json({ skill });
    }),
  );

  router.post(
    "/skills/import",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const bundle = req.body?.bundle ?? req.body;
      const imported = await importSkillBundle({
        bundle: JSON.parse(JSON.stringify(bundle)) as SkillImportBundle,
        ...(typeof req.body?.projectId === "string" ? { projectId: req.body.projectId } : {}),
        sourceName: typeof req.body?.sourceName === "string" ? req.body.sourceName : "skill-import.json",
        store,
        userId,
      });
      return res.status(201).json(imported);
    }),
  );

  router.get(
    "/skills/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const skillId = req.params.id;
      if (!skillId) return res.status(400).json({ error: "Missing skill id" });
      const skill = await getSkillForUser({
        ...stringQuery("projectId", req.query.projectId),
        skillIdOrSlug: skillId,
        store,
        userId,
      });
      if (!skill) return res.status(404).json({ error: "Skill not found" });
      return res.json({ skill });
    }),
  );

  router.put(
    "/skills/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = updateSkillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid custom Skill update", details: parsed.error.flatten() });
      }
      const skillId = req.params.id;
      if (!skillId) return res.status(400).json({ error: "Missing skill id" });
      const skill = await updateCustomSkill({
        input: JSON.parse(JSON.stringify(parsed.data)) as UpdateSkillRequest,
        skillId,
        store,
        userId,
      });
      return res.json({ skill });
    }),
  );

  router.get(
    "/skills/:id/export",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const skillId = req.params.id;
      if (!skillId) return res.status(400).json({ error: "Missing skill id" });
      const bundle = await exportSkillBundle({
        ...stringQuery("projectId", req.query.projectId),
        skillId,
        store,
        userId,
      });
      return res.json({ bundle });
    }),
  );

  router.post(
    "/skills/:id/run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = runSkillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const skillId = req.params.id;
      if (!skillId) return res.status(400).json({ error: "Missing skill id" });
      const run = await runSkill({
        request: JSON.parse(JSON.stringify(parsed.data)) as RunSkillRequest,
        skillIdOrSlug: skillId,
        store,
        userId,
      });
      return res.status(201).json({ run });
    }),
  );

  router.post(
    "/skills/:id/test-run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = runSkillSchema.safeParse({ ...req.body, trigger: "SUGGESTED" });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const skillId = req.params.id;
      if (!skillId) return res.status(400).json({ error: "Missing skill id" });
      const run = await runSkill({
        request: JSON.parse(JSON.stringify(parsed.data)) as RunSkillRequest,
        skillIdOrSlug: skillId,
        store,
        userId,
      });
      return res.status(201).json({ run });
    }),
  );

  router.get(
    "/skill-workflows",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const workflows = await listSkillWorkflows({
        ...stringQuery("projectId", req.query.projectId),
        store,
        userId,
      });
      return res.json({ workflows });
    }),
  );

  router.post(
    "/skill-workflows",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = workflowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid Skill workflow", details: parsed.error.flatten() });
      }
      const workflow = await createSkillWorkflow({
        input: JSON.parse(JSON.stringify(parsed.data)) as CreateSkillWorkflowRequest,
        store,
        userId,
      });
      return res.status(201).json({ workflow });
    }),
  );

  router.post(
    "/skill-workflows/:id/run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const workflowId = req.params.id;
      if (!workflowId) return res.status(400).json({ error: "Missing workflow id" });
      const run = await runSkillWorkflow({
        inputs: req.body?.inputs && typeof req.body.inputs === "object" ? req.body.inputs : {},
        store,
        userId,
        workflowId,
      });
      return res.status(201).json({ run });
    }),
  );

  router.get(
    "/skill-schedules",
    asyncHandler(async (_req, res) => {
      const userId = getUserId(_req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const schedules = await listSkillSchedules({ store, userId });
      return res.json({ schedules });
    }),
  );

  router.post(
    "/skill-schedules",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = scheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid Skill schedule", details: parsed.error.flatten() });
      }
      const schedule = await createSkillSchedule({
        input: JSON.parse(JSON.stringify(parsed.data)) as CreateSkillScheduleRequest,
        store,
        userId,
      });
      return res.status(201).json({ schedule });
    }),
  );

  router.post(
    "/skill-schedules/:id/run-now",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const scheduleId = req.params.id;
      if (!scheduleId) return res.status(400).json({ error: "Missing schedule id" });
      const run = await runSkillScheduleNow({ scheduleId, store, userId });
      return res.status(201).json({ run });
    }),
  );

  router.get(
    "/skill-runs",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await syncBuiltinSkills(store);

      const rows = await store.skillRun.findMany({
        include: { artifacts: true, skill: true, steps: true },
        orderBy: { createdAt: "desc" },
        take: 100,
        where: {
          userId,
          ...(typeof req.query.skillId === "string" ? { skillId: req.query.skillId } : {}),
          ...(typeof req.query.projectId === "string" ? { projectId: req.query.projectId } : {}),
          ...(typeof req.query.status === "string" ? { status: req.query.status as never } : {}),
        },
      });
      return res.json({ runs: rows.map(serializeSkillRunSummary) });
    }),
  );

  router.get(
    "/skill-runs/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Missing run id" });
      const row = await store.skillRun.findFirst({
        include: {
          artifacts: { orderBy: { createdAt: "asc" } },
          skill: true,
          steps: { orderBy: { index: "asc" } },
        },
        where: { id: runId, userId },
      });
      if (!row) return res.status(404).json({ error: "Skill run not found" });
      return res.json({ run: serializeSkillRunDetail(row) });
    }),
  );

  router.get(
    "/skill-runs/:id/artifacts",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Missing run id" });
      const row = await store.skillRun.findFirst({
        include: {
          artifacts: { orderBy: { createdAt: "asc" } },
          skill: true,
          steps: { orderBy: { index: "asc" } },
        },
        where: { id: runId, userId },
      });
      if (!row) return res.status(404).json({ error: "Skill run not found" });
      return res.json({ artifacts: serializeSkillRunDetail(row).artifacts });
    }),
  );

  router.post(
    "/skill-runs/:id/send-approval",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = skillSendApprovalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid approval decision", details: parsed.error.flatten() });
      }

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Missing run id" });
      const row = await store.skillRun.findFirst({
        include: {
          artifacts: { orderBy: { createdAt: "asc" } },
          skill: true,
          steps: { orderBy: { index: "asc" } },
        },
        where: { id: runId, userId },
      });
      if (!row) return res.status(404).json({ error: "Skill run not found" });
      if (row.skill.slug !== "email-outreach") {
        return res.status(400).json({ error: "Send approval is only available for Email Outreach Skill runs." });
      }

      const draftArtifact = row.artifacts.find((artifact) => artifact.kind === "EMAIL_DRAFTS");
      if (!draftArtifact?.inlineContent) {
        return res.status(400).json({ error: "No email draft batch is available for this Skill run." });
      }
      const drafts = parseDraftBatch(draftArtifact.inlineContent);
      if (drafts.length === 0) {
        return res.status(400).json({ error: "Email draft batch has no sendable drafts." });
      }

      const nextIndex = (row.steps.at(-1)?.index ?? -1) + 1;
      if (parsed.data.decision === "denied") {
        await store.skillRunStep.create({
          data: {
            completedAt: new Date(),
            index: nextIndex,
            metadata: { decision: "denied", draftCount: drafts.length },
            redactedInput: {},
            redactedOutput: {},
            safeSummary: "User denied sending the email draft batch. No emails were sent.",
            skillRunId: row.id,
            status: "completed",
            title: "Send approval denied",
            type: "APPROVAL",
          },
        });
        await appendActionLog({
          conversationId: row.conversationId ?? "",
          description: "User denied Email Outreach send approval. No emails were sent.",
          metadata: { decision: "denied", draftCount: drafts.length, skillRunId: row.id },
          outcomeType: "integration_action",
          projectId: row.projectId ?? "",
          reversible: false,
          target: "gmail:send-batch",
          taskId: row.id,
          timestamp: new Date().toISOString(),
        });
        return res.json({ decision: "denied", sentCount: 0 });
      }

      const runtime = createDefaultIntegrationToolRuntime();
      const sent: string[] = [];
      for (const draft of drafts) {
        await runtime.request({
          connectorId: "gmail",
          data: { raw: toGmailRawMessage(draft) },
          endpoint: "/gmail/v1/users/me/messages/send",
          method: "POST",
          userId,
        });
        sent.push(draft.recipient);
      }

      await store.skillRunStep.create({
        data: {
          completedAt: new Date(),
          connectorId: "GMAIL",
          index: nextIndex,
          metadata: { decision: "approved", draftCount: drafts.length, sentCount: sent.length },
          redactedInput: { draftCount: drafts.length },
          redactedOutput: { sentCount: sent.length },
          safeSummary: `User approved and sent ${sent.length} email draft(s).`,
          skillRunId: row.id,
          status: "completed",
          title: "Send approved",
          toolName: "gmail_send",
          type: "APPROVAL",
        },
      });
      await appendActionLog({
        conversationId: row.conversationId ?? "",
        description: `Sent ${sent.length} Email Outreach draft(s) after explicit approval.`,
        metadata: { decision: "approved", draftCount: drafts.length, skillRunId: row.id },
        outcomeType: "integration_action",
        projectId: row.projectId ?? "",
        reversible: false,
        target: "gmail:send-batch",
        taskId: row.id,
        timestamp: new Date().toISOString(),
      });

      return res.json({ decision: "approved", sentCount: sent.length });
    }),
  );

  return router;
}

export const skillsRouter = createSkillsRouter();

function stringQuery(key: "projectId", value: unknown): { projectId?: string } {
  return typeof value === "string" ? { [key]: value } : {};
}

interface ParsedEmailDraft {
  body: string;
  recipient: string;
  subject: string;
}

function parseDraftBatch(inlineContent: string): ParsedEmailDraft[] {
  const parsed = JSON.parse(inlineContent) as { drafts?: unknown };
  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
  return drafts
    .map((draft) => {
      if (!draft || typeof draft !== "object") return null;
      const record = draft as Record<string, unknown>;
      const recipient = typeof record.recipient === "string" ? record.recipient.trim() : "";
      const subject = typeof record.subject === "string" ? record.subject.trim() : "";
      const body = typeof record.body === "string" ? record.body.trim() : "";
      if (!recipient || !subject || !body) return null;
      return {
        body: redactSecrets(body),
        recipient: redactSecrets(recipient),
        subject: redactSecrets(subject),
      };
    })
    .filter((draft): draft is ParsedEmailDraft => Boolean(draft));
}

function toGmailRawMessage(draft: ParsedEmailDraft) {
  const message = [
    `To: ${draft.recipient}`,
    `Subject: ${draft.subject.replace(/\r|\n/g, " ")}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    draft.body,
  ].join("\r\n");
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
