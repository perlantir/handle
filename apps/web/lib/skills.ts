import type {
  CreateSkillRequest,
  CreateSkillScheduleRequest,
  CreateSkillWorkflowRequest,
  RunSkillRequest,
  RunSkillResponse,
  SkillImportBundle,
  SkillDetail,
  SkillScheduleSummary,
  SkillRunDetail,
  SkillRunSummary,
  SkillSummary,
  SkillWorkflowRunSummary,
  SkillWorkflowSummary,
  UpdateSkillRequest,
} from "@handle/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";

async function parseApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

function authHeaders(token: string | null) {
  if (!token) throw new Error("Missing Clerk session token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function listSkills({
  projectId,
  q,
  token,
}: {
  projectId?: string;
  q?: string;
  token: string | null;
}) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (q) params.set("q", q);
  const response = await fetch(`${apiBaseUrl}/api/skills${params.size ? `?${params.toString()}` : ""}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load Skills"));
  const body = (await response.json()) as { skills?: SkillSummary[] };
  return body.skills ?? [];
}

export async function getSkill({
  skillId,
  token,
}: {
  skillId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skills/${encodeURIComponent(skillId)}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load Skill"));
  const body = (await response.json()) as { skill?: SkillDetail };
  if (!body.skill) throw new Error("Skill detail response was empty");
  return body.skill;
}

export async function runSkill({
  input,
  skillId,
  token,
}: {
  input: RunSkillRequest;
  skillId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skills/${encodeURIComponent(skillId)}/run`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Skill run failed"));
  const body = (await response.json()) as RunSkillResponse;
  return body.run;
}

export async function listSkillRuns({
  skillId,
  token,
}: {
  skillId?: string;
  token: string | null;
}) {
  const params = new URLSearchParams();
  if (skillId) params.set("skillId", skillId);
  const response = await fetch(`${apiBaseUrl}/api/skill-runs${params.size ? `?${params.toString()}` : ""}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load Skill runs"));
  const body = (await response.json()) as { runs?: SkillRunSummary[] };
  return body.runs ?? [];
}

export async function getSkillRun({
  runId,
  token,
}: {
  runId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skill-runs/${encodeURIComponent(runId)}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load Skill run"));
  const body = (await response.json()) as { run?: SkillRunDetail };
  if (!body.run) throw new Error("Skill run detail response was empty");
  return body.run;
}

export async function decideSkillRunSendApproval({
  decision,
  runId,
  token,
}: {
  decision: "approved" | "denied";
  runId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skill-runs/${encodeURIComponent(runId)}/send-approval`, {
    body: JSON.stringify({ decision }),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to record send approval"));
  return response.json() as Promise<{ decision: "approved" | "denied"; sentCount: number }>;
}

export async function createSkill({
  input,
  token,
}: {
  input: CreateSkillRequest;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skills`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create Skill"));
  const body = (await response.json()) as { skill?: SkillDetail };
  if (!body.skill) throw new Error("Create Skill response was empty");
  return body.skill;
}

export async function updateSkill({
  input,
  skillId,
  token,
}: {
  input: UpdateSkillRequest;
  skillId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skills/${encodeURIComponent(skillId)}`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "PUT",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to update Skill"));
  const body = (await response.json()) as { skill?: SkillDetail };
  if (!body.skill) throw new Error("Update Skill response was empty");
  return body.skill;
}

export async function exportSkill({
  skillId,
  token,
}: {
  skillId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skills/${encodeURIComponent(skillId)}/export`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to export Skill"));
  const body = (await response.json()) as { bundle?: SkillImportBundle };
  if (!body.bundle) throw new Error("Export Skill response was empty");
  return body.bundle;
}

export async function importSkill({
  bundle,
  token,
}: {
  bundle: SkillImportBundle;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skills/import`, {
    body: JSON.stringify({ bundle, sourceName: "skills-ui-import.json" }),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to import Skill"));
  const body = (await response.json()) as { skill?: SkillDetail };
  if (!body.skill) throw new Error("Import Skill response was empty");
  return body.skill;
}

export async function listSkillWorkflows({ token }: { token: string | null }) {
  const response = await fetch(`${apiBaseUrl}/api/skill-workflows`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load Skill workflows"));
  const body = (await response.json()) as { workflows?: SkillWorkflowSummary[] };
  return body.workflows ?? [];
}

export async function createSkillWorkflow({
  input,
  token,
}: {
  input: CreateSkillWorkflowRequest;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skill-workflows`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create Skill workflow"));
  const body = (await response.json()) as { workflow?: SkillWorkflowSummary };
  if (!body.workflow) throw new Error("Create Skill workflow response was empty");
  return body.workflow;
}

export async function runSkillWorkflow({
  workflowId,
  token,
}: {
  workflowId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skill-workflows/${encodeURIComponent(workflowId)}/run`, {
    body: JSON.stringify({}),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to run Skill workflow"));
  const body = (await response.json()) as { run?: SkillWorkflowRunSummary };
  if (!body.run) throw new Error("Run Skill workflow response was empty");
  return body.run;
}

export async function listSkillSchedules({ token }: { token: string | null }) {
  const response = await fetch(`${apiBaseUrl}/api/skill-schedules`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to load Skill schedules"));
  const body = (await response.json()) as { schedules?: SkillScheduleSummary[] };
  return body.schedules ?? [];
}

export async function createSkillSchedule({
  input,
  token,
}: {
  input: CreateSkillScheduleRequest;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skill-schedules`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create Skill schedule"));
  const body = (await response.json()) as { schedule?: SkillScheduleSummary };
  if (!body.schedule) throw new Error("Create Skill schedule response was empty");
  return body.schedule;
}

export async function runSkillScheduleNow({
  scheduleId,
  token,
}: {
  scheduleId: string;
  token: string | null;
}) {
  const response = await fetch(`${apiBaseUrl}/api/skill-schedules/${encodeURIComponent(scheduleId)}/run-now`, {
    body: JSON.stringify({}),
    headers: authHeaders(token),
    method: "POST",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to run Skill schedule"));
  const body = (await response.json()) as RunSkillResponse;
  return body.run;
}
