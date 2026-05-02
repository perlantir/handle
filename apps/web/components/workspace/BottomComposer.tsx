'use client';

import { ArrowUp, Mic, Paperclip, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ProjectSummary, TaskDetailResponse } from '@handle/shared';
import { listProjects, sendConversationMessage, updateProject } from '@/lib/api';
import { useHandleAuth } from '@/lib/handleAuth';
import { listSettingsProviders, type SettingsProvider } from '@/lib/settingsProviders';

function IconButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle"
      type="button"
    >
      {children}
    </button>
  );
}

export function BottomComposer({ task }: { task: TaskDetailResponse | null }) {
  const router = useRouter();
  const { getToken } = useHandleAuth();
  const [value, setValue] = useState('');
  const [backend, setBackend] = useState<TaskDetailResponse['backend']>(task?.backend ?? 'e2b');
  const [customScopePath, setCustomScopePath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [providers, setProviders] = useState<SettingsProvider[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState('');

  useEffect(() => {
    setBackend(task?.backend ?? 'e2b');
    setSelectedModelKey(
      task?.providerId && task.providerModel ? `${task.providerId}:${task.providerModel}` : '',
    );
  }, [task?.backend, task?.providerId, task?.providerModel]);

  useEffect(() => {
    let cancelled = false;
    async function loadControls() {
      const token = await getToken();
      const [projects, loadedProviders] = await Promise.all([
        listProjects({ token }),
        listSettingsProviders().catch(() => []),
      ]);
      if (cancelled) return;
      const activeProject = projects.find((item) => item.id === task?.projectId) ?? null;
      setProject(activeProject);
      setCustomScopePath(activeProject?.customScopePath ?? '');
      setProviders(loadedProviders);
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
    const token = await getToken();
    const updated = await updateProject({ input, projectId: project.id, token });
    setProject(updated);
    return updated;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = value.trim();
    if (!content || !task?.conversationId) return;

    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const [providerId, ...modelParts] = selectedModelKey.split(':');
      const modelName = modelParts.join(':');
      const { agentRunId } = await sendConversationMessage({
        content,
        conversationId: task.conversationId,
        ...(backend ? { backend } : {}),
        ...(providerId && modelName ? { providerId, modelName } : {}),
        token,
      });
      setValue('');
      router.push(`/tasks/${agentRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send follow-up');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-6 py-[14px]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Project scope"
          className="h-8 rounded-pill border border-border-subtle bg-bg-canvas px-3 text-[11.5px] text-text-secondary outline-none"
          disabled={!project || submitting}
          onChange={(event) => {
            if (!project) return;
            const workspaceScope = event.target.value as ProjectSummary['workspaceScope'];
            setProject({ ...project, workspaceScope });
            if (workspaceScope !== 'CUSTOM_FOLDER') {
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
              onChange={(event) => setCustomScopePath(event.target.value)}
              placeholder="/Users/perlantir/Projects/handle"
              value={customScopePath}
            />
            <button
              className="h-8 rounded-pill border border-border-subtle bg-bg-canvas px-3 text-[11.5px] font-medium text-text-primary hover:bg-bg-subtle"
              disabled={submitting || !customScopePath.trim()}
              onClick={() => {
                void saveProjectPatch({
                  customScopePath: customScopePath.trim(),
                  workspaceScope: 'CUSTOM_FOLDER',
                }).catch((err) => setError(err instanceof Error ? err.message : 'Could not save folder path'));
              }}
              type="button"
            >
              Save folder
            </button>
          </>
        )}
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
        <IconButton label="Voice input">
          <Mic className="h-[13px] w-[13px]" />
        </IconButton>
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
