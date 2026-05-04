import type {
  IntegrationConnectorId,
  SkillArtifactKind,
  SkillInputSlotSummary,
  SkillRunStepType,
} from "@handle/shared";

export interface SkillPackage {
  manifest: SkillManifest;
  packagePath: string;
  skillMd: string;
}

export interface SkillManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  category: string;
  icon: {
    kind: "letter" | "icon";
    tone?: string | undefined;
    value: string;
  };
  package: {
    author: string;
    homepage?: string | null | undefined;
    license: string;
    source: "builtin" | "custom" | "imported";
  };
  activationExamples: string[];
  negativeActivationExamples: string[];
  inputSlots: SkillInputSlotSummary[];
  requiredIntegrations: IntegrationConnectorId[];
  optionalIntegrations: IntegrationConnectorId[];
  runtimePolicy: Record<string, unknown>;
  toolPolicy: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  outputArtifactContract: {
    required: Array<{
      citationsRequired?: boolean | undefined;
      kind: SkillArtifactKind;
      mimeType: string;
      schema?: Record<string, unknown> | undefined;
      title: string;
    }>;
    optional?: Array<{
      citationsRequired?: boolean | undefined;
      kind: SkillArtifactKind;
      mimeType: string;
      schema?: Record<string, unknown> | undefined;
      title: string;
    }> | undefined;
  };
  sourceCitationPolicy: Record<string, unknown>;
  uiTemplate: string;
  suggestedModel?: string | null | undefined;
  evalFixtures: string[];
  resources: string[];
  scheduling: { allowed: boolean };
  visibility: "BUILTIN" | "PERSONAL" | "PROJECT";
  metadata: Record<string, unknown>;
}

export interface ParsedSkillMarkdownSection {
  content: string;
  title: string;
}

export interface SkillTraceStepInput {
  connectorId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  safeSummary: string;
  status?: "completed" | "failed" | "running" | "waiting";
  title: string;
  toolName?: string | undefined;
  type: SkillRunStepType;
}

export interface SkillArtifactInput {
  citations?: Array<Record<string, unknown>> | undefined;
  inlineContent?: string | undefined;
  kind: SkillArtifactKind;
  metadata?: Record<string, unknown> | undefined;
  mimeType: string;
  title: string;
}
