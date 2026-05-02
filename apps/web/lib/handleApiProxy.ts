import type { NextRequest } from "next/server";
import { getHandleServerToken } from "@/lib/serverAuth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";

function upstreamUrl(path: string) {
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}

function responseHeaders(upstream: Response) {
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const cacheControl = upstream.headers.get("cache-control");

  if (contentType) headers.set("Content-Type", contentType);
  if (cacheControl) headers.set("Cache-Control", cacheControl);

  return headers;
}

export async function proxyHandleApiRequest(
  request: NextRequest,
  path: string,
  method: "DELETE" | "GET" | "POST" | "PUT",
) {
  const token = await getHandleServerToken();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const requestInit: RequestInit = {
    cache: "no-store",
    headers,
    method,
  };

  if (method === "POST" || method === "PUT") {
    requestInit.body = await request.text();
  }

  const upstream = await fetch(upstreamUrl(path), requestInit);

  return new Response(upstream.body, {
    headers: responseHeaders(upstream),
    status: upstream.status,
  });
}
