"use client";

import type { BrowserScreenshotEvent } from "@handle/shared";
import { cn } from "@/lib/utils";

interface ScreenshotViewerProps {
  screenshot: BrowserScreenshotEvent | null;
}

export function ScreenshotViewer({ screenshot }: ScreenshotViewerProps) {
  if (!screenshot) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-bg-canvas px-6 text-center">
        <div className="max-w-[280px] text-[12px] leading-[18px] text-text-tertiary">
          Browser will appear when agent uses it
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-bg-canvas p-3">
      <img
        alt={`${screenshot.source === "computer_use" ? "Computer-use" : "Browser"} screenshot`}
        className={cn(
          "max-h-full max-w-full rounded-[8px] border border-border-subtle bg-bg-surface object-contain shadow-sm",
        )}
        src={`data:image/png;base64,${screenshot.imageBase64}`}
      />
    </div>
  );
}
