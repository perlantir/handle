"use client";

import { Eye, FileText, RefreshCw, Terminal, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AgentStreamState, ToolCallState } from "@/hooks/useAgentStream";
import { cn } from "@/lib/utils";
import { BrowserPane } from "./BrowserPane";

type SurfaceTab = 'terminal' | 'browser' | 'preview';

interface CenterPaneProps {
  state: AgentStreamState;
  taskId: string;
}

const tabs: Array<{ icon: LucideIcon; key: SurfaceTab; label: string; sub: string }> = [
  { icon: Terminal, key: 'terminal', label: 'Terminal', sub: 'e2b' },
  { icon: FileText, key: 'preview', label: 'Preview', sub: 'files' },
  { icon: Eye, key: 'browser', label: 'Browser', sub: 'ready' },
];

function SurfaceTabButton({
  active,
  icon: Icon,
  label,
  onClick,
  sub,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  sub: string;
}) {
  return (
    <button
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-pill border px-3 transition-colors duration-fast',
        active
          ? 'border-border-subtle bg-bg-surface text-text-primary'
          : 'border-transparent bg-transparent text-text-secondary hover:bg-bg-subtle',
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className={cn('h-[13px] w-[13px]', active ? 'text-text-primary' : 'text-text-tertiary')} />
      <span className="text-[12px] font-medium tracking-[-0.005em]">{label}</span>
      <span className="font-mono text-[11px] text-text-muted">{sub}</span>
    </button>
  );
}

function IconButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle"
      type="button"
    >
      {children}
    </button>
  );
}

function commandForTool(toolCall: ToolCallState) {
  if (typeof toolCall.args.command === 'string') return toolCall.args.command;
  if (typeof toolCall.args.path === 'string') return `${toolCall.toolName} ${toolCall.args.path}`;
  return `${toolCall.toolName} ${JSON.stringify(toolCall.args)}`;
}

function terminalLines(toolCalls: ToolCallState[]) {
  return toolCalls.flatMap((toolCall) => {
    const lines: Array<{ tone?: 'muted' | 'error' | 'success'; text: string }> = [
      { text: `$ ${commandForTool(toolCall)}` },
    ];

    toolCall.streams.forEach((stream) => {
      stream.content
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => lines.push({ text: line, tone: stream.channel === 'stderr' ? 'error' : 'muted' }));
    });

    if (toolCall.result && toolCall.streams.length === 0) {
      lines.push({ text: toolCall.result, tone: toolCall.error ? 'error' : 'muted' });
    }

    if (toolCall.status === 'done') lines.push({ text: `exit ${toolCall.exitCode ?? 0}`, tone: 'success' });
    if (toolCall.status === 'error') lines.push({ text: toolCall.error ?? 'Tool failed', tone: 'error' });

    return lines;
  });
}

function TerminalSurface({ state }: { state: AgentStreamState }) {
  const lines = useMemo(() => terminalLines(state.toolCalls), [state.toolCalls]);

  return (
    <div className="h-full overflow-auto rounded-[14px] bg-bg-inverse p-5 font-mono text-[12px] text-bg-muted">
      {lines.map((line, index) => (
        <div key={`${line.text}-${index}`} className="flex gap-2.5 py-[3px]">
          <span
            className={cn(
              'min-w-0 flex-1 whitespace-pre-wrap break-words',
              line.tone === 'muted' && 'text-text-muted',
              line.tone === 'success' && 'text-status-success',
              line.tone === 'error' && 'text-status-error',
            )}
          >
            {line.text}
          </span>
        </div>
      ))}
      <div className="flex gap-2.5 py-[3px]">
        <span className="text-accent">$</span>
        <span className="inline-block h-[14px] w-2 animate-pulse-handle bg-bg-muted" />
      </div>
    </div>
  );
}

function latestFileTool(toolCalls: ToolCallState[]) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall?.toolName.startsWith('file.')) return toolCall;
  }
  return null;
}

function PreviewSurface({ state }: { state: AgentStreamState }) {
  const fileTool = latestFileTool(state.toolCalls);
  const path = typeof fileTool?.args.path === 'string' ? fileTool.args.path : '';

  return (
    <div className="h-full overflow-auto rounded-[14px] border border-border-subtle bg-bg-surface p-7">
      {fileTool && (
        <>
          <div className="text-[10px] uppercase tracking-[0.06em] text-text-muted">{path || fileTool.toolName}</div>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px] text-text-secondary">
            {fileTool.result || JSON.stringify(fileTool.args, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

export function CenterPane({ state, taskId }: CenterPaneProps) {
  const [tab, setTab] = useState<SurfaceTab>('terminal');
  const hasBrowserActivity = state.browserScreenshots.length > 0;

  useEffect(() => {
    if (hasBrowserActivity) setTab("browser");
  }, [hasBrowserActivity]);

  return (
    <section className="flex min-h-0 flex-col bg-bg-canvas">
      <div className="flex items-center gap-1 border-b border-border-subtle px-4 py-[14px] pb-3">
        {tabs.map((tabItem) => (
          <SurfaceTabButton
            key={tabItem.key}
            active={tab === tabItem.key}
            icon={tabItem.icon}
            label={tabItem.label}
            onClick={() => setTab(tabItem.key)}
            sub={tabItem.sub}
          />
        ))}
        <span className="flex-1" />
        <IconButton label="Refresh surface">
          <RefreshCw className="h-[13px] w-[13px]" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        {tab === 'terminal' && <TerminalSurface state={state} />}
        {tab === 'preview' && <PreviewSurface state={state} />}
        {tab === 'browser' && <BrowserPane state={state} taskId={taskId} />}
      </div>
    </section>
  );
}
