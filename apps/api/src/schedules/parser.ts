import type { ParsedSchedulePreview } from "@handle/shared";
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
  return { confidence, cronExpression, explanation, nextRuns, runAt, timezone };
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
