import type { NextRequest } from "next/server";
import { proxyHandleApiRequest } from "@/lib/handleApiProxy";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyHandleApiRequest(
    request,
    `/api/settings/providers/${encodeURIComponent(id)}/key`,
    "POST",
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyHandleApiRequest(
    request,
    `/api/settings/providers/${encodeURIComponent(id)}/key`,
    "DELETE",
  );
}
