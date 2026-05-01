"use client";

import { useHandleUser } from "@/lib/handleAuth";

export function HomeHero() {
  const { user } = useHandleUser();
  const name = user?.firstName ?? user?.fullName ?? user?.username ?? "there";

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-subtle">
        <span className="font-display text-[28px] font-semibold leading-none text-bg-inverse">
          h
        </span>
      </div>
      <div className="text-center">
        <h1 className="font-display text-[30px] font-medium text-text-primary">
          Good morning, {name}.
        </h1>
        <p className="mt-2.5 text-[15px] text-text-tertiary">
          What should we get done today?
        </p>
      </div>
    </div>
  );
}
