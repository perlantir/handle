"use client";

import { ChevronLeft, ChevronRight, Lock, RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { AgentStreamState } from "@/hooks/useAgentStream";
import { cn } from "@/lib/utils";
import { ScreenshotHistory } from "./ScreenshotHistory";
import { ScreenshotViewer } from "./ScreenshotViewer";

interface BrowserPaneProps {
  state: AgentStreamState;
  taskId: string;
}

function IconButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle"
      type="button"
    >
      {children}
    </button>
  );
}

function browserMeta(state: AgentStreamState, taskId: string) {
  for (let index = state.toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = state.toolCalls[index];
    if (!toolCall?.toolName.startsWith("browser.")) continue;

    const url =
      typeof toolCall.args.url === "string"
        ? toolCall.args.url
        : (toolCall.result?.match(/Current URL: ([^.]+(?:\.[^.\s]+)+[^.]*)\./)?.[1] ??
          toolCall.result?.match(/Navigated to ([^.]+(?:\.[^.\s]+)+[^.]*)\./)?.[1]);
    const title = toolCall.result?.match(/Title: "([^"]+)"/)?.[1];
    return {
      title: title ?? "Sandbox browser",
      url: url ?? `sandbox.handle.local/tasks/${taskId}`,
    };
  }

  return {
    title: "Ready",
    url: `sandbox.handle.local/tasks/${taskId}`,
  };
}

export function BrowserPane({ state, taskId }: BrowserPaneProps) {
  const current = state.browserScreenshots.at(-1) ?? null;
  const meta = useMemo(() => browserMeta(state, taskId), [state, taskId]);

  useEffect(() => {
    if (!current) return;
    const renderTimeMs = Math.max(Date.now() - Date.parse(current.timestamp), 0);
    console.log("browser_screenshot received", {
      byteCount: current.byteCount,
      callId: current.callId,
      renderTimeMs,
      source: current.source,
    });
  }, [current]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-[14px]">
        <IconButton label="Back">
          <ChevronLeft className="h-[11px] w-[11px]" />
        </IconButton>
        <IconButton label="Forward">
          <ChevronRight className="h-[11px] w-[11px]" />
        </IconButton>
        <IconButton label="Refresh">
          <RefreshCw className="h-[11px] w-[11px]" />
        </IconButton>
        <div className="flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-pill bg-bg-canvas px-3 font-mono text-[11px] text-text-tertiary">
          <Lock className="h-2.5 w-2.5 shrink-0 text-text-muted" />
          <span className="truncate">{meta.url}</span>
        </div>
        <span className="inline-flex max-w-[160px] items-center gap-1.5 px-2 text-[11px] font-medium text-accent">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-pill", current ? "bg-accent" : "bg-text-muted")} />
          <span className="truncate">{current ? meta.title : "Ready"}</span>
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,7fr)_minmax(104px,2.5fr)]">
        <ScreenshotViewer screenshot={current} />
        <ScreenshotHistory current={current} screenshots={state.browserScreenshots} />
      </div>
    </div>
  );
}
