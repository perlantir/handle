"use client";

import { useMemo, useState } from "react";

type Frequency = "custom" | "daily" | "hourly" | "monthly" | "once" | "weekdays" | "weekly";

const days = [
  { label: "Sun", value: "0" },
  { label: "Mon", value: "1" },
  { label: "Tue", value: "2" },
  { label: "Wed", value: "3" },
  { label: "Thu", value: "4" },
  { label: "Fri", value: "5" },
  { label: "Sat", value: "6" },
];

interface FrequencyBuilderProps {
  label?: string;
  onChange: (value: string) => void;
  value: string;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function splitTime(value: string) {
  const [hour = "09", minute = "00"] = value.split(":");
  return {
    hour: Number.parseInt(hour, 10) || 9,
    minute: Number.parseInt(minute, 10) || 0,
  };
}

function cronFor({
  dayOfMonth,
  frequency,
  onceAt,
  selectedDays,
  time,
}: {
  dayOfMonth: string;
  frequency: Frequency;
  onceAt: string;
  selectedDays: string[];
  time: string;
}) {
  const { hour, minute } = splitTime(time);
  if (frequency === "hourly") return "0 * * * *";
  if (frequency === "daily") return `${minute} ${hour} * * *`;
  if (frequency === "weekdays") return `${minute} ${hour} * * 1-5`;
  if (frequency === "weekly") return `${minute} ${hour} * * ${selectedDays.length ? selectedDays.join(",") : "1"}`;
  if (frequency === "monthly") return `${minute} ${hour} ${Number.parseInt(dayOfMonth, 10) || 1} * *`;
  if (frequency === "once") return onceAt ? `once:${onceAt}` : "once:";
  return "";
}

function labelForValue(value: string): Frequency {
  if (value.startsWith("once:")) return "once";
  if (value === "0 * * * *") return "hourly";
  if (/^\d+ \d+ \* \* 1-5$/.test(value)) return "weekdays";
  if (/^\d+ \d+ \* \* [0-6](,[0-6])*$/.test(value)) return "weekly";
  if (/^\d+ \d+ \d+ \* \*$/.test(value)) return "monthly";
  if (/^\d+ \d+ \* \* \*$/.test(value)) return "daily";
  return "custom";
}

function nextPreview(frequency: Frequency, time: string, timezone: string) {
  const { hour, minute } = splitTime(time);
  const now = new Date();
  const examples = Array.from({ length: 3 }, (_, index) => {
    const next = new Date(now);
    next.setDate(now.getDate() + index + 1);
    next.setHours(hour, minute, 0, 0);
    return next.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    });
  });
  if (frequency === "hourly") return "Next 3 runs: at the top of the next 3 hours";
  if (frequency === "custom") return "Next runs appear after saving the custom expression.";
  if (frequency === "once") return "Runs once at the selected date and time.";
  return `Next 3 runs: ${examples.join(", ")}`;
}

export function FrequencyBuilder({ label = "Schedule", onChange, value }: FrequencyBuilderProps) {
  const initialFrequency = labelForValue(value);
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency);
  const [custom, setCustom] = useState(value.startsWith("once:") ? "" : value);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [onceAt, setOnceAt] = useState(value.startsWith("once:") ? value.slice(5) : "");
  const [selectedDays, setSelectedDays] = useState<string[]>(["1"]);
  const [time, setTime] = useState("09:00");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const preview = useMemo(() => nextPreview(frequency, time, timezone), [frequency, time, timezone]);

  function updateFrequency(nextFrequency: Frequency) {
    setFrequency(nextFrequency);
    if (nextFrequency === "custom") {
      onChange(custom);
      return;
    }
    onChange(cronFor({ dayOfMonth, frequency: nextFrequency, onceAt, selectedDays, time }));
  }

  function updateSchedule(next: {
    dayOfMonth?: string;
    onceAt?: string;
    selectedDays?: string[];
    time?: string;
  }) {
    const nextDay = next.dayOfMonth ?? dayOfMonth;
    const nextOnce = next.onceAt ?? onceAt;
    const nextSelected = next.selectedDays ?? selectedDays;
    const nextTime = next.time ?? time;
    if (next.dayOfMonth !== undefined) setDayOfMonth(next.dayOfMonth);
    if (next.onceAt !== undefined) setOnceAt(next.onceAt);
    if (next.selectedDays !== undefined) setSelectedDays(next.selectedDays);
    if (next.time !== undefined) setTime(next.time);
    if (frequency !== "custom") {
      onChange(cronFor({
        dayOfMonth: nextDay,
        frequency,
        onceAt: nextOnce,
        selectedDays: nextSelected,
        time: nextTime,
      }));
    }
  }

  return (
    <div className="grid gap-3 rounded-[10px] border border-border-subtle bg-bg-canvas p-3">
      <div className="text-[11.5px] font-medium text-text-secondary">{label}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
          Frequency
          <select
            aria-label={`${label} frequency`}
            className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
            onChange={(event) => updateFrequency(event.target.value as Frequency)}
            value={frequency}
          >
            <option value="once">Once</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays only</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom cron</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
          Timezone
          <input
            aria-label={`${label} timezone`}
            className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
            onChange={(event) => setTimezone(event.target.value)}
            value={timezone}
          />
        </label>
      </div>

      {frequency === "custom" ? (
        <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
          Cron expression
          <input
            aria-label={`${label} custom cron`}
            className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 font-mono text-[12.5px] text-text-primary outline-none"
            onChange={(event) => {
              setCustom(event.target.value);
              onChange(event.target.value);
            }}
            placeholder="0 9 * * 1-5"
            value={custom}
          />
          <span className="font-normal text-text-tertiary">Minute hour day month weekday.</span>
        </label>
      ) : null}

      {frequency !== "custom" && frequency !== "hourly" && frequency !== "once" ? (
        <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
          Time
          <input
            aria-label={`${label} time`}
            className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
            onChange={(event) => updateSchedule({ time: event.target.value })}
            type="time"
            value={time}
          />
        </label>
      ) : null}

      {frequency === "once" ? (
        <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
          Run at
          <input
            aria-label={`${label} run once at`}
            className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
            onChange={(event) => updateSchedule({ onceAt: event.target.value })}
            type="datetime-local"
            value={onceAt}
          />
        </label>
      ) : null}

      {frequency === "weekly" ? (
        <div className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
          Days
          <div className="flex flex-wrap gap-1.5">
            {days.map((day) => (
              <button
                className={`rounded-pill border px-2 py-1 text-[11px] ${selectedDays.includes(day.value) ? "border-accent bg-accent/10 text-accent" : "border-border-subtle bg-bg-surface text-text-secondary"}`}
                key={day.value}
                onClick={() => {
                  const next = selectedDays.includes(day.value)
                    ? selectedDays.filter((item) => item !== day.value)
                    : [...selectedDays, day.value].sort();
                  updateSchedule({ selectedDays: next.length ? next : [day.value] });
                }}
                type="button"
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {frequency === "monthly" ? (
        <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
          Day of month
          <input
            aria-label={`${label} day of month`}
            className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
            max={31}
            min={1}
            onChange={(event) => updateSchedule({ dayOfMonth: event.target.value })}
            type="number"
            value={dayOfMonth}
          />
        </label>
      ) : null}

      <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-[11.5px] text-text-tertiary">
        {preview}
      </div>
    </div>
  );
}
