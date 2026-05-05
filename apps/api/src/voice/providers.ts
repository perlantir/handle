import { accountForProvider } from "../providers/providerCredentials";

export const DEEPGRAM_API_KEY_ACCOUNT = "voice:deepgram:apiKey";
export const ELEVENLABS_API_KEY_ACCOUNT = "voice:elevenlabs:apiKey";

export interface VoiceKeychain {
  getCredential(account: string): Promise<string>;
}

export interface TranscribeInput {
  audio: Buffer;
  mimeType: string;
  preferredProvider: "DEEPGRAM" | "OPENAI";
}

export interface TranscribeResult {
  confidence?: number;
  providerId: "DEEPGRAM" | "OPENAI";
  text: string;
  words?: Array<{ confidence?: number; end?: number; start?: number; word: string }>;
}

export interface TextToSpeechInput {
  elevenLabsVoiceId: string;
  input: string;
  openAiVoice: string;
  preferredProvider: "ELEVENLABS" | "OPENAI";
}

export interface TextToSpeechResult {
  audioBase64: string;
  mimeType: string;
  providerId: "ELEVENLABS" | "OPENAI";
}

export class VoiceProviderError extends Error {
  code: string;
  providerId: string;

  constructor(providerId: string, code: string, message: string) {
    super(message);
    this.name = "VoiceProviderError";
    this.providerId = providerId;
    this.code = code;
  }
}

function bufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

async function requireKey(keychain: VoiceKeychain, account: string, providerId: string) {
  const key = await keychain.getCredential(account).catch(() => "");
  if (!key) {
    throw new VoiceProviderError(providerId, "missing_api_key", `${providerId} API key is not configured.`);
  }
  return key;
}

async function parseJsonOrThrow(response: Response, providerId: string) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : `${providerId} request failed with status ${response.status}`;
    throw new VoiceProviderError(providerId, "provider_error", message);
  }
  return body;
}

export function createVoiceProviderService({ keychain }: { keychain: VoiceKeychain }) {
  async function transcribeWithDeepgram(input: TranscribeInput): Promise<TranscribeResult> {
    const apiKey = await requireKey(keychain, DEEPGRAM_API_KEY_ACCOUNT, "DEEPGRAM");
    const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true", {
      body: new Blob([bufferToArrayBuffer(input.audio)], {
        type: input.mimeType || "audio/webm",
      }),
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": input.mimeType || "audio/webm",
      },
      method: "POST",
    });
    const body = await parseJsonOrThrow(response, "DEEPGRAM");
    const alternative = body?.results?.channels?.[0]?.alternatives?.[0];
    const text = typeof alternative?.transcript === "string" ? alternative.transcript : "";
    if (!text) {
      throw new VoiceProviderError("DEEPGRAM", "empty_transcript", "Deepgram returned an empty transcript.");
    }
    return {
      providerId: "DEEPGRAM",
      text,
      ...(typeof alternative.confidence === "number" ? { confidence: alternative.confidence } : {}),
      ...(Array.isArray(alternative.words) ? { words: alternative.words } : {}),
    };
  }

  async function transcribeWithOpenAI(input: TranscribeInput): Promise<TranscribeResult> {
    const apiKey = await requireKey(keychain, accountForProvider("openai"), "OPENAI");
    const form = new FormData();
    const extension = input.mimeType.includes("wav") ? "wav" : input.mimeType.includes("mpeg") ? "mp3" : "webm";
    form.append("model", "gpt-4o-transcribe");
    form.append(
      "file",
      new Blob([bufferToArrayBuffer(input.audio)], {
        type: input.mimeType || "audio/webm",
      }),
      `voice-command.${extension}`,
    );
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      body: form,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      method: "POST",
    });
    const body = await parseJsonOrThrow(response, "OPENAI");
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text) {
      throw new VoiceProviderError("OPENAI", "empty_transcript", "OpenAI returned an empty transcript.");
    }
    return {
      providerId: "OPENAI",
      text,
    };
  }

  async function transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const providers = input.preferredProvider === "DEEPGRAM" ? ["DEEPGRAM", "OPENAI"] : ["OPENAI", "DEEPGRAM"];
    const errors: string[] = [];
    for (const providerId of providers) {
      try {
        return providerId === "DEEPGRAM" ? await transcribeWithDeepgram(input) : await transcribeWithOpenAI(input);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new VoiceProviderError("VOICE", "all_providers_failed", errors.join(" | "));
  }

  async function speakWithElevenLabs(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    const apiKey = await requireKey(keychain, ELEVENLABS_API_KEY_ACCOUNT, "ELEVENLABS");
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.elevenLabsVoiceId)}?output_format=mp3_44100_128`,
      {
        body: JSON.stringify({
          model_id: "eleven_multilingual_v2",
          text: input.input,
        }),
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        method: "POST",
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new VoiceProviderError("ELEVENLABS", "provider_error", body || `ElevenLabs failed with ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      audioBase64: buffer.toString("base64"),
      mimeType: "audio/mpeg",
      providerId: "ELEVENLABS",
    };
  }

  async function speakWithOpenAI(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    const apiKey = await requireKey(keychain, accountForProvider("openai"), "OPENAI");
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      body: JSON.stringify({
        input: input.input,
        model: "gpt-4o-mini-tts",
        voice: input.openAiVoice || "coral",
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new VoiceProviderError("OPENAI", "provider_error", body || `OpenAI TTS failed with ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      audioBase64: buffer.toString("base64"),
      mimeType: "audio/mpeg",
      providerId: "OPENAI",
    };
  }

  async function textToSpeech(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    const providers = input.preferredProvider === "ELEVENLABS" ? ["ELEVENLABS", "OPENAI"] : ["OPENAI", "ELEVENLABS"];
    const errors: string[] = [];
    for (const providerId of providers) {
      try {
        return providerId === "ELEVENLABS" ? await speakWithElevenLabs(input) : await speakWithOpenAI(input);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new VoiceProviderError("VOICE", "all_providers_failed", errors.join(" | "));
  }

  return {
    textToSpeech,
    transcribe,
  };
}
