'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface SidebarNavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
}

export function SidebarNavItem({ href, icon: Icon, label }: SidebarNavItemProps) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'mx-[10px] flex h-[34px] items-center gap-3 rounded-lg px-[14px] text-[13px] transition-colors duration-fast',
        active
          ? 'bg-[rgba(20,22,26,0.05)] font-medium text-text-primary'
          : 'font-normal text-text-secondary hover:bg-bg-subtle',
      )}
    >
      <Icon className={cn('h-4 w-4', active ? 'text-text-primary' : 'text-text-tertiary')} strokeWidth={1.8} />
      <span>{label}</span>
    </Link>
  );
}
