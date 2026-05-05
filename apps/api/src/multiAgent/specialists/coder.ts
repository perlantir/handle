import type { SpecialistExecutionContext } from "../types";
import { executeGenericSpecialist, type SpecialistExecutor } from "./common";

export const coderAgent: SpecialistExecutor = async (
  context: SpecialistExecutionContext,
  extraContext?: string,
) =>
  executeGenericSpecialist({
    artifactKind: "code_review",
    context,
    ...(extraContext !== undefined ? { extraContext } : {}),
    ...(/\b(pr|pull request|github|repository|repo)\b/i.test(context.goal) ? { searchQuery: context.goal } : {}),
  });
