import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import {
  deleteCredential as defaultDeleteCredential,
  getCredential as defaultGetCredential,
  setCredential as defaultSetCredential,
} from "../lib/keychain";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { parseVoiceApproval, parseVoiceCommand } from "../voice/parser";
import {
  createVoiceProviderService,
  DEEPGRAM_API_KEY_ACCOUNT,
  ELEVENLABS_API_KEY_ACCOUNT,
  VoiceProviderError,
  type VoiceKeychain,
} from "../voice/providers";

const GLOBAL_SETTINGS_ID = "global";

const voiceSettingsSchema = z
  .object({
    elevenLabsVoiceId: z.string().min(1).max(200).optional(),
    openAiVoice: z.string().min(1).max(80).optional(),
    preferredSpeechToTextProvider: z.enum(["DEEPGRAM", "OPENAI"]).optional(),
    preferredTextToSpeechProvider: z.enum(["ELEVENLABS", "OPENAI"]).optional(),
    readAloudEnabled: z.boolean().optional(),
    requireConfirmationForVoiceCommands: z.boolean().optional(),
    storeTranscripts: z.boolean().optional(),
    verbalApprovalEnabled: z.boolean().optional(),
    voiceInputEnabled: z.boolean().optional(),
    voiceOutputEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one voice setting is required.",
  });

const setVoiceKeySchema = z.object({
  apiKey: z.string().min(1),
});

const transcribeSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1).max(120).default("audio/webm"),
  projectId: z.string().optional(),
});

const ttsSchema = z.object({
  text: z.string().min(1).max(4000),
});

const commandSchema = z.object({
  agentRunId: z.string().optional(),
  projectId: z.string().optional(),
  transcript: z.string().min(1).max(10_000),
});

const approvalSchema = z.object({
  agentRunId: z.string().optional(),
  approvalId: z.string().min(1),
  confirmationCode: z.string().regex(/^\d{4}$/),
  projectId: z.string().optional(),
  target: z.string().min(1).max(200),
  transcript: z.string().min(1).max(10_000),
});

