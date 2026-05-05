import type { ParsedSchedulePreview, ScheduleTargetType } from "@handle/shared";
import { nextRunPreview } from "./preview";

const DAY_TO_CRON: Record<string, string> = {
  friday: "5",
  monday: "1",
  saturday: "6",
  sunday: "0",
  thursday: "4",
  tuesday: "2",
  wednesday: "3",
};

export function parseNaturalSchedule({
  text,
  timezone = "America/Chicago",
}: {
  text: string;
  timezone?: string;
}): ParsedSchedulePreview {
  const normalized = text.trim().toLowerCase();
  const time = parseTime(normalized) ?? { hour: 9, minute: 0 };
  let cronExpression: string | null = null;
  let runAt: string | null = null;
  let explanation = "Custom schedule";
  let confidence = 0.55;
  const target = inferTarget(normalized);

  if (/\bweekday|monday through friday|mon-?fri\b/.test(normalized)) {
    cronExpression = `${time.minute} ${time.hour} * * 1-5`;
    explanation = `Every weekday at ${formatTime(time)}`;
    confidence = 0.9;
  } else {
    const day = Object.keys(DAY_TO_CRON).find((candidate) => normalized.includes(candidate));
    if (day) {
      cronExpression = `${time.minute} ${time.hour} * * ${DAY_TO_CRON[day]}`;
      explanation = `Every ${day} at ${formatTime(time)}`;
      confidence = 0.88;
    } else if (/\bhourly|every hour\b/.test(normalized)) {
      cronExpression = "0 * * * *";
      explanation = "Every hour";
      confidence = 0.85;
    } else if (/\bmonthly|every month\b/.test(normalized)) {
      const dayOfMonth = normalized.match(/\b(?:day|on the)\s+(\d{1,2})\b/)?.[1] ?? "1";
      cronExpression = `${time.minute} ${time.hour} ${Number.parseInt(dayOfMonth, 10) || 1} * *`;
      explanation = `Monthly on day ${dayOfMonth} at ${formatTime(time)}`;
      confidence = 0.78;
    } else if (/\bdaily|every day|tomorrow\b/.test(normalized)) {
      cronExpression = `${time.minute} ${time.hour} * * *`;
      explanation = `Every day at ${formatTime(time)}`;
      confidence = 0.82;
    }
  }

  if (!cronExpression && /\bonce|one time|on \d{4}-\d{2}-\d{2}/.test(normalized)) {
    const iso = normalized.match(/\d{4}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2})?/)?.[0];
    if (iso) {
      const date = new Date(iso.replace(" ", "T"));
      if (Number.isFinite(date.getTime())) {
        runAt = date.toISOString();
        explanation = `Once at ${date.toLocaleString()}`;
        confidence = 0.8;
      }
    }
  }

  const nextRuns = nextRunPreview({
    cronExpression,
    runAt: runAt ? new Date(runAt) : null,
    timezone,
  });
  return {
    confidence,
    cronExpression,
    explanation,
    input: target.input,
    name: buildName({ cadence: explanation, target }),
    nextRuns,
    outputTarget: inferOutputTarget(normalized),
    runAt,
    targetRef: target.targetRef,
    targetType: target.targetType,
    timezone,
  };
}

