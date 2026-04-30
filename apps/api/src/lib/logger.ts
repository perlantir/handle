import { homedir } from 'node:os';
import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { redactSecrets } from './redact';

function expandHome(path: string) {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

const logDir = expandHome(process.env.HANDLE_LOG_DIR ?? '~/Library/Logs/Handle');
const logFile = join(logDir, 'api.log');
const pinoRollCurrentLog = join(logDir, 'current.log');

function ensureStableLogPath() {
  mkdirSync(logDir, { recursive: true });

  try {
    const stats = lstatSync(logFile);

    if (!stats.isSymbolicLink()) return;
    if (readlinkSync(logFile) === 'current.log') return;

    unlinkSync(logFile);
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? err.code : null;

    if (code !== 'ENOENT') throw err;
  }

  symlinkSync('current.log', logFile);
}

ensureStableLogPath();

const transport = pino.transport({
  target: 'pino-roll',
  options: {
    file: logFile,
    limit: { count: 5, removeOtherLogFiles: true },
    mkdir: true,
    size: '10m',
    symlink: true,
  },
});

export function getLogFilePath() {
  return logFile;
}

export function getPinoRollCurrentLogPath() {
  return pinoRollCurrentLog;
}

export const logger = pino(
  {
    hooks: {
      logMethod(args, method) {
        const redacted = args.map((arg) => (typeof arg === 'string' ? redactSecrets(arg) : arg));
        return method.apply(this, redacted as [unknown, string | undefined, ...unknown[]]);
      },
    },
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      censor: '[REDACTED]',
      paths: [
        '*.apiKey',
        '*.api_key',
        '*.secret',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.credential',
        '*.authorization',
        'req.headers.authorization',
      ],
    },
  },
  transport,
);
