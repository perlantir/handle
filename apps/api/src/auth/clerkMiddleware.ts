import { getAuth } from '@clerk/express';
import type { Request, RequestHandler } from 'express';

export function getAuthenticatedUserId(req: Request) {
  const auth = getAuth(req);
  return auth.userId ?? null;
}

export const requireClerkAuth: RequestHandler = (req, res, next) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
};
