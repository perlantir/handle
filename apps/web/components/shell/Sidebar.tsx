'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ConversationSummary, ProjectSummary } from '@handle/shared';
import { Brain, Calendar, Check, Folder, History, Home, MoreHorizontal, Pencil, Plug, Plus, Settings, Sparkles, Trash2, X } from 'lucide-react';
import {
  createProject,
  deleteConversation,
  deleteProject,
  listConversations,
  listProjects,
  pickProjectFolder,
  updateConversation,
  updateProject,
} from '@/lib/api';
import { Modal, PillButton } from '@/components/design-system';
import { useHandleAuth } from '@/lib/handleAuth';
import { listSettingsProviders, type SettingsProvider } from '@/lib/settingsProviders';
import { cn } from '@/lib/utils';
import { SidebarNavItem } from './SidebarNavItem';
import { Wordmark } from './Wordmark';

const primaryNavItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/tasks', icon: Folder, label: 'Tasks' },
  { href: '/memory', icon: Brain, label: 'Memory' },
  { href: '/actions', icon: History, label: 'Actions' },
  { href: '/skills', icon: Sparkles, label: 'Skills' },
  { href: '/schedules', icon: Calendar, label: 'Schedules' },
  { href: '/integrations', icon: Plug, label: 'Integrations' },
];

