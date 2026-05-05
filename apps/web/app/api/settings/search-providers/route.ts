import type { NextRequest } from "next/server";
import { proxyHandleApiRequest } from "@/lib/handleApiProxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.search;
  return proxyHandleApiRequest(
    request,
    `/api/settings/search-providers${query}`,
    "GET",
  );
}
