import type { CreateSkillRequest, SkillImportBundle } from "@handle/shared";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { createCustomSkill, validateCustomSkillInput } from "./customSkills";
import { getSkillForUser } from "./skillRegistry";

type SkillStore = typeof prisma;

export async function exportSkillBundle({
  projectId,
  skillId,
  store = prisma,
  userId,
}: {
  projectId?: string;
  skillId: string;
  store?: SkillStore;
  userId: string;
}): Promise<SkillImportBundle> {
  const skill = await getSkillForUser({ ...(projectId ? { projectId } : {}), skillIdOrSlug: skillId, store, userId });
  if (!skill) throw new Error("Skill not found");
  return {
    evals: { fixtures: skill.evalFixtures },
    examples: {
      activation: skill.activationExamples,
      negativeActivation: skill.negativeActivationExamples,
    },
    manifest: stripUndefined({
      activationExamples: skill.activationExamples,
      approvalPolicy: skill.approvalPolicy,
      category: skill.category,
      description: skill.description,
      evalFixtures: skill.evalFixtures,
      icon: skill.icon,
      inputSlots: skill.inputSlots,
      name: skill.name,
      negativeActivationExamples: skill.negativeActivationExamples,
      optionalIntegrations: skill.optionalIntegrations,
      outputArtifactContract: skill.outputArtifactContract,
      packageMetadata: skill.packageMetadata,
      ...(skill.visibility === "PROJECT" && projectId ? { projectId } : {}),
      requiredIntegrations: skill.requiredIntegrations,
      reusableResources: skill.reusableResources,
      runtimePolicy: skill.runtimePolicy,
      schedulingConfig: skill.schedulingConfig,
      skillMd: skill.skillMd,
      slug: skill.slug,
      sourceCitationPolicy: skill.sourceCitationPolicy,
      toolPolicy: skill.toolPolicy,
      uiTemplate: skill.uiTemplate,
      version: skill.version,
      visibility: skill.visibility === "PROJECT" ? "PROJECT" : "PERSONAL",
    }) as CreateSkillRequest,
    resources: { exportedAt: new Date().toISOString(), source: "handle" },
    skillMd: skill.skillMd,
  };
}

export async function importSkillBundle({
  bundle,
  projectId,
  sourceName = "uploaded-skill.json",
  store = prisma,
  userId,
}: {
  bundle: SkillImportBundle;
  projectId?: string;
  sourceName?: string;
  store?: SkillStore;
  userId: string;
}) {
  const manifest = stripUndefined({
    ...bundle.manifest,
    ...(bundle.manifest.visibility === "PROJECT" && (bundle.manifest.projectId ?? projectId) ? { projectId: bundle.manifest.projectId ?? projectId } : {}),
    skillMd: bundle.skillMd || bundle.manifest.skillMd,
  }) as CreateSkillRequest;
  try {
    validateCustomSkillInput(manifest);
    const skill = await createCustomSkill({
      input: manifest,
      ...(projectId ? { projectId } : {}),
      store,
      userId,
    });
    await store.skill.update({
      data: { sourceType: "IMPORTED" },
      where: { id: skill.id },
    });
    await store.skillImportRecord.create({
      data: {
        skillId: skill.id,
        sourceName: redactSecrets(sourceName),
        status: "IMPORTED",
        userId,
        validation: { importedAt: new Date().toISOString(), valid: true },
      },
    });
    return { skill: { ...skill, sourceType: "IMPORTED" as const }, validation: { valid: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    await store.skillImportRecord.create({
      data: {
        sourceName: redactSecrets(sourceName),
        status: "FAILED",
        userId,
        validation: { error: redactSecrets(message), valid: false },
      },
    });
    throw err;
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
