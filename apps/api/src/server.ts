import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import express from 'express';
import { requireClerkAuth } from './auth/clerkMiddleware';
import { getLogFilePath, logger } from './lib/logger';
import { healthRouter } from './routes/health';

export async function createServer() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(
    cors({
      credentials: true,
      origin: ['http://localhost:3000'],
    }),
  );

  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, 'request');
    next();
  });

  app.use('/health', healthRouter);

  app.use('/api', clerkMiddleware(), requireClerkAuth);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err, url: req.url }, 'unhandled error');
    res.status(500).json({
      error: 'Internal server error',
      logPath: getLogFilePath(),
    });
  });

  return app;
}
