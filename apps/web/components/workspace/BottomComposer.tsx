'use client';

import { ArrowUp, Brain, Mic, Paperclip, Pause, Play, Sparkles, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ProjectSummary, TaskDetailResponse } from '@handle/shared';
import { listProjects, pickProjectFolder, sendConversationMessage, updateProject } from '@/lib/api';
import { useHandleAuth } from '@/lib/handleAuth';
import { listSettingsProviders, type SettingsProvider } from '@/lib/settingsProviders';
import { cn } from '@/lib/utils';
import { getVoiceSettings, parseVoiceCommand, transcribeVoice, type VoiceSettingsSummary } from '@/lib/voice';

function IconButton({ children, label, ...props }: { children: React.ReactNode; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

function defaultMemoryEnabled(project: ProjectSummary | null) {
  return project?.memoryScope !== 'NONE';
}

export function BottomComposer({
  cancelling = false,
  isRunActive = false,
  isRunPaused = false,
  onCancelRun,
  onPauseRun,
  onResumeRun,
  pausing = false,
  resuming = false,
  task,
}: {
  cancelling?: boolean;
  isRunActive?: boolean;
  isRunPaused?: boolean;
  onCancelRun?: () => void;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  pausing?: boolean;
  resuming?: boolean;
  task: TaskDetailResponse | null;
}) {
  const router = useRouter();
  const { getToken } = useHandleAuth();
  const [value, setValue] = useState('');
  const [backend, setBackend] = useState<TaskDetailResponse['backend']>(task?.backend ?? 'e2b');
  const [customScopePath, setCustomScopePath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [providers, setProviders] = useState<SettingsProvider[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsSummary | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const memoryTouchedRef = useRef(false);
  const pendingProjectPatchRef = useRef<Promise<ProjectSummary | null> | null>(null);

  useEffect(() => {
    if (!task?.projectId) {
      setBackend(task?.backend ?? 'e2b');
    }
    memoryTouchedRef.current = false;
    setSelectedModelKey(
      task?.providerId && task.providerModel ? `${task.providerId}:${task.providerModel}` : '',
    );
  }, [task?.backend, task?.projectId, task?.providerId, task?.providerModel]);

  useEffect(() => {
    let cancelled = false;
    async function loadControls() {
      const token = await getToken();
      const [projects, loadedProviders] = await Promise.all([
        listProjects({ token }),
        listSettingsProviders().catch(() => []),
      ]);
      const loadedVoiceSettings = await getVoiceSettings().catch(() => null);
      if (cancelled) return;
      const activeProject = projects.find((item) => item.id === task?.projectId) ?? null;
      setProject(activeProject);
      if (!memoryTouchedRef.current) {
        setMemoryEnabled(defaultMemoryEnabled(activeProject));
      }
      setCustomScopePath(activeProject?.customScopePath ?? '');
      if (activeProject?.defaultBackend) {
        setBackend(activeProject.defaultBackend === 'LOCAL' ? 'local' : 'e2b');
      } else {
        setBackend(task?.backend ?? 'e2b');
      }
      setProviders(loadedProviders);
      setVoiceSettings(loadedVoiceSettings);
      if (!selectedModelKey) {
        const current =
          loadedProviders.find((provider) => provider.enabled && provider.id === activeProject?.defaultProvider) ??
          loadedProviders.find((provider) => provider.enabled);
        if (current) setSelectedModelKey(`${current.id}:${activeProject?.defaultModel ?? current.primaryModel}`);
      }
    }
    if (task?.projectId) {
      void loadControls().catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load project controls');
      });
    }
    return () => {
      cancelled = true;
    };
  }, [getToken, selectedModelKey, task?.projectId]);

  async function saveProjectPatch(input: Parameters<typeof updateProject>[0]['input']) {
    if (!project) return null;
    const promise = (async () => {
      const token = await getToken();
      const updated = await updateProject({ input, projectId: project.id, token });
      setProject(updated);
      return updated;
    })();
    pendingProjectPatchRef.current = promise;
    try {
      return await promise;
    } finally {
      if (pendingProjectPatchRef.current === promise) {
        pendingProjectPatchRef.current = null;
      }
    }
  }

  async function chooseSpecificFolder() {
    if (!project) return;
    setPickingFolder(true);
    setError(null);
    try {
      const token = await getToken();
      const { path } = await pickProjectFolder({ token });
      const updated = await saveProjectPatch({
        customScopePath: path,
        workspaceScope: 'CUSTOM_FOLDER',
      });
      setProject(updated);
      setCustomScopePath(updated?.customScopePath ?? path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not choose folder');
    } finally {
      setPickingFolder(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = value.trim();
    if (!content || !task?.conversationId) return;

    setSubmitting(true);
    setError(null);
    try {
      if (pendingProjectPatchRef.current) {
        await pendingProjectPatchRef.current;
      }
      const token = await getToken();
      const [providerId, ...modelParts] = selectedModelKey.split(':');
      const modelName = modelParts.join(':');
      const { agentRunId } = await sendConversationMessage({
        content,
        conversationId: task.conversationId,
        ...(backend ? { backend } : {}),
        ...(providerId && modelName ? { providerId, modelName } : {}),
        memoryEnabled,
        token,
      });
      setValue('');
      memoryTouchedRef.current = false;
      setMemoryEnabled(defaultMemoryEnabled(project));
      router.push(`/tasks/${agentRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send follow-up');
    } finally {
      setSubmitting(false);
    }
  }

  async function blobToBase64(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index] ?? 0);
    }
    return window.btoa(binary);
  }

  async function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }

  async function startVoiceRecording() {
    if (!voiceSettings?.voiceInputEnabled) {
      setError('Voice input is disabled in Settings → Voice.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not available in this browser.');
      return;
    }
    if (voiceRecording) {
      await stopVoiceRecording();
      return;
    }

    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    voiceChunksRef.current = [];
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) voiceChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      setVoiceRecording(false);
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      void (async () => {
        try {
          const audioBase64 = await blobToBase64(blob);
          const transcript = await transcribeVoice(audioBase64, blob.type || 'audio/webm');
          const parsed = await parseVoiceCommand(transcript.text, task?.id, task?.projectId);
          if (parsed.command.commandType === 'PAUSE_RUN' && onPauseRun) {
            onPauseRun();
          } else if (parsed.command.commandType === 'RESUME_RUN' && onResumeRun) {
            onResumeRun();
          } else if (parsed.command.commandType === 'STATUS_QUERY') {
            setValue('What is the status of this run?');
          } else {
            setValue(transcript.text);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Voice transcription failed');
        }
      })();
    };
    recorder.start();
    setVoiceRecording(true);
  }

  return (
    <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-6 py-[14px]" data-testid="workspace-bottom-composer">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Project scope"
          className="h-8 rounded-pill border border-border-subtle bg-bg-canvas px-3 text-[11.5px] text-text-secondary outline-none"
          disabled={!project || submitting}
          onChange={(event) => {
            if (!project) return;
            const workspaceScope = event.target.value as ProjectSummary['workspaceScope'];
            setProject({ ...project, workspaceScope });
            if (workspaceScope === 'CUSTOM_FOLDER') {
              void chooseSpecificFolder();
            } else {
              void saveProjectPatch({ workspaceScope }).catch((err) =>
                setError(err instanceof Error ? err.message : 'Could not update scope'),
              );
            }
          }}
          value={project?.workspaceScope ?? 'DEFAULT_WORKSPACE'}
        >
          <option value="DEFAULT_WORKSPACE">Default workspace</option>
          <option value="CUSTOM_FOLDER">Specific folder</option>
          <option value="DESKTOP">Desktop</option>
        </select>
        <select
          aria-label="Permission level"
          className={cn(
            "h-8 rounded-pill border border-border-subtle bg-bg-canvas px-3 text-[11.5px] text-text-secondary outline-none",
            project?.permissionMode === 'FULL_ACCESS' && 'border-status-waiting text-status-waiting',
          )}
          disabled={!project || submitting}
          onChange={(event) => {
            if (!project) return;
            const permissionMode = event.target.value as ProjectSummary['permissionMode'];
            setProject({ ...project, permissionMode });
            void saveProjectPatch({ permissionMode }).catch((err) =>
              setError(err instanceof Error ? err.message : 'Could not update permission level'),
            );
          }}
          value={project?.permissionMode ?? 'ASK'}
        >
          <option value="ASK">Ask</option>
          <option value="PLAN">Plan</option>
          <option value="FULL_ACCESS">Full access</option>
        </select>
        <select
          aria-label="Task backend"
          className="h-8 rounded-pill border border-border-subtle bg-bg-canvas px-3 text-[11.5px] text-text-secondary outline-none"
          disabled={submitting}
          onChange={(event) => {
            const nextBackend = event.target.value as NonNullable<TaskDetailResponse['backend']>;
            setBackend(nextBackend);
            void saveProjectPatch({
              defaultBackend: nextBackend === 'local' ? 'LOCAL' : 'E2B',
            }).catch((err) => setError(err instanceof Error ? err.message : 'Could not update backend'));
          }}
          value={backend ?? 'e2b'}
        >
          <option value="e2b">E2B</option>
          <option value="local">Local</option>
        </select>
        <select
          aria-label="Model"
          className="h-8 max-w-[280px] rounded-pill border border-border-subtle bg-bg-canvas px-3 text-[11.5px] text-text-secondary outline-none"
          disabled={submitting || providers.filter((provider) => provider.enabled).length === 0}
          onChange={(event) => {
            const nextKey = event.target.value;
            setSelectedModelKey(nextKey);
            const [providerId, ...modelParts] = nextKey.split(':');
            const modelName = modelParts.join(':');
            if (providerId && modelName) {
              void saveProjectPatch({
                defaultModel: modelName,
                defaultProvider: providerId,
              }).catch((err) => setError(err instanceof Error ? err.message : 'Could not update model'));
            }
          }}
          value={selectedModelKey}
        >
          {providers.filter((provider) => provider.enabled).length === 0 && <option>No configured models</option>}
          {providers.filter((provider) => provider.enabled).map((provider) => (
            <option key={`${provider.id}:${provider.primaryModel}`} value={`${provider.id}:${provider.primaryModel}`}>
              {provider.id} · {provider.primaryModel}
            </option>
          ))}
        </select>
        {project?.workspaceScope === 'CUSTOM_FOLDER' && (
          <>
            <input
              aria-label="Specific folder path"
              className="h-8 min-w-[260px] flex-1 rounded-pill border border-border-subtle bg-bg-canvas px-3 font-mono text-[11.5px] text-text-primary outline-none"
              readOnly
              placeholder="Choose a folder"
              value={customScopePath}
            />
            <button
              className="h-8 rounded-pill border border-border-subtle bg-bg-canvas px-3 text-[11.5px] font-medium text-text-primary hover:bg-bg-subtle"
              disabled={submitting || pickingFolder}
              onClick={() => {
                void chooseSpecificFolder();
              }}
              type="button"
            >
              {pickingFolder ? 'Choosing...' : 'Choose folder'}
            </button>
          </>
        )}
        <button
          aria-label={memoryEnabled ? 'Memory enabled for this message' : 'Memory disabled for this message'}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-[11.5px] font-medium outline-none transition-colors duration-fast",
            memoryEnabled
              ? "border-accent/30 bg-accent/5 text-text-primary"
              : "border-border-subtle bg-bg-canvas text-text-tertiary",
          )}
          disabled={submitting}
          onClick={() => {
            memoryTouchedRef.current = true;
            setMemoryEnabled((current) => !current);
          }}
          title={memoryEnabled ? 'Save & recall memory for this message' : 'Memory disabled for this message'}
          type="button"
        >
          <Brain className="h-3.5 w-3.5" />
          Memory {memoryEnabled ? 'on' : 'off'}
        </button>
      </div>
      <form
        className="flex items-center gap-2.5 rounded-[14px] border border-border-subtle bg-bg-canvas py-1 pl-4 pr-1.5"
        onSubmit={handleSubmit}
      >
        <Sparkles className="h-[13px] w-[13px] shrink-0 text-text-tertiary" />
        <input
          aria-label="Add an instruction"
          className="min-w-0 flex-1 bg-transparent py-2 text-[13px] tracking-[-0.005em] text-text-primary outline-none placeholder:text-text-tertiary"
          disabled={submitting || !task?.conversationId}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask for follow-up changes"
          type="text"
          value={value}
        />
        <IconButton label="Attach file">
          <Paperclip className="h-[13px] w-[13px]" />
        </IconButton>
        <IconButton
          label={voiceRecording ? "Stop voice recording" : "Voice input"}
          onClick={() => {
            void startVoiceRecording().catch((err) => setError(err instanceof Error ? err.message : 'Could not start voice input'));
          }}
          title={voiceRecording ? 'Stop recording' : 'Push to talk'}
        >
          <Mic className={cn("h-[13px] w-[13px]", voiceRecording && "text-accent")} />
        </IconButton>
        {isRunActive ? (
          <button
            aria-label="Pause active run"
            className="flex h-[34px] items-center gap-1.5 rounded-pill border border-border-subtle bg-bg-surface px-3 text-[11.5px] font-medium text-text-secondary transition-colors duration-fast hover:bg-bg-subtle disabled:opacity-60"
            disabled={pausing}
            onClick={onPauseRun}
            type="button"
          >
            <Pause className="h-[13px] w-[13px]" />
            Pause
          </button>
        ) : null}
        {isRunPaused ? (
          <button
            aria-label="Resume paused run"
            className="flex h-[34px] items-center gap-1.5 rounded-pill border border-accent/30 bg-accent/5 px-3 text-[11.5px] font-medium text-text-primary transition-colors duration-fast hover:bg-accent/10 disabled:opacity-60"
            disabled={resuming}
            onClick={onResumeRun}
            type="button"
          >
            <Play className="h-[13px] w-[13px]" />
            Resume
          </button>
        ) : null}
        {isRunActive ? (
          <button
            aria-label="Stop active run"
            className="flex h-[34px] items-center gap-1.5 rounded-pill border border-status-error/30 bg-status-error/5 px-3 text-[11.5px] font-medium text-status-error transition-colors duration-fast hover:bg-status-error/10 disabled:opacity-60"
            disabled={cancelling}
            onClick={onCancelRun}
            type="button"
          >
            <Square className="h-[13px] w-[13px]" />
            Stop
          </button>
        ) : null}
        <button
          aria-label="Send instruction"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-pill bg-bg-inverse text-text-onAccent transition-colors duration-fast hover:bg-text-primary"
          disabled={submitting || !value.trim() || !task?.conversationId}
          type="submit"
        >
          <ArrowUp className="h-[14px] w-[14px]" />
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-status-error">{error}</p>}
    </div>
  );
}
