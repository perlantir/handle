import { AIMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/actionLog", () => ({
  appendActionLog: vi.fn(async () => undefined),
}));

import {
  CRITIC_PROMPT_VERSION,
  formatCriticFeedback,
  runCriticReview,
  shouldCriticReviewToolStep,
} from "./critic";

describe("critic review", () => {
  it("parses critic verdicts and persists review records", async () => {
    const create = vi.fn(async () => ({}));
    const llm = new FakeStreamingChatModel({
      responses: [new AIMessage("REVISE: verify the output before continuing.")],
    });

    const review = await runCriticReview({
      agentRunId: "run-1",
      conversationId: "conversation-1",
      goal: "Build the thing",
      interventionPoint: "post-plan-before-execute",
      llm,
      metadata: { plan: "test" },
      project: { criticEnabled: true, id: "project-1" },
      store: { criticReview: { create } },
    });

    expect(review.verdict).toBe("REVISE");
    expect(review.reasoning).toContain("verify the output");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentRunId: "run-1",
          projectId: "project-1",
          verdict: "REVISE",
        }),
      }),
    );
  });

  it("formats revise feedback for the main agent", () => {
    expect(
      formatCriticFeedback({
        interventionPoint: "post-tool-result-before-next-step",
        reasoning: "Run tests before claiming done.",
        verdict: "REVISE",
      }),
    ).toContain("<critic_feedback>");
  });

  it("honors critic intervention scope", () => {
    expect(
      shouldCriticReviewToolStep({
        project: { criticEnabled: true, criticScope: "writes-only" },
        step: {
          completedAt: "now",
          durationMs: 1,
          startedAt: "then",
          status: "success",
          subgoal: "read",
          toolInput: {},
          toolName: "file_read",
          toolOutput: "ok",
        },
      }),
    ).toBe(false);
    expect(
      shouldCriticReviewToolStep({
        project: { criticEnabled: true, criticScope: "writes-only" },
        step: {
          completedAt: "now",
          durationMs: 1,
          startedAt: "then",
          status: "success",
          subgoal: "write",
          toolInput: {},
          toolName: "file_write",
          toolOutput: "ok",
        },
      }),
    ).toBe(true);
  });

  it("versions the critic prompt", () => {
    expect(CRITIC_PROMPT_VERSION).toBe("critic_prompt_v1");
  });
});
