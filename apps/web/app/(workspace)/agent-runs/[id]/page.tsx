import type { AgentRunDetail } from "@handle/shared";
import { MultiAgentRunPanel } from "@/components/multiAgent/MultiAgentRunPanel";
import { getHandleServerToken } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const apiBaseUrl =
  process.env.HANDLE_API_BASE_URL ??
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ??
  "http://127.0.0.1:3001";

async function loadAgentRun(agentRunId: string): Promise<AgentRunDetail | null> {
  const token = await getHandleServerToken();
  if (!token) return null;

  const response = await fetch(`${apiBaseUrl}/api/agent-runs/${agentRunId}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!response?.ok) return null;
  const body = (await response.json()) as { run?: AgentRunDetail };
  return body.run ?? null;
}

export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await loadAgentRun(id);

  if (!run) {
    return (
      <main className="min-h-screen bg-bg-canvas px-8 py-8">
        <div className="mx-auto max-w-5xl rounded-[10px] border border-border-subtle bg-bg-surface p-6">
          <h1 className="text-[18px] font-semibold text-text-primary">Agent run not found</h1>
          <p className="mt-2 text-[13px] text-text-secondary">The run may have been deleted or you may need to sign in again.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-canvas px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted">Agent run</div>
            <h1 className="mt-1 text-[22px] font-semibold text-text-primary">{run.goal}</h1>
            <div className="mt-2 text-[12px] text-text-secondary">
              {run.projectName ?? "Project"} · {run.status.toLowerCase()} · {run.providerId ?? "provider"} {run.modelName ?? ""}
            </div>
          </div>
          <a
            className="rounded-pill border border-border-subtle bg-bg-surface px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-bg-subtle"
            href={`/tasks/${run.id}`}
          >
            Open task
          </a>
        </div>

        <MultiAgentRunPanel handoffs={run.handoffs} subRuns={run.subRuns} trace={run.trace} />

        <section className="mt-4 rounded-[10px] border border-border-subtle bg-bg-surface p-5">
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Result</div>
          <div className="whitespace-pre-wrap text-[13px] leading-[20px] text-text-secondary">
            {run.result ?? "No final result recorded yet."}
          </div>
        </section>
      </div>
    </main>
  );
}
