import type { SpecialistExecutionContext } from "../types";
import { executeGenericSpecialist, type SpecialistExecutor } from "./common";

export const analystAgent: SpecialistExecutor = async (
  context: SpecialistExecutionContext,
  extraContext?: string,
) =>
  executeGenericSpecialist({
    artifactKind: "analysis",
    context,
    ...(extraContext !== undefined ? { extraContext } : {}),
  });
