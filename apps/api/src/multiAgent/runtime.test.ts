import { describe, expect, it, vi } from "vitest";
import { initializeMultiAgentRun, recordVerifierPass } from "./runtime";
import type { MultiAgentTraceEvent } from "@handle/shared";

describe("multi-agent runtime", () => {
  it("auto-escalates comparison research tasks and records specialist traces", async () => {
    const events: MultiAgentTraceEvent[] = [];
    let subRunCounter = 0;
    const store = {
      agentHandoff: {
        create: vi.fn(async () => ({ id: "handoff-1" })),
        update: vi.fn(async () => undefined),
      },
      agentSubRun: {
        create: vi.fn(async () => {
          subRunCounter += 1;
          return { id: `subrun-${subRunCounter}` };
        }),
        update: vi.fn(async () => undefined),
      },
    };

    const summary = await initializeMultiAgentRun({
      emitEvent: (event) => events.push(event),
      goal: "Research Stripe, compare to Adyen, and draft an executive report",
      project: { agentExecutionMode: "AUTO" },
      store,
      taskId: "run-test",
    });

    expect(summary.teamMode).toBe(true);
    expect(summary.roles).toContain("RESEARCHER");
    expect(summary.roles).toContain("WRITER");
    expect(summary.verifierRequired).toBe(true);
    expect(events.some((event) => event.event === "auto_escalated_to_multi_agent")).toBe(true);
    expect(store.agentSubRun.create).toHaveBeenCalled();
    expect(store.agentHandoff.create).toHaveBeenCalled();
  });

  it("records verifier pass without exposing private reasoning", async () => {
    const events: MultiAgentTraceEvent[] = [];
    const store = {
      agentSubRun: {
        create: vi.fn(async () => ({ id: "verifier-subrun" })),
        update: vi.fn(async () => undefined),
      },
    };

    await recordVerifierPass({
      emitEvent: (event) => events.push(event),
      store,
      summary: "Verifier approved the final response.",
      taskId: "run-test",
    });

    expect(events.map((event) => event.event)).toEqual([
      "verification_started",
      "verification_passed",
    ]);
    expect(JSON.stringify(events)).not.toContain("chain-of-thought");
  });
});
