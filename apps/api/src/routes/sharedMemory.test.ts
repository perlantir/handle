import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSharedMemoryRouter } from "./sharedMemory";

function createApp(store: NonNullable<NonNullable<Parameters<typeof createSharedMemoryRouter>[0]>["store"]>) {
  const app = express();
  app.use(express.json());
  app.use("/api", createSharedMemoryRouter({ getUserId: () => "user-test", store }));
  return app;
}

describe("shared memory routes", () => {
  it("sets and gets shared memory entries", async () => {
    let namespace = {
      entries: {},
      id: "namespace-1",
      lockedKeys: [] as string[],
    };
    const store = {
      sharedMemoryNamespace: {
        findUnique: vi.fn(async () => namespace),
        update: vi.fn(async ({ data }: { data: Partial<typeof namespace> }) => {
          namespace = { ...namespace, ...data };
          return namespace;
        }),
      },
    };

    await request(createApp(store))
      .post("/api/shared-memory/namespace-1/set")
      .send({ key: "plan", lastWriter: "worker-a", value: "draft" })
      .expect(200);

    const response = await request(createApp(store))
      .post("/api/shared-memory/namespace-1/get")
      .send({ key: "plan" })
      .expect(200);

    expect(response.body.entry).toMatchObject({
      lastWriter: "worker-a",
      value: "draft",
      version: 1,
    });
  });
});
