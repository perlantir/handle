import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { CriticVerdict } from "@handle/shared";
import { redactSecrets } from "../../lib/redact";
import type { SpecialistExecutionContext, SpecialistReport, VerificationResult } from "../types";
import { completeSubRun, createSubRun, failSubRun, loadSpecialistPrompt, reportFromMarkdown, type SpecialistExecutor } from "./common";

function contentText(content: unknown) {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function verdictFromText(text: string): CriticVerdict {
  if (/\bREJECT\b/i.test(text)) return "REJECT";
  if (/\bREVISE\b/i.test(text)) return "REVISE";
  return "APPROVE";
}

export async function verifyReports(
  context: SpecialistExecutionContext,
  reports: SpecialistReport[],
): Promise<VerificationResult> {
  const startedAt = Date.now();
  const subRunId = await createSubRun({ context });
  try {
    const prompt = await loadSpecialistPrompt("verifier");
    const reportContext = reports
      .map((report) => {
        const artifactContext = report.artifacts
          .map((artifact) => `${artifact.title} (${artifact.kind})\n${artifact.content.slice(0, 4_000)}`)
          .join("\n\n");
        return `${report.role}: ${report.safeSummary}\nSources: ${report.sources.length}\nFindings:\n${report.findings.join("\n")}\nArtifacts:\n${artifactContext || "None"}`;
      })
      .join("\n\n");
    const response = await context.llm.invoke([
      new SystemMessage(`${prompt}\nReturn a verdict line exactly as VERDICT: APPROVE, VERDICT: REVISE, or VERDICT: REJECT.`),
      new HumanMessage(`Original goal:\n${redactSecrets(context.goal)}\n\nSpecialist reports:\n${redactSecrets(reportContext)}`),
    ]);
    const text = redactSecrets(contentText(response.content));
    const verdict = verdictFromText(text);
    const result: VerificationResult = {
      revisionNotes: verdict === "APPROVE" ? [] : [text],
      safeSummary: `Verifier returned ${verdict}: ${text.slice(0, 220)}`,
      verdict,
    };
    const report = reportFromMarkdown({
      artifactKind: "verification",
      content: text,
      context,
      sources: reports.flatMap((item) => item.sources).slice(0, 12),
      status: verdict === "APPROVE" ? "completed" : "revised",
      toolCallCount: 1,
    });
    report.safeSummary = result.safeSummary;
    await completeSubRun({
      context,
      report,
      startedAt,
      subRunId,
      trace: [{ at: new Date().toISOString(), verdict, summary: result.safeSummary }],
    });
    context.emitEvent({
      event: verdict === "APPROVE" ? "verification_passed" : "verification_revision_requested",
      role: "VERIFIER",
      summary: result.safeSummary,
      taskId: context.taskId,
      timestamp: new Date().toISOString(),
      type: "multi_agent_trace",
      verdict,
      ...(subRunId ? { subRunId } : {}),
    });
    return result;
  } catch (err) {
    const report = await failSubRun({ context, err, startedAt, subRunId });
    return {
      revisionNotes: report.blockers,
      safeSummary: report.safeSummary,
      verdict: "REJECT",
    };
  }
}

export const verifierAgent: SpecialistExecutor = async (context: SpecialistExecutionContext) => {
  const verification = await verifyReports(context, []);
  return reportFromMarkdown({
    artifactKind: "verification",
    content: verification.safeSummary,
    context,
    sources: [],
    status: verification.verdict === "APPROVE" ? "completed" : "revised",
    toolCallCount: 1,
  });
};
