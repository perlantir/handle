import type { SpecialistExecutionContext } from "../types";
import { executeGenericSpecialist, type SpecialistExecutor } from "./common";

export const designerAgent: SpecialistExecutor = async (
  context: SpecialistExecutionContext,
  extraContext?: string,
) =>
  executeGenericSpecialist({
    artifactKind: "design_review",
    context,
    ...(extraContext !== undefined ? { extraContext } : {}),
  });
