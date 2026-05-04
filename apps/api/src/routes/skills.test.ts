import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createSkillsRouter } from "./skills";

function createSkillStore() {
  const skills: any[] = [];
  const runs: any[] = [];
  const steps: any[] = [];
  const artifacts: any[] = [];
  const schedules: any[] = [];
  const workflows: any[] = [];
  const workflowRuns: any[] = [];
  const importRecords: any[] = [];
  let id = 0;

  function nextId(prefix: string) {
    id += 1;
    return `${prefix}-${id}`;
  }

  const store = {
    integration: {
      findMany: async () => [],
    },
    skill: {
      create: async ({ data }: any) => {
        const now = new Date();
        const row = { ...data, archivedAt: null, createdAt: now, id: nextId("skill"), updatedAt: now };
        skills.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        if (where?.slug && where?.version && where?.sourceType) {
          return skills.find((skill) => skill.slug === where.slug && skill.version === where.version && skill.sourceType === where.sourceType) ?? null;
        }
        if (where?.id) {
          return skills.find((skill) => skill.id === where.id) ?? null;
        }
        const candidates = where?.OR ?? [];
        return skills.find((skill) =>
          candidates.some((candidate: any) => candidate.id === skill.id || candidate.slug === skill.slug),
        ) ?? null;
      },
      findMany: async ({ include }: any = {}) => {
        return skills
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((skill) => ({
            ...skill,
            ...(include?.runs ? { runs: runs.filter((run) => run.skillId === skill.id).slice(0, 1) } : {}),
          }));
      },
      update: async ({ data, where }: any) => {
        const index = skills.findIndex((skill) => skill.id === where.id);
        skills[index] = { ...skills[index], ...data, updatedAt: new Date() };
        return skills[index];
      },
    },
    skillArtifact: {
      create: async ({ data }: any) => {
        const now = new Date();
        const row = { ...data, createdAt: now, id: nextId("artifact"), updatedAt: now };
        artifacts.push(row);
        return row;
      },
    },
    skillImportRecord: {
      create: async ({ data }: any) => {
        const now = new Date();
        const row = { ...data, createdAt: now, id: nextId("import") };
        importRecords.push(row);
        return row;
      },
    },
    skillRun: {
      create: async ({ data }: any) => {
        const now = new Date();
        const row = { ...data, artifacts: [], createdAt: now, id: nextId("run"), steps: [], updatedAt: now };
        runs.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        const run = runs.find((item) => item.id === where.id && item.userId === where.userId);
        return run ? hydrateRun(run, skills, steps, artifacts) : null;
      },
      findMany: async () => runs.map((run) => hydrateRun(run, skills, steps, artifacts)),
      findUnique: async ({ where }: any) => {
        const run = runs.find((item) => item.id === where.id);
        return run ? hydrateRun(run, skills, steps, artifacts) : null;
      },
      update: async ({ data, where }: any) => {
        const index = runs.findIndex((run) => run.id === where.id);
        runs[index] = { ...runs[index], ...data, updatedAt: new Date() };
        return runs[index];
      },
    },
    skillRunStep: {
      create: async ({ data }: any) => {
        const now = new Date();
        const duplicate = steps.some((step) => step.skillRunId === data.skillRunId && step.index === data.index);
        if (duplicate) {
          throw new Error("Unique constraint failed on the fields: (`skillRunId`,`index`)");
        }
        const row = { ...data, createdAt: now, id: nextId("step"), startedAt: now, updatedAt: now };
        steps.push(row);
        return row;
      },
    },
    skillSchedule: {
      create: async ({ data, include }: any) => {
        const now = new Date();
        const row = { ...data, createdAt: now, id: nextId("schedule"), updatedAt: now };
        schedules.push(row);
        return include?.skill ? { ...row, skill: skills.find((skill) => skill.id === row.skillId) } : row;
      },
      findFirst: async ({ where, include }: any) => {
        const row = schedules.find((item) => item.id === where.id && item.userId === where.userId) ?? null;
        return row && include?.skill ? { ...row, skill: skills.find((skill) => skill.id === row.skillId) } : row;
      },
      findMany: async ({ include }: any = {}) => schedules.map((row) => include?.skill ? { ...row, skill: skills.find((skill) => skill.id === row.skillId) } : row),
      update: async ({ data, where, include }: any) => {
        const index = schedules.findIndex((row) => row.id === where.id);
        schedules[index] = { ...schedules[index], ...data, updatedAt: new Date() };
        return include?.skill ? { ...schedules[index], skill: skills.find((skill) => skill.id === schedules[index].skillId) } : schedules[index];
      },
    },
    skillWorkflow: {
      create: async ({ data, include }: any) => {
        const now = new Date();
        const row = { ...data, createdAt: now, id: nextId("workflow"), updatedAt: now };
        workflows.push(row);
        return include?.runs ? { ...row, runs: [] } : row;
      },
      findFirst: async ({ where }: any) => workflows.find((row) => row.id === where.id && row.userId === where.userId && row.enabled === where.enabled) ?? null,
      findMany: async ({ include }: any = {}) => workflows.map((row) => include?.runs ? { ...row, runs: workflowRuns.filter((run) => run.workflowId === row.id) } : row),
    },
    skillWorkflowRun: {
      create: async ({ data }: any) => {
        const now = new Date();
        const row = { ...data, createdAt: now, id: nextId("workflow-run") };
        workflowRuns.push(row);
        return row;
      },
      update: async ({ data, where }: any) => {
        const index = workflowRuns.findIndex((run) => run.id === where.id);
        workflowRuns[index] = { ...workflowRuns[index], ...data };
        return workflowRuns[index];
      },
    },
  };

  return store;
}

