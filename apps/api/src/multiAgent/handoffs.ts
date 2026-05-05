import type { AgentSpecialistRole, MultiAgentTraceEvent } from "@handle/shared";
import type { MultiAgentStore, SpecialistReport } from "./types";

export async function createSpecialistHandoff({
  agentRunId,
  artifactRefs,
  emitEvent,
  fromRole,
  reason,
  store,
  toRole,
}: {
  agentRunId: string;
  artifactRefs?: SpecialistReport["artifactIds"];
  emitEvent: (event: MultiAgentTraceEvent) => void;
  fromRole: AgentSpecialistRole;
  reason: string;
  store: MultiAgentStore;
  toRole: AgentSpecialistRole;
}) {
  if (!store.agentHandoff?.create) return null;
  const handoff = await store.agentHandoff.create({
    data: {
      agentRunId,
      artifactRefs: artifactRefs ?? [],
      completedAt: new Date(),
      fromRole,
      reason,
      status: "COMPLETED",
      toRole,
    },
  });
  emitEvent({
    event: "handoff_created",
    fromRole,
    handoffId: handoff.id,
    reason,
    summary: `${fromRole} handed structured context to ${toRole}.`,
    taskId: agentRunId,
    timestamp: new Date().toISOString(),
    toRole,
    type: "multi_agent_trace",
  });
  return handoff;
}
