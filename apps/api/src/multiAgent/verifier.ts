import type { CriticVerdict } from "@handle/shared";
import type { MultiAgentRuntimeContext, SpecialistReport, VerificationResult } from "./types";
import { SPECIALIST_DEFINITIONS } from "./registry";
import { resolveSpecialistContext } from "./specialists/common";
import { verifyReports } from "./specialists/verifier";

export function shouldRunVerifier({
  goal,
  reports,
  verifierRequired,
}: {
  goal: string;
  reports: SpecialistReport[];
  verifierRequired: boolean;
}) {
  if (verifierRequired) return true;
  if (reports.some((report) => report.sources.length > 0 || report.role === "CODER" || report.role === "OPERATOR")) return true;
  return /\b(research|citation|code review|send|email|slack|browser|schedule|artifact)\b/i.test(goal);
}

export async function runVerifier({
  budget,
  reports,
  runtime,
}: {
  budget: Parameters<typeof resolveSpecialistContext>[2];
  reports: SpecialistReport[];
  runtime: MultiAgentRuntimeContext;
}): Promise<VerificationResult> {
  const definition = SPECIALIST_DEFINITIONS.verifier;
  const context = await resolveSpecialistContext(runtime, definition, budget);
  return verifyReports(
    {
      ...context,
      assignment: {
        goal: "Verify final multi-agent output quality and policy compliance.",
        id: "verifier-1",
        rationale: "Verification is required for this run.",
        role: "VERIFIER",
        specialistId: "verifier",
      },
    },
    reports,
  );
}

export function verifierPassed(verdict: CriticVerdict) {
  return verdict === "APPROVE";
}
