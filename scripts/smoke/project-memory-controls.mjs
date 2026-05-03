#!/usr/bin/env node
import { createRequire } from "node:module";
import { config } from "dotenv";

const scenario = process.argv[2];
if (!scenario) throw new Error("Usage: project-memory-controls.mjs <scenario>");
const requireApi = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const express = requireApi("express");
const request = requireApi("supertest");
config({ path: new URL("../../.env", import.meta.url) });
const { createProjectsRouter } = await import("../../apps/api/src/routes/projects.ts");
const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const { appendMessageToZep } = await import("../../apps/api/src/memory/sessionMemory.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function app() {
  const server = express();
  server.use(express.json());
  server.use(
    "/api",
    createProjectsRouter({
      getUserId: () => "smoke-project-memory-controls",
      store: prisma,
      runAgent: async () => undefined,
    }),
  );
  return server;
}

async function run() {
  const suffix = Date.now();

  if (scenario === "new-project-inherits-providers") {
    await prisma.memorySettings.upsert({
      create: {
        defaultScopeForNewProjects: "PROJECT_ONLY",
        id: "global",
        provider: "self-hosted",
      },
      update: { defaultScopeForNewProjects: "PROJECT_ONLY" },
      where: { id: "global" },
    });
    await prisma.providerConfig.upsert({
      create: {
        enabled: true,
        fallbackOrder: 1,
        id: "anthropic",
        primaryModel: "claude-opus-4-7",
      },
      update: {
        enabled: true,
        fallbackOrder: 1,
        modelName: null,
        primaryModel: "claude-opus-4-7",
      },
      where: { id: "anthropic" },
    });

    const response = await request(app())
      .post("/api/projects")
      .send({ name: `Provider inherit ${suffix}` })
      .expect(201);
    const project = response.body.project;
    assert(project.memoryScope === "PROJECT_ONLY", `Expected PROJECT_ONLY, got ${project.memoryScope}`);
    assert(project.defaultProvider === "anthropic", `Expected anthropic, got ${project.defaultProvider}`);
    assert(project.defaultModel === "claude-opus-4-7", `Expected model inheritance, got ${project.defaultModel}`);
    return;
  }

  if (scenario === "project-edit-scope") {
    const project = await prisma.project.create({
      data: {
        id: `project-edit-scope-${suffix}`,
        memoryScope: "PROJECT_ONLY",
        name: `Project Edit Scope ${suffix}`,
      },
    });
    const response = await request(app())
      .put(`/api/projects/${project.id}`)
      .send({
        defaultBackend: "LOCAL",
        memoryScope: "GLOBAL_AND_PROJECT",
        name: `Project Edit Scope Updated ${suffix}`,
      })
      .expect(200);
    assert(response.body.project.memoryScope === "GLOBAL_AND_PROJECT", "Project edit did not persist memory scope");
    assert(response.body.project.defaultBackend === "LOCAL", "Project edit did not persist backend");
    const persisted = await prisma.project.findUnique({ where: { id: project.id } });
    assert(persisted?.memoryScope === "GLOBAL_AND_PROJECT", "Project memory scope was not persisted in DB");
    return;
  }

  if (scenario === "memory-toggle-off-respected") {
    let zepCalls = 0;
    const fakeClient = {
      addMemoryMessages: async () => {
        zepCalls += 1;
        return { ok: true };
      },
      checkConnection: async () => {
        zepCalls += 1;
        return { provider: "self-hosted", status: "online" };
      },
      ensureSession: async () => {
        zepCalls += 1;
        return { ok: true };
      },
      ensureUser: async () => {
        zepCalls += 1;
        return { ok: true };
      },
      getSessionMemory: async () => {
        zepCalls += 1;
        return { ok: true, value: [] };
      },
    };
    await appendMessageToZep({
      content: "My favorite color is teal",
      memoryEnabled: false,
      project: { id: `memory-toggle-off-${suffix}`, memoryScope: "PROJECT_ONLY" },
      role: "USER",
    }, fakeClient);
    assert(zepCalls === 0, `Memory-disabled append made ${zepCalls} Zep calls`);
    return;
  }

  throw new Error(`Unknown project memory controls scenario: ${scenario}`);
}

run()
  .then(() => {
    console.log(`[project-memory-controls:${scenario}] PASS`);
  })
  .catch((error) => {
    console.error(`[project-memory-controls:${scenario}] FAIL ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  });
