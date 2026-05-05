"use client";

import { KeyRound, Loader2, Save, Trash2, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PillButton, Toggle } from "@/components/design-system";
import {
  deleteVoiceProviderKey,
  getVoiceSettings,
  saveVoiceProviderKey,
  updateVoiceSettings,
  type VoiceSettingsSummary,
} from "@/lib/voice";
import { cn } from "@/lib/utils";

type Status = { message: string; tone: "error" | "success" };

const defaultDraft: Partial<VoiceSettingsSummary> = {
  elevenLabsVoiceId: "JBFqnCBsd6RMkjVDRZzb",
  openAiVoice: "coral",
  preferredSpeechToTextProvider: "DEEPGRAM",
  preferredTextToSpeechProvider: "ELEVENLABS",
  readAloudEnabled: false,
  requireConfirmationForVoiceCommands: true,
  storeTranscripts: false,
  verbalApprovalEnabled: false,
  voiceInputEnabled: false,
  voiceOutputEnabled: false,
};

function SettingToggle({
  checked,
  helper,
  label,
  onChange,
}: {
  checked: boolean;
  helper: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[8px] border border-border-subtle bg-bg-canvas px-3 py-3">
      <div>
        <div className="text-[12.5px] font-medium text-text-primary">{label}</div>
        <div className="mt-1 text-[11.5px] leading-[16px] text-text-tertiary">{helper}</div>
      </div>
      <Toggle checked={checked} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function VoiceSettings() {
  const [deepgramKey, setDeepgramKey] = useState("");
  const [draft, setDraft] = useState<Partial<VoiceSettingsSummary>>(defaultDraft);
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [settings, setSettings] = useState<VoiceSettingsSummary | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVoiceSettings()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setDraft(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            message: error instanceof Error ? error.message : "Failed to load voice settings",
            tone: "error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveSettings() {
    setSaving("settings");
    setStatus(null);
    try {
      const updated = await updateVoiceSettings(draft);
      setSettings(updated);
      setDraft(updated);
      setStatus({ message: "Voice settings saved", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to save voice settings",
        tone: "error",
      });
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveKey(providerId: "deepgram" | "elevenlabs") {
    const value = providerId === "deepgram" ? deepgramKey.trim() : elevenLabsKey.trim();
    if (!value) return;
    setSaving(providerId);
    setStatus(null);
    try {
      await saveVoiceProviderKey(providerId, value);
      const updated = await getVoiceSettings();
      setSettings(updated);
      setDraft(updated);
      if (providerId === "deepgram") setDeepgramKey("");
      if (providerId === "elevenlabs") setElevenLabsKey("");
      setStatus({ message: `${providerId === "deepgram" ? "Deepgram" : "ElevenLabs"} key saved`, tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to save voice key",
        tone: "error",
      });
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteKey(providerId: "deepgram" | "elevenlabs") {
    setSaving(providerId);
    setStatus(null);
    try {
      await deleteVoiceProviderKey(providerId);
      const updated = await getVoiceSettings();
      setSettings(updated);
      setDraft(updated);
      setStatus({ message: "Voice provider key deleted", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to delete voice key",
        tone: "error",
      });
    } finally {
      setSaving(null);
    }
  }

  function patch(patch: Partial<VoiceSettingsSummary>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading voice settings
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[12px] border border-border-subtle bg-bg-surface p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-bg-inverse text-text-onAccent">
            <Volume2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="m-0 text-[14px] font-medium tracking-[-0.01em] text-text-primary">Voice control</h2>
            <p className="mt-1 max-w-[560px] text-[12px] leading-[18px] text-text-tertiary">
              Push-to-talk only. Raw audio is never stored. Full transcripts are off unless you opt in.
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <SettingToggle
            checked={Boolean(draft.voiceInputEnabled)}
            helper="Enable microphone transcription with Deepgram first, OpenAI fallback when configured."
            label="Voice input"
            onChange={(checked) => patch({ voiceInputEnabled: checked })}
          />
          <SettingToggle
            checked={Boolean(draft.voiceOutputEnabled)}
            helper="Enable spoken responses with ElevenLabs first, OpenAI TTS fallback when configured."
            label="Voice output"
            onChange={(checked) => patch({ voiceOutputEnabled: checked })}
          />
          <SettingToggle
            checked={Boolean(draft.readAloudEnabled)}
            helper="Read final summaries aloud after a run completes."
            label="Read aloud"
            onChange={(checked) => patch({ readAloudEnabled: checked })}
          />
          <SettingToggle
            checked={Boolean(draft.verbalApprovalEnabled)}
            helper="Allow voice approvals only when the visible approval card and confirmation code match."
            label="Verbal approvals"
            onChange={(checked) => patch({ verbalApprovalEnabled: checked })}
          />
          <SettingToggle
            checked={Boolean(draft.storeTranscripts)}
            helper="Store full command transcripts. Approval transcripts are always logged for safety."
            label="Store full transcripts"
            onChange={(checked) => patch({ storeTranscripts: checked })}
          />
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Speech-to-text provider</span>
            <select
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => patch({ preferredSpeechToTextProvider: event.target.value as "DEEPGRAM" | "OPENAI" })}
              value={draft.preferredSpeechToTextProvider ?? "DEEPGRAM"}
            >
              <option value="DEEPGRAM">Deepgram Nova-3</option>
              <option value="OPENAI">OpenAI gpt-4o-transcribe</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Text-to-speech provider</span>
            <select
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => patch({ preferredTextToSpeechProvider: event.target.value as "ELEVENLABS" | "OPENAI" })}
              value={draft.preferredTextToSpeechProvider ?? "ELEVENLABS"}
            >
              <option value="ELEVENLABS">ElevenLabs</option>
              <option value="OPENAI">OpenAI TTS</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-[12px] border border-border-subtle bg-bg-surface p-5">
        <h2 className="m-0 text-[14px] font-medium text-text-primary">Provider keys</h2>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-text-secondary">
              <KeyRound className="h-3.5 w-3.5" />
              Deepgram API key {settings?.hasDeepgramKey ? "· configured" : "· missing"}
            </div>
            <div className="flex gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) => setDeepgramKey(event.target.value)}
                placeholder={settings?.hasDeepgramKey ? "Leave blank to keep existing key" : "Paste Deepgram API key"}
                type="password"
                value={deepgramKey}
              />
              <PillButton disabled={saving === "deepgram" || !deepgramKey.trim()} onClick={() => void handleSaveKey("deepgram")} type="button">
                Save
              </PillButton>
              {settings?.hasDeepgramKey ? (
                <PillButton icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void handleDeleteKey("deepgram")} type="button" variant="secondary">
                  Delete
                </PillButton>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-text-secondary">
              <KeyRound className="h-3.5 w-3.5" />
              ElevenLabs API key {settings?.hasElevenLabsKey ? "· configured" : "· missing"}
            </div>
            <div className="flex gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) => setElevenLabsKey(event.target.value)}
                placeholder={settings?.hasElevenLabsKey ? "Leave blank to keep existing key" : "Paste ElevenLabs API key"}
                type="password"
                value={elevenLabsKey}
              />
              <PillButton disabled={saving === "elevenlabs" || !elevenLabsKey.trim()} onClick={() => void handleSaveKey("elevenlabs")} type="button">
                Save
              </PillButton>
              {settings?.hasElevenLabsKey ? (
                <PillButton icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void handleDeleteKey("elevenlabs")} type="button" variant="secondary">
                  Delete
                </PillButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {status ? (
          <span className={cn("text-[12px]", status.tone === "success" ? "text-status-success" : "text-status-error")}>
            {status.message}
          </span>
        ) : (
          <span className="text-[12px] text-text-tertiary">High-risk verbal approvals always require the visible code.</span>
        )}
        <PillButton
          disabled={saving === "settings"}
          icon={saving === "settings" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          onClick={handleSaveSettings}
          type="button"
        >
          Save voice settings
        </PillButton>
      </div>
    </div>
  );
}
