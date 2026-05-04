import type {
  CreateSkillRequest,
  SkillDetail,
  UpdateSkillRequest,
} from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { skillInputSlotSchema } from "./manifestSchema";
import { connectorToDb, getSkillForUser, syncBuiltinSkills } from "./skillRegistry";
import { validateSkillMarkdown } from "./skillMarkdown";

type SkillStore = typeof prisma;

const DEFAULT_SKILL_MD = `## Overview
Describe what this Skill does.

## Activation
Use this Skill when the user asks for this workflow.

## Inputs
List the required inputs.

## Workflow
Describe the ordered execution path.

## Tools
List allowed tools and integrations.

## Safety
Describe safety and approval boundaries.

## Artifacts
Describe produced artifacts.

## Citations
Explain citation requirements.

## Evaluation
Describe happy-path and safety evals.`;

export async function createCustomSkill({
  input,
  projectId,
  store = prisma,
  userId,
}: {
  input: CreateSkillRequest;
  projectId?: string;
  store?: SkillStore;
  userId: string;
}): Promise<SkillDetail> {
  await syncBuiltinSkills(store);
  const normalized = normalizeSkillInput(input, projectId);
  const row = await store.skill.create({
    data: {
      ...normalized,
      ownerUserId: userId,
      sourceType: "CUSTOM",
    } as Prisma.SkillUncheckedCreateInput,
  });
  const detail = await getSkillForUser({
    ...(row.projectId ? { projectId: row.projectId } : {}),
    skillIdOrSlug: row.id,
    store,
    userId,
  });
  if (!detail) throw new Error("Created Skill was not available");
  return detail;
}

export async function updateCustomSkill({
  input,
  skillId,
  store = prisma,
  userId,
}: {
  input: UpdateSkillRequest;
  skillId: string;
  store?: SkillStore;
  userId: string;
}): Promise<SkillDetail> {
  const existing = await store.skill.findFirst({
    where: {
      id: skillId,
      ownerUserId: userId,
      sourceType: { in: ["CUSTOM", "IMPORTED"] },
    },
  });
  if (!existing) throw new Error("Custom Skill not found");
  const normalized = normalizeSkillInput(
    {
      activationExamples: existing.activationExamples as string[],
      approvalPolicy: existing.approvalPolicy as Record<string, unknown>,
      category: existing.category,
      description: existing.description,
      evalFixtures: existing.evalFixtures as unknown[],
      icon: existing.icon as unknown as CreateSkillRequest["icon"],
      inputSlots: existing.inputSlots as unknown as CreateSkillRequest["inputSlots"],
      name: existing.name,
      negativeActivationExamples: existing.negativeActivationExamples as string[],
      optionalIntegrations: existing.optionalIntegrations.map((item) => item.toLowerCase().replaceAll("_", "-")) as CreateSkillRequest["optionalIntegrations"],
      outputArtifactContract: existing.outputArtifactContract as Record<string, unknown>,
      packageMetadata: existing.packageMetadata as Record<string, unknown>,
      projectId: existing.projectId ?? undefined,
      requiredIntegrations: existing.requiredIntegrations.map((item) => item.toLowerCase().replaceAll("_", "-")) as CreateSkillRequest["requiredIntegrations"],
      reusableResources: existing.reusableResources as unknown[],
      runtimePolicy: existing.runtimePolicy as Record<string, unknown>,
      schedulingConfig: existing.schedulingConfig as Record<string, unknown>,
      skillMd: existing.skillMd,
      slug: existing.slug,
      sourceCitationPolicy: existing.sourceCitationPolicy as Record<string, unknown>,
      suggestedModel: existing.suggestedModel ?? undefined,
      suggestedProvider: existing.suggestedProvider ?? undefined,
      toolPolicy: existing.toolPolicy as Record<string, unknown>,
      uiTemplate: existing.uiTemplate,
      version: existing.version,
      visibility: existing.visibility as Extract<CreateSkillRequest["visibility"], "PERSONAL" | "PROJECT">,
      ...stripUndefined(input),
    } as CreateSkillRequest,
    input.projectId ?? existing.projectId ?? undefined,
  );

  const row = await store.skill.update({
    data: {
      ...normalized,
      ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
      sourceType: existing.sourceType,
    } as Prisma.SkillUncheckedUpdateInput,
    where: { id: existing.id },
  });
  const detail = await getSkillForUser({
    ...(row.projectId ? { projectId: row.projectId } : {}),
    skillIdOrSlug: row.id,
    store,
    userId,
  });
  if (!detail) throw new Error("Updated Skill was not available");
  return detail;
}

