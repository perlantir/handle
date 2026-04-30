import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import express from 'express';
import { requireClerkAuth } from './auth/clerkMiddleware';
import { corsAllowedHeaders, corsMethods, corsOptions, corsOrigins } from './lib/cors';
import { getLogFilePath, logger } from './lib/logger';
import { approvalsRouter } from './routes/approvals';
import { healthRouter } from './routes/health';
import { streamRouter } from './routes/stream';
import { tasksRouter } from './routes/tasks';

export async function createServer() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  logger.info(
    { allowedHeaders: corsAllowedHeaders, credentials: true, methods: corsMethods, origins: corsOrigins },
    'CORS configured',
  );
  app.use(cors(corsOptions));

  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, 'request');
    next();
  });

  app.use('/health', healthRouter);

  app.use('/api', clerkMiddleware(), requireClerkAuth);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/tasks', streamRouter);
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