function voiceKeyAccount(providerId: string) {
  if (providerId === "deepgram") return DEEPGRAM_API_KEY_ACCOUNT;
  if (providerId === "elevenlabs") return ELEVENLABS_API_KEY_ACCOUNT;
  return null;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Record<string, unknown>;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function hasCredential(keychain: VoiceKeychain, account: string) {
  return (await keychain.getCredential(account).catch(() => "")).length > 0;
}

function serializeSettings(settings: Awaited<ReturnType<typeof prisma.voiceSettings.upsert>>, credentialState: {
  deepgram: boolean;
  elevenlabs: boolean;
}) {
  return {
    ...settings,
    hasDeepgramKey: credentialState.deepgram,
    hasElevenLabsKey: credentialState.elevenlabs,
    storeRawAudio: false,
  };
}

function providerErrorResponse(err: unknown) {
  if (err instanceof VoiceProviderError) {
    return {
      code: err.code,
      error: redactSecrets(err.message),
      providerId: err.providerId,
    };
  }
  return {
    code: "voice_error",
    error: redactSecrets(err instanceof Error ? err.message : String(err)),
  };
}

export function createVoiceRouter({
  deleteCredential = defaultDeleteCredential,
  getCredential = defaultGetCredential,
  getUserId = getAuthenticatedUserId,
  setCredential = defaultSetCredential,
  store = prisma,
}: {
  deleteCredential?: (account: string) => Promise<void>;
  getCredential?: (account: string) => Promise<string>;
  getUserId?: typeof getAuthenticatedUserId;
  setCredential?: (account: string, value: string) => Promise<void>;
  store?: typeof prisma;
} = {}) {
  const router = Router();
  const keychain = { getCredential };
  const providerService = createVoiceProviderService({ keychain });

  async function getSettings() {
    return store.voiceSettings.upsert({
      create: { id: GLOBAL_SETTINGS_ID },
      update: {},
      where: { id: GLOBAL_SETTINGS_ID },
    });
  }

  router.get(
    "/settings/voice",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const [settings, deepgram, elevenlabs] = await Promise.all([
        getSettings(),
        hasCredential(keychain, DEEPGRAM_API_KEY_ACCOUNT),
        hasCredential(keychain, ELEVENLABS_API_KEY_ACCOUNT),
      ]);
      return res.json({ settings: serializeSettings(settings, { deepgram, elevenlabs }) });
    }),
  );

  router.put(
    "/settings/voice",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = voiceSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const data = withoutUndefined(parsed.data);
      const settings = await store.voiceSettings.upsert({
        create: { id: GLOBAL_SETTINGS_ID, ...data, storeRawAudio: false } as Prisma.VoiceSettingsUncheckedCreateInput,
        update: { ...data, storeRawAudio: false } as Prisma.VoiceSettingsUncheckedUpdateInput,
        where: { id: GLOBAL_SETTINGS_ID },
      });
      const [deepgram, elevenlabs] = await Promise.all([
        hasCredential(keychain, DEEPGRAM_API_KEY_ACCOUNT),
        hasCredential(keychain, ELEVENLABS_API_KEY_ACCOUNT),
      ]);
      return res.json({ settings: serializeSettings(settings, { deepgram, elevenlabs }) });
    }),
  );

  router.post(
    "/settings/voice/providers/:providerId/key",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const providerId = req.params.providerId ?? "";
      const account = voiceKeyAccount(providerId);
      if (!account) return res.status(404).json({ error: "Voice provider not found" });
      const parsed = setVoiceKeySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid API key" });
      await setCredential(account, parsed.data.apiKey);
      return res.json({ providerId, saved: true });
    }),
  );

  router.delete(
    "/settings/voice/providers/:providerId/key",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const providerId = req.params.providerId ?? "";
      const account = voiceKeyAccount(providerId);
      if (!account) return res.status(404).json({ error: "Voice provider not found" });
      await deleteCredential(account);
      return res.json({ deleted: true, providerId });
    }),
  );

  router.post(
    "/voice/transcribe",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const settings = await getSettings();
      if (!settings.voiceInputEnabled) {
        return res.status(403).json({ error: "Voice input is disabled in Settings." });
      }
      const parsed = transcribeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const audio = Buffer.from(parsed.data.audioBase64, "base64");
      try {
        const result = await providerService.transcribe({
          audio,
          mimeType: parsed.data.mimeType,
          preferredProvider: settings.preferredSpeechToTextProvider as "DEEPGRAM" | "OPENAI",
        });
        return res.json({
          ...result,
          audioRetained: false,
        });
      } catch (err) {
        logger.warn({ err, userId }, "Voice transcription failed");
        return res.status(502).json(providerErrorResponse(err));
      }
    }),
  );

  router.post(
    "/voice/tts",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const settings = await getSettings();
      if (!settings.voiceOutputEnabled) {
        return res.status(403).json({ error: "Voice output is disabled in Settings." });
      }
      const parsed = ttsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      try {
        const result = await providerService.textToSpeech({
          elevenLabsVoiceId: settings.elevenLabsVoiceId,
          input: parsed.data.text,
          openAiVoice: settings.openAiVoice,
          preferredProvider: settings.preferredTextToSpeechProvider as "ELEVENLABS" | "OPENAI",
        });
        return res.json(result);
      } catch (err) {
        logger.warn({ err, userId }, "Voice TTS failed");
        return res.status(502).json(providerErrorResponse(err));
      }
    }),
  );

  router.post(
    "/voice/commands/parse",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const settings = await getSettings();
      const parsed = commandSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const result = parseVoiceCommand(parsed.data.transcript);
      const storedTranscript = settings.storeTranscripts ? parsed.data.transcript : null;
      await store.voiceCommand.create({
        data: {
          commandType: result.commandType,
          confidence: result.confidence,
          decision: result.decision,
          parsedJson: jsonValue(result.args),
          riskLevel: result.riskLevel,
          transcript: storedTranscript,
          transcriptStored: Boolean(storedTranscript),
          userId,
          ...(parsed.data.agentRunId ? { agentRunId: parsed.data.agentRunId } : {}),
          ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
          ...(result.rejectionReason ? { rejectionReason: result.rejectionReason } : {}),
        } as Prisma.VoiceCommandUncheckedCreateInput,
      });
      return res.json({ command: result, transcriptStored: Boolean(storedTranscript) });
    }),
  );

  router.post(
    "/voice/approvals/parse",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const settings = await getSettings();
      if (!settings.verbalApprovalEnabled) {
        return res.status(403).json({ error: "Verbal approval is disabled in Settings." });
      }
      const parsed = approvalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const result = parseVoiceApproval(parsed.data);
      await store.voiceCommand.create({
        data: {
          approvalId: parsed.data.approvalId,
          commandType: result.commandType,
          confidence: result.confidence,
          confirmationCode: parsed.data.confirmationCode,
          decision: result.decision,
          parsedJson: jsonValue({ target: parsed.data.target }),
          riskLevel: result.riskLevel,
          transcript: parsed.data.transcript,
          transcriptStored: true,
          userId,
          ...(parsed.data.agentRunId ? { agentRunId: parsed.data.agentRunId } : {}),
          ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
          ...(result.rejectionReason ? { rejectionReason: result.rejectionReason } : {}),
        } as Prisma.VoiceCommandUncheckedCreateInput,
      });
      return res.json({ approval: result, transcriptStored: true });
    }),
  );

  return router;
}

export const voiceRouter = createVoiceRouter();
