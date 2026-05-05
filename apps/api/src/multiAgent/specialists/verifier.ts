import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { CriticVerdict } from "@handle/shared";
import { redactSecrets } from "../../lib/redact";
import type { SpecialistExecutionContext, SpecialistReport, VerificationResult } from "../types";
import { completeSubRun, createSubRun, loadSpecialistPrompt, reportFromMarkdown, type SpecialistExecutor } from "./common";

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
  const prompt = await loadSpecialistPrompt("verifier");
  const reportContext = reports
    .map((report) => `${report.role}: ${report.safeSummary}\nSources: ${report.sources.length}\nFindings:\n${report.findings.join("\n")}`)
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
