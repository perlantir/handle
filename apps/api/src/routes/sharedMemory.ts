import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  lockSharedMemoryKey,
  readSharedMemoryKey,
  unlockSharedMemoryKey,
  writeSharedMemoryKey,
  type SharedMemoryStore,
} from "../memory/sharedMemory";

const keySchema = z.object({
  key: z.string().min(1).max(200),
});

const setSchema = keySchema.extend({
  expectedVersion: z.number().int().nonnegative().optional(),
  lastWriter: z.string().min(1).max(200).optional(),
  value: z.unknown(),
});

export function createSharedMemoryRouter({
  getUserId = getAuthenticatedUserId,
  store = prisma,
}: {
  getUserId?: typeof getAuthenticatedUserId;
  store?: SharedMemoryStore;
} = {}) {
  const router = Router();

  router.post(
    "/shared-memory/:namespaceId/get",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const namespaceId = req.params.namespaceId;
      if (!namespaceId) return res.status(400).json({ error: "Namespace id is required" });
      const parsed = keySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const entry = await readSharedMemoryKey({
        key: parsed.data.key,
        namespaceId,
        store,
      });
      return res.json({ entry });
    }),
  );

  router.post(
    "/shared-memory/:namespaceId/set",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const namespaceId = req.params.namespaceId;
      if (!namespaceId) return res.status(400).json({ error: "Namespace id is required" });
      const parsed = setSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const entry = await writeSharedMemoryKey({
        ...(parsed.data.expectedVersion === undefined ? {} : { expectedVersion: parsed.data.expectedVersion }),
        key: parsed.data.key,
        namespaceId,
        store,
        value: parsed.data.value,
        writer: parsed.data.lastWriter ?? userId,
      });
      return res.json({ entry });
    }),
  );

  router.post(
    "/shared-memory/:namespaceId/lock",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const namespaceId = req.params.namespaceId;
      if (!namespaceId) return res.status(400).json({ error: "Namespace id is required" });
      const parsed = keySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      return res.json(await lockSharedMemoryKey({ key: parsed.data.key, namespaceId, store }));
    }),
  );

  router.post(
    "/shared-memory/:namespaceId/unlock",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const namespaceId = req.params.namespaceId;
      if (!namespaceId) return res.status(400).json({ error: "Namespace id is required" });
      const parsed = keySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      return res.json(await unlockSharedMemoryKey({ key: parsed.data.key, namespaceId, store }));
    }),
  );

  return router;
}

export const sharedMemoryRouter = createSharedMemoryRouter();