function hydrateRun(run: any, skills: any[], steps: any[], artifacts: any[]) {
  return {
    ...run,
    artifacts: artifacts.filter((artifact) => artifact.skillRunId === run.id),
    skill: skills.find((skill) => skill.id === run.skillId),
    steps: steps.filter((step) => step.skillRunId === run.id).sort((a, b) => a.index - b.index),
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createSkillsRouter({ getUserId: () => "user-test", store: createSkillStore() as any }));
  return app;
}

describe("skills routes", () => {
  it("lists built-in Skills", async () => {
    const response = await request(createApp()).get("/api/skills").expect(200);

    expect(response.body.skills).toHaveLength(5);
    expect(response.body.skills.map((skill: any) => skill.slug)).toContain("research-company");
  });

  it("runs a no-credential Skill and returns trace artifacts", async () => {
    const app = createApp();
    await request(app).get("/api/skills").expect(200);

    const response = await request(app)
      .post("/api/skills/research-company/run")
      .send({ inputs: { company: "Acme", depth: "quick" } })
      .expect(201);

    expect(response.body.run).toMatchObject({
      resultSummary: "Created cited research report for Acme.",
      status: "COMPLETED",
    });
    expect(response.body.run.steps.length).toBeGreaterThan(1);
    expect(new Set(response.body.run.steps.map((step: any) => step.index)).size).toBe(response.body.run.steps.length);
    expect(response.body.run.artifacts.map((artifact: any) => artifact.kind)).toEqual([
      "REPORT",
      "SOURCE_SET",
    ]);
  });

  it("creates a custom Skill and test-runs it", async () => {
    const app = createApp();
    const skillMd = "## Overview\nCustom.\n## Activation\nUse it.\n## Inputs\nInput.\n## Workflow\nRun.\n## Tools\nNone.\n## Safety\nSafe.\n## Artifacts\nOutput.\n## Citations\nNone.\n## Evaluation\nFixture.";
    const created = await request(app)
      .post("/api/skills")
      .send({
        category: "custom",
        description: "Custom smoke Skill",
        inputSlots: [{ id: "topic", label: "Topic", required: true, type: "text" }],
        name: "Custom Smoke Skill",
        skillMd,
        visibility: "PERSONAL",
      })
      .expect(201);

    const run = await request(app)
      .post(`/api/skills/${created.body.skill.id}/test-run`)
      .send({ inputs: { topic: "trace" } })
      .expect(201);

    expect(run.body.run.status).toBe("COMPLETED");
    expect(run.body.run.artifacts[0].kind).toBe("CUSTOM_MARKDOWN");
  });

  it("runs Skill workflows and schedules", async () => {
    const app = createApp();
    const list = await request(app).get("/api/skills").expect(200);
    const skill = list.body.skills.find((item: any) => item.slug === "research-company");

    const workflow = await request(app)
      .post("/api/skill-workflows")
      .send({
        graph: {
          artifactBindings: [],
          nodes: [{ dependsOn: [], id: "research", inputs: { company: "Acme", depth: "quick" }, skillId: skill.id }],
        },
        name: "Research workflow",
      })
      .expect(201);
    const workflowRun = await request(app).post(`/api/skill-workflows/${workflow.body.workflow.id}/run`).send({}).expect(201);
    expect(workflowRun.body.run.status).toBe("COMPLETED");

    const schedule = await request(app)
      .post("/api/skill-schedules")
      .send({
        cronExpression: "0 9 * * *",
        enabled: false,
        inputs: { company: "Acme", depth: "quick" },
        name: "Daily research",
        skillId: skill.id,
      })
      .expect(201);
    const scheduledRun = await request(app).post(`/api/skill-schedules/${schedule.body.schedule.id}/run-now`).send({}).expect(201);
    expect(scheduledRun.body.run.status).toBe("COMPLETED");
  });
});
