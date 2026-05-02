'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ConversationSummary, ProjectSummary } from '@handle/shared';
import { Calendar, Check, Folder, Home, Pencil, Plug, Plus, Settings, Sparkles, X } from 'lucide-react';
import { createProject, listConversations, listProjects, updateProject } from '@/lib/api';
import { Modal, PillButton } from '@/components/design-system';
import { useHandleAuth } from '@/lib/handleAuth';
import { cn } from '@/lib/utils';
import { SidebarNavItem } from './SidebarNavItem';
import { Wordmark } from './Wordmark';

const primaryNavItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/tasks', icon: Folder, label: 'Tasks' },
  { href: '/skills', icon: Sparkles, label: 'Skills' },
  { href: '/schedules', icon: Calendar, label: 'Schedules' },
  { href: '/integrations', icon: Plug, label: 'Integrations' },
];

export function Sidebar() {
  const { getToken, isLoaded } = useHandleAuth();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(() => defaultProjectDraft());
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const activeProjectId = searchParams.get('projectId') ?? projects[0]?.id ?? null;

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    getToken()
      .then((token) => listProjects({ token }))
      .then((loadedProjects) => {
        if (!cancelled) setProjects(loadedProjects);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !activeProjectId) {
      setConversations([]);
      return;
    }
    let cancelled = false;

    getToken()
      .then((token) => listConversations({ projectId: activeProjectId, token }))
      .then((loadedConversations) => {
        if (!cancelled) setConversations(loadedConversations);
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, getToken, isLoaded]);

  async function handleCreateProject() {
    setCreating(true);
    setCreateError(null);
    try {
      const token = await getToken();
      const input: Parameters<typeof createProject>[0]['input'] = {
        browserMode: draft.browserMode,
        defaultBackend: draft.defaultBackend,
        name: draft.name.trim(),
        workspaceScope: draft.workspaceScope,
      };
      if (draft.workspaceScope === 'CUSTOM_FOLDER') {
        input.customScopePath = draft.customScopePath.trim();
      }
      const project = await createProject({ input, token });
      setProjects((current) => [...current, project]);
      setCreateOpen(false);
      setDraft(defaultProjectDraft());
      window.location.href = `/?projectId=${project.id}`;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create project');
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(project: ProjectSummary) {
    const name = renameValue.trim();
    if (!name || name === project.name) {
      setRenamingProjectId(null);
      return;
    }

    const token = await getToken();
    const updated = await updateProject({
      input: { name },
      projectId: project.id,
      token,
    });
    setProjects((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setRenamingProjectId(null);
  }

  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-border-subtle bg-bg-canvas">
      <div className="flex h-16 items-center px-6">
        <Wordmark />
      </div>
      <nav className="flex flex-1 flex-col gap-1 py-3">
        {primaryNavItems.map((item) => (
          <SidebarNavItem key={item.href} {...item} />
        ))}
        <div className="mt-3 border-t border-border-subtle px-3 pt-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              Projects
            </span>
            <button
              aria-label="New project"
              className="flex h-6 w-6 items-center justify-center rounded-pill text-text-tertiary hover:bg-bg-subtle hover:text-text-primary"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {projects.map((project) => (
              <div key={project.id}>
                {renamingProjectId === project.id ? (
                  <form
                    className="flex items-center gap-1 rounded-[8px] bg-bg-subtle px-2 py-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveRename(project);
                    }}
                  >
                    <input
                      aria-label="Project name"
                      autoFocus
                      className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text-primary outline-none"
                      onChange={(event) => setRenameValue(event.target.value)}
                      value={renameValue}
                    />
                    <button aria-label="Save project name" className="text-status-success" type="submit">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="Cancel project rename"
                      className="text-text-tertiary"
                      onClick={() => setRenamingProjectId(null)}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : project.id === activeProjectId ? (
                  <button
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-[8px] bg-bg-subtle px-3 py-2 text-left text-[12.5px] text-text-primary',
                      project.workspaceScope === 'FULL_ACCESS' && 'text-status-waiting',
                    )}
                    onClick={() => {
                      setRenamingProjectId(project.id);
                      setRenameValue(project.name);
                    }}
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ) : (
                  <a
                    className={cn(
                      'block truncate rounded-[8px] px-3 py-2 text-[12.5px] text-text-secondary transition-colors duration-fast hover:bg-bg-subtle hover:text-text-primary',
                      project.workspaceScope === 'FULL_ACCESS' && 'text-status-waiting',
                    )}
                    href={`/?projectId=${project.id}`}
                  >
                    {project.name}
                  </a>
                )}
                {project.id === activeProjectId && conversations.length > 0 && (
                  <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-border-subtle pl-2">
                    {conversations.slice(0, 5).map((conversation) => (
                      <a
                        className="truncate rounded-[6px] px-2 py-1 text-[11.5px] text-text-tertiary hover:bg-bg-subtle hover:text-text-secondary"
                        href={
                          conversation.latestAgentRunId
                            ? `/tasks/${conversation.latestAgentRunId}`
                            : `/?projectId=${project.id}&conversationId=${conversation.id}`
                        }
                        key={conversation.id}
                      >
                        {conversation.title ?? 'New conversation'}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </nav>
      <div className="border-t border-border-subtle py-3">
        <SidebarNavItem href="/settings" icon={Settings} label="Settings" />
      </div>
      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)} title="New project">
          <form
            className="grid gap-4 px-8 pb-8"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateProject();
            }}
          >
            <ProjectDraftFields draft={draft} onChange={setDraft} />
            {createError && <p className="text-[12px] text-status-error">{createError}</p>}
            <div className="flex justify-end gap-2">
              <PillButton onClick={() => setCreateOpen(false)} type="button" variant="ghost">
                Cancel
              </PillButton>
              <PillButton disabled={creating || !canSubmitProjectDraft(draft)} type="submit" variant="primary">
                Create project
              </PillButton>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  );
}

interface ProjectDraft {
  browserMode: ProjectSummary['browserMode'];
  customScopePath: string;
  defaultBackend: ProjectSummary['defaultBackend'];
  name: string;
  workspaceScope: ProjectSummary['workspaceScope'];
}

function defaultProjectDraft(): ProjectDraft {
  return {
    browserMode: 'SEPARATE_PROFILE',
    customScopePath: '',
    defaultBackend: 'E2B',
    name: '',
    workspaceScope: 'DEFAULT_WORKSPACE',
  };
}

function canSubmitProjectDraft(draft: ProjectDraft) {
  if (!draft.name.trim()) return false;
  if (draft.workspaceScope === 'CUSTOM_FOLDER' && !draft.customScopePath.trim()) return false;
  return true;
}

function ProjectDraftFields({
  draft,
  onChange,
}: {
  draft: ProjectDraft;
  onChange: Dispatch<SetStateAction<ProjectDraft>>;
}) {
  return (
    <>
      <label className="grid gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Name</span>
        <input
          aria-label="New project name"
          autoFocus
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          placeholder="My project"
          value={draft.name}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Workspace scope</span>
        <select
          aria-label="New project scope"
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              workspaceScope: event.target.value as ProjectSummary['workspaceScope'],
            }))
          }
          value={draft.workspaceScope}
        >
          <option value="DEFAULT_WORKSPACE">Default workspace</option>
          <option value="CUSTOM_FOLDER">Specific folder</option>
          <option value="DESKTOP">Desktop</option>
          <option value="FULL_ACCESS">Full access</option>
        </select>
      </label>

      {draft.workspaceScope === 'CUSTOM_FOLDER' && (
        <label className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-text-secondary">Folder path</span>
          <input
            aria-label="Specific folder path"
            className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 font-mono text-[12px] text-text-primary outline-none"
            onChange={(event) => onChange((current) => ({ ...current, customScopePath: event.target.value }))}
            placeholder="/Users/perlantir/Projects/handle"
            value={draft.customScopePath}
          />
          <span className="text-[11px] text-text-tertiary">
            Native folder picker arrives with Tauri in Phase 11. For now, enter an existing absolute path.
          </span>
        </label>
      )}

      <label className="grid gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Default backend</span>
        <select
          aria-label="New project backend"
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              defaultBackend: event.target.value as ProjectSummary['defaultBackend'],
            }))
          }
          value={draft.defaultBackend}
        >
          <option value="E2B">E2B Cloud</option>
          <option value="LOCAL">Local Mac</option>
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Browser mode</span>
        <select
          aria-label="New project browser mode"
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              browserMode: event.target.value as ProjectSummary['browserMode'],
            }))
          }
          value={draft.browserMode}
        >
          <option value="SEPARATE_PROFILE">Separate profile</option>
          <option value="ACTUAL_CHROME">Use my actual Chrome</option>
        </select>
      </label>
    </>
  );
}
