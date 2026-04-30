'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { PendingApproval, TaskDetailResponse } from '@handle/shared';
import { useAgentStream } from '@/hooks/useAgentStream';
import { getTask, listPendingApprovals } from '@/lib/api';
import { ApprovalModal } from './ApprovalModal';
import { BottomComposer } from './BottomComposer';
import { CenterPane } from './CenterPane';
import { LeftPane } from './LeftPane';
import { RightInspector } from './RightInspector';
import { StatusBarHeader } from './StatusBarHeader';

interface WorkspaceScreenProps {
  initialTask: TaskDetailResponse | null;
  taskId: string;
}

function dedupeApprovals(approvals: PendingApproval[]) {
  return Array.from(new Map(approvals.map((approval) => [approval.approvalId, approval])).values());
}

export function WorkspaceScreen({ initialTask, taskId }: WorkspaceScreenProps) {
  const { getToken, isLoaded } = useAuth();
  const state = useAgentStream(taskId);
  const [task, setTask] = useState<TaskDetailResponse | null>(initialTask);
  const [listedApprovals, setListedApprovals] = useState<PendingApproval[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [resolvedApprovalIds, setResolvedApprovalIds] = useState<Set<string>>(() => new Set());

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
        setListedApprovals(approvals.filter((approval) => approval.taskId === taskId));
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
      status: 'pending',
      taskId,
      type: state.pendingApproval.type,
    };
  }, [state.pendingApproval, taskId]);

  const approvals = useMemo(() => {
    const candidates = streamApproval ? [streamApproval, ...listedApprovals] : listedApprovals;
    return dedupeApprovals(candidates).filter((approval) => !resolvedApprovalIds.has(approval.approvalId));
  }, [listedApprovals, resolvedApprovalIds, streamApproval]);

  const modalApproval =
    selectedApproval && approvals.some((approval) => approval.approvalId === selectedApproval.approvalId)
      ? selectedApproval
      : approvals.find((approval) => approval.status === 'pending') ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StatusBarHeader state={state} task={task} />
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_320px] overflow-hidden">
        <LeftPane state={state} task={task} />
        <CenterPane state={state} taskId={taskId} />
        <RightInspector approvals={approvals} onReviewApproval={setSelectedApproval} state={state} />
      </div>
      <BottomComposer />
      {modalApproval && (
        <ApprovalModal
          approval={modalApproval}
          onResolved={(approvalId) => {
            setResolvedApprovalIds((current) => new Set(current).add(approvalId));
            setListedApprovals((current) => current.filter((approval) => approval.approvalId !== approvalId));
            setSelectedApproval(null);
          }}
        />
      )}
    </div>
  );
}
