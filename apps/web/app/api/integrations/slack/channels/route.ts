import type { NextRequest } from "next/server";
import { proxyHandleApiRequest } from "@/lib/handleApiProxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyHandleApiRequest(request, "/api/integrations/slack/channels", "GET");
}
