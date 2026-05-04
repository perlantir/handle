import type { NextRequest } from "next/server";
import { proxyHandleApiRequest } from "@/lib/handleApiProxy";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> },
) {
  const { connectorId } = await params;
  return proxyHandleApiRequest(
    request,
    `/api/settings/integrations/${encodeURIComponent(connectorId)}/oauth-app`,
    "POST",
  );
}
