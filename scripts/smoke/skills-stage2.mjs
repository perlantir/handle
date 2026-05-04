import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });

const mode = process.argv[2] ?? "all";
const userId = `skills-stage2-${Date.now()}`;

const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const { createCustomSkill } = await import("../../apps/api/src/skills/customSkills.ts");
const { exportSkillBundle, importSkillBundle } = await import("../../apps/api/src/skills/importExport.ts");
const { createSkillSchedule, runSkillScheduleNow } = await import("../../apps/api/src/skills/schedules.ts");
const { getSkillForUser, listSkillsForUser, syncBuiltinSkills } = await import("../../apps/api/src/skills/skillRegistry.ts");
const { runSkill } = await import("../../apps/api/src/skills/skillRunner.ts");
const { createSkillWorkflow, runSkillWorkflow } = await import("../../apps/api/src/skills/workflows.ts");

const skillMd = `## Overview
Custom smoke Skill.
## Activation
Use for smoke tests.
## Inputs
Requires topic.
## Workflow
Validate inputs and produce an artifact.
## Tools
Uses no external tools.
## Safety
Does not write externally.
## Artifacts
Produces custom markdown.
## Citations
Citations are not required.
## Evaluation
Happy path exercises trace and artifact creation.`;

const createdIds = {
  schedules: [],
  skills: [],
  workflowRuns: [],
  workflows: [],
};

