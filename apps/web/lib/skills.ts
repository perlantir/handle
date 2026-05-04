import type {
  RunSkillRequest,
  RunSkillResponse,
  SkillDetail,
  SkillRunDetail,
  SkillRunSummary,
  SkillSummary,
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
