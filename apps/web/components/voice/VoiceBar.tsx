"use client";

import { Loader2, Mic, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

type VoiceBarTone = "error" | "info" | "success";

interface VoiceBarProps {
  message: string;
  recording?: boolean;
  speaking?: boolean;
  tone?: VoiceBarTone;
}

export function VoiceBar({ message, recording = false, speaking = false, tone = "info" }: VoiceBarProps) {
  const Icon = recording ? Loader2 : speaking ? Volume2 : Mic;

  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px]",
        tone === "error" && "border-status-error/20 bg-status-error/5 text-status-error",
        tone === "info" && "border-border-subtle bg-bg-canvas text-text-secondary",
        tone === "success" && "border-status-success/20 bg-status-success/5 text-status-success",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", recording && "animate-spin")} />
      <span className="min-w-0 flex-1 truncate">{message}</span>
    </div>
  );
}
