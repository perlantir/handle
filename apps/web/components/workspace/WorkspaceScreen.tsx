"use client";

import { useEffect, useMemo, useState } from "react";
import type { PendingApproval, TaskDetailResponse } from "@handle/shared";
import { useAgentStream } from "@/hooks/useAgentStream";
import { useHandleAuth } from "@/lib/handleAuth";
import { getTask, listPendingApprovals } from "@/lib/api";
import { ApprovalModal } from "./ApprovalModal";
import { BottomComposer } from "./BottomComposer";
import { CenterPane } from "./CenterPane";
import { LeftPane } from "./LeftPane";
import { RightInspector } from "./RightInspector";
import { StatusBarHeader } from "./StatusBarHeader";

interface WorkspaceScreenProps {
  initialTask: TaskDetailResponse | null;
  taskId: string;
}

function dedupeApprovals(approvals: PendingApproval[]) {
  return Array.from(
    new Map(
      approvals.map((approval) => [approval.approvalId, approval]),
    ).values(),
  );
}

export function WorkspaceScreen({ initialTask, taskId }: WorkspaceScreenProps) {
  const { getToken, isLoaded } = useHandleAuth();
  const state = useAgentStream(taskId);
  const [task, setTask] = useState<TaskDetailResponse | null>(initialTask);
  const [listedApprovals, setListedApprovals] = useState<PendingApproval[]>([]);
  const [selectedApproval, setSelectedApproval] =
    useState<PendingApproval | null>(null);
  const [resolvedApprovalIds, setResolvedApprovalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [chatWidth, setChatWidth] = useState(64);

  useEffect(() => {
    const saved = window.localStorage.getItem("handle.workspace.chatWidth");
    if (saved) {
      const parsed = Number.parseFloat(saved);
      if (Number.isFinite(parsed)) setChatWidth(Math.min(78, Math.max(45, parsed)));
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function loadWorkspaceData() {
      const token = await getToken();
      const [loadedTask, approvals] = await Promise.all([
        task ? Promise.resolve(task) : getTask(taskId, { token }),
        listPendingApprovals({ token }),
      ]);

      if (!cancelled) {
        setTask(loadedTask);
        setListedApprovals(
          approvals.filter((approval) => approval.taskId === taskId),
        );
      }
    }

    loadWorkspaceData().catch(() => {
      if (!cancelled) setListedApprovals([]);
    });

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, task, taskId]);

  const streamApproval = useMemo<PendingApproval | null>(() => {
    if (!state.pendingApproval) return null;

    return {
      approvalId: state.pendingApproval.approvalId,
      request: state.pendingApproval,
      status: "pending",
      taskId,
      type: state.pendingApproval.type,
    };
  }, [state.pendingApproval, taskId]);

  const approvals = useMemo(() => {
    const candidates = streamApproval
      ? [streamApproval, ...listedApprovals]
      : listedApprovals;
    return dedupeApprovals(candidates).filter(
      (approval) => !resolvedApprovalIds.has(approval.approvalId),
    );
  }, [listedApprovals, resolvedApprovalIds, streamApproval]);

  const modalApproval =
    selectedApproval &&
    approvals.some(
      (approval) => approval.approvalId === selectedApproval.approvalId,
    )
      ? selectedApproval
      : (approvals.find((approval) => approval.status === "pending") ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StatusBarHeader state={state} task={task} />
      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns: `${chatWidth}% 6px minmax(0, 1fr)` }}
      >
        <LeftPane state={state} task={task} />
        <button
          aria-label="Resize chat pane"
          className="cursor-col-resize border-x border-border-subtle bg-bg-canvas hover:bg-bg-subtle"
          onMouseDown={(event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = chatWidth;
            const container = event.currentTarget.parentElement;
            const totalWidth = container?.getBoundingClientRect().width ?? window.innerWidth;
            let currentWidth = startWidth;

            function onMove(moveEvent: MouseEvent) {
              const deltaPercent = ((moveEvent.clientX - startX) / totalWidth) * 100;
              const next = Math.min(78, Math.max(45, startWidth + deltaPercent));
              currentWidth = next;
              setChatWidth(next);
            }

            function onUp() {
              window.localStorage.setItem(
                "handle.workspace.chatWidth",
                String(currentWidth),
              );
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            }

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
          type="button"
        />
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px] overflow-hidden">
          <CenterPane state={state} taskId={taskId} />
          <RightInspector
            approvals={approvals}
            onReviewApproval={setSelectedApproval}
            state={state}
          />
        </div>
      </div>
      <BottomComposer task={task} />
      {modalApproval && (
        <ApprovalModal
          approval={modalApproval}
          onResolved={(approvalId) => {
            setResolvedApprovalIds((current) =>
              new Set(current).add(approvalId),
            );
            setListedApprovals((current) =>
              current.filter((approval) => approval.approvalId !== approvalId),
            );
            setSelectedApproval(null);
          }}
        />
      )}
    </div>
  );
}
