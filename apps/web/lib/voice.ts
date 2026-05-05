export interface VoiceSettingsSummary {
  elevenLabsVoiceId: string;
  hasDeepgramKey: boolean;
  hasElevenLabsKey: boolean;
  openAiVoice: string;
  preferredSpeechToTextProvider: "DEEPGRAM" | "OPENAI";
  preferredTextToSpeechProvider: "ELEVENLABS" | "OPENAI";
  readAloudEnabled: boolean;
  requireConfirmationForHighRiskApproval: boolean;
  requireConfirmationForVoiceCommands: boolean;
  storeRawAudio: boolean;
  storeTranscripts: boolean;
  verbalApprovalEnabled: boolean;
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
}

export interface TranscribeResponse {
  audioRetained: false;
  confidence?: number;
  providerId: "DEEPGRAM" | "OPENAI";
  text: string;
}

export interface VoiceCommandResponse {
  command: {
    args: Record<string, unknown>;
    commandType: string;
    confidence: number;
    decision: string;
    rejectionReason?: string;
    riskLevel: string;
  };
  transcriptStored: boolean;
}

async function parseApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Voice request failed"));
  }

  return response.json() as Promise<T>;
}

export async function getVoiceSettings() {
  const body = await requestJson<{ settings: VoiceSettingsSummary }>("/api/settings/voice");
  return body.settings;
}

export async function updateVoiceSettings(input: Partial<VoiceSettingsSummary>) {
  const body = await requestJson<{ settings: VoiceSettingsSummary }>("/api/settings/voice", {
    body: JSON.stringify(input),
    method: "PUT",
  });
  return body.settings;
}

export async function saveVoiceProviderKey(providerId: "deepgram" | "elevenlabs", apiKey: string) {
  return requestJson<{ providerId: string; saved: boolean }>(`/api/settings/voice/providers/${providerId}/key`, {
    body: JSON.stringify({ apiKey }),
    method: "POST",
  });
}

export async function deleteVoiceProviderKey(providerId: "deepgram" | "elevenlabs") {
  return requestJson<{ deleted: boolean; providerId: string }>(`/api/settings/voice/providers/${providerId}/key`, {
    method: "DELETE",
  });
}

export async function transcribeVoice(audioBase64: string, mimeType: string) {
  return requestJson<TranscribeResponse>("/api/voice/transcribe", {
    body: JSON.stringify({ audioBase64, mimeType }),
    method: "POST",
  });
}

export async function parseVoiceCommand(transcript: string, agentRunId?: string, projectId?: string) {
  return requestJson<VoiceCommandResponse>("/api/voice/commands/parse", {
    body: JSON.stringify({ agentRunId, projectId, transcript }),
    method: "POST",
  });
}

export async function parseVoiceApproval(input: {
  agentRunId?: string;
  approvalId: string;
  confirmationCode: string;
  projectId?: string;
  target: string;
  transcript: string;
}) {
  return requestJson<{
    approval: {
      commandType: string;
      confidence: number;
      decision: "EXECUTED" | "REJECTED";
      rejectionReason?: string;
      riskLevel: "HIGH";
    };
    transcriptStored: true;
  }>("/api/voice/approvals/parse", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function textToSpeech(text: string) {
  return requestJson<{ audioBase64: string; mimeType: string; providerId: string }>("/api/voice/tts", {
    body: JSON.stringify({ text }),
    method: "POST",
  });
}
