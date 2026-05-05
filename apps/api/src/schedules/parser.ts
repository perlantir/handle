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
  const parsedTimezone = inferTimezone(normalized) ?? timezone;
  const time = parseTime(normalized) ?? { hour: 9, minute: 0 };
  let cronExpression: string | null = null;
  let runAt: string | null = null;
  let explanation = "Custom schedule";
  let confidence = 0.55;
  const target = inferTarget(normalized);
  const outputTarget = inferOutputTarget(normalized);

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
    } else if (/\bdaily|every\s*day|everyday|tomorrow\b/.test(normalized)) {
      cronExpression = `${time.minute} ${time.hour} * * *`;
      explanation = `Every day at ${formatTime(time)}`;
      confidence = 0.86;
    } else if (/\bmonthly|every month\b/.test(normalized)) {
      const dayOfMonth = normalized.match(/\b(?:day|on the)\s+(\d{1,2})\b/)?.[1] ?? "1";
      cronExpression = `${time.minute} ${time.hour} ${Number.parseInt(dayOfMonth, 10) || 1} * *`;
      explanation = `Monthly on day ${dayOfMonth} at ${formatTime(time)}`;
      confidence = 0.78;
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
    timezone: parsedTimezone,
  });
  return {
    confidence,
    cronExpression,
    explanation,
    input: target.input,
    name: buildName({ cadence: explanation, outputTarget, target }),
    nextRuns,
    outputTarget,
    runAt,
    targetRef: target.targetRef,
    targetType: target.targetType,
    timezone: parsedTimezone,
  };
}

function parseTime(value: string) {
  const patterns = [
    /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/,
    /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/,
    /\b(\d{1,2})\s*(am|pm)\b/,
    /\bat\s+(\d{1,2})(?::(\d{2}))?\b/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match?.[1]) continue;
    const time = normalizeTime({
      hourRaw: match[1],
      meridiem: match[3],
      minuteRaw: match[2],
    });
    if (time) return time;
  }
  return null;
}

function normalizeTime({
  hourRaw,
  meridiem,
  minuteRaw,
}: {
  hourRaw: string;
  meridiem?: string | undefined;
  minuteRaw?: string | undefined;
}) {
  let hour = Number.parseInt(hourRaw, 10);
  const minute = minuteRaw ? Number.parseInt(minuteRaw, 10) : 0;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function inferTimezone(value: string) {
  if (/\b(central standard time|central daylight time|central time|cst|cdt|ct)\b/.test(value)) {
    return "America/Chicago";
  }
  if (/\b(eastern standard time|eastern daylight time|eastern time|est|edt|et)\b/.test(value)) {
    return "America/New_York";
  }
  if (/\b(mountain standard time|mountain daylight time|mountain time|mst|mdt|mt)\b/.test(value)) {
    return "America/Denver";
  }
  if (/\b(pacific standard time|pacific daylight time|pacific time|pst|pdt|pt)\b/.test(value)) {
    return "America/Los_Angeles";
  }
  return null;
}

function formatTime({ hour, minute }: { hour: number; minute: number }) {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
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

  const directMessage = extractDirectMessage(value);
  const goal = extractTaskGoal(value);
  const taskPayload = {
    ...(directMessage ? { directMessage: true, message: sentenceCase(directMessage) } : {}),
    goal,
  };
  return {
    input: taskPayload,
    label: goal || "Scheduled task",
    targetRef: taskPayload,
    targetType: "TASK",
  };
}

function extractTaskGoal(value: string) {
  const directMessage = extractDirectMessage(value);
  if (directMessage) return sentenceCase(directMessage);

  const cleaned = stripScheduleCommand(value);
  return sentenceCase(cleaned || value);
}

function stripScheduleCommand(value: string) {
  return value
    .replace(
      /^(?:every\s*day|everyday|daily|every weekday|weekdays?)\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:central standard time|central daylight time|central time|cst|cdt|ct|eastern standard time|eastern daylight time|eastern time|est|edt|et|mountain standard time|mountain daylight time|mountain time|mst|mdt|mt|pacific standard time|pacific daylight time|pacific time|pst|pdt|pt)?\s*[,;:-]?\s*/i,
      "",
    )
    .replace(/^(?:email|mail|send)\s+me\s+/i, "")
    .replace(/^(?:email|mail|send)\s+/i, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(
      /\b(?:central standard time|central daylight time|central time|cst|cdt|ct|eastern standard time|eastern daylight time|eastern time|est|edt|et|mountain standard time|mountain daylight time|mountain time|mst|mdt|mt|pacific standard time|pacific daylight time|pacific time|pst|pdt|pt)\b/gi,
      "",
    )
    .replace(/\b(?:every\s*day|everyday|daily|every weekday|weekdays?)\b/gi, "")
    .replace(/^(?:and\s+)?say\s+/i, "")
    .replace(/^\s*(?:and|then|to)\s+/i, "")
    .trim();
}

function extractDirectMessage(value: string) {
  return extractSaidMessage(value) ?? extractGreetingMessage(value);
}

function extractSaidMessage(value: string) {
  const raw = value.match(/\b(?:and\s+)?(?:say|message)\s+["“]?(.+?)["”]?\s*$/i)?.[1]?.trim();
  if (!raw) return null;
  return cleanTaskMessage(raw);
}

function extractGreetingMessage(value: string) {
  const cleaned = stripScheduleCommand(value);
  if (/^(?:hello|hi|hey|good morning|good afternoon|good evening|good night)\b/i.test(cleaned)) {
    return cleanTaskMessage(cleaned);
  }
  return null;
}

function cleanTaskMessage(value: string) {
  return value
    .replace(/[.!?]+$/g, "")
    .trim();
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
  outputTarget,
  target,
}: {
  cadence: string;
  outputTarget: { channel: string; label: string };
  target: { input: Record<string, unknown>; label: string };
}) {
  const company = typeof target.input.company === "string" ? target.input.company : null;
  if (company) {
    const cadenceLabel = cadence.toLowerCase().includes("weekday") ? "weekday digest" : "scheduled digest";
    const delivery = outputTarget.channel === "EMAIL" ? " email" : "";
    return `Research ${company} ${cadenceLabel}${delivery}`;
  }
  const cadenceLabel = cadence.toLowerCase().includes("weekday")
    ? "Weekday"
    : cadence.toLowerCase().includes("every day")
      ? "Daily"
      : cadence.toLowerCase().includes("hour")
        ? "Hourly"
        : cadence.toLowerCase().startsWith("every ")
          ? titleCase(cadence.replace(/^every\s+/i, "").replace(/\s+at\s+\d{2}:\d{2}$/i, ""))
          : "Scheduled";
  const delivery = outputTarget.channel === "EMAIL"
    ? "email"
    : outputTarget.channel === "SLACK"
      ? "Slack post"
      : outputTarget.channel === "WEBHOOK"
        ? "webhook"
        : "automation";
  return compactName(`${cadenceLabel} ${target.label} ${delivery}`);
}

function compactName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\b(schedule|automation)\s+automation$/i, "automation")
    .trim()
    .slice(0, 80);
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
