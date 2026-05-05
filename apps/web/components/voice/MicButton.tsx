"use client";

import { Mic, Square } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface MicButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  recording: boolean;
}

export function MicButton({ className, disabled, recording, ...props }: MicButtonProps) {
  const Icon = recording ? Square : Mic;

  return (
    <button
      aria-label={recording ? "Stop voice recording" : "Voice input"}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle disabled:opacity-50",
        recording && "border-accent/30 bg-accent/5 text-accent",
        className,
      )}
      disabled={disabled}
      title={recording ? "Stop recording" : "Push to talk"}
      type="button"
      {...props}
    >
      <Icon className="h-[13px] w-[13px]" />
    </button>
  );
}