function parseTime(value: string) {
  const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!match?.[1]) return null;
  let hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatTime({ hour, minute }: { hour: number; minute: number }) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inferTarget(value: string): {
  input: Record<string, unknown>;
  label: string;
  targetRef: Record<string, unknown>;
  targetType: ScheduleTargetType;
} {
  const company = extractResearchSubject(value);
  if (/\bresearch|company|competitor|competitors|market\b/.test(value)) {
    return {
      input: {
        company: company ?? "Company",
        depth: /\bdeep|comprehensive|detailed\b/.test(value) ? "deep" : "standard",
      },
      label: `Research ${company ?? "a company"}`,
      targetRef: { skillSlug: "research-company" },
      targetType: "SKILL",
    };
  }

  if (/\bnotion|workspace summary|summarize workspace\b/.test(value)) {
    return {
      input: { depth: "standard" },
      label: "Summarize a Notion workspace",
      targetRef: { skillSlug: "summarize-a-notion-workspace" },
      targetType: "SKILL",
    };
  }

  if (/\btrip|itinerary|travel\b/.test(value)) {
    return {
      input: { destination: extractAfter(value, ["to", "in", "for"]) ?? "Destination", days: 3 },
      label: "Plan a trip",
      targetRef: { skillSlug: "plan-a-trip" },
      targetType: "SKILL",
    };
  }

  if (/\bcode review|review pr|pull request\b/.test(value)) {
    return {
      input: { mode: /\bsecurity\b/.test(value) ? "security-focused" : "summary" },
      label: "Code review a PR",
      targetRef: { skillSlug: "code-review-a-pr" },
      targetType: "SKILL",
    };
  }

  return {
    input: { goal: sentenceCase(value) },
    label: sentenceCase(value) || "Scheduled task",
    targetRef: { goal: sentenceCase(value) },
    targetType: "TASK",
  };
}

function inferOutputTarget(value: string) {
  if (/\bemail|mail|inbox\b/.test(value)) {
    return { channel: "EMAIL", label: "Email via configured notification address" };
  }
  if (/\bslack|channel\b/.test(value)) {
    return { channel: "SLACK", label: "Slack via configured notification channel" };
  }
  if (/\bwebhook\b/.test(value)) {
    return { channel: "WEBHOOK", label: "Webhook via configured notification URL" };
  }
  return { channel: "IN_APP", label: "Handle schedule history" };
}

function buildName({
  cadence,
  target,
}: {
  cadence: string;
  target: { input: Record<string, unknown>; label: string };
}) {
  const company = typeof target.input.company === "string" ? target.input.company : null;
  if (company) {
    const cadenceLabel = cadence.toLowerCase().includes("weekday") ? "weekday digest" : "scheduled digest";
    return `Research ${company} ${cadenceLabel}`;
  }
  return `${target.label} schedule`;
}

function extractResearchSubject(value: string) {
  const patterns = [
    /\bresearch\s+([a-z0-9][a-z0-9 .&-]{1,60}?)(?:\s+and\s+(?:email|send|post|notify)|\s+at\s+|\s+every\s+|$)/i,
    /\btrack\s+([a-z0-9][a-z0-9 .&-]{1,60}?)(?:\s+and\s+(?:email|send|post|notify)|\s+at\s+|\s+every\s+|$)/i,
    /\bcompany\s+([a-z0-9][a-z0-9 .&-]{1,60}?)(?:\s+and\s+(?:email|send|post|notify)|\s+at\s+|\s+every\s+|$)/i,
  ];
  for (const pattern of patterns) {
    const raw = value.match(pattern)?.[1]?.trim();
    if (raw) return titleCase(cleanSubject(raw));
  }
  return null;
}

function extractAfter(value: string, markers: string[]) {
  for (const marker of markers) {
    const raw = value.match(new RegExp(`\\b${marker}\\s+([a-z0-9][a-z0-9 .&-]{1,60})`, "i"))?.[1]?.trim();
    if (raw) return titleCase(cleanSubject(raw));
  }
  return null;
}

function cleanSubject(value: string) {
  return value
    .replace(/\b(the|a|an)\b$/i, "")
    .replace(/\b(report|digest|brief|summary)\b.*$/i, "")
    .trim();
}

function titleCase(value: string) {
  const titled = value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 && /^[A-Z0-9]+$/.test(part) ? part : part.slice(0, 1).toUpperCase() + part.slice(1)))
    .join(" ");
  return titled.replace(/\bOpenai\b/g, "OpenAI").replace(/\bAnthropic\b/g, "Anthropic").replace(/\bStripe\b/g, "Stripe");
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1) : "";
}
