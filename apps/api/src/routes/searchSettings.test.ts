import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSearchSettingsRouter } from "./searchSettings";
import type {
  SearchKeychainLike,
  SearchProviderConfigRow,
  SearchProviderStore,
} from "../search/searchProviderService";

function makeStore(): SearchProviderStore {
  const rows = new Map<string, SearchProviderConfigRow>();
  return {
    projectSearchSettings: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (args: { create: unknown; update: unknown }) => ({
        ...(args.create as Record<string, unknown>),
        ...(args.update as Record<string, unknown>),
      }) as never),
    },
    searchProviderConfig: {
      findMany: vi.fn(async () => Array.from(rows.values())),
      findUnique: vi.fn(async (args: { where: { userId_providerId: { providerId: string } } }) =>
        rows.get(args.where.userId_providerId.providerId) ?? null,
      ),
      update: vi.fn(async (args: { data: Partial<SearchProviderConfigRow>; where: { userId_providerId: { providerId: string } } }) => {
        const current = rows.get(args.where.userId_providerId.providerId);
        if (!current) throw new Error("missing row");
        const updated = { ...current, ...args.data };
        rows.set(args.where.userId_providerId.providerId, updated);
        return updated;
      }),
      upsert: vi.fn(async (args: { create: SearchProviderConfigRow; update?: Partial<SearchProviderConfigRow>; where: { userId_providerId: { providerId: string } } }) => {
        const current = rows.get(args.where.userId_providerId.providerId);
        if (current) {
          const updated = { ...current, ...(args.update ?? {}) };
          rows.set(args.where.userId_providerId.providerId, updated);
          return updated;
        }
        rows.set(args.create.providerId, args.create);
        return args.create;
      }),
    },
  };
}

function makeKeychain(): SearchKeychainLike {
  const values = new Map<string, string>();
  return {
    async deleteCredential(account) {
      values.delete(account);
    },
    async getCredential(account) {
      const value = values.get(account);
      if (!value) throw new Error(`Credential not found: ${account}`);
      return value;
    },
    async setCredential(account, value) {
      values.set(account, value);
    },
  };
}

function app(store = makeStore(), keychain = makeKeychain()) {
  const server = express();
  server.use(express.json());
  server.use(
    "/api/settings",
    createSearchSettingsRouter({
      getUserId: () => "user-test",
      keychain,
      store,
    }),
  );
  return server;
}

describe("search settings routes", () => {
  it("lists BYOK search providers with missing-key status", async () => {
    const response = await request(app()).get("/api/settings/search-providers");

    expect(response.status).toBe(200);
    expect(response.body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "TAVILY", status: "missing_key" }),
        expect.objectContaining({ id: "SERPER", status: "missing_key" }),
        expect.objectContaining({ id: "BRAVE", status: "missing_key" }),
      ]),
    );
  });

  it("saves a provider key and enables the provider", async () => {
    const response = await request(app())
      .post("/api/settings/search-providers/TAVILY/key")
      .send({ apiKey: "test-key-not-real" });

    expect(response.status).toBe(200);
    expect(response.body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          hasApiKey: true,
          id: "TAVILY",
          status: "configured",
        }),
      ]),
    );
  });

  it("saves project search defaults", async () => {
    const response = await request(app())
      .put("/api/settings/projects/project-1/search")
      .send({
        defaultProvider: "BRAVE",
        fallbackOrder: ["BRAVE", "SERPER", "BUILT_IN"],
        memoryScope: "NONE",
      });

    expect(response.status).toBe(200);
    expect(response.body.search.defaultProvider).toBe("BRAVE");
  });
});
