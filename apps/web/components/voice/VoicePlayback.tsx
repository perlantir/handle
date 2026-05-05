"use client";

import { Volume2, VolumeX } from "lucide-react";
import { PillButton } from "@/components/design-system";

interface VoicePlaybackProps {
  disabled?: boolean;
  onReadAloud: () => void;
  onStop: () => void;
  speaking: boolean;
}

export function VoicePlayback({ disabled = false, onReadAloud, onStop, speaking }: VoicePlaybackProps) {
  return (
    <div className="flex items-center gap-2">
      <PillButton
        disabled={disabled}
        icon={speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        onClick={speaking ? onStop : onReadAloud}
        size="sm"
        type="button"
        variant="secondary"
      >
        {speaking ? "Stop speaking" : "Read aloud"}
      </PillButton>
    </div>
  );
}
