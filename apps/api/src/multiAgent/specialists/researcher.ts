import type { SpecialistExecutionContext } from "../types";
import { executeGenericSpecialist, type SpecialistExecutor } from "./common";

export const researcherAgent: SpecialistExecutor = async (
  context: SpecialistExecutionContext,
  extraContext?: string,
) =>
  executeGenericSpecialist({
    artifactKind: "research_report",
    context,
    ...(extraContext !== undefined ? { extraContext } : {}),
    searchQuery: context.goal,
  });
