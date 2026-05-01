import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

export const TEST_AUTH_BYPASS_USER_ID = "user-smoke-e2e";

export function isTestAuthBypassEnabled() {
  return (
    process.env.HANDLE_TEST_AUTH_BYPASS === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

export function getAuthenticatedUserId(req: Request) {
  if (isTestAuthBypassEnabled()) {
    return (
      req.header("x-handle-test-user-id")?.trim() || TEST_AUTH_BYPASS_USER_ID
    );
  }

  const auth = getAuth(req);
  return auth.userId ?? null;
}

export const requireClerkAuth: RequestHandler = (req, res, next) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
};