export function Sidebar() {
  const { getToken, isLoaded } = useHandleAuth();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [conversationsByProject, setConversationsByProject] = useState<Record<string, ConversationSummary[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(() => defaultProjectDraft());
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [openMenu, setOpenMenu] = useState<{ id: string; type: 'conversation' | 'project' } | null>(null);
  const [providers, setProviders] = useState<SettingsProvider[]>([]);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [conversationRenameValue, setConversationRenameValue] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const activeProjectId = searchParams.get('projectId') ?? projects[0]?.id ?? null;

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    getToken()
      .then(async (token) => {
        const [loadedProjects, loadedProviders] = await Promise.all([
          listProjects({ token }),
          listSettingsProviders().catch(() => []),
        ]);
        const conversations = await Promise.all(
          loadedProjects.map(async (project) => [
            project.id,
            await listConversations({ projectId: project.id, token }).catch(() => []),
          ] as const),
        );
        return { conversations: Object.fromEntries(conversations), loadedProjects, loadedProviders };
      })
      .then(({ conversations, loadedProjects, loadedProviders }) => {
        if (!cancelled) {
          setProjects(loadedProjects);
          setConversationsByProject(conversations);
          setProviders(loadedProviders);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setConversationsByProject({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  async function handleCreateProject() {
    setCreating(true);
    setCreateError(null);
    try {
      const token = await getToken();
      const input: Parameters<typeof createProject>[0]['input'] = {
        browserMode: draft.browserMode,
        defaultBackend: draft.defaultBackend,
        memoryScope: draft.memoryScope,
        name: draft.name.trim(),
        permissionMode: draft.permissionMode,
        workspaceScope: draft.workspaceScope,
      };
      if (draft.defaultProvider && draft.defaultModel) {
        input.defaultProvider = draft.defaultProvider;
        input.defaultModel = draft.defaultModel;
      }
      if (draft.workspaceScope === 'CUSTOM_FOLDER') {
        input.customScopePath = draft.customScopePath.trim();
      }
      const project = await createProject({ input, token });
      setProjects((current) => [...current, project]);
      setConversationsByProject((current) => ({ ...current, [project.id]: [] }));
      setCreateOpen(false);
      setDraft(defaultProjectDraft());
      window.location.href = `/?projectId=${project.id}`;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create project');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveProjectEdit() {
    if (!editingProject) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = await getToken();
      const input: Parameters<typeof updateProject>[0]['input'] = {
        browserMode: draft.browserMode,
        defaultBackend: draft.defaultBackend,
        defaultModel: draft.defaultModel || null,
        defaultProvider: draft.defaultProvider || null,
        memoryScope: draft.memoryScope,
        name: draft.name.trim(),
        permissionMode: draft.permissionMode,
        workspaceScope: draft.workspaceScope,
      };
      if (draft.workspaceScope === 'CUSTOM_FOLDER') {
        input.customScopePath = draft.customScopePath.trim();
      }
      const updated = await updateProject({ input, projectId: editingProject.id, token });
      setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingProject(null);
      setDraft(defaultProjectDraft());
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not save project');
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

  async function saveConversationRename(conversation: ConversationSummary) {
    const title = conversationRenameValue.trim();
    if (!title || title === conversation.title) {
      setRenamingConversationId(null);
      return;
    }

    const token = await getToken();
    const updated = await updateConversation({
      conversationId: conversation.id,
      title,
      token,
    });
    setConversationsByProject((current) => ({
      ...current,
      [conversation.projectId]: (current[conversation.projectId] ?? []).map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item,
      ),
    }));
    setRenamingConversationId(null);
  }

  async function removeProject(project: ProjectSummary) {
    if (!window.confirm(`Delete project "${project.name}" and all of its chats?`)) return;
    const token = await getToken();
    await deleteProject({ projectId: project.id, token });
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setConversationsByProject((current) => {
      const next = { ...current };
      delete next[project.id];
      return next;
    });
    setOpenMenu(null);
    if (project.id === activeProjectId) {
      const nextProject = projects.find((item) => item.id !== project.id);
      window.location.href = nextProject ? `/?projectId=${nextProject.id}` : '/';
    }
  }

  async function removeConversation(conversation: ConversationSummary) {
    const title = conversation.title ?? 'New conversation';
    if (!window.confirm(`Delete chat "${title}"?`)) return;
    const token = await getToken();
    await deleteConversation({ conversationId: conversation.id, token });
    setConversationsByProject((current) => ({
      ...current,
      [conversation.projectId]: (current[conversation.projectId] ?? []).filter((item) => item.id !== conversation.id),
    }));
    setOpenMenu(null);
  }

  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-border-subtle bg-bg-canvas">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Wordmark />
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden py-3">
        <div className="shrink-0">
          {primaryNavItems.map((item) => (
            <SidebarNavItem key={item.href} {...item} />
          ))}
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-border-subtle px-3 pt-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              Projects
            </span>
            <button
              aria-label="New project"
              className="flex h-6 w-6 items-center justify-center rounded-pill text-text-tertiary hover:bg-bg-subtle hover:text-text-primary"
              onClick={() => {
                setDraft(defaultProjectDraft());
                setCreateOpen(true);
              }}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1">
            {projects.map((project) => {
              const projectConversations = conversationsByProject[project.id] ?? [];
              return (
              <div key={project.id} className="relative">
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
                ) : (
                  <div className="group flex items-center gap-1">
                    <a
                      className={cn(
                        'min-w-0 flex-1 truncate rounded-[8px] px-3 py-2 text-[12.5px] transition-colors duration-fast hover:bg-bg-subtle hover:text-text-primary',
                        project.id === activeProjectId ? 'bg-bg-subtle text-text-primary' : 'text-text-secondary',
                        project.permissionMode === 'FULL_ACCESS' && 'text-status-waiting',
                      )}
                      href={`/?projectId=${project.id}`}
                    >
                      {project.name}
                    </a>
                    <button
                      aria-label={`Project actions for ${project.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-pill text-text-tertiary opacity-70 hover:bg-bg-subtle hover:text-text-primary group-hover:opacity-100"
                      onClick={() =>
                        setOpenMenu((current) =>
                          current?.type === 'project' && current.id === project.id
                            ? null
                            : { id: project.id, type: 'project' },
                        )
                      }
                      type="button"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {openMenu?.type === 'project' && openMenu.id === project.id && (
                      <div className="absolute right-1 top-8 z-20 grid min-w-[132px] gap-1 rounded-[8px] border border-border-subtle bg-bg-surface p-1 shadow-lg">
                        <button
                          className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11.5px] text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
                          onClick={() => {
                            setOpenMenu(null);
                            setEditingProject(project);
                            setDraft(draftFromProject(project));
                          }}
                          type="button"
                        >
                          <Settings className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11.5px] text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
                          onClick={() => {
                            setOpenMenu(null);
                            setRenamingProjectId(project.id);
                            setRenameValue(project.name);
                          }}
                          type="button"
                        >
                          <Pencil className="h-3 w-3" />
                          Rename
                        </button>
                        <button
                          className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11.5px] text-status-error hover:bg-bg-subtle"
                          onClick={() => void removeProject(project)}
                          type="button"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {projectConversations.length > 0 && (
                  <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-border-subtle pl-2">
                    {projectConversations.map((conversation) => (
                      <div className="group/conversation relative flex items-center gap-1" key={conversation.id}>
                        {renamingConversationId === conversation.id ? (
                          <form
                            className="flex min-w-0 flex-1 items-center gap-1 rounded-[6px] bg-bg-subtle px-2 py-1"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveConversationRename(conversation);
                            }}
                          >
                            <input
                              aria-label="Chat title"
                              autoFocus
                              className="min-w-0 flex-1 bg-transparent text-[11.5px] text-text-primary outline-none"
                              onChange={(event) => setConversationRenameValue(event.target.value)}
                              value={conversationRenameValue}
                            />
                            <button aria-label="Save chat title" className="text-status-success" type="submit">
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              aria-label="Cancel chat rename"
                              className="text-text-tertiary"
                              onClick={() => setRenamingConversationId(null)}
                              type="button"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <a
                              className="min-w-0 flex-1 truncate rounded-[6px] px-2 py-1 text-[11.5px] text-text-tertiary hover:bg-bg-subtle hover:text-text-secondary"
                              href={
                                conversation.latestAgentRunId
                                  ? `/tasks/${conversation.latestAgentRunId}`
                                  : `/?projectId=${project.id}&conversationId=${conversation.id}`
                              }
                            >
                              {conversation.title ?? 'New conversation'}
                            </a>
                            <button
                              aria-label={`Chat actions for ${conversation.title ?? 'New conversation'}`}
                              className="flex h-6 w-6 items-center justify-center rounded-pill text-text-tertiary opacity-0 hover:bg-bg-subtle hover:text-text-primary group-hover/conversation:opacity-100"
                              onClick={() =>
                                setOpenMenu((current) =>
                                  current?.type === 'conversation' && current.id === conversation.id
                                    ? null
                                    : { id: conversation.id, type: 'conversation' },
                                )
                              }
                              type="button"
                            >
                              <MoreHorizontal className="h-3 w-3" />
                            </button>
                            {openMenu?.type === 'conversation' && openMenu.id === conversation.id && (
                              <div className="absolute right-0 top-6 z-20 grid min-w-[124px] gap-1 rounded-[8px] border border-border-subtle bg-bg-surface p-1 shadow-lg">
                                <button
                                  className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11.5px] text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setRenamingConversationId(conversation.id);
                                    setConversationRenameValue(conversation.title ?? 'New conversation');
                                  }}
                                  type="button"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Rename
                                </button>
                                <button
                                  className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11.5px] text-status-error hover:bg-bg-subtle"
                                  onClick={() => void removeConversation(conversation)}
                                  type="button"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
          </div>
        </div>
      </nav>
      <div className="shrink-0 border-t border-border-subtle py-3">
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
            <ProjectDraftFields draft={draft} onChange={setDraft} providers={providers} />
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
      {editingProject && (
        <Modal onClose={() => setEditingProject(null)} title="Edit project">
          <form
            className="grid gap-4 px-8 pb-8"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveProjectEdit();
            }}
          >
            <ProjectDraftFields draft={draft} onChange={setDraft} providers={providers} />
            {createError && <p className="text-[12px] text-status-error">{createError}</p>}
            <div className="flex justify-end gap-2">
              <PillButton onClick={() => setEditingProject(null)} type="button" variant="ghost">
                Cancel
              </PillButton>
              <PillButton disabled={creating || !canSubmitProjectDraft(draft)} type="submit" variant="primary">
                Save project
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
  defaultModel: string;
  defaultProvider: string;
  memoryScope: ProjectSummary['memoryScope'];
  name: string;
  permissionMode: ProjectSummary['permissionMode'];
  workspaceScope: ProjectSummary['workspaceScope'];
}

function defaultProjectDraft(): ProjectDraft {
  return {
    browserMode: 'SEPARATE_PROFILE',
    customScopePath: '',
    defaultBackend: 'E2B',
    defaultModel: '',
    defaultProvider: '',
    memoryScope: 'GLOBAL_AND_PROJECT',
    name: '',
    permissionMode: 'ASK',
    workspaceScope: 'DEFAULT_WORKSPACE',
  };
}

function draftFromProject(project: ProjectSummary): ProjectDraft {
  return {
    browserMode: project.browserMode,
    customScopePath: project.customScopePath ?? '',
    defaultBackend: project.defaultBackend,
    defaultModel: project.defaultModel ?? '',
    defaultProvider: project.defaultProvider ?? '',
    memoryScope: project.memoryScope,
    name: project.name,
    permissionMode: project.permissionMode,
    workspaceScope: project.workspaceScope,
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
  providers,
}: {
  draft: ProjectDraft;
  onChange: Dispatch<SetStateAction<ProjectDraft>>;
  providers: SettingsProvider[];
}) {
  const { getToken } = useHandleAuth();
  const [folderError, setFolderError] = useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = useState(false);

  async function chooseFolder() {
    setPickingFolder(true);
    setFolderError(null);
    try {
      const token = await getToken();
      const { path } = await pickProjectFolder({ token });
      onChange((current) => ({
        ...current,
        customScopePath: path,
        workspaceScope: 'CUSTOM_FOLDER',
      }));
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Could not choose folder');
    } finally {
      setPickingFolder(false);
    }
  }

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
          onChange={(event) => {
            const workspaceScope = event.target.value as ProjectSummary['workspaceScope'];
            onChange((current) => ({ ...current, workspaceScope }));
            if (workspaceScope === 'CUSTOM_FOLDER') void chooseFolder();
          }}
          value={draft.workspaceScope}
        >
          <option value="DEFAULT_WORKSPACE">Default workspace</option>
          <option value="CUSTOM_FOLDER">Specific folder</option>
          <option value="DESKTOP">Desktop</option>
        </select>
      </label>

      {draft.workspaceScope === 'CUSTOM_FOLDER' && (
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-text-secondary">Folder path</span>
          <div className="flex gap-2">
            <input
              aria-label="Specific folder path"
              className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-canvas px-3 font-mono text-[12px] text-text-primary outline-none"
              readOnly
              placeholder="Choose a folder"
              value={draft.customScopePath}
            />
            <PillButton disabled={pickingFolder} onClick={() => void chooseFolder()} type="button" variant="secondary">
              {pickingFolder ? 'Choosing...' : 'Choose folder'}
            </PillButton>
          </div>
          {folderError && <span className="text-[11px] text-status-error">{folderError}</span>}
        </div>
      )}

      <label className="grid gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Permission level</span>
        <select
          aria-label="New project permission level"
          className={cn(
            "h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none",
            draft.permissionMode === 'FULL_ACCESS' && 'border-status-waiting text-status-waiting',
          )}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              permissionMode: event.target.value as ProjectSummary['permissionMode'],
            }))
          }
          value={draft.permissionMode}
        >
          <option value="ASK">Ask before destructive actions</option>
          <option value="PLAN">Plan mode (read-only)</option>
          <option value="FULL_ACCESS">Full access</option>
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Memory scope</span>
        <select
          aria-label="Project memory scope"
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              memoryScope: event.target.value as ProjectSummary['memoryScope'],
            }))
          }
          value={draft.memoryScope}
        >
          <option value="GLOBAL_AND_PROJECT">Global + project</option>
          <option value="PROJECT_ONLY">Project only</option>
          <option value="NONE">Memory off</option>
        </select>
      </label>

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
        <span className="text-[12.5px] font-medium text-text-secondary">Default model</span>
        <select
          aria-label="Project default model"
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          onChange={(event) => {
            const [providerId, ...modelParts] = event.target.value.split(':');
            const modelName = modelParts.join(':');
            onChange((current) => ({
              ...current,
              defaultModel: modelName,
              defaultProvider: providerId ?? '',
            }));
          }}
          value={draft.defaultProvider && draft.defaultModel ? `${draft.defaultProvider}:${draft.defaultModel}` : ''}
        >
          <option value="">Use Settings default</option>
          {providers.filter((provider) => provider.enabled).map((provider) => (
            <option key={`${provider.id}:${provider.primaryModel}`} value={`${provider.id}:${provider.primaryModel}`}>
              {provider.id} · {provider.primaryModel}
            </option>
          ))}
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
