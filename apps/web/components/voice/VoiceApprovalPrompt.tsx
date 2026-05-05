"use client";

import { Mic } from "lucide-react";
import { PillButton } from "@/components/design-system";
import { cn } from "@/lib/utils";

interface VoiceApprovalPromptProps {
  confirmationCode: string;
  disabledReason?: string | undefined;
  onRecord: () => void;
  recording: boolean;
  result?: string | null | undefined;
  target: string;
}

export function VoiceApprovalPrompt({
  confirmationCode,
  disabledReason,
  onRecord,
  recording,
  result,
  target,
}: VoiceApprovalPromptProps) {
  return (
    <div className="mt-4 rounded-[10px] border border-border-subtle bg-bg-canvas px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-muted">
        Voice approval code
      </div>
      <div className="mt-1 font-mono text-[18px] font-semibold text-text-primary">
        {confirmationCode}
      </div>
      <p className="mt-1 text-[12px] leading-[18px] text-text-secondary">
        Say approve {target} {confirmationCode} or deny {target} {confirmationCode}.
      </p>
      {disabledReason ? (
        <p className="mt-2 text-[12px] leading-[18px] text-text-tertiary">{disabledReason}</p>
      ) : null}
      {result ? (
        <p
          className={cn(
            "mt-2 text-[12px]",
            result.startsWith("Rejected:") ? "text-status-error" : "text-status-success",
          )}
        >
          {result}
        </p>
      ) : null}
      <PillButton
        className="mt-3"
        disabled={Boolean(disabledReason)}
        icon={<Mic className="h-3.5 w-3.5" />}
        onClick={onRecord}
        type="button"
        variant="secondary"
      >
        {recording ? "Stop listening" : "Listen for voice approval"}
      </PillButton>
    </div>
  );
}
