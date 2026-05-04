import type {
  IntegrationConnectorId,
  IntegrationSettingsResponse,
  MemoryScope,
} from "@handle/shared";
import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import {
  deleteCredential as defaultDeleteCredential,
  getCredential as defaultGetCredential,
  setCredential as defaultSetCredential,
} from "../lib/keychain";
import { prisma } from "../lib/prisma";
import { connectorById, connectorOrder } from "../integrations/nango/connectors";
import {
  IntegrationError,
  integrationErrorCode,
  integrationErrorMessage,
} from "../integrations/nango/errors";
import {
  createNangoService,
  type IntegrationKeychain,
} from "../integrations/nango/nangoService";

const connectSessionSchema = z
  .object({
    accountAlias: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const completeConnectionSchema = z
  .object({
    accountAlias: z.string().trim().min(1).max(80).optional(),
    accountLabel: z.string().trim().min(1).max(160).optional(),
    connectionId: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

const updateIntegrationSchema = z
  .object({
    accountAlias: z.string().trim().min(1).max(80).optional(),
    accountLabel: z.string().trim().min(1).max(160).nullable().optional(),
    defaultAccount: z.boolean().optional(),
    memoryScope: z.enum(["GLOBAL_AND_PROJECT", "PROJECT_ONLY", "NONE"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one integration setting is required.",
  });

export interface CreateIntegrationsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  keychain?: IntegrationKeychain;
  nangoService?: {
    completeConnection(input: {
      accountAlias?: string;
      accountLabel?: string;
      connectionId?: string;
      connectorId: IntegrationConnectorId;
      userId: string;
    }): Promise<unknown>;
    createConnectSession(input: {
      accountAlias?: string;
      connectorId: IntegrationConnectorId;
      userId: string;
    }): Promise<unknown>;
    deleteIntegration(integrationId: string, userId: string): Promise<unknown>;
    listSettings(userId: string): Promise<IntegrationSettingsResponse>;
    testIntegration(integrationId: string, userId: string): Promise<unknown>;
    updateIntegration(input: {
      accountAlias?: string;
      accountLabel?: string | null;
      defaultAccount?: boolean;
      integrationId: string;
      memoryScope?: MemoryScope;
      userId: string;
    }): Promise<unknown>;
  };
}

export function createIntegrationsRouter({
  getUserId = getAuthenticatedUserId,
  keychain = {
    deleteCredential: defaultDeleteCredential,
    getCredential: defaultGetCredential,
    setCredential: defaultSetCredential,
  },
  nangoService,
}: CreateIntegrationsRouterOptions = {}) {
  const router = Router();
  const integrations =
    nangoService ??
    createNangoService({
      keychain,
      prisma,
    });

  router.get(
    "/integrations",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      return res.json(await integrations.listSettings(userId));
    }),
  );

  router.get(
    "/integrations/connectors",
    asyncHandler(async (_req, res) => {
      return res.json({
        connectors: connectorOrder.map((connectorId) => connectorById(connectorId)),
      });
    }),
  );

  router.post(
    "/integrations/:connectorId/connect-session",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const connector = req.params.connectorId
        ? connectorById(req.params.connectorId)
        : null;
      if (!connector) {
        return res.status(404).json({ error: "Unknown integration connector." });
      }

      const parsed = connectSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      try {
        const input = {
          connectorId: connector.connectorId,
          userId,
          ...(parsed.data.accountAlias
            ? { accountAlias: parsed.data.accountAlias }
            : {}),
        };
        const result = await integrations.createConnectSession(input);
        return res.json(result);
      } catch (err) {
        return res.status(integrationHttpStatus(err)).json(formatIntegrationError(err));
      }
    }),
  );

  router.post(
    "/integrations/:connectorId/complete",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const connector = req.params.connectorId
        ? connectorById(req.params.connectorId)
        : null;
      if (!connector) {
        return res.status(404).json({ error: "Unknown integration connector." });
      }

      const parsed = completeConnectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      try {
        const input = {
          connectorId: connector.connectorId,
          userId,
          ...(parsed.data.accountAlias
            ? { accountAlias: parsed.data.accountAlias }
            : {}),
          ...(parsed.data.accountLabel
            ? { accountLabel: parsed.data.accountLabel }
            : {}),
          ...(parsed.data.connectionId
            ? { connectionId: parsed.data.connectionId }
            : {}),
        };
        const result = await integrations.completeConnection(input);
        return res.json(result);
      } catch (err) {
        return res.status(integrationHttpStatus(err)).json(formatIntegrationError(err));
      }
    }),
  );

  router.post(
    "/integrations/:integrationId/test",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        const integrationId = req.params.integrationId;
        if (!integrationId) {
          return res.status(404).json({ error: "Integration account not found." });
        }
        return res.json(
          await integrations.testIntegration(integrationId, userId),
        );
      } catch (err) {
        return res.status(integrationHttpStatus(err)).json(formatIntegrationError(err));
      }
    }),
  );

  router.put(
    "/integrations/:integrationId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = updateIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      try {
        const integrationId = req.params.integrationId;
        if (!integrationId) {
          return res.status(404).json({ error: "Integration account not found." });
        }
        const input = {
          integrationId,
          userId,
          ...(parsed.data.accountAlias
            ? { accountAlias: parsed.data.accountAlias }
            : {}),
          ...(parsed.data.accountLabel !== undefined
            ? { accountLabel: parsed.data.accountLabel }
            : {}),
          ...(parsed.data.defaultAccount !== undefined
            ? { defaultAccount: parsed.data.defaultAccount }
            : {}),
          ...(parsed.data.memoryScope
            ? { memoryScope: parsed.data.memoryScope }
            : {}),
        };
        return res.json(
          await integrations.updateIntegration(input),
        );
      } catch (err) {
        return res.status(integrationHttpStatus(err)).json(formatIntegrationError(err));
      }
    }),
  );

  router.delete(
    "/integrations/:integrationId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        const integrationId = req.params.integrationId;
        if (!integrationId) {
          return res.status(404).json({ error: "Integration account not found." });
        }
        return res.json(
          await integrations.deleteIntegration(integrationId, userId),
        );
      } catch (err) {
        return res.status(integrationHttpStatus(err)).json(formatIntegrationError(err));
      }
    }),
  );

  return router;
}

function formatIntegrationError(err: unknown) {
  return {
    code: integrationErrorCode(err),
    error: integrationErrorMessage(err),
  };
}

function integrationHttpStatus(err: unknown) {
  if (err instanceof IntegrationError) {
    if (err.code === "validation_error") return 400;
    if (err.code === "nango_not_configured" || err.code === "settings_invalid") {
      return 409;
    }
    if (err.code === "not_connected" || err.code === "provider_not_found") return 404;
    if (err.code === "rate_limited") return 429;
  }
  return 500;
}

export const integrationsRouter = createIntegrationsRouter();
