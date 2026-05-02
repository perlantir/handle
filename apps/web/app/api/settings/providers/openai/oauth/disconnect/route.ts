import type { NextRequest } from "next/server";
import { proxyHandleApiRequest } from "@/lib/handleApiProxy";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  return proxyHandleApiRequest(
    request,
    "/api/settings/providers/openai/oauth/disconnect",
    "DELETE",
  );
}
