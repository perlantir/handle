import type { SpecialistExecutor } from "./common";
import { analystAgent } from "./analyst";
import { coderAgent } from "./coder";
import { designerAgent } from "./designer";
import { operatorAgent } from "./operator";
import { researcherAgent } from "./researcher";
import { verifierAgent } from "./verifier";
import { writerAgent } from "./writer";

export const specialistExecutors = {
  analyst: analystAgent,
  coder: coderAgent,
  designer: designerAgent,
  operator: operatorAgent,
  researcher: researcherAgent,
  verifier: verifierAgent,
  writer: writerAgent,
} satisfies Record<string, SpecialistExecutor>;
