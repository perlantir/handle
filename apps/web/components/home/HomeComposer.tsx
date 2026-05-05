"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brain, ChevronDown, ShieldAlert } from "lucide-react";
import type { ProjectSummary } from "@handle/shared";
import { Composer } from "@/components/design-system";
import { SpecialistPicker } from "@/components/multiAgent/SpecialistPicker";
import { useHandleAuth } from "@/lib/handleAuth";
import {
  createConversation,
  listProjects,
  pickProjectFolder,
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

function defaultMemoryEnabled(project: ProjectSummary | null) {
  return project?.memoryScope !== "NONE";
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
  const [customScopePath, setCustomScopePath] = useState("");
  const [pickingFolder, setPickingFolder] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [agentExecutionMode, setAgentExecutionMode] =
    useState<ProjectSummary["agentExecutionMode"]>("AUTO");
  const [submitting, setSubmitting] = useState(false);
  const memoryTouchedRef = useRef(false);
  const pendingProjectPatchRef = useRef<Promise<ProjectSummary | null> | null>(null);
  const previousProjectIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    const projectId = activeProject?.id ?? null;
    if (previousProjectIdRef.current !== projectId) {
      memoryTouchedRef.current = false;
      previousProjectIdRef.current = projectId;
    }
    setCustomScopePath(activeProject?.customScopePath ?? "");
    if (activeProject?.defaultBackend) {
      setBackend(activeProject.defaultBackend === "LOCAL" ? "local" : "e2b");
    }
    if (!memoryTouchedRef.current) {
      setMemoryEnabled(defaultMemoryEnabled(activeProject));
    }
    setAgentExecutionMode(activeProject?.agentExecutionMode ?? "AUTO");
  }, [
    activeProject?.agentExecutionMode,
    activeProject?.customScopePath,
    activeProject?.defaultBackend,
    activeProject?.id,
    activeProject?.memoryScope,
  ]);

  useEffect(() => {
    const enabled = providers.filter((provider) => provider.enabled);
    const projectProvider =
      enabled.find((provider) => provider.id === activeProject?.defaultProvider) ??
      enabled[0] ??
      null;
    if (!projectProvider) {
      setSelectedModelKey("");
      return;
    }
    setSelectedModelKey(`${projectProvider.id}:${activeProject?.defaultModel ?? projectProvider.primaryModel}`);
  }, [activeProject?.defaultModel, activeProject?.defaultProvider, activeProject?.id, providers]);

  function updateProjectState(project: ProjectSummary) {
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? project : item)),
    );
  }

  async function saveProjectPatch(input: Parameters<typeof updateProject>[0]["input"]) {
    if (!activeProject) return null;
    const promise = (async () => {
      const token = await getToken();
      const updated = await updateProject({
        input,
        projectId: activeProject.id,
        token,
      });
      updateProjectState(updated);
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

  async function chooseSpecificFolder(project = activeProject) {
    if (!project) return;
    setPickingFolder(true);
    setError(null);
    try {
      if (pendingProjectPatchRef.current) {
        await pendingProjectPatchRef.current;
      }
      const token = await getToken();
      const { path } = await pickProjectFolder({ token });
      const updated = await updateProject({
        input: {
          customScopePath: path,
          workspaceScope: "CUSTOM_FOLDER",
        },
        projectId: project.id,
        token,
      });
      updateProjectState(updated);
      setCustomScopePath(updated.customScopePath ?? path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not choose folder");
    } finally {
      setPickingFolder(false);
    }
  }

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
        agentExecutionMode,
        backend,
        content: goal,
        conversationId: conversation.id,
        memoryEnabled,
        ...(selectedProvider
          ? {
              modelName: selectedProvider.primaryModel,
              providerId: selectedProvider.id,
            }
          : {}),
        token,
      });
      memoryTouchedRef.current = false;
      setMemoryEnabled(defaultMemoryEnabled(activeProject));
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
              activeProject?.permissionMode === "FULL_ACCESS" &&
                "border-status-waiting bg-status-waiting/10 text-status-waiting",
            )}
            disabled={!activeProject || submitting}
            onChange={async (event) => {
              if (!activeProject) return;
              const workspaceScope = event.target.value as ProjectSummary["workspaceScope"];
              setError(null);
              if (workspaceScope === "CUSTOM_FOLDER") {
                updateProjectState({ ...activeProject, workspaceScope });
                void chooseSpecificFolder(activeProject);
                return;
              }
              try {
                await saveProjectPatch({ workspaceScope });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not update project scope");
              }
            }}
            value={activeProject?.workspaceScope ?? "DEFAULT_WORKSPACE"}
          >
            <option value="DEFAULT_WORKSPACE">Default workspace</option>
            <option value="CUSTOM_FOLDER">Specific folder</option>
            <option value="DESKTOP">Desktop</option>
          </select>
          <select
            aria-label="Permission level"
            className={cn(
              "h-8 rounded-pill border border-border-subtle bg-bg-surface px-3 text-[11.5px] font-medium text-text-secondary outline-none",
              activeProject?.permissionMode === "FULL_ACCESS" &&
                "border-status-waiting bg-status-waiting/10 text-status-waiting",
            )}
            disabled={!activeProject || submitting}
            onChange={(event) => {
              const permissionMode = event.target.value as ProjectSummary["permissionMode"];
              if (activeProject) updateProjectState({ ...activeProject, permissionMode });
              void saveProjectPatch({ permissionMode }).catch((err) => {
                setError(err instanceof Error ? err.message : "Could not update permission level");
              });
            }}
            value={activeProject?.permissionMode ?? "ASK"}
          >
            <option value="ASK">Ask</option>
            <option value="PLAN">Plan</option>
            <option value="FULL_ACCESS">Full access</option>
          </select>
          {activeProject?.permissionMode === "FULL_ACCESS" && (
            <span className="inline-flex items-center gap-1 rounded-pill border border-status-waiting bg-status-waiting/10 px-2.5 py-1 text-[11px] font-medium text-status-waiting">
              <ShieldAlert className="h-3 w-3" />
              Full access
            </span>
          )}
          <SpecialistPicker
            disabled={!activeProject || submitting}
            onChange={(nextMode) => {
              setAgentExecutionMode(nextMode);
              if (activeProject) updateProjectState({ ...activeProject, agentExecutionMode: nextMode });
              void saveProjectPatch({ agentExecutionMode: nextMode }).catch((err) => {
                setError(err instanceof Error ? err.message : "Could not update agent mode");
              });
            }}
            value={agentExecutionMode ?? "AUTO"}
          />
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
                onClick={() => {
                  const nextBackend = option.value as ExecutionBackend;
                  setBackend(nextBackend);
                  void saveProjectPatch({
                    defaultBackend: nextBackend === "local" ? "LOCAL" : "E2B",
                  }).catch((err) => {
                    setError(err instanceof Error ? err.message : "Could not update backend");
                  });
                }}
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
      {activeProject?.workspaceScope === "CUSTOM_FOLDER" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            aria-label="Specific folder path"
            className="h-8 min-w-[320px] flex-1 rounded-pill border border-border-subtle bg-bg-surface px-3 font-mono text-[11.5px] text-text-primary outline-none"
            readOnly
            placeholder="Choose a folder"
            value={customScopePath}
          />
          <button
            className="h-8 rounded-pill border border-border-subtle bg-bg-surface px-3 text-[11.5px] font-medium text-text-primary hover:bg-bg-subtle"
            disabled={submitting || pickingFolder}
            onClick={() => {
              void chooseSpecificFolder();
            }}
            type="button"
          >
            {pickingFolder ? "Choosing..." : "Choose folder"}
          </button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          aria-label={memoryEnabled ? "Memory enabled for this message" : "Memory disabled for this message"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-[11.5px] font-medium outline-none transition-colors duration-fast",
            memoryEnabled
              ? "border-accent/30 bg-accent/5 text-text-primary"
              : "border-border-subtle bg-bg-surface text-text-tertiary",
          )}
          disabled={submitting}
          onClick={() => {
            memoryTouchedRef.current = true;
            setMemoryEnabled((current) => !current);
          }}
          title={memoryEnabled ? "Save & recall memory for this message" : "Memory disabled for this message"}
          type="button"
        >
          <Brain className="h-3.5 w-3.5" />
          Memory {memoryEnabled ? "on" : "off"}
        </button>
        <label className="inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-bg-surface px-3 py-1.5 text-[11.5px] text-text-secondary">
          <span>Model</span>
          <select
            aria-label="Model"
            className="max-w-[240px] bg-transparent text-text-primary outline-none"
            disabled={submitting || enabledProviders.length === 0}
            onChange={(event) => {
              const nextKey = event.target.value;
              setSelectedModelKey(nextKey);
              const [providerId, ...modelParts] = nextKey.split(":");
              const modelName = modelParts.join(":");
              if (providerId && modelName) {
                void saveProjectPatch({
                  defaultModel: modelName,
                  defaultProvider: providerId,
                }).catch((err) => {
                  setError(err instanceof Error ? err.message : "Could not update model");
                });
              }
            }}
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
