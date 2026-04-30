import { UserButton } from '@clerk/nextjs';

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end border-b border-border-subtle px-8">
      <UserButton afterSignOutUrl="/sign-in" />
    </header>
  );
}
