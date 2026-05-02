"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ShieldAlert } from "lucide-react";
import type { ProjectSummary } from "@handle/shared";
import { Composer } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import {
  createConversation,
  listProjects,
  sendConversationMessage,
  updateProject,
} from "@/lib/api";
import {
  getExecutionSettings,
  type ExecutionBackend,
} from "@/lib/settingsExecution";
import { listSettingsProviders, type SettingsProvider } from "@/lib/settingsProviders";
import { cn } from "@/lib/utils";

interface HomeComposerProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function HomeComposer({ onValueChange, value }: HomeComposerProps) {
  const { getToken } = useHandleAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [backend, setBackend] = useState<ExecutionBackend>("e2b");
  const [error, setError] = useState<string | null>(null);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [providers, setProviders] = useState<SettingsProvider[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeProject =
    projects.find((project) => project.id === searchParams.get("projectId")) ??
    projects[0] ??
    null;
  const enabledProviders = providers.filter((provider) => provider.enabled);
  const selectedProvider =
    enabledProviders.find(
      (provider) => `${provider.id}:${provider.primaryModel}` === selectedModelKey,
    ) ?? enabledProviders[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadComposerContext() {
      const token = await getToken();
      const [settings, loadedProjects, loadedProviders] = await Promise.all([
        getExecutionSettings(),
        listProjects({ token }),
        listSettingsProviders().catch(() => []),
      ]);

      if (cancelled) return;
      setBackend(settings.defaultBackend);
      setProjects(loadedProjects);
      setProviders(loadedProviders);
      const firstEnabled = loadedProviders.find((provider) => provider.enabled);
      if (firstEnabled) {
        setSelectedModelKey(`${firstEnabled.id}:${firstEnabled.primaryModel}`);
      }
    }

    loadComposerContext()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load projects");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBackend(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(goal: string) {
    if (!activeProject) {
      setError("No project is available.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const conversation = await createConversation({
        projectId: activeProject.id,
        title: goal.slice(0, 80),
        token,
      });
      const { agentRunId } = await sendConversationMessage({
        backend,
        content: goal,
        conversationId: conversation.id,
        ...(selectedProvider
          ? {
              modelName: selectedProvider.primaryModel,
              providerId: selectedProvider.id,
            }
          : {}),
        token,
      });
      router.push(`/tasks/${agentRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-[720px]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            aria-label="Project scope"
            className={cn(
              "h-8 rounded-pill border border-border-subtle bg-bg-surface px-3 text-[11.5px] font-medium text-text-secondary outline-none",
              activeProject?.workspaceScope === "FULL_ACCESS" &&
                "border-status-waiting bg-status-waiting/10 text-status-waiting",
            )}
            disabled={!activeProject || submitting}
            onChange={async (event) => {
              if (!activeProject) return;
              const workspaceScope = event.target.value as ProjectSummary["workspaceScope"];
              const token = await getToken();
              const updated = await updateProject({
                input: { workspaceScope },
                projectId: activeProject.id,
                token,
              });
              setProjects((current) =>
                current.map((project) =>
                  project.id === updated.id ? updated : project,
                ),
              );
            }}
            value={activeProject?.workspaceScope ?? "DEFAULT_WORKSPACE"}
          >
            <option value="DEFAULT_WORKSPACE">Default workspace</option>
            <option value="CUSTOM_FOLDER">Custom folder</option>
            <option value="FULL_ACCESS">Full access</option>
          </select>
          {activeProject?.workspaceScope === "FULL_ACCESS" && (
            <span className="inline-flex items-center gap-1 rounded-pill border border-status-waiting bg-status-waiting/10 px-2.5 py-1 text-[11px] font-medium text-status-waiting">
              <ShieldAlert className="h-3 w-3" />
              Full access
            </span>
          )}
        </div>
        <div
          aria-label="Task backend"
          className="inline-flex rounded-pill border border-border-subtle bg-bg-surface p-0.5"
          role="group"
        >
          {[
            { label: "E2B", value: "e2b" },
            { label: "Local", value: "local" },
          ].map((option) => {
            const active = backend === option.value;

            return (
              <button
                className={cn(
                  "rounded-pill px-3 py-1 text-[11.5px] transition-colors duration-fast",
                  active
                    ? "bg-bg-inverse text-text-onAccent"
                    : "text-text-secondary hover:bg-bg-subtle",
                )}
                disabled={loadingBackend || submitting}
                key={option.value}
                onClick={() => setBackend(option.value as ExecutionBackend)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <Composer
        disabled={submitting}
        onSubmit={handleSubmit}
        onValueChange={onValueChange}
        placeholder="What would you like to do?"
        submitDisabled={!value.trim()}
        value={value}
      />
      <div className="mt-2 flex justify-end">
        <label className="inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-bg-surface px-3 py-1.5 text-[11.5px] text-text-secondary">
          <span>Model</span>
          <select
            aria-label="Model"
            className="max-w-[240px] bg-transparent text-text-primary outline-none"
            disabled={submitting || enabledProviders.length === 0}
            onChange={(event) => setSelectedModelKey(event.target.value)}
            value={selectedModelKey}
          >
            {enabledProviders.length === 0 && <option>No configured models</option>}
            {enabledProviders.map((provider) => (
              <option
                key={`${provider.id}:${provider.primaryModel}`}
                value={`${provider.id}:${provider.primaryModel}`}
              >
                {provider.id} · {provider.primaryModel}
              </option>
            ))}
          </select>
          <ChevronDown className="h-3 w-3 text-text-tertiary" />
        </label>
      </div>
      {error && (
        <p className="mt-3 text-center text-[12px] text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}
