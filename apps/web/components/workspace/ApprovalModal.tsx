"use client";

import { useState } from "react";
import type { PendingApproval } from "@handle/shared";
import {
  ApprovalPill,
  Modal,
  PillButton,
  Toggle,
} from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import { respondToApproval } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ApprovalModalProps {
  approval: PendingApproval;
  onResolved: (approvalId: string) => void;
}

const scopeLabels = {
  browser_use_actual_chrome: ["Browser", "operate"],
  destructive_integration_action: ["Integration", "write"],
  file_delete: ["Files", "delete"],
  file_write_outside_workspace: ["Files", "write"],
  risky_browser_action: ["Browser", "approve"],
  shell_exec: ["Shell", "execute"],
} satisfies Record<PendingApproval["request"]["type"], [string, string]>;

function approvalTitle(approval: PendingApproval) {
  const { request } = approval;

  switch (request.type) {
    case "browser_use_actual_chrome":
      return "Connect to your actual Chrome?";
    case "file_delete":
      return `Delete ${request.path ?? "selected path"}?`;
    case "file_write_outside_workspace":
      return `Write to ${request.path ?? "selected path"}? This is outside the task workspace.`;
    case "risky_browser_action":
      return "Approve action?";
    case "shell_exec":
      return `Run command: ${request.command ?? "unknown"}?`;
    default:
      return request.reason;
  }
}

function RiskRow({
  highlighted = false,
  risk,
  text,
}: {
  highlighted?: boolean;
  risk: "low" | "med";
  text: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] text-text-secondary",
        highlighted &&
          "border border-status-waiting/20 bg-status-waiting/5 text-text-primary",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-pill",
          risk === "med" ? "bg-status-waiting" : "bg-status-success",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </div>
  );
}

export function ApprovalModal({ approval, onResolved }: ApprovalModalProps) {
  const { getToken } = useHandleAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [understandsActualChromeRisk, setUnderstandsActualChromeRisk] = useState(false);
  const [trustSimilarRuns, setTrustSimilarRuns] = useState(false);
  const [scope, action] = scopeLabels[approval.request.type];
  const isActualChromeApproval = approval.request.type === "browser_use_actual_chrome";
  const isHostAffectingApproval =
    approval.request.type === "file_delete" ||
    approval.request.type === "file_write_outside_workspace" ||
    approval.request.type === "shell_exec";
  const isRiskyBrowserAction = approval.request.type === "risky_browser_action";
  const title = approvalTitle(approval);
  const approvalDisabled = isSubmitting || (isActualChromeApproval && !understandsActualChromeRisk);
  const usesDenyApproveLabels =
    isActualChromeApproval || isHostAffectingApproval || isRiskyBrowserAction;

  async function decide(decision: "approved" | "denied") {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      await respondToApproval({
        approvalId: approval.approvalId,
        decision,
        token,
      });
      onResolved(approval.approvalId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to respond to approval",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal>
      <div className="px-8 py-7">
        <ApprovalPill
          className="mb-4 uppercase tracking-[0.04em]"
          label="Needs approval"
        />
        <h2 className="font-display text-[22px] font-semibold leading-[28px] tracking-[-0.02em] text-text-primary">
          {title}
        </h2>
        {(isRiskyBrowserAction || title !== approval.request.reason) && (
          <p className="mt-2 text-[13px] leading-[19px] text-text-secondary">
            {approval.request.reason}
          </p>
        )}
      </div>

      <div className="border-t border-border-subtle px-8 py-5">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.04em] text-text-muted">
          Plan
        </div>
        <div className="flex flex-col gap-1">
          <RiskRow risk="low" text="Review requested action" />
          <RiskRow highlighted risk="med" text={`${scope} · ${action}`} />
          <RiskRow risk="low" text="Return decision to Handle" />
        </div>

        {isActualChromeApproval && (
          <div className="mt-5 rounded-[10px] border border-status-error/20 bg-status-error/5 px-4 py-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-status-error">
              Actual Chrome access
            </div>
            <ul className="space-y-1.5 text-[12px] leading-[18px] text-text-secondary">
              <li>Agent will see: any tab you have open</li>
              <li>Agent will see: your logged-in sessions to all sites</li>
              <li>Agent will see: saved passwords visible to extensions</li>
              <li>Agent will see: browsing history</li>
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            scope,
            action,
            approval.request.integration ??
              approval.request.path ??
              approval.request.command,
            isRiskyBrowserAction && approval.request.action
              ? `Action: ${approval.request.action}`
              : null,
            isRiskyBrowserAction && approval.request.target
              ? `Target: ${approval.request.target}`
              : null,
          ]
            .filter(Boolean)
            .map((chip) => (
              <span
                key={String(chip)}
                className="rounded-pill border border-border-subtle bg-bg-canvas px-2.5 py-1 text-[11px] text-text-secondary"
              >
                {chip}
              </span>
            ))}
        </div>

        {error && (
          <div className="mt-4 rounded-[10px] border border-status-error/20 bg-status-error/5 px-3 py-2 text-[12px] text-status-error">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border-subtle px-8 py-5">
        {isActualChromeApproval ? (
          <>
            <Toggle
              aria-label="I understand actual Chrome access risks"
              checked={understandsActualChromeRisk}
              onClick={() => setUnderstandsActualChromeRisk((value) => !value)}
            />
            <span className="text-[12px] text-text-secondary">
              I understand
            </span>
          </>
        ) : (
          <>
            <Toggle
              checked={trustSimilarRuns}
              onClick={() => setTrustSimilarRuns((value) => !value)}
            />
            <span className="text-[12px] text-text-secondary">
              Trust similar runs
            </span>
          </>
        )}
        <span className="flex-1" />
        <PillButton
          autoFocus={isActualChromeApproval}
          className={
            usesDenyApproveLabels
              ? "border-status-error/25 text-status-error hover:bg-status-error/5"
              : undefined
          }
          disabled={isSubmitting}
          onClick={() => decide("denied")}
          variant="secondary"
        >
          {usesDenyApproveLabels ? "Deny" : "Decline"}
        </PillButton>
        <PillButton
          disabled={approvalDisabled}
          onClick={() => decide("approved")}
          variant="primary"
        >
          {usesDenyApproveLabels ? "Approve" : "Approve & run"}
        </PillButton>
      </div>
    </Modal>
  );
}
