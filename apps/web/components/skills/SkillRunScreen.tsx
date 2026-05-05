"use client";

import { useEffect, useState } from "react";
import type { SkillArtifactSummary, SkillRunDetail } from "@handle/shared";
import { ArrowLeft, Box, CheckCircle2, ExternalLink, FileText, Loader2, XCircle } from "lucide-react";
import { useHandleAuth } from "@/lib/handleAuth";
import { getSkillRun } from "@/lib/skills";
import { cn } from "@/lib/utils";

export function SkillRunScreen({ runId }: { runId: string }) {
  const { getToken, isLoaded } = useHandleAuth();
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
    </main>
  );
}

function citationString(citation: Record<string, unknown>, key: string) {
  const value = citation[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function CitationList({ citations }: { citations: Array<Record<string, unknown>> }) {
  return (
    <div className="mb-3 max-h-[220px] overflow-auto rounded-[8px] border border-border-subtle bg-bg-base p-2">
      <div className="grid gap-2">
        {citations.map((citation, index) => {
          const title = citationString(citation, "title") ?? `Citation ${index + 1}`;
          const url = citationString(citation, "url");
          const domain = citationString(citation, "domain");
          const publishedAt = citationString(citation, "publishedAt");
          const accessedAt = citationString(citation, "accessedAt");
          const sourceId = citationString(citation, "sourceId");
          return (
            <div className="rounded-[8px] border border-border-subtle bg-bg-canvas px-2.5 py-2 text-[12px]" key={`${url ?? title}-${index}`}>
              {url ? (
                <a
                  className="inline-flex items-center gap-1.5 font-medium text-text-primary hover:text-accent"
                  href={url}
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
