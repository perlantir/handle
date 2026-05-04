import { z } from "zod";
import type { SkillManifest } from "./types";

const integrationConnectorSchema = z.enum([
  "gmail",
  "slack",
  "notion",
  "google-drive",
  "github",
  "google-calendar",
  "cloudflare",
  "vercel",
  "linear",
  "google-sheets",
  "google-docs",
  "zapier",
  "obsidian",
]);

const artifactKindSchema = z.enum([
  "REPORT",
  "SOURCE_SET",
  "EMAIL_DRAFTS",
  "ITINERARY",
  "CODE_REVIEW",
  "NOTION_SUMMARY",
  "EXECUTION_PLAN",
  "FILE",
  "BROWSER_SESSION_SUMMARY",
  "TRACE_SUMMARY",
  "CUSTOM_JSON",
  "CUSTOM_MARKDOWN",
]);

export const skillInputSlotSchema = z.object({
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
  id: z.string().min(1),
  label: z.string().min(1),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  required: z.boolean(),
  type: z.enum([
    "text",
    "textarea",
    "url",
    "email",
    "number",
    "select",
    "multi_select",
    "date",
    "file",
    "integration_account",
    "repository",
    "notion_page",
    "calendar_range",
  ]),
  validation: z.record(z.unknown()).optional(),
});

const artifactContractItemSchema = z.object({
  citationsRequired: z.boolean().optional(),
  kind: artifactKindSchema,
  mimeType: z.string().min(1),
  schema: z.record(z.unknown()).optional(),
  title: z.string().min(1),
});

export const skillManifestSchema = z.object({
  activationExamples: z.array(z.string()).default([]),
  approvalPolicy: z.record(z.unknown()).default({}),
  category: z.string().min(1),
  description: z.string().min(1),
  evalFixtures: z.array(z.string()).default([]),
  icon: z.object({
    kind: z.enum(["letter", "icon"]),
    tone: z.string().optional(),
    value: z.string().min(1),
  }),
  id: z.string().min(1),
  inputSlots: z.array(skillInputSlotSchema).default([]),
  metadata: z.record(z.unknown()).default({}),
  name: z.string().min(1),
  negativeActivationExamples: z.array(z.string()).default([]),
  optionalIntegrations: z.array(integrationConnectorSchema).default([]),
  outputArtifactContract: z
    .object({
      optional: z.array(artifactContractItemSchema).optional(),
      required: z.array(artifactContractItemSchema).default([]),
    })
    .default({ required: [] }),
  package: z.object({
    author: z.string().min(1),
    homepage: z.string().nullable().optional(),
    license: z.string().min(1),
    source: z.enum(["builtin", "custom", "imported"]),
  }),
  requiredIntegrations: z.array(integrationConnectorSchema).default([]),
  resources: z.array(z.string()).default([]),
  runtimePolicy: z.record(z.unknown()).default({}),
  scheduling: z.object({ allowed: z.boolean() }).default({ allowed: false }),
  sourceCitationPolicy: z.record(z.unknown()).default({}),
  suggestedModel: z.string().nullable().optional(),
  toolPolicy: z.record(z.unknown()).default({}),
  uiTemplate: z.string().default("standard"),
  version: z.string().min(1),
  visibility: z.enum(["BUILTIN", "PERSONAL", "PROJECT"]).default("BUILTIN"),
});

export function parseSkillManifest(value: unknown): SkillManifest {
  return skillManifestSchema.parse(value) as SkillManifest;
}
