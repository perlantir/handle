import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createVoiceRouter } from "./voice";

function createApp(store: unknown) {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(
    "/api",
    createVoiceRouter({
      getCredential: async () => "",
      getUserId: () => "user-test",
      store: store as never,
    }),
  );
  return app;
}

function createStore(agentRun: { id: string } | null = null) {
  const writes: unknown[] = [];
  const store = {
    agentRun: {
      findFirst: vi.fn(async () => agentRun),
    },
    voiceCommand: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        writes.push(data);
        return { id: "voice-command-test", ...(data as Record<string, unknown>) };
      }),
    },
    voiceSettings: {
      upsert: vi.fn(async () => ({
        id: "global",
        storeTranscripts: false,
        verbalApprovalEnabled: true,
      })),
    },
  };
  return { store, writes };
}

describe("voice routes", () => {
  it("stores command audits without crashing when an optional agent run link is stale", async () => {
    const { store, writes } = createStore(null);

    const response = await request(createApp(store))
      .post("/api/voice/commands/parse")
      .send({ agentRunId: "stale-run", transcript: "pause this run" })
      .expect(200);

    expect(response.body.agentRunLinked).toBe(false);
    expect(store.agentRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "stale-run" }),
      }),
    );
    expect(writes[0]).not.toHaveProperty("agentRunId");
  });

  it("links command audits when the agent run belongs to the current user", async () => {
    const { store, writes } = createStore({ id: "run-1" });

    const response = await request(createApp(store))
      .post("/api/voice/commands/parse")
      .send({ agentRunId: "run-1", transcript: "what is the status?" })
      .expect(200);

    expect(response.body.agentRunLinked).toBe(true);
    expect(writes[0]).toMatchObject({ agentRunId: "run-1", userId: "user-test" });
  });

  it("stores voice approval attempts without crashing when an optional agent run link is stale", async () => {
    const { store, writes } = createStore(null);

    const response = await request(createApp(store))
      .post("/api/voice/approvals/parse")
      .send({
        agentRunId: "stale-run",
        approvalId: "approval-test",
        confirmationCode: "4821",
        target: "emails",
        transcript: "yeah sure",
      })
      .expect(200);

    expect(response.body.agentRunLinked).toBe(false);
    expect(response.body.approval.decision).toBe("REJECTED");
    expect(writes[0]).not.toHaveProperty("agentRunId");
    expect(writes[0]).toMatchObject({ transcriptStored: true });
  });
});