export function validateCustomSkillInput(input: CreateSkillRequest | UpdateSkillRequest) {
  const skillMd = typeof input.skillMd === "string" ? input.skillMd : DEFAULT_SKILL_MD;
  const markdown = validateSkillMarkdown(skillMd);
  if (!markdown.valid) {
    throw new Error(`SKILL.md is missing required sections: ${markdown.missing.join(", ")}`);
  }
  if (input.inputSlots) {
    for (const slot of input.inputSlots) {
      skillInputSlotSchema.parse(slot);
    }
  }
}

export function defaultCustomSkillMd() {
  return DEFAULT_SKILL_MD;
}

function normalizeSkillInput(input: CreateSkillRequest, fallbackProjectId?: string) {
  validateCustomSkillInput(input);
  const visibility: "PROJECT" | "PERSONAL" = input.visibility === "PROJECT" ? "PROJECT" : "PERSONAL";
  const projectId = visibility === "PROJECT" ? input.projectId ?? fallbackProjectId : null;
  if (visibility === "PROJECT" && !projectId) {
    throw new Error("Project Skills require a projectId");
  }
  const slug = slugify(input.slug || input.name);
  return {
    activationExamples: jsonInput(input.activationExamples ?? []),
    approvalPolicy: jsonInput(input.approvalPolicy ?? { requireBeforeWrites: true }),
    category: redactSecrets(input.category),
    customMetadata: jsonInput(input.customMetadata ?? {}),
    description: redactSecrets(input.description),
    enabled: true,
    evalFixtures: jsonInput(input.evalFixtures ?? []),
    icon: jsonInput(input.icon ?? { kind: "letter", value: input.name.slice(0, 1).toUpperCase() || "S" }),
    inputSlots: jsonInput(input.inputSlots ?? []),
    name: redactSecrets(input.name),
    negativeActivationExamples: jsonInput(input.negativeActivationExamples ?? []),
    optionalIntegrations: (input.optionalIntegrations ?? []).map(connectorToDb),
    outputArtifactContract: jsonInput(input.outputArtifactContract ?? { required: [{ kind: "CUSTOM_MARKDOWN", title: "Skill output", mimeType: "text/markdown" }] }),
    packageMetadata: jsonInput(input.packageMetadata ?? { author: "Handle user", license: "private", source: "custom" }),
    projectId,
    requiredIntegrations: (input.requiredIntegrations ?? []).map(connectorToDb),
    reusableResources: jsonInput(input.reusableResources ?? []),
    runtimePolicy: jsonInput(input.runtimePolicy ?? { filesystem: "PROJECT_WORKSPACE", maxDurationMinutes: 30 }),
    schedulingConfig: jsonInput(input.schedulingConfig ?? { allowed: true }),
    skillMd: redactSecrets(input.skillMd || DEFAULT_SKILL_MD),
    slug,
    sourceCitationPolicy: jsonInput(input.sourceCitationPolicy ?? { required: false }),
    suggestedModel: input.suggestedModel ?? null,
    suggestedProvider: input.suggestedProvider ?? null,
    toolPolicy: jsonInput(input.toolPolicy ?? { allowedConnectors: [], allowedTools: [] }),
    uiTemplate: input.uiTemplate ?? "standard",
    version: input.version ?? "1.0.0",
    visibility,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `custom-skill-${Date.now()}`;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
