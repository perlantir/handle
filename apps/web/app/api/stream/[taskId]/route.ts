import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';

const apiBaseUrl = process.env.HANDLE_API_BASE_URL ?? process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? 'http://127.0.0.1:3001';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return new Response('Unauthorized', { status: 401 });

  const { taskId } = await params;
  const upstream = await fetch(`${apiBaseUrl}/api/tasks/${taskId}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!upstream.ok) {
    return new Response(upstream.body, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    },
  });
}
