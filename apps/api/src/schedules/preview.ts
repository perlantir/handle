const DAY_ALIASES: Record<string, number> = {
  friday: 5,
  monday: 1,
  saturday: 6,
  sunday: 0,
  thursday: 4,
  tuesday: 2,
  wednesday: 3,
};

export interface PreviewInput {
  cronExpression?: string | null;
  runAt?: Date | null;
  timezone?: string;
}

export function nextRunPreview({ cronExpression, runAt, timezone = "America/Chicago" }: PreviewInput) {
  if (runAt) return [runAt.toISOString()];
  const parsed = parseCron(cronExpression ?? "");
  if (!parsed) return [];

  const runs: string[] = [];
  const cursor = new Date();
  cursor.setMinutes(0, 0, 0);
  for (let i = 0; i < 730 && runs.length < 3; i += 1) {
    const candidate = new Date(cursor.getTime() + i * 60 * 60 * 1000);
    if (!matchesCron(candidate, parsed)) continue;
    runs.push(candidate.toISOString());
  }
  return runs;
}

export function humanCron(cronExpression: string | null | undefined) {
  const parsed = parseCron(cronExpression ?? "");
  if (!parsed) return cronExpression ?? "Custom schedule";
  const time = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
  if (parsed.weekday === "1-5") return `Weekdays at ${time}`;
  if (/^[0-6]$/.test(parsed.weekday)) {
    const name = Object.entries(DAY_ALIASES).find(([, value]) => String(value) === parsed.weekday)?.[0] ?? "day";
    return `Every ${name} at ${time}`;
  }
  if (parsed.day !== "*") return `Monthly on day ${parsed.day} at ${time}`;
  return `Daily at ${time}`;
}

interface ParsedCron {
  day: string;
  hour: number;
  minute: number;
  month: string;
  weekday: string;
}

function parseCron(value: string): ParsedCron | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minuteRaw, hourRaw, day = "*", month = "*", weekday = "*"] = parts;
  const minute = Number.parseInt(minuteRaw ?? "", 10);
  const hour = Number.parseInt(hourRaw ?? "", 10);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return { day, hour, minute, month, weekday };
}

function matchesCron(date: Date, cron: ParsedCron) {
  if (date.getMinutes() !== cron.minute || date.getHours() !== cron.hour) return false;
  if (cron.day !== "*" && Number.parseInt(cron.day, 10) !== date.getDate()) return false;
  if (cron.month !== "*" && Number.parseInt(cron.month, 10) !== date.getMonth() + 1) return false;
  if (cron.weekday === "*") return true;
  if (cron.weekday === "1-5") return date.getDay() >= 1 && date.getDay() <= 5;
  if (cron.weekday.includes(",")) return cron.weekday.split(",").includes(String(date.getDay()));
  return Number.parseInt(cron.weekday, 10) === date.getDay();
}
