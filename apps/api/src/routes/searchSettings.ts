import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { redactSecrets } from "../lib/redact";
import {
  deleteSearchProviderKey,
  listSearchSettings,
  parseSearchProviderId,
  saveSearchProviderKey,
  updateProjectSearchSettings,
  updateSearchProviderConfig,
  webSearch,
  type SearchKeychainLike,
  type SearchProviderStore,
} from "../search/searchProviderService";

const memoryScopeSchema = z.enum(["GLOBAL_AND_PROJECT", "PROJECT_ONLY", "NONE"]);
const searchProviderIdSchema = z.enum(["TAVILY", "SERPER", "BRAVE"]);
const fallbackProviderSchema = z.enum(["TAVILY", "SERPER", "BRAVE", "BUILT_IN"]);

const updateProviderSchema = z
  .object({
    enabled: z.boolean().optional(),
    memoryScope: memoryScopeSchema.optional(),
    rateLimitPerMinute: z.number().int().min(1).max(10_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one search provider setting is required.",
  });

const saveKeySchema = z
  .object({
    apiKey: z.string().min(1),
  })
  .strict();

const updateProjectSchema = z
  .object({
    defaultProvider: searchProviderIdSchema.nullable().optional(),
    fallbackOrder: z.array(fallbackProviderSchema).min(1).max(4).optional(),
    memoryScope: memoryScopeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one project search setting is required.",
  });

export interface CreateSearchSettingsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  keychain?: SearchKeychainLike;
  store?: SearchProviderStore;
}

export function createSearchSettingsRouter({
  getUserId = getAuthenticatedUserId,
  keychain,
  store,
}: CreateSearchSettingsRouterOptions = {}) {
  const router = Router();

  function requireUserId(req: Request, res: Response) {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return userId;
  }

  function providerUpdateInput(value: z.infer<typeof updateProviderSchema>) {
    const input: {
      enabled?: boolean;
      memoryScope?: "GLOBAL_AND_PROJECT" | "PROJECT_ONLY" | "NONE";
      rateLimitPerMinute?: number | null;
    } = {};
    if (value.enabled !== undefined) input.enabled = value.enabled;
    if (value.memoryScope !== undefined) input.memoryScope = value.memoryScope;
    if (value.rateLimitPerMinute !== undefined) input.rateLimitPerMinute = value.rateLimitPerMinute;
    return input;
  }

  function projectUpdateInput(value: z.infer<typeof updateProjectSchema>) {
    const input: {
      defaultProvider?: "TAVILY" | "SERPER" | "BRAVE" | null;
      fallbackOrder?: Array<"TAVILY" | "SERPER" | "BRAVE" | "BUILT_IN">;
      memoryScope?: "GLOBAL_AND_PROJECT" | "PROJECT_ONLY" | "NONE";
    } = {};
    if (value.defaultProvider !== undefined) input.defaultProvider = value.defaultProvider;
    if (value.fallbackOrder !== undefined) input.fallbackOrder = value.fallbackOrder;
    if (value.memoryScope !== undefined) input.memoryScope = value.memoryScope;
    return input;
  }

  router.get(
    "/search-providers",
    asyncHandler(async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const settings = await listSearchSettings({
        ...(keychain ? { keychain } : {}),
        ...(projectId ? { projectId } : {}),
        ...(store ? { store } : {}),
        userId,
      });
      res.json(settings);
    }),
  );

  router.put(
    "/search-providers/:providerId",
    asyncHandler(async (req, res) => {
      const providerId = parseSearchProviderId(req.params.providerId);
      if (!providerId) return res.status(404).json({ error: "Search provider not found" });

      const parsed = updateProviderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      }

      const userId = requireUserId(req, res);
      if (!userId) return;
      await updateSearchProviderConfig({
        input: providerUpdateInput(parsed.data),
        providerId,
        ...(store ? { store } : {}),
        userId,
      });
      const settings = await listSearchSettings({
        ...(keychain ? { keychain } : {}),
        ...(store ? { store } : {}),
        userId,
      });
      res.json(settings);
    }),
  );

  router.post(
    "/search-providers/:providerId/key",
    asyncHandler(async (req, res) => {
      const providerId = parseSearchProviderId(req.params.providerId);
      if (!providerId) return res.status(404).json({ error: "Search provider not found" });

      const parsed = saveKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      }

      const userId = requireUserId(req, res);
      if (!userId) return;
      await saveSearchProviderKey({
        apiKey: parsed.data.apiKey,
        ...(keychain ? { keychain } : {}),
        providerId,
        ...(store ? { store } : {}),
        userId,
      });
      const settings = await listSearchSettings({
        ...(keychain ? { keychain } : {}),
        ...(store ? { store } : {}),
        userId,
      });
      res.json(settings);
    }),
  );

  router.delete(
    "/search-providers/:providerId/key",
    asyncHandler(async (req, res) => {
      const providerId = parseSearchProviderId(req.params.providerId);
      if (!providerId) return res.status(404).json({ error: "Search provider not found" });
      const userId = requireUserId(req, res);
      if (!userId) return;
      await deleteSearchProviderKey({
        ...(keychain ? { keychain } : {}),
        providerId,
        ...(store ? { store } : {}),
        userId,
      });
      res.json({ deleted: true, providerId });
    }),
  );

  router.post(
    "/search-providers/:providerId/test",
    asyncHandler(async (req, res) => {
      const providerId = parseSearchProviderId(req.params.providerId);
      if (!providerId) return res.status(404).json({ error: "Search provider not found" });
      const userId = requireUserId(req, res);
      if (!userId) return;
      try {
        const result = await webSearch({
          maxResults: 1,
          providerId,
          query: "Handle AI agent",
          ...(keychain ? { keychain } : {}),
          ...(store ? { store } : {}),
          userId,
        });
        res.json({
          ok: true,
          providerId,
          resultCount: result.results.length,
          sample: result.results[0] ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({
          error: redactSecrets(message),
          ok: false,
          providerId,
        });
      }
    }),
  );

  router.get(
    "/projects/:projectId/search",
    asyncHandler(async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const projectId = req.params.projectId;
      if (!projectId) return res.status(404).json({ error: "Project not found" });
      const settings = await listSearchSettings({
        ...(keychain ? { keychain } : {}),
        projectId,
        ...(store ? { store } : {}),
        userId,
      });
      res.json(settings.project);
    }),
  );

  router.put(
    "/projects/:projectId/search",
    asyncHandler(async (req, res) => {
      const parsed = updateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      }
      const projectId = req.params.projectId;
      if (!projectId) return res.status(404).json({ error: "Project not found" });
      const updated = await updateProjectSearchSettings({
        input: projectUpdateInput(parsed.data),
        projectId,
        ...(store ? { store } : {}),
      });
      res.json({ search: updated });
    }),
  );

  return router;
}

export const searchSettingsRouter = createSearchSettingsRouter();
