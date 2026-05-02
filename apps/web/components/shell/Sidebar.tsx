'use client';

import { useEffect, useState } from 'react';
import type { ProjectSummary } from '@handle/shared';
import { Calendar, Folder, Home, Plug, Plus, Settings, Sparkles } from 'lucide-react';
import { createProject, listProjects } from '@/lib/api';
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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

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

  async function handleCreateProject() {
    const token = await getToken();
    const project = await createProject({
      input: { name: 'Untitled Project' },
      token,
    });
    setProjects((current) => [...current, project]);
    window.location.href = `/?projectId=${project.id}`;
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
              onClick={handleCreateProject}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {projects.map((project) => (
              <a
                className={cn(
                  'truncate rounded-[8px] px-3 py-2 text-[12.5px] text-text-secondary transition-colors duration-fast hover:bg-bg-subtle hover:text-text-primary',
                  project.workspaceScope === 'FULL_ACCESS' &&
                    'text-status-waiting',
                )}
                href={`/?projectId=${project.id}`}
                key={project.id}
              >
                {project.name}
              </a>
            ))}
          </div>
        </div>
      </nav>
      <div className="border-t border-border-subtle py-3">
        <SidebarNavItem href="/settings" icon={Settings} label="Settings" />
      </div>
    </aside>
  );
}
