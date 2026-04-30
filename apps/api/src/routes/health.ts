import { Router } from 'express';
import type { HealthResponse } from '@handle/shared';
import { getBuildInfo } from '../lib/buildInfo';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const response: HealthResponse = {
    service: 'handle-api',
    status: 'ok',
    build: getBuildInfo(),
    timestamp: new Date().toISOString(),
  };

  res.json(response);
});
