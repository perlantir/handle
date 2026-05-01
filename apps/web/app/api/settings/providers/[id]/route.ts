import type { NextRequest } from "next/server";
import { proxyHandleApiRequest } from "@/lib/handleApiProxy";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyHandleApiRequest(
    request,
    `/api/settings/providers/${encodeURIComponent(id)}`,
    "PUT",
  );
}
