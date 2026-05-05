"use client";

import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectSummary } from "@handle/shared";
import { PillButton } from "@/components/design-system";
import { listProjects, pickProjectFolder, updateProject } from "@/lib/api";
import { useHandleAuth } from "@/lib/handleAuth";
import { cn } from "@/lib/utils";

type StatusState = { message: string; tone: "error" | "success" };

export function ProjectDefaultsSettings() {
  const { getToken, isLoaded } = useHandleAuth();
  const [defaultProject, setDefaultProject] = useState<ProjectSummary | null>(null);
  const [draft, setDraft] = useState<Partial<ProjectSummary>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [status, setStatus] = useState<StatusState | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    async function load() {
      const token = await getToken();
      const projects = await listProjects({ token });
      const project = projects.find((item) => item.id === "default-project") ?? projects[0] ?? null;
      if (cancelled) return;
      setDefaultProject(project);
      setDraft(project ?? {});
      setStatus(null);
    }

    load()
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            message: error instanceof Error ? error.message : "Failed to load project defaults",
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
  }, [getToken, isLoaded]);

  async function handleSave() {
    if (!defaultProject) return;
    setSaving(true);
    setStatus(null);
    try {
      const token = await getToken();
      const input: Parameters<typeof updateProject>[0]["input"] = {};
      if (draft.agentExecutionMode) input.agentExecutionMode = draft.agentExecutionMode;
      if (draft.browserMode) input.browserMode = draft.browserMode;
      if (draft.criticEnabled !== undefined) input.criticEnabled = draft.criticEnabled;
      if (draft.criticScope) input.criticScope = draft.criticScope;
      if (draft.customScopePath !== undefined) input.customScopePath = draft.customScopePath;
      if (draft.defaultBackend) input.defaultBackend = draft.defaultBackend;
      if (draft.defaultModel !== undefined) input.defaultModel = draft.defaultModel;
      if (draft.defaultProvider !== undefined) input.defaultProvider = draft.defaultProvider;
      if (draft.name) input.name = draft.name;
      if (draft.permissionMode) input.permissionMode = draft.permissionMode;
      if (draft.maxRuntimeSeconds !== undefined) input.maxRuntimeSeconds = Number(draft.maxRuntimeSeconds);
      if (draft.maxCostCents !== undefined) input.maxCostCents = Number(draft.maxCostCents);
      if (draft.maxToolCalls !== undefined) input.maxToolCalls = Number(draft.maxToolCalls);
      if (draft.maxSupervisorTurns !== undefined) input.maxSupervisorTurns = Number(draft.maxSupervisorTurns);
      if (draft.maxSpecialistSubRuns !== undefined) input.maxSpecialistSubRuns = Number(draft.maxSpecialistSubRuns);
      if (draft.maxParallelSubRuns !== undefined) input.maxParallelSubRuns = Number(draft.maxParallelSubRuns);
      if (draft.maxRevisionLoops !== undefined) input.maxRevisionLoops = Number(draft.maxRevisionLoops);
      if (draft.workspaceScope) input.workspaceScope = draft.workspaceScope;
      const updated = await updateProject({
        input,
        projectId: defaultProject.id,
        token,
      });
      setDefaultProject(updated);
      setDraft(updated);
      setStatus({ message: "Project defaults saved", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to save project defaults",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function chooseFolder() {
    setPickingFolder(true);
    setStatus(null);
    try {
      const token = await getToken();
      const { path } = await pickProjectFolder({ token });
      setDraft((current) => ({
        ...current,
        customScopePath: path,
        workspaceScope: "CUSTOM_FOLDER",
      }));
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to choose folder",
        tone: "error",
      });
    } finally {
      setPickingFolder(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading defaults
      </div>
    );
  }

  if (!defaultProject) {
    return <p className="text-[12.5px] text-text-tertiary">No project is available.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[12px] border border-border-subtle bg-bg-surface p-5">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Default project name</span>
            <input
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              value={draft.name ?? ""}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Workspace scope</span>
            <select
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => {
                const workspaceScope = event.target.value as ProjectSummary["workspaceScope"];
                setDraft((current) => ({ ...current, workspaceScope }));
                if (workspaceScope === "CUSTOM_FOLDER") void chooseFolder();
              }}
              value={draft.workspaceScope ?? "DEFAULT_WORKSPACE"}
            >
              <option value="DEFAULT_WORKSPACE">Default workspace</option>
              <option value="CUSTOM_FOLDER">Specific folder</option>
              <option value="DESKTOP">Desktop</option>
            </select>
          </label>

          {draft.workspaceScope === "CUSTOM_FOLDER" && (
            <div className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">Specific folder path</span>
              <div className="flex gap-2">
                <input
                  aria-label="Specific folder path"
                  className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-canvas px-3 font-mono text-[12px] text-text-primary outline-none"
                  readOnly
                  placeholder="Choose a folder"
                  value={draft.customScopePath ?? ""}
                />
                <PillButton disabled={pickingFolder} onClick={() => void chooseFolder()} type="button" variant="secondary">
                  {pickingFolder ? "Choosing..." : "Choose folder"}
                </PillButton>
              </div>
            </div>
          )}

          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Permission level</span>
            <select
              aria-label="Default project permission level"
              className={cn(
                "h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none",
                draft.permissionMode === "FULL_ACCESS" && "border-status-waiting text-status-waiting",
              )}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  permissionMode: event.target.value as ProjectSummary["permissionMode"],
                }))
              }
              value={draft.permissionMode ?? "ASK"}
            >
              <option value="ASK">Ask before destructive actions</option>
              <option value="PLAN">Plan mode (read-only)</option>
              <option value="FULL_ACCESS">Full access</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Default backend</span>
            <select
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultBackend: event.target.value as ProjectSummary["defaultBackend"],
                }))
              }
              value={draft.defaultBackend ?? "E2B"}
            >
              <option value="E2B">E2B Cloud</option>
              <option value="LOCAL">Local Mac</option>
            </select>
          </label>

          <div className="grid gap-3 rounded-[8px] border border-border-subtle bg-bg-canvas p-3">
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">Agent mode</span>
              <select
                className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    agentExecutionMode: event.target.value as NonNullable<ProjectSummary["agentExecutionMode"]>,
                  }))
                }
                value={draft.agentExecutionMode ?? "AUTO"}
              >
                <option value="AUTO">Auto</option>
                <option value="RESEARCHER">Researcher</option>
                <option value="CODER">Coder</option>
                <option value="DESIGNER">Designer</option>
                <option value="OPERATOR">Operator</option>
                <option value="WRITER">Writer</option>
                <option value="MULTI_AGENT_TEAM">Multi-agent team</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-[12.5px] font-medium text-text-secondary">Enable critic review</span>
                <span className="mt-1 block text-[11.5px] text-text-tertiary">Verifier intervenes for risky or artifact-producing work.</span>
              </span>
              <input
                checked={Boolean(draft.criticEnabled)}
                className="h-4 w-4"
                onChange={(event) => setDraft((current) => ({ ...current, criticEnabled: event.target.checked }))}
                type="checkbox"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">Critic scope</span>
              <select
                className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    criticScope: event.target.value as NonNullable<ProjectSummary["criticScope"]>,
                  }))
                }
                value={draft.criticScope ?? "RISKY_ONLY"}
              >
                <option value="RISKY_ONLY">Risky only</option>
                <option value="WRITES_ONLY">Writes only</option>
                <option value="ALL_DECISIONS">All decisions</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              ["maxRuntimeSeconds", "Runtime seconds", 1800],
              ["maxCostCents", "Cost cents", 200],
              ["maxToolCalls", "Tool calls", 100],
              ["maxSupervisorTurns", "Supervisor turns", 15],
              ["maxSpecialistSubRuns", "Specialist runs", 20],
              ["maxParallelSubRuns", "Parallel runs", 3],
              ["maxRevisionLoops", "Revision loops", 2],
            ] as const).map(([key, label, fallback]) => (
              <label className="grid gap-1.5" key={key}>
                <span className="text-[12.5px] font-medium text-text-secondary">{label}</span>
                <input
                  className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                  min={0}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={Number(draft[key] ?? fallback)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {status ? (
            <span
              className={cn(
                "text-[12px]",
                status.tone === "success" ? "text-status-success" : "text-status-error",
              )}
            >
              {status.message}
            </span>
          ) : (
            <span className="text-[12px] text-text-tertiary">
              New projects inherit these defaults.
            </span>
          )}
          <PillButton
            disabled={saving}
            icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            onClick={handleSave}
            type="button"
          >
            Save
          </PillButton>
        </div>
      </div>
    </div>
  );
}
