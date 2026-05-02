"use client";

import type { BrowserScreenshotEvent } from "@handle/shared";
import { cn } from "@/lib/utils";

interface ScreenshotHistoryProps {
  current: BrowserScreenshotEvent | null;
  screenshots: BrowserScreenshotEvent[];
}

export function ScreenshotHistory({ current, screenshots }: ScreenshotHistoryProps) {
  return (
    <div className="h-full min-h-0 border-t border-border-subtle bg-bg-surface px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-muted">
          Screenshot history
        </span>
        <span className="font-mono text-[10.5px] text-text-tertiary">
          {screenshots.length}/10
        </span>
      </div>
      <div className="flex h-[calc(100%-24px)] gap-2 overflow-x-auto pb-1">
        {screenshots.length === 0 && (
          <div className="flex h-full items-center text-[11px] text-text-tertiary">
            No screenshots yet
          </div>
        )}
        {screenshots.map((screenshot) => (
          <div
            key={`${screenshot.timestamp}-${screenshot.callId ?? screenshot.source}`}
            className={cn(
              "h-full min-w-[112px] overflow-hidden rounded-[8px] border bg-bg-canvas",
              current?.timestamp === screenshot.timestamp
                ? "border-accent"
                : "border-border-subtle",
            )}
          >
            <img
              alt={`${screenshot.source} thumbnail`}
              className="h-full w-full object-cover"
              src={`data:image/png;base64,${screenshot.imageBase64}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
