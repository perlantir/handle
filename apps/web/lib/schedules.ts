import type {
  CreateScheduleRequest,
  ParsedSchedulePreview,
  ScheduleRunDetail,
  ScheduleRunSummary,
  ScheduleSummary,
  ScheduleTemplateSummary,
  UpdateScheduleRequest,
} from "@handle/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";

function authHeaders(token: string | null) {
  if (!token) throw new Error("Missing Clerk session token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function parseApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

export async function listSchedules({ token }: { token: string | null }) {
  const response = await fetch(`${apiBaseUrl}/api/schedules`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load schedules"));
  const body = (await response.json()) as { schedules?: ScheduleSummary[] };
  return body.schedules ?? [];
}

export async function listScheduleTemplates({ token }: { token: string | null }) {
  const response = await fetch(`${apiBaseUrl}/api/schedule-templates`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load schedule templates"));
  const body = (await response.json()) as { templates?: ScheduleTemplateSummary[] };
  return body.templates ?? [];
}

export async function createSchedule({
  input,
  token,
}: {
  input: CreateScheduleRequest;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/schedules`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create schedule"));
  const body = (await response.json()) as { schedule?: ScheduleSummary };
  if (!body.schedule) throw new Error("Create schedule response was empty");
  return body.schedule;
}

export async function updateSchedule({
  input,
  scheduleId,
  token,
}: {
  input: UpdateScheduleRequest;
  scheduleId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/schedules/${encodeURIComponent(scheduleId)}`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "PUT",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update schedule"));
  const body = (await response.json()) as { schedule?: ScheduleSummary };
  if (!body.schedule) throw new Error("Update schedule response was empty");
  return body.schedule;
}

export async function deleteSchedule({
  scheduleId,
  token,
}: {
  scheduleId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/schedules/${encodeURIComponent(scheduleId)}`, {
    headers: authHeaders(token),
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to delete schedule"));
  const body = (await response.json()) as { schedule?: ScheduleSummary };
  if (!body.schedule) throw new Error("Delete schedule response was empty");
  return body.schedule;
}

export async function runScheduleNow({
  mode = "normal",
  scheduleId,
  token,
}: {
  mode?: "normal" | "test";
  scheduleId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/schedules/${encodeURIComponent(scheduleId)}/run-now`, {
    body: JSON.stringify({ mode }),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to run schedule"));
  const body = (await response.json()) as { run?: ScheduleRunSummary };
  if (!body.run) throw new Error("Run schedule response was empty");
  return body.run;
}

export async function backfillSchedule({
  from,
  maxRuns,
  scheduleId,
  to,
  token,
}: {
  from: string;
  maxRuns?: number;
  scheduleId: string;
  to: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/schedules/${encodeURIComponent(scheduleId)}/backfill`, {
    body: JSON.stringify({ from, maxRuns, to }),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to backfill schedule"));
  const body = (await response.json()) as { runs?: ScheduleRunSummary[] };
  return body.runs ?? [];
}

export async function parseScheduleText({
  text,
  timezone,
  token,
}: {
  text: string;
  timezone?: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/schedules/parse`, {
    body: JSON.stringify({ text, timezone }),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to parse schedule"));
  const body = (await response.json()) as { preview?: ParsedSchedulePreview };
  if (!body.preview) throw new Error("Schedule parser response was empty");
  return body.preview;
}

export async function getScheduleRun({
  runId,
  token,
}: {
  runId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/schedule-runs/${encodeURIComponent(runId)}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load schedule run"));
  const body = (await response.json()) as { run?: ScheduleRunDetail };
  if (!body.run) throw new Error("Schedule run response was empty");
  return body.run;
}
