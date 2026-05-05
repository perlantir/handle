import type { NextRequest } from "next/server";
import { proxyHandleApiRequest } from "@/lib/handleApiProxy";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await params;
  return proxyHandleApiRequest(
    request,
    `/api/settings/voice/providers/${encodeURIComponent(providerId)}/key`,
    "DELETE",
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await params;
  return proxyHandleApiRequest(
    request,
    `/api/settings/voice/providers/${encodeURIComponent(providerId)}/key`,
    "POST",
  );
}
