import type { SkillArtifactInput, SkillTraceStepInput } from "./types";

export type SkillRuntimeMode =
  | "standard"
  | "server_browser"
  | "local_browser"
  | "computer_use"
  | "wide_research";

export function runtimeTraceForMode({
  mode,
  runtimePolicy,
}: {
  mode?: SkillRuntimeMode;
  runtimePolicy: Record<string, unknown>;
}): { artifacts: SkillArtifactInput[]; steps: SkillTraceStepInput[] } {
  if (!mode || mode === "standard" || mode === "wide_research") {
    return { artifacts: [], steps: [] };
  }
  const allowedModes = Array.isArray(runtimePolicy.browserModes) ? runtimePolicy.browserModes.map(String) : ["server_browser"];
  if (mode === "local_browser" && !allowedModes.includes("local_browser")) {
    throw new Error("Local browser mode is not allowed by this Skill runtime policy");
  }
  if (mode === "computer_use" && runtimePolicy.computerUse !== true) {
    throw new Error("Computer-use runtime is not allowed by this Skill runtime policy");
  }
  return {
    artifacts: [
      {
        inlineContent: `Runtime mode: ${mode}\n\nStage 2 verified that this Skill run requested the ${mode} runtime. Full browser/computer session transcripts are attached by the live agent runtime when the Skill performs browser or computer actions.`,
        kind: "BROWSER_SESSION_SUMMARY",
        mimeType: "text/markdown",
        title: "Runtime session summary",
      },
    ],
    steps: [
      {
        metadata: { mode },
        safeSummary: `Prepared ${mode} runtime with policy checks.`,
        title: "Prepare runtime session",
        type: mode === "computer_use" ? "COMPUTER" : "BROWSER",
      },
    ],
  };
}
