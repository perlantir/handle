"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PlanStep, TaskDetailResponse, TaskMessage } from "@handle/shared";
import type { AgentStreamState, ToolCallState } from "@/hooks/useAgentStream";
import { cn } from "@/lib/utils";

type LeftTab = "chat" | "plan" | "timeline";

interface LeftPaneProps {
  state: AgentStreamState;
  task: TaskDetailResponse | null;
}

const tabLabels: Array<[LeftTab, string]> = [
  ["chat", "Chat"],
  ["plan", "Plan"],
  ["timeline", "Timeline"],
];

const markdownAllowedElements = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

async function copyToClipboard(text: string) {
  if (!text || typeof navigator === "undefined" || !navigator.clipboard) {
    return false;
  }

  await navigator.clipboard.writeText(text);
  return true;
}

function CopyButton({
  className,
  getText,
  label,
  onCopied,
  text,
}: {
  className?: string;
  getText?: () => string;
  label: string;
  onCopied?: () => void;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const didCopy = await copyToClipboard(getText?.() ?? text ?? "");
    if (!didCopy) return;
    setCopied(true);
    onCopied?.();
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] border border-transparent text-text-muted transition hover:border-border-subtle hover:bg-bg-canvas hover:text-text-primary",
        className,
      )}
      onClick={handleCopy}
      type="button"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.1} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={1.9} />
      )}
    </button>
  );
}

function CopyableCodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);

  return (
    <div className="group/code relative my-2 rounded-[6px] border border-border-subtle bg-bg-subtle">
      <CopyButton
        className="absolute right-2 top-2 bg-bg-subtle/90 opacity-100 shadow-sm md:opacity-0 md:group-hover/code:opacity-100 md:focus:opacity-100"
        getText={() =>
          (
            preRef.current?.querySelector("code")?.textContent ??
            preRef.current?.textContent ??
            ""
          ).replace(/\n$/, "")
        }
        label="Copy code block"
      />
      <pre
        className="overflow-x-auto p-3 pr-11 font-mono text-[12px] leading-[18px] text-text-primary"
        ref={preRef}
      >
        {children}
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
  a: ({ children, href, ...props }) => (
    <a
      {...props}
      className="text-accent underline decoration-accent/35 underline-offset-[3px] hover:decoration-accent"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="my-2 border-l-2 border-border pl-3 text-text-secondary"
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className, ...props }) => {
    const isBlockCode = className?.startsWith("language-");

    return (
      <code
        {...props}
        className={cn(
          isBlockCode
            ? "font-mono text-[12px] text-text-primary"
            : "rounded-[3px] bg-bg-subtle px-1 py-0.5 font-mono text-[12px] text-text-primary",
          className,
        )}
      >
        {children}
      </code>
    );
  },
  h1: ({ children, ...props }) => (
    <h1
      {...props}
      className="mb-2 mt-3 text-[16px] font-semibold leading-6 text-text-primary"
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      {...props}
      className="mb-2 mt-3 text-[15px] font-semibold leading-6 text-text-primary"
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      {...props}
      className="mb-1.5 mt-2.5 text-[14px] font-semibold leading-5 text-text-primary"
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      {...props}
      className="mb-1.5 mt-2 text-[13px] font-semibold leading-5 text-text-primary"
    >
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5
      {...props}
      className="mb-1 mt-2 text-[13px] font-semibold leading-5 text-text-primary"
    >
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6
      {...props}
      className="mb-1 mt-2 text-[12px] font-semibold uppercase leading-5 text-text-secondary"
    >
      {children}
    </h6>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="pl-1">
      {children}
    </li>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className="my-2 list-decimal space-y-1 pl-5">
      {children}
    </ol>
  ),
  p: ({ children, ...props }) => (
    <p {...props} className="my-1 first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  pre: ({ children }) => <CopyableCodeBlock>{children}</CopyableCodeBlock>,
  table: ({ children, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table
        {...props}
        className="min-w-full border-collapse text-left text-[12px]"
      >
        {children}
      </table>
    </div>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="border border-border-subtle px-2 py-1 align-top">
      {children}
    </td>
  ),
  th: ({ children, ...props }) => (
    <th
      {...props}
      className="border border-border-subtle bg-bg-subtle px-2 py-1 font-semibold"
    >
      {children}
    </th>
  ),
  ul: ({ children, ...props }) => (
    <ul {...props} className="my-2 list-disc space-y-1 pl-5">
      {children}
    </ul>
  ),
};

function TypingDots() {
  return (
    <span className="inline-flex gap-[3px] align-middle">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1 w-1 rounded-pill bg-accent animate-pulse-handle"
          style={{ animationDelay: `${index * 0.18}s` }}
        />
      ))}
    </span>
  );
}

function AssistantMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      allowedElements={markdownAllowedElements}
      components={markdownComponents}
      remarkPlugins={[remarkGfm]}
      skipHtml
      unwrapDisallowed
    >
      {children}
    </ReactMarkdown>
  );
}

function Message({
  message,
  working = false,
}: {
  message: Pick<TaskMessage, "content" | "role">;
  working?: boolean;
}) {
  const isAgent = message.role === "ASSISTANT" || message.role === "SYSTEM";

  return (
    <div className="group/message flex items-start gap-2.5">
      <div
        className={cn(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-pill text-[10px] font-semibold text-text-onAccent",
          isAgent ? "bg-bg-inverse" : "bg-accent",
        )}
      >
        {isAgent ? "H" : "Y"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] flex min-h-7 items-center justify-between gap-2 text-[11px] tracking-[0.005em] text-text-muted">
          <span>
            {isAgent ? "Handle" : "You"}
            {working && " · working"}
          </span>
          {!working && (
            <CopyButton
              className="opacity-100 md:opacity-0 md:group-hover/message:opacity-100 md:focus:opacity-100"
              label={`Copy ${isAgent ? "Handle" : "your"} message`}
              text={message.content}
            />
          )}
        </div>
        <div
          className={cn(
            "text-[13px] leading-[19.5px] tracking-[-0.005em] text-text-primary",
            working && "text-text-secondary",
          )}
        >
          {isAgent ? (
            <AssistantMarkdown>{message.content}</AssistantMarkdown>
          ) : (
            message.content
          )}
          {working && (
            <span className="ml-1.5 inline-block">
              <TypingDots />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Conversation({ state, task }: LeftPaneProps) {
  const messages = useMemo(() => {
    const base = [...(task?.messages ?? [])];
    if (
      state.finalMessage &&
      !base.some(
        (message) =>
          message.role === "ASSISTANT" &&
          message.content === state.finalMessage,
      )
    ) {
      base.push({
        content: state.finalMessage,
        id: "stream-final",
        role: "ASSISTANT",
      });
    }
    return base;
  }, [state.finalMessage, task?.messages]);

  const runningTool = latestToolCall(state.toolCalls, "running");
  const workingText =
    state.thought || (runningTool ? `Using ${runningTool.toolName}` : "");

  return (
    <div className="flex flex-col gap-[18px] px-5 py-1">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {workingText && (
        <Message
          message={{ content: workingText, role: "ASSISTANT" }}
          working
        />
      )}
    </div>
  );
}

function PlanDot({ state }: { state: PlanStep["state"] }) {
  if (state === "done") {
    return (
      <div className="relative z-10 mt-1 flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-pill bg-status-success text-text-onAccent">
        <Check className="h-2 w-2" strokeWidth={2.2} />
      </div>
    );
  }

  if (state === "active") {
    return (
      <div className="relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-pill bg-accent shadow-[0_0_0_4px_oklch(0.62_0.18_250/0.18)]" />
    );
  }

  return (
    <div className="relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-pill border-[1.5px] border-border bg-bg-canvas" />
  );
}

function Plan({ steps }: { steps: PlanStep[] }) {
  return (
    <div className="px-3 pt-1">
      <div className="relative pl-[14px]">
        {steps.length > 1 && (
          <div className="absolute bottom-3 left-[21px] top-3 w-px bg-border-subtle" />
        )}
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-3 py-2">
            <PlanDot state={step.state} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "truncate text-[12.5px] tracking-[-0.005em]",
                    step.state === "active"
                      ? "font-medium text-text-primary"
                      : "font-normal",
                    step.state === "pending"
                      ? "text-text-muted"
                      : "text-text-primary",
                  )}
                >
                  {step.title}
                </span>
                {step.requiresApproval && (
                  <span className="rounded-[3px] bg-status-waiting/15 px-[5px] py-px text-[9.5px] font-semibold uppercase tracking-[0.04em] text-status-waiting">
                    Approval
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function timelineEntries(state: AgentStreamState) {
  const entries: Array<{
    kind: "plan" | "tool" | "browser" | "memory";
    state: "active" | "done" | "error";
    text: string;
  }> = [];

  if (state.planSteps.length > 0) {
    entries.push({
      kind: "plan",
      state: "done",
      text: `Plan generated · ${state.planSteps.length} steps`,
    });
  }

  state.toolCalls.forEach((toolCall) => {
    entries.push({
      kind: "tool",
      state:
        toolCall.status === "running"
          ? "active"
          : toolCall.status === "error"
            ? "error"
            : "done",
      text: toolCall.toolName,
    });
  });

  if (state.finalMessage)
    entries.push({
      kind: "plan",
      state: "done",
      text: "Final response received",
    });
  if (state.error)
    entries.push({ kind: "tool", state: "error", text: state.error });

  return entries.slice().reverse();
}

function Timeline({ state }: { state: AgentStreamState }) {
  const colors = {
    browser: "bg-agent-browser",
    memory: "bg-agent-memory",
    plan: "bg-accent",
    tool: "bg-agent-tool",
  };
  const entries = timelineEntries(state);

  return (
    <div className="flex flex-col gap-px px-5 pt-1">
      {entries.map((entry, index) => (
        <div
          key={`${entry.text}-${index}`}
          className="flex items-baseline gap-2.5 px-1 py-2"
        >
          <span className="w-10 shrink-0 font-mono text-[10.5px] tabular-nums text-text-muted">
            00:{String(Math.max(entries.length - index, 1)).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill",
              colors[entry.kind],
            )}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12px] leading-[17px] tracking-[-0.005em]",
              entry.kind === "tool" && "font-mono text-[11.5px]",
              entry.state === "active"
                ? "font-medium text-text-primary"
                : "text-text-secondary",
              entry.state === "error" && "text-status-error",
            )}
          >
            {entry.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function latestToolCall(
  toolCalls: ToolCallState[],
  status?: ToolCallState["status"],
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall && (!status || toolCall.status === status)) return toolCall;
  }
  return null;
}

export function LeftPane({ state, task }: LeftPaneProps) {
  const [tab, setTab] = useState<LeftTab>("chat");

  return (
    <aside className="flex min-h-0 flex-1 flex-col border-r border-border-subtle">
      <div className="flex gap-1 px-5 py-[14px] pb-3">
        {tabLabels.map(([key, label]) => (
          <button
            key={key}
            className={cn(
              "h-7 rounded-pill border px-3 text-[12px] font-medium tracking-[-0.005em] transition-colors duration-fast",
              tab === key
                ? "border-border-subtle bg-bg-surface text-text-primary"
                : "border-transparent bg-transparent text-text-tertiary hover:bg-bg-subtle hover:text-text-secondary",
            )}
            onClick={() => setTab(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 pb-4">
        {tab === "chat" && <Conversation state={state} task={task} />}
        {tab === "plan" && <Plan steps={state.planSteps} />}
        {tab === "timeline" && <Timeline state={state} />}
      </div>
    </aside>
  );
}
