import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createSkillsRouter } from "./skills";

function createSkillStore() {
  const skills: any[] = [];
  const runs: any[] = [];
  const steps: any[] = [];
  const artifacts: any[] = [];
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
});
