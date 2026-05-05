"use client";

import { useEffect, useState } from "react";
import type { SkillArtifactSummary, SkillRunDetail } from "@handle/shared";
import { ArrowLeft, Box, CheckCircle2, ExternalLink, FileText, Loader2, Mail, ShieldAlert, XCircle } from "lucide-react";
import { Modal } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import { decideSkillRunSendApproval, getSkillRun } from "@/lib/skills";
import { cn } from "@/lib/utils";

export function SkillRunScreen({ runId }: { runId: string }) {
  const { getToken, isLoaded } = useHandleAuth();
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalResult, setApprovalResult] = useState<string | null>(null);
  const [approvalSubmitting, setApprovalSubmitting] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<SkillRunDetail | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<SkillArtifactSummary | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const loaded = await getSkillRun({ runId, token });
        if (!cancelled) {
          setRun(loaded);
          setSelectedArtifact(loaded.artifacts[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Skill run");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, runId]);

  async function reloadRun() {
    const token = await getToken();
    const loaded = await getSkillRun({ runId, token });
    setRun(loaded);
    setSelectedArtifact((current) => loaded.artifacts.find((artifact) => artifact.id === current?.id) ?? loaded.artifacts[0] ?? null);
  }

  async function handleSendApproval(decision: "approved" | "denied") {
    setApprovalSubmitting(decision);
    setApprovalError(null);
    setApprovalResult(null);
    try {
      const token = await getToken();
      const result = await decideSkillRunSendApproval({ decision, runId, token });
      setApprovalResult(
        result.decision === "denied"
          ? "Denied. No emails were sent."
          : `Approved. Sent ${result.sentCount} email draft(s).`,
      );
      setApprovalOpen(false);
      await reloadRun();
    } catch (err) {
      setApprovalError(err instanceof Error ? err.message : "Could not record approval decision");
    } finally {
      setApprovalSubmitting(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-bg-base px-8 py-8 text-[13px] text-text-secondary">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Loading Skill run
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="min-h-screen bg-bg-base px-8 py-8">
        <div className="rounded-[8px] border border-status-error/20 bg-status-error/5 px-4 py-3 text-[13px] text-status-error">
          {error ?? "Skill run unavailable"}
        </div>
      </main>
    );
  }

  const emailDraftArtifact = run.skill?.slug === "email-outreach"
    ? run.artifacts.find((artifact) => artifact.kind === "EMAIL_DRAFTS") ?? null
    : null;
  const emailDrafts = parseEmailDrafts(emailDraftArtifact?.inlineContent ?? null);

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-8 py-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.8fr)]">
        <section className="min-w-0">
          <a className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-text-primary" href={`/skills/${run.skill?.slug ?? run.skillId}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Skill detail
          </a>
          <div className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11.5px] uppercase tracking-[0.04em] text-text-muted">{run.skillName ?? "Skill run"}</p>
                <h1 className="mt-1 font-display text-[24px] font-semibold">Skill Run Trace</h1>
                <p className="mt-2 text-[13px] text-text-secondary">{run.resultSummary ?? run.errorMessage ?? "No summary yet"}</p>
              </div>
              <StatusBadge status={run.status} />
            </div>
          </div>

          <section className="mt-5 rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="text-[14px] font-semibold">Trace</h2>
            <div className="mt-4 grid gap-3">
              {run.steps.map((step) => (
                <div className="rounded-[8px] border border-border-subtle bg-bg-base p-3" key={step.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[12.5px] font-medium text-text-primary">{step.index + 1}. {step.title}</div>
                      <div className="mt-1 text-[12px] leading-5 text-text-secondary">{step.safeSummary}</div>
                    </div>
                    <span className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-tertiary">{step.type.toLowerCase()}</span>
                  </div>
                  {step.toolName || step.connectorId ? (
                    <div className="mt-2 text-[11.5px] text-text-tertiary">
                      {[step.toolName, step.connectorId].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="grid h-fit gap-5">
          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Box className="h-4 w-4" /> Artifacts</h2>
            <div className="mt-3 grid gap-2">
              {run.artifacts.map((artifact) => (
                <button
                  className={cn("rounded-[8px] border px-3 py-2 text-left text-[12.5px]", selectedArtifact?.id === artifact.id ? "border-accent bg-accent/5 text-text-primary" : "border-border-subtle bg-bg-base text-text-secondary")}
                  key={artifact.id}
                  onClick={() => setSelectedArtifact(artifact)}
                  type="button"
                >
                  <div className="font-medium">{artifact.title}</div>
                  <div className="mt-0.5 text-[11px] text-text-tertiary">{artifact.kind.toLowerCase()} · {artifact.mimeType}</div>
                </button>
              ))}
            </div>
          </section>

          {emailDraftArtifact ? (
            <section className="rounded-[8px] border border-status-warning/20 bg-status-warning/5 p-5">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
                <ShieldAlert className="h-4 w-4 text-status-warning" />
                Send Approval
              </h2>
              <p className="mt-2 text-[12.5px] leading-5 text-text-secondary">
                This Skill created {emailDrafts.length} draft(s). No email is sent unless you explicitly approve this batch here.
              </p>
              {approvalResult ? <p className="mt-2 text-[12px] text-status-success">{approvalResult}</p> : null}
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-border-subtle bg-bg-canvas px-3 py-2 text-[12.5px] font-medium text-text-primary hover:border-accent"
                onClick={() => {
                  setApprovalError(null);
                  setApprovalOpen(true);
                }}
                type="button"
              >
                <Mail className="h-3.5 w-3.5" />
                Review send approval
              </button>
            </section>
          ) : null}

          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold"><FileText className="h-4 w-4" /> Artifact Preview</h2>
            {selectedArtifact ? (
              <div className="mt-3">
                <div className="mb-2 text-[12px] text-text-tertiary">{selectedArtifact.citations.length} citation(s)</div>
                {selectedArtifact.citations.length ? (
                  <CitationList citations={selectedArtifact.citations} />
                ) : null}
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-border-subtle bg-bg-base p-3 text-[12px] leading-5 text-text-secondary">
                  {selectedArtifact.inlineContent ?? "Artifact stored externally."}
                </pre>
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-text-tertiary">No artifact selected.</p>
            )}
          </section>
        </aside>
      </div>
      {approvalOpen ? (
        <EmailSendApprovalModal
          drafts={emailDrafts}
          error={approvalError}
          onClose={() => setApprovalOpen(false)}
          onDecision={handleSendApproval}
          submitting={approvalSubmitting}
        />
      ) : null}
    </main>
  );
}

interface EmailDraftPreview {
  body: string;
  recipient: string;
  subject: string;
}

function parseEmailDrafts(content: string | null): EmailDraftPreview[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { drafts?: unknown };
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
    return drafts
      .map((draft) => {
        if (!draft || typeof draft !== "object") return null;
        const record = draft as Record<string, unknown>;
        const recipient = typeof record.recipient === "string" ? record.recipient : "";
        const subject = typeof record.subject === "string" ? record.subject : "";
        const body = typeof record.body === "string" ? record.body : "";
        if (!recipient || !subject || !body) return null;
        return { body, recipient, subject };
      })
      .filter((draft): draft is EmailDraftPreview => Boolean(draft));
  } catch {
    return [];
  }
}

function EmailSendApprovalModal({
  drafts,
  error,
  onClose,
  onDecision,
  submitting,
}: {
  drafts: EmailDraftPreview[];
  error: string | null;
  onClose: () => void;
  onDecision: (decision: "approved" | "denied") => void;
  submitting: "approved" | "denied" | null;
}) {
  return (
    <Modal className="max-h-[86vh] w-full max-w-[760px] rounded-[8px] border border-border-subtle bg-bg-canvas">
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <ShieldAlert className="h-4 w-4 text-status-warning" />
                Approve Email Send
              </h2>
              <p className="mt-1 text-[12.5px] leading-5 text-text-secondary">
                Review every draft. Denying this approval records the decision and blocks all sends.
              </p>
            </div>
            <button className="text-[12px] text-text-tertiary hover:text-text-primary" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[52vh] overflow-auto px-5 py-4">
          <div className="grid gap-3">
            {drafts.map((draft, index) => (
              <article className="rounded-[8px] border border-border-subtle bg-bg-base p-3" key={`${draft.recipient}-${index}`}>
                <div className="text-[11px] uppercase tracking-[0.04em] text-text-muted">Draft {index + 1}</div>
                <div className="mt-1 text-[12.5px] font-medium text-text-primary">{draft.recipient}</div>
                <div className="mt-1 text-[12px] text-text-secondary">Subject: {draft.subject}</div>
                <pre className="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-border-subtle bg-bg-canvas p-2 text-[12px] leading-5 text-text-secondary">
                  {draft.body}
                </pre>
              </article>
            ))}
          </div>
        </div>
        {error ? (
          <div className="border-t border-status-error/20 bg-status-error/5 px-5 py-3 text-[12px] text-status-error">
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <button
            className="rounded-[8px] border border-border-subtle px-3 py-2 text-[12.5px] text-text-primary hover:border-status-error/50 disabled:opacity-60"
            disabled={Boolean(submitting)}
            onClick={() => onDecision("denied")}
            type="button"
          >
            {submitting === "denied" ? "Denying..." : "Deny send"}
          </button>
          <button
            className="rounded-[8px] bg-status-warning px-3 py-2 text-[12.5px] font-medium text-bg-base disabled:opacity-60"
            disabled={Boolean(submitting) || drafts.length === 0}
            onClick={() => onDecision("approved")}
            type="button"
          >
            {submitting === "approved" ? "Sending..." : `Approve and send ${drafts.length}`}
          </button>
        </div>
    </Modal>
  );
}

function citationString(citation: Record<string, unknown>, key: string) {
  const value = citation[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function citationHref(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) return `https://${value}`;
  return value;
}

function CitationList({ citations }: { citations: Array<Record<string, unknown>> }) {
  return (
    <div className="mb-3 max-h-[220px] overflow-auto rounded-[8px] border border-border-subtle bg-bg-base p-2">
      <div className="grid gap-2">
        {citations.map((citation, index) => {
          const title = citationString(citation, "title") ?? `Citation ${index + 1}`;
          const url = citationString(citation, "url");
          const href = citationHref(url);
          const domain = citationString(citation, "domain");
          const publishedAt = citationString(citation, "publishedAt");
          const accessedAt = citationString(citation, "accessedAt");
          const sourceId = citationString(citation, "sourceId");
          return (
            <div className="rounded-[8px] border border-border-subtle bg-bg-canvas px-2.5 py-2 text-[12px]" key={`${url ?? title}-${index}`}>
              {href ? (
                <a
                  className="inline-flex items-center gap-1.5 font-medium text-text-primary hover:text-accent"
                  href={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {sourceId ? `${sourceId}: ` : null}
                  {title}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <div className="font-medium text-text-primary">{sourceId ? `${sourceId}: ` : null}{title}</div>
              )}
              <div className="mt-1 text-[11px] leading-4 text-text-tertiary">
                {[domain, publishedAt ? `published ${publishedAt}` : null, accessedAt ? `accessed ${accessedAt}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SkillRunDetail["status"] }) {
  const ok = status === "COMPLETED";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium", ok ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error")}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status.toLowerCase()}
    </span>
  );
}
