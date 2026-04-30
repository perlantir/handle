import { Calendar, Folder, Home, Plug, Settings, Sparkles } from 'lucide-react';
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
  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-border-subtle bg-bg-canvas">
      <div className="flex h-16 items-center px-6">
        <Wordmark />
      </div>
      <nav className="flex flex-1 flex-col gap-1 py-3">
        {primaryNavItems.map((item) => (
          <SidebarNavItem key={item.href} {...item} />
        ))}
      </nav>
      <div className="border-t border-border-subtle py-3">
        <SidebarNavItem href="/settings" icon={Settings} label="Settings" />
      </div>
    </aside>
  );
}
