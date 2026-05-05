import type { VoiceCommandType, VoiceRiskLevel } from "@prisma/client";

export interface ParsedVoiceCommand {
  args: Record<string, unknown>;
  commandType: VoiceCommandType;
  confidence: number;
  decision: "EXECUTED" | "REJECTED" | "NEEDS_CONFIRMATION";
  rejectionReason?: string;
  riskLevel: VoiceRiskLevel;
}

export interface ParsedVoiceApproval {
  commandType: "APPROVE_ACTION" | "DENY_ACTION" | "UNKNOWN";
  confidence: number;
  decision: "EXECUTED" | "REJECTED";
  rejectionReason?: string;
  riskLevel: "HIGH";
}

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function parseVoiceCommand(transcript: string): ParsedVoiceCommand {
  const text = normalize(transcript);
  if (!text) {
    return {
      args: {},
      commandType: "UNKNOWN",
      confidence: 0,
      decision: "REJECTED",
      rejectionReason: "empty transcript",
      riskLevel: "LOW",
    };
  }

  if (containsAny(text, ["pause this run", "pause the run", "pause task", "pause"])) {
    return {
      args: {},
      commandType: "PAUSE_RUN",
      confidence: 0.92,
      decision: "NEEDS_CONFIRMATION",
      riskLevel: "MEDIUM",
    };
  }

  if (containsAny(text, ["resume this run", "resume the run", "continue this run", "resume"])) {
    return {
      args: {},
      commandType: "RESUME_RUN",
      confidence: 0.92,
      decision: "NEEDS_CONFIRMATION",
      riskLevel: "MEDIUM",
    };
  }

  if (containsAny(text, ["cancel this run", "stop this run", "cancel task"])) {
    return {
      args: {},
      commandType: "CANCEL_RUN",
      confidence: 0.9,
      decision: "NEEDS_CONFIRMATION",
      riskLevel: "HIGH",
    };
  }

  if (containsAny(text, ["what is the status", "status update", "how is it going"])) {
    return {
      args: {},
      commandType: "STATUS_QUERY",
      confidence: 0.93,
      decision: "EXECUTED",
      riskLevel: "LOW",
    };
  }

  const submitMatch = text.match(/^(?:research|write|build|create|draft|summarize|review|plan)\b(.+)/);
  if (submitMatch) {
    return {
      args: { prompt: transcript.trim() },
      commandType: "SUBMIT_TASK",
      confidence: 0.86,
      decision: "NEEDS_CONFIRMATION",
      riskLevel: "MEDIUM",
    };
  }

  return {
    args: { transcript: transcript.trim() },
    commandType: "UNKNOWN",
    confidence: 0.35,
    decision: "REJECTED",
    rejectionReason: "command not recognized",
    riskLevel: "LOW",
  };
}

export function parseVoiceApproval({
  confirmationCode,
  target,
  transcript,
}: {
  confirmationCode: string;
  target: string;
  transcript: string;
}): ParsedVoiceApproval {
  const text = normalize(transcript);
  const normalizedTarget = normalize(target);
  const approved = /\b(approve|send|yes approve|confirm)\b/.test(text);
  const denied = /\b(deny|reject|cancel|do not|don't)\b/.test(text);
  const targetMatched =
    normalizedTarget.length === 0 ||
    text.includes(normalizedTarget) ||
    normalizedTarget
      .split(/[\s._-]+/)
      .filter(Boolean)
      .some((part) => part.length > 2 && text.includes(part));
  const codeMatched = text.includes(confirmationCode);

  if (!codeMatched) {
    return {
      commandType: approved ? "APPROVE_ACTION" : denied ? "DENY_ACTION" : "UNKNOWN",
      confidence: approved || denied ? 0.65 : 0.2,
      decision: "REJECTED",
      rejectionReason: "missing confirmation code",
      riskLevel: "HIGH",
    };
  }
  if (!approved && !denied) {
    return {
      commandType: "UNKNOWN",
      confidence: 0.2,
      decision: "REJECTED",
      rejectionReason: "missing explicit approve or deny verb",
      riskLevel: "HIGH",
    };
  }
  if (!targetMatched) {
    return {
      commandType: approved ? "APPROVE_ACTION" : "DENY_ACTION",
      confidence: 0.5,
      decision: "REJECTED",
      rejectionReason: "approval target did not match",
      riskLevel: "HIGH",
    };
  }

  return {
    commandType: approved ? "APPROVE_ACTION" : "DENY_ACTION",
    confidence: 0.94,
    decision: "EXECUTED",
    riskLevel: "HIGH",
  };
}
