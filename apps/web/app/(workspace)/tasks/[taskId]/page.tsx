import type { TaskDetailResponse } from "@handle/shared";
import { WorkspaceScreen } from "@/components/workspace/WorkspaceScreen";
import { getHandleServerToken } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const apiBaseUrl =
  process.env.HANDLE_API_BASE_URL ??
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ??
  "http://127.0.0.1:3001";

async function loadTask(taskId: string): Promise<TaskDetailResponse | null> {
  const token = await getHandleServerToken();
  if (!token) return null;

  const response = await fetch(`${apiBaseUrl}/api/tasks/${taskId}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;

  return response.json() as Promise<TaskDetailResponse>;
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const initialTask = await loadTask(taskId);

  return <WorkspaceScreen initialTask={initialTask} taskId={taskId} />;
}
