import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const canonicalWebOrigin = (
  process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");
const signInUrl = `${canonicalWebOrigin}/sign-in`;
const signUpUrl = `${canonicalWebOrigin}/sign-up`;
const testAuthBypassEnabled =
  process.env.HANDLE_TEST_AUTH_BYPASS === "1" &&
  process.env.NODE_ENV !== "production";

const handleClerkMiddleware = clerkMiddleware(
  async (auth) => {
    await auth.protect({
      unauthenticatedUrl: signInUrl,
    });
  },
  {
    frontendApiProxy: { enabled: false },
    signInUrl,
    signUpUrl,
  },
);

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (testAuthBypassEnabled) {
    return NextResponse.next();
  }

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  return handleClerkMiddleware(req, event);
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
