import type { CreateTaskResponse } from '@handle/shared';

const apiBaseUrl = process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? 'http://127.0.0.1:3001';

interface CreateTaskInput {
  goal: string;
  token: string | null;
}

export async function createTask({ goal, token }: CreateTaskInput): Promise<CreateTaskResponse> {
  if (!token) throw new Error('Missing Clerk session token');

  const response = await fetch(`${apiBaseUrl}/api/tasks`, {
    body: JSON.stringify({ goal }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = typeof body?.error === 'string' ? body.error : 'Failed to create task';
    throw new Error(message);
  }

  return response.json() as Promise<CreateTaskResponse>;
}
