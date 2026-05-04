import type { IntegrationConnectorId } from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { loadBuiltinSkillPackages } from "./packageLoader";
import {
  serializeSkillDetail,
  serializeSkillSummary,
} from "./serializer";
import type { SkillPackage } from "./types";

type SkillStore = typeof prisma;

const BUILTIN_SYNC_KEY = Symbol.for("handle.skills.builtinSync");

interface SyncState {
  promise?: Promise<void> | undefined;
}

function syncState(): SyncState {
  const globalState = globalThis as typeof globalThis & {
    [BUILTIN_SYNC_KEY]?: SyncState;
  };
  globalState[BUILTIN_SYNC_KEY] ??= {};
  return globalState[BUILTIN_SYNC_KEY];
}

export async function syncBuiltinSkills(store: SkillStore = prisma) {
  const state = syncState();
  state.promise ??= syncBuiltinSkillsOnce(store).finally(() => {
    state.promise = undefined;
  });
  return state.promise;
}

export async function listSkillsForUser({
  projectId,
  store = prisma,
  userId,
}: {
  projectId?: string;
  store?: SkillStore;
  userId: string;
}) {
  await syncBuiltinSkills(store);
  const [rows, connected] = await Promise.all([
    store.skill.findMany({
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ visibility: "asc" }, { name: "asc" }],
      where: {
        archivedAt: null,
        enabled: true,
        OR: [
          { visibility: "BUILTIN" },
          { ownerUserId: userId, visibility: "PERSONAL" },
          ...(projectId ? [{ projectId, visibility: "PROJECT" as const }] : []),
        ],
      },
    }),
    connectedIntegrationSet(userId, store),
  ]);

  return rows.map((row) =>
    serializeSkillSummary(row, {
      connectedIntegrations: connected,
      runCount: row.runs.length,
    }),
  );
}

export async function getSkillForUser({
  skillIdOrSlug,
  projectId,
  store = prisma,
  userId,
}: {
  projectId?: string;
  skillIdOrSlug: string;
  store?: SkillStore;
  userId: string;
}) {
  await syncBuiltinSkills(store);
  const row = await store.skill.findFirst({
    include: {
      runs: {
        include: { artifacts: true, steps: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
    where: {
      OR: [
        { id: skillIdOrSlug },
        { slug: skillIdOrSlug },
      ],
      archivedAt: null,
      enabled: true,
      AND: [
        {
          OR: [
            { visibility: "BUILTIN" },
            { ownerUserId: userId, visibility: "PERSONAL" },
            ...(projectId ? [{ projectId, visibility: "PROJECT" as const }] : []),
          ],
        },
      ],
    },
  });

  if (!row) return null;
  const connected = await connectedIntegrationSet(userId, store);
  return serializeSkillDetail(row, { connectedIntegrations: connected });
}

async function syncBuiltinSkillsOnce(store: SkillStore) {
  const packages = await loadBuiltinSkillPackages();
  for (const skillPackage of packages) {
    await upsertBuiltinSkill(skillPackage, store);
  }
}

async function upsertBuiltinSkill(skillPackage: SkillPackage, store: SkillStore) {
  const { manifest, packagePath, skillMd } = skillPackage;
  const existing = await store.skill.findFirst({
    where: {
      ownerUserId: null,
      projectId: null,
      slug: manifest.id,
      sourceType: "BUILTIN",
      version: manifest.version,
    },
  });
  const data = {
      activationExamples: manifest.activationExamples,
      approvalPolicy: jsonInput(manifest.approvalPolicy),
      category: manifest.category,
      customMetadata: jsonInput(manifest.metadata),
      description: manifest.description,
      enabled: true,
      evalFixtures: manifest.evalFixtures,
      icon: jsonInput(manifest.icon),
      inputSlots: jsonInput(manifest.inputSlots),
      name: manifest.name,
      negativeActivationExamples: manifest.negativeActivationExamples,
      optionalIntegrations: manifest.optionalIntegrations.map(connectorToDb),
      outputArtifactContract: jsonInput(manifest.outputArtifactContract),
      packageMetadata: jsonInput(manifest.package),
      packagePath,
      requiredIntegrations: manifest.requiredIntegrations.map(connectorToDb),
      reusableResources: manifest.resources,
      runtimePolicy: jsonInput(manifest.runtimePolicy),
      schedulingConfig: jsonInput(manifest.scheduling),
      skillMd,
      slug: manifest.id,
      sourceCitationPolicy: jsonInput(manifest.sourceCitationPolicy),
      sourceType: "BUILTIN",
      toolPolicy: jsonInput(manifest.toolPolicy),
      uiTemplate: manifest.uiTemplate,
      version: manifest.version,
      visibility: "BUILTIN",
      ...(manifest.suggestedModel ? { suggestedModel: manifest.suggestedModel } : {}),
    } satisfies Prisma.SkillCreateInput;

  if (existing) {
    await store.skill.update({
      data: {
        ...data,
        suggestedModel: manifest.suggestedModel ?? null,
      },
      where: { id: existing.id },
    });
    return;
  }

  await store.skill.create({ data });
}

async function connectedIntegrationSet(userId: string, store: SkillStore) {
  const rows = await store.integration.findMany({
    select: { connectorId: true },
    where: { status: "CONNECTED", userId },
  });
  return new Set(rows.map((row) => dbConnectorToShared(row.connectorId)));
}

export function connectorToDb(connectorId: string) {
  return connectorId.toUpperCase().replaceAll("-", "_");
}

export function dbConnectorToShared(connectorId: string) {
  return connectorId.toLowerCase().replaceAll("_", "-") as IntegrationConnectorId;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
