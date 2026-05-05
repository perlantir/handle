import { runAgent } from "../agent/runAgent";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { isProviderId } from "../providers/types";
import { runScheduleNow } from "../schedules/manager";
import { runSkill } from "../skills/skillRunner";
import type { AgentRunWorkflowInput, ScheduledRunWorkflowInput, SkillRunWorkflowInput } from "./constants";

export async function startAgentRunActivity(input: AgentRunWorkflowInput) {
  logger.info(
    {
      agentRunId: input.agentRunId,
      backend: input.options?.backend ?? null,
      providerOverride: input.options?.providerOverride ?? null,
    },
    "Temporal activity starting agent run",
  );

  await runAgent(input.agentRunId, input.goal, {
    ...(input.options?.backend ? { backend: input.options.backend } : {}),
    ...(input.options?.providerOverride &&
    isProviderId(input.options.providerOverride)
      ? { providerOverride: input.options.providerOverride }
      : {}),
  });

  return { agentRunId: input.agentRunId, completedAt: new Date().toISOString() };
}

export async function startSkillRunActivity(input: SkillRunWorkflowInput) {
  let skillId = input.skillId;
  let userId = input.userId;
  let projectId = input.projectId;
  let inputs = input.inputs ?? {};

  if (input.scheduleId) {
    const schedule = await prisma.skillSchedule.findUnique({
      where: { id: input.scheduleId },
    });
    if (!schedule) throw new Error("Skill schedule not found");
    skillId = schedule.skillId;
    userId = schedule.userId;
    projectId = schedule.projectId ?? undefined;
    inputs = schedule.inputs as Record<string, unknown>;
  }

  if (!skillId) throw new Error("Skill id is required");

  logger.info(
    {
      projectId: projectId ?? null,
      scheduleId: input.scheduleId ?? null,
      skillId,
      trigger: input.trigger ?? "SCHEDULED",
    },
    "Temporal activity starting Skill run",
  );

  const run = await runSkill({
    request: {
      inputs,
      ...(projectId ? { projectId } : {}),
      trigger: input.trigger ?? "SCHEDULED",
    },
    skillIdOrSlug: skillId,
    userId,
  });

  if (input.scheduleId) {
    await prisma.skillSchedule.update({
      data: { lastRunAt: new Date() },
      where: { id: input.scheduleId },
    });
  }

  return { completedAt: new Date().toISOString(), skillRunId: run.id };
}

export async function startScheduledRunActivity(input: ScheduledRunWorkflowInput) {
  const schedule = await prisma.schedule.findUnique({ where: { id: input.scheduleId } });
  if (!schedule) throw new Error("Schedule not found");
  if (!schedule.enabled || schedule.status !== "ACTIVE") {
    logger.info(
      { scheduleId: schedule.id, status: schedule.status },
      "Skipping Temporal scheduled run because schedule is not active",
    );
    return { completedAt: new Date().toISOString(), scheduleRunId: null, status: "SKIPPED" };
  }
  const run = await runScheduleNow({
    scheduleId: schedule.id,
    userId: input.userId ?? schedule.userId,
  });
  return { completedAt: new Date().toISOString(), scheduleRunId: run.id, status: run.status };
}
