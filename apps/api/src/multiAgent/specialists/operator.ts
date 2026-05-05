import type { SpecialistExecutionContext } from "../types";
import { executeGenericSpecialist, type SpecialistExecutor } from "./common";

export const operatorAgent: SpecialistExecutor = async (
  context: SpecialistExecutionContext,
  extraContext?: string,
) =>
  executeGenericSpecialist({
    artifactKind: "operation_plan",
    context,
    ...(extraContext !== undefined ? { extraContext } : {}),
    ...(/\b(website|browser|docs|api|integration|oauth)\b/i.test(context.goal) ? { searchQuery: context.goal } : {}),
  });
