import 'dotenv/config';
import { createServer } from './server';
import { initBuildInfo } from './lib/buildInfo';
import { logger } from './lib/logger';

async function main() {
  await initBuildInfo();

  const port = Number.parseInt(process.env.HANDLE_API_PORT ?? '3001', 10);
  const host = process.env.HANDLE_API_HOST ?? '127.0.0.1';
  const app = await createServer();

  const server = app.listen(port, host, () => {
    logger.info({ host, port }, 'Handle API listening');
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }

      process.exit();
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
