import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { redactSecrets } from "../lib/redact";
import type { MultiAgentRuntimeContext, SpecialistReport } from "./types";
import { SPECIALIST_DEFINITIONS } from "./registry";
import { loadSpecialistPrompt } from "./specialists/common";

function textFromContent(content: unknown) {
  return typeof content === "string" ? content : JSON.stringify(content);
}

export function formatReportsForContext(reports: SpecialistReport[]) {
  if (reports.length === 0) return "";
  return [
    "<multi_agent_reports>",
    ...reports.map((report, index) => {
      const sources = report.sources
        .map((source, sourceIndex) => `${sourceIndex + 1}. ${source.title} (${source.domain}) ${source.url}`)
        .join("\n");
      const artifacts = report.artifacts.map((artifact) => `Artifact: ${artifact.title}\n${artifact.content}`).join("\n\n");
      return [
        `## Report ${index + 1}: ${report.role}`,
        `Status: ${report.status}`,
        `Summary: ${report.safeSummary}`,
        `Findings:\n${report.findings.join("\n") || "None recorded"}`,
        `Recommendations:\n${report.recommendations.join("\n") || "None recorded"}`,
        `Sources:\n${sources || "None recorded"}`,
        artifacts,
      ].join("\n\n");
    }),
    "</multi_agent_reports>",
  ].join("\n\n");
}

export async function synthesizeFinalResponse({
  reports,
  runtime,
}: {
  reports: SpecialistReport[];
  runtime: MultiAgentRuntimeContext;
}) {
  if (reports.length === 0) return "";
  const { model } = await runtime.providerRegistry.getActiveModel({
    ...(runtime.project?.defaultModel ? { modelOverride: runtime.project.defaultModel } : {}),
    taskId: runtime.taskId,
  });
  const prompt = await loadSpecialistPrompt("synthesizer").catch(() => SPECIALIST_DEFINITIONS.synthesizer.description);
  const response = await model.invoke([
    new SystemMessage(prompt),
    new HumanMessage(
      [
        `Original goal:\n${redactSecrets(runtime.goal)}`,
        formatReportsForContext(reports),
        "Produce a concise answer for the main agent to use. Preserve citations as URLs. Do not expose private reasoning.",
      ].join("\n\n"),
    ),
  ]);
  return redactSecrets(textFromContent(response.content));
}