try {
  await syncBuiltinSkills(prisma);
  const builtins = await listSkillsForUser({ userId });
  const research = builtins.find((skill) => skill.slug === "research-company");
  if (!research) throw new Error("research-company builtin missing");

  if (needs("custom-skill-crud") || needs("custom-skill-test-run") || needs("project-skill-library") || needs("skill-import-export")) {
    const custom = await createCustomSkill({
      input: {
        category: "custom",
        description: "Custom smoke Skill",
        inputSlots: [{ id: "topic", label: "Topic", required: true, type: "text" }],
        name: "Custom Smoke Skill",
        runtimePolicy: { browserModes: ["server_browser", "local_browser"], computerUse: true, filesystem: "PROJECT_WORKSPACE", maxDurationMinutes: 15 },
        schedulingConfig: { allowed: true },
        skillMd,
        visibility: "PERSONAL",
      },
      userId,
    });
    createdIds.skills.push(custom.id);
    const loaded = await getSkillForUser({ skillIdOrSlug: custom.id, userId });
    if (!loaded || loaded.name !== custom.name) throw new Error("custom Skill did not load");
    if (needs("custom-skill-test-run")) {
      const run = await runSkill({
        request: { inputs: { topic: "smoke" }, trigger: "SUGGESTED" },
        skillIdOrSlug: custom.id,
        userId,
      });
      if (run.status !== "COMPLETED") throw new Error("custom Skill test run failed");
    }
    if (needs("project-skill-library")) {
      const project = await prisma.project.create({
        data: { name: `Skill Project ${Date.now()}`, workspaceScope: "DEFAULT_WORKSPACE" },
      });
      const projectSkill = await createCustomSkill({
        input: {
          category: "custom",
          description: "Project Skill smoke",
          name: "Project Skill Smoke",
          projectId: project.id,
          skillMd,
          visibility: "PROJECT",
        },
        projectId: project.id,
        userId,
      });
      createdIds.skills.push(projectSkill.id);
      const projectSkills = await listSkillsForUser({ projectId: project.id, userId });
      if (!projectSkills.some((skill) => skill.id === projectSkill.id)) throw new Error("project Skill not listed");
      await prisma.project.delete({ where: { id: project.id } });
    }
    if (needs("skill-import-export")) {
      const bundle = await exportSkillBundle({ skillId: custom.id, userId });
      const imported = await importSkillBundle({ bundle, sourceName: "smoke-export.json", userId });
      createdIds.skills.push(imported.skill.id);
      if (!imported.validation.valid) throw new Error("import validation failed");
    }
  }

  if (needs("skill-workflow-sequential") || needs("skill-workflow-parallel")) {
    const parallel = mode === "skill-workflow-parallel";
    const workflow = await createSkillWorkflow({
      input: {
        graph: {
          artifactBindings: [],
          nodes: parallel
            ? [
                { dependsOn: [], id: "a", inputs: { company: "Acme", depth: "quick" }, parallelGroup: "p", skillId: research.id },
                { dependsOn: [], id: "b", inputs: { company: "Globex", depth: "quick" }, parallelGroup: "p", skillId: research.id },
              ]
            : [
                { dependsOn: [], id: "a", inputs: { company: "Acme", depth: "quick" }, skillId: research.id },
                { dependsOn: ["a"], id: "b", inputs: { company: "Globex", depth: "quick" }, skillId: research.id },
              ],
        },
        name: parallel ? "Parallel smoke workflow" : "Sequential smoke workflow",
      },
      userId,
    });
    createdIds.workflows.push(workflow.id);
    const run = await runSkillWorkflow({ userId, workflowId: workflow.id });
    createdIds.workflowRuns.push(run.id);
    if (run.status !== "COMPLETED") throw new Error(`workflow failed: ${run.errorMessage ?? run.status}`);
  }

  if (needs("skill-schedule-once") || needs("skill-schedule-cron")) {
    const schedule = await createSkillSchedule({
      input: {
        cronExpression: "0 9 * * *",
        enabled: false,
        inputs: { company: "Acme", depth: "quick" },
        name: "Smoke Skill schedule",
        skillId: research.id,
      },
      userId,
    });
    createdIds.schedules.push(schedule.id);
    const run = await runSkillScheduleNow({ scheduleId: schedule.id, userId });
    if (run.status !== "COMPLETED") throw new Error("schedule run-now failed");
  }

  if (needs("skill-browser-runtime") || needs("skill-local-browser-approval") || needs("wide-research-orchestration")) {
    const runtimeMode = mode === "wide-research-orchestration" ? "wide_research" : mode === "skill-local-browser-approval" ? "local_browser" : "server_browser";
    let runtimeSkillId = research.id;
    let runtimeInputs = { company: "Acme", depth: "quick" };
    if (runtimeMode === "local_browser") {
      const custom = await createCustomSkill({
        input: {
          category: "browser",
          description: "Local browser runtime smoke Skill",
          inputSlots: [{ id: "topic", label: "Topic", required: true, type: "text" }],
          name: "Local Browser Runtime Smoke",
          runtimePolicy: { browserModes: ["server_browser", "local_browser"], filesystem: "PROJECT_WORKSPACE", maxDurationMinutes: 15 },
          skillMd,
          visibility: "PERSONAL",
        },
        userId,
      });
      createdIds.skills.push(custom.id);
      runtimeSkillId = custom.id;
      runtimeInputs = { topic: "local browser" };
    }
    const run = await runSkill({
      request: { inputs: runtimeInputs, runtimeMode },
      skillIdOrSlug: runtimeSkillId,
      userId,
    });
    if (run.status !== "COMPLETED") throw new Error(`${runtimeMode} run failed`);
    if (runtimeMode === "wide_research" && !run.steps.some((step) => step.toolName === "wide_research.subtask")) throw new Error("wide research steps missing");
    if (runtimeMode !== "wide_research" && !run.artifacts.some((artifact) => artifact.kind === "BROWSER_SESSION_SUMMARY")) throw new Error("runtime summary artifact missing");
  }

  console.log(`[skills-stage2:${mode}] PASS`);
} finally {
  await prisma.skillSchedule.deleteMany({ where: { id: { in: createdIds.schedules } } }).catch(() => undefined);
  await prisma.skillWorkflowRun.deleteMany({ where: { id: { in: createdIds.workflowRuns } } }).catch(() => undefined);
  await prisma.skillWorkflow.deleteMany({ where: { id: { in: createdIds.workflows } } }).catch(() => undefined);
  await prisma.skill.deleteMany({ where: { id: { in: createdIds.skills } } }).catch(() => undefined);
  await prisma.$disconnect();
}

function needs(target) {
  return mode === "all" || mode === target;
}
