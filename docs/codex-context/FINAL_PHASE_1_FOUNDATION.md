# Handle — Phase 1: Foundation (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
and FINAL_ROADMAP.md before starting.

==================================================
GOAL
==================================================

Deliver Handle's foundation: a working personal-use agent product
with the design system fully implemented, Clerk auth, OpenAI as the
single provider (multi-provider comes in Phase 2), E2B sandbox,
Live Workspace screen, basic tools, and SSE streaming.

User signs in via Clerk, opens the Workspace screen, submits a
goal, watches the agent plan and execute via E2B with full design-
system fidelity, sees streaming tool output, and receives a final
answer.

Phase 1 ships in 2-3 weeks.

==================================================
CANONICAL TASK
==================================================

Phase 1's gate is completing this task end-to-end:

> "Write a Python script that fetches the top 10 Hacker News
> stories from https://news.ycombinator.com and saves them as
> JSON to /tmp/hn.json, then run the script once and show me the
> contents."

The agent should:
1. Plan the steps (write file, execute file, show output)
2. Use file.write to create the script
3. Use shell.exec to run it
4. Use file.read to show the output
5. Reply with a summary

==================================================
ARCHITECTURE OVERVIEW
==================================================

```
┌─────────────────────────────────────────┐
│  Browser (localhost:3000)               │
│  Next.js + React + Tailwind             │
│  Clerk auth on every request            │
│  Design system: tokens + components     │
└────────┬────────────────────────────────┘
         │ HTTP + SSE
         │ Clerk session token
┌────────▼────────────────────────────────┐
│  Express backend (localhost:3001)       │
│  Clerk middleware on all routes         │
│  Pino logging with redaction            │
│  ┌─────────────────────────────────┐    │
│  │ LangChain Agent (OpenAI Tools)  │    │
│  └────┬────────────────────────────┘    │
│  ┌────▼────────┐                        │
│  │ Tool Registry│                       │
│  │ - shell.exec │                       │
│  │ - file.write │                       │
│  │ - file.read  │                       │
│  │ - file.list  │                       │
│  └────┬─────────┘                       │
└───────┼─────────────────────────────────┘
        │
   ┌────▼─────────┐
   │ E2B Sandbox  │
   │ (cloud)      │
   └──────────────┘
```

==================================================
REPO STRUCTURE (PHASE 1 STARTING POINT)
==================================================

```
Handle/
├── apps/
│   ├── web/                              # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/                   # Clerk-handled routes
│   │   │   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   │   │   └── sign-up/[[...sign-up]]/page.tsx
│   │   │   ├── (workspace)/              # Authenticated routes
│   │   │   │   ├── layout.tsx            # Sidebar shell
│   │   │   │   ├── page.tsx              # Home (Screen 01)
│   │   │   │   └── tasks/
│   │   │   │       └── [taskId]/
│   │   │   │           └── page.tsx      # Workspace (Screen 03)
│   │   │   ├── api/
│   │   │   │   └── stream/
│   │   │   │       └── [taskId]/
│   │   │   │           └── route.ts      # SSE proxy
│   │   │   ├── layout.tsx                # Root with ClerkProvider
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── design-system/            # Tokens-driven primitives
│   │   │   │   ├── PillButton.tsx
│   │   │   │   ├── StatusDot.tsx
│   │   │   │   ├── PlanStep.tsx
│   │   │   │   ├── ApprovalPill.tsx
│   │   │   │   ├── ModePill.tsx
│   │   │   │   ├── Composer.tsx
│   │   │   │   ├── ContinueCard.tsx
│   │   │   │   ├── SidebarNavItem.tsx
│   │   │   │   ├── SidebarSectionLabel.tsx
│   │   │   │   ├── Toggle.tsx
│   │   │   │   ├── StatusBar.tsx
│   │   │   │   ├── InspectorBlock.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── ProviderCard.tsx
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   └── index.ts
│   │   │   ├── workspace/
│   │   │   │   ├── WorkspaceLayout.tsx
│   │   │   │   ├── StatusBarHeader.tsx
│   │   │   │   ├── LeftPane.tsx
│   │   │   │   ├── ChatTab.tsx
│   │   │   │   ├── PlanTab.tsx
│   │   │   │   ├── TimelineTab.tsx
│   │   │   │   ├── CenterPane.tsx
│   │   │   │   ├── BrowserTab.tsx
│   │   │   │   ├── TerminalTab.tsx
│   │   │   │   ├── PreviewTab.tsx
│   │   │   │   ├── RightInspector.tsx
│   │   │   │   ├── BottomComposer.tsx
│   │   │   │   └── ApprovalModal.tsx
│   │   │   ├── home/
│   │   │   │   ├── HomeHero.tsx
│   │   │   │   ├── ModePillRow.tsx
│   │   │   │   ├── HomeComposer.tsx
│   │   │   │   ├── SuggestionChips.tsx
│   │   │   │   └── ContinueBand.tsx
│   │   │   ├── shell/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── TopBar.tsx
│   │   │   │   └── MacWindow.tsx
│   │   │   └── ui/                       # shadcn/ui re-exports
│   │   ├── hooks/
│   │   │   ├── useAgentStream.ts
│   │   │   └── useTask.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── utils.ts
│   │   ├── middleware.ts                 # Clerk middleware
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   └── postcss.config.js
│   └── api/                              # Express backend
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── auth/
│       │   │   └── clerkMiddleware.ts
│       │   ├── routes/
│       │   │   ├── tasks.ts
│       │   │   ├── stream.ts
│       │   │   ├── approvals.ts
│       │   │   └── health.ts
│       │   ├── agent/
│       │   │   ├── createAgent.ts
│       │   │   ├── runAgent.ts
│       │   │   ├── prompts.ts
│       │   │   └── tools.ts
│       │   ├── execution/
│       │   │   ├── e2bBackend.ts
│       │   │   └── types.ts
│       │   ├── lib/
│       │   │   ├── logger.ts
│       │   │   ├── redact.ts
│       │   │   ├── eventBus.ts
│       │   │   ├── buildInfo.ts
│       │   │   └── prisma.ts
│       │   └── types.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/                           # Shared types
│   │   ├── src/
│   │   │   ├── types.ts                  # SSE events, etc.
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── design-tokens/                    # From design package
│   │   ├── tokens.json
│   │   ├── tokens.css
│   │   ├── package.json
│   │   └── index.ts
│   └── design-refs/                      # Reference JSX
│       ├── icons.jsx
│       ├── refs/
│       │   ├── home.jsx
│       │   ├── workspace.jsx
│       │   ├── approval.jsx
│       │   └── ...
│       ├── component-specs.md
│       ├── screen-specs.md
│       └── README.md
├── scripts/
│   ├── manual-audit/
│   │   └── phase1-canonical-task.md
│   └── dev-setup.sh
├── docs/
│   ├── codex-context/                    # Spec docs
│   │   ├── FINAL_AGENTS.md
│   │   ├── FINAL_KICKOFF.md
│   │   ├── FINAL_DESIGN_SYSTEM.md
│   │   ├── FINAL_ROADMAP.md
│   │   └── FINAL_PHASE_*.md
│   └── phase-1/                          # Created at SIGNOFF
├── .github/
│   └── workflows/
│       └── ci.yml
├── .env.example
├── .gitignore
├── AGENTS.md                             # Symlink to FINAL_AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

==================================================
DEPENDENCIES
==================================================

Root (workspace):

```
pnpm@^9
typescript@^5.4
@types/node@^20
prettier@^3
eslint@^9
vitest@^1
turbo@^2
```

apps/web:

```
next@^15
react@^18
react-dom@^18
@types/react@^18
@types/react-dom@^18
@clerk/nextjs@^5
tailwindcss@^3
postcss@^8
autoprefixer@^10
clsx@^2
tailwind-merge@^2
class-variance-authority@^0.7
lucide-react@^0.400
@handle/shared@workspace:*
@handle/design-tokens@workspace:*
@handle/design-refs@workspace:*
```

apps/api:

```
express@^4
@types/express@^4
cors@^2
@types/cors@^2
@clerk/backend@^1
@clerk/express@^1
@e2b/sdk@latest    # check current version
@langchain/core@^0.3
@langchain/openai@^0.3
@langchain/community@^0.3
langchain@^0.3
zod@^3
prisma@^5
@prisma/client@^5
pino@^9
pino-pretty@^11
@handle/shared@workspace:*
```

packages/shared, packages/design-tokens, packages/design-refs:
just TypeScript / JSON / JSX, minimal dependencies.

If any version is stale by the time Codex runs this, use the
latest stable.

==================================================
DATABASE SCHEMA (PHASE 1)
==================================================

prisma/schema.prisma:

```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

model User {
  id          String   @id            // Clerk user ID
  email       String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tasks       Task[]
}

model Task {
  id           String      @id @default(cuid())
  userId       String
  status       TaskStatus  @default(RUNNING)
  goal         String
  sandboxId    String?
  backend      String      @default("e2b")  // 'e2b' | 'local'
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  user         User        @relation(fields: [userId], references: [id])
  messages     Message[]
  
  @@index([userId, createdAt])
}

enum TaskStatus {
  RUNNING
  WAITING       // Awaiting approval
  STOPPED       // Completed
  ERROR
  PAUSED
}

model Message {
  id          String      @id @default(cuid())
  taskId      String
  role        Role
  content     String?
  toolCalls   Json?       // LangChain tool call array
  toolCallId  String?     // For TOOL messages
  createdAt   DateTime    @default(now())
  task        Task        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  @@index([taskId, createdAt])
}

enum Role {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}

model ApprovalRequest {
  id          String      @id @default(cuid())
  taskId      String
  type        String      // 'shell_exec' | 'file_write_outside_workspace' | etc.
  payload     Json        // request details (command, path, reason)
  status      String      @default("pending")  // 'pending' | 'approved' | 'denied' | 'timeout'
  createdAt   DateTime    @default(now())
  respondedAt DateTime?
  
  @@index([taskId, status])
}
```

Phase 4 adds Project. Phase 5 adds Memory entities. Phase 6 adds
Integrations. Phase 7 adds Skills. Phase 8 adds Schedules. Phase
10 adds Templates. We migrate gracefully each time.

==================================================
SHARED TYPES
==================================================

packages/shared/src/types.ts:

```typescript
// SSE events streamed from backend to frontend

export type SSEEvent =
  | ThoughtEvent
  | ToolCallEvent
  | ToolStreamEvent
  | ToolResultEvent
  | StatusUpdateEvent
  | MessageEvent
  | ErrorEvent
  | ApprovalRequestEvent
  | PlanUpdateEvent;

export interface ThoughtEvent {
  type: 'thought';
  content: string;
  taskId: string;
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolName: string;
  args: Record<string, unknown>;
  callId: string;
  taskId: string;
}

export interface ToolStreamEvent {
  type: 'tool_stream';
  callId: string;
  channel: 'stdout' | 'stderr';
  content: string;
  taskId: string;
}

export interface ToolResultEvent {
  type: 'tool_result';
  callId: string;
  result: string;
  exitCode?: number;
  error?: string;
  taskId: string;
}

export interface StatusUpdateEvent {
  type: 'status_update';
  status: 'RUNNING' | 'WAITING' | 'STOPPED' | 'ERROR' | 'PAUSED';
  detail?: string;
  taskId: string;
}

export interface MessageEvent {
  type: 'message';
  role: 'assistant';
  content: string;
  taskId: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  taskId: string;
}

export interface ApprovalRequestEvent {
  type: 'approval_request';
  approvalId: string;
  request: ApprovalPayload;
  taskId: string;
}

export interface PlanUpdateEvent {
  type: 'plan_update';
  steps: PlanStep[];
  taskId: string;
}

export interface ApprovalPayload {
  type: 'shell_exec' | 'file_write_outside_workspace' | 'browser_use_actual_chrome' | 'destructive_integration_action';
  command?: string;
  path?: string;
  integration?: string;
  action?: string;
  reason: string;
}

export interface PlanStep {
  id: string;
  title: string;
  state: 'done' | 'active' | 'pending';
  requiresApproval?: boolean;
}

// API request/response types

export interface CreateTaskRequest {
  goal: string;
  backend?: 'e2b' | 'local';     // Phase 4 will use; Phase 1 ignores
}

export interface CreateTaskResponse {
  taskId: string;
}

export interface HealthResponse {
  service: 'handle-api';
  status: 'ok' | 'starting' | 'degraded';
  build: {
    gitCommit: string;
    builtAt: string;
  };
  timestamp: string;
}
```

==================================================
BACKEND IMPLEMENTATION
==================================================

### 1. Server bootstrap (apps/api/src/index.ts)

```typescript
import { createServer } from './server';
import { logger } from './lib/logger';
import { initBuildInfo } from './lib/buildInfo';

async function main() {
  await initBuildInfo();
  const port = parseInt(process.env.HANDLE_API_PORT ?? '3001', 10);
  const host = process.env.HANDLE_API_HOST ?? '127.0.0.1';

  const server = await createServer();

  server.listen(port, host, () => {
    logger.info({ port, host }, 'Handle API listening');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    server.close();
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
```

### 2. Express setup (apps/api/src/server.ts)

```typescript
import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { tasksRouter } from './routes/tasks';
import { streamRouter } from './routes/stream';
import { approvalsRouter } from './routes/approvals';
import { healthRouter } from './routes/health';
import { logger } from './lib/logger';

export async function createServer() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(cors({
    origin: ['http://localhost:3000'],
    credentials: true,
  }));

  app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.url }, 'request');
    next();
  });

  // Public routes
  app.use('/health', healthRouter);

  // Clerk middleware for authenticated routes
  app.use(clerkMiddleware());

  // Authenticated routes
  app.use('/api/tasks', tasksRouter);
  app.use('/api/tasks', streamRouter);
  app.use('/api/tasks', approvalsRouter);

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ err, url: req.url }, 'unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

### 3. Build info (apps/api/src/lib/buildInfo.ts)

```typescript
import { execSync } from 'node:child_process';

export interface BuildInfo {
  gitCommit: string;
  builtAt: string;
}

let buildInfo: BuildInfo | null = null;

export async function initBuildInfo() {
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    gitCommit = 'unknown-not-a-git-repo';
  }

  buildInfo = {
    gitCommit,
    builtAt: new Date().toISOString(),
  };
}

export function getBuildInfo(): BuildInfo {
  if (!buildInfo) {
    throw new Error('buildInfo not initialized');
  }
  return buildInfo;
}
```

### 4. Logger with redaction (apps/api/src/lib/logger.ts)

```typescript
import pino from 'pino';
import { join } from 'node:path';
import { homedir } from 'node:os';

const logDir = process.env.HANDLE_LOG_DIR ?? join(homedir(), 'Library', 'Logs', 'Handle');
const logFile = join(logDir, 'api.log');

const transport = process.env.NODE_ENV === 'production'
  ? pino.destination({ dest: logFile, mkdir: true, sync: false })
  : { target: 'pino-pretty', options: { colorize: true } };

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
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
    censor: '[REDACTED]',
  },
}, transport as any);
```

apps/api/src/lib/redact.ts:

```typescript
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk-ant-[a-zA-Z0-9-_]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g,
  /eyJ[a-zA-Z0-9._-]{20,}/g,
  /[a-fA-F0-9]{40,}/g,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
```

### 5. Health endpoint (apps/api/src/routes/health.ts)

```typescript
import { Router } from 'express';
import { getBuildInfo } from '../lib/buildInfo';
import type { HealthResponse } from '@handle/shared';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  const response: HealthResponse = {
    service: 'handle-api',
    status: 'ok',
    build: getBuildInfo(),
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});
```

### 6. Event bus (apps/api/src/lib/eventBus.ts)

```typescript
import { EventEmitter } from 'node:events';
import type { SSEEvent } from '@handle/shared';

export const taskEventBus = new EventEmitter();
taskEventBus.setMaxListeners(100);

export function emitTaskEvent(event: SSEEvent) {
  taskEventBus.emit(`task:${event.taskId}`, event);
}

export function subscribeToTask(taskId: string, listener: (e: SSEEvent) => void) {
  taskEventBus.on(`task:${taskId}`, listener);
  return () => {
    taskEventBus.off(`task:${taskId}`, listener);
  };
}
```

### 7. SSE streaming (apps/api/src/routes/stream.ts)

```typescript
import { Router } from 'express';
import { getAuth } from '@clerk/express';
import { subscribeToTask } from '../lib/eventBus';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export const streamRouter = Router();

streamRouter.get('/:taskId/stream', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).end();

  const { taskId } = req.params;

  // Verify task belongs to user
  const task = await prisma.task.findUnique({
    where: { id: taskId, userId },
  });
  if (!task) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    res.write(':\n\n');
  }, 15000);

  const unsubscribe = subscribeToTask(taskId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => {
    logger.info({ taskId }, 'SSE client disconnected');
    clearInterval(heartbeat);
    unsubscribe();
  });
});
```

### 8. Tools (apps/api/src/agent/tools.ts)

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Sandbox } from '@e2b/sdk';
import { emitTaskEvent } from '../lib/eventBus';
import { randomUUID } from 'node:crypto';

export interface ToolContext {
  taskId: string;
  sandbox: Sandbox;
}

export function createPhase1Tools(ctx: ToolContext) {
  const shellExec = tool(
    async (input: { command: string }) => {
      const callId = randomUUID();
      emitTaskEvent({
        type: 'tool_call',
        toolName: 'shell.exec',
        args: input,
        callId,
        taskId: ctx.taskId,
      });

      try {
        const proc = await ctx.sandbox.process.start({
          cmd: input.command,
          onStdout: (data: { line: string }) => {
            emitTaskEvent({
              type: 'tool_stream',
              callId,
              channel: 'stdout',
              content: data.line + '\n',
              taskId: ctx.taskId,
            });
          },
          onStderr: (data: { line: string }) => {
            emitTaskEvent({
              type: 'tool_stream',
              callId,
              channel: 'stderr',
              content: data.line + '\n',
              taskId: ctx.taskId,
            });
          },
        });

        await proc.wait();

        const result = {
          exitCode: proc.exitCode,
          stdout: proc.stdout,
          stderr: proc.stderr,
        };

        emitTaskEvent({
          type: 'tool_result',
          callId,
          result: JSON.stringify(result),
          exitCode: proc.exitCode,
          taskId: ctx.taskId,
        });

        return JSON.stringify(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emitTaskEvent({
          type: 'tool_result',
          callId,
          result: '',
          error,
          taskId: ctx.taskId,
        });
        throw err;
      }
    },
    {
      name: 'shell_exec',
      description: 'Execute a bash command in the sandbox. Streams stdout/stderr in real time.',
      schema: z.object({
        command: z.string().describe('The bash command to run'),
      }),
    },
  );

  const fileWrite = tool(
    async (input: { path: string; content: string }) => {
      const callId = randomUUID();
      emitTaskEvent({
        type: 'tool_call',
        toolName: 'file.write',
        args: { path: input.path, contentLength: input.content.length },
        callId,
        taskId: ctx.taskId,
      });

      try {
        await ctx.sandbox.filesystem.write(input.path, input.content);
        const result = `Wrote ${input.content.length} bytes to ${input.path}`;
        emitTaskEvent({ type: 'tool_result', callId, result, taskId: ctx.taskId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emitTaskEvent({ type: 'tool_result', callId, result: '', error, taskId: ctx.taskId });
        throw err;
      }
    },
    {
      name: 'file_write',
      description: 'Write content to a file in the sandbox.',
      schema: z.object({
        path: z.string().describe('Absolute path (e.g., /home/user/script.py)'),
        content: z.string().describe('File content'),
      }),
    },
  );

  const fileRead = tool(
    async (input: { path: string }) => {
      const callId = randomUUID();
      emitTaskEvent({
        type: 'tool_call',
        toolName: 'file.read',
        args: input,
        callId,
        taskId: ctx.taskId,
      });

      try {
        const content = await ctx.sandbox.filesystem.read(input.path);
        emitTaskEvent({ type: 'tool_result', callId, result: content, taskId: ctx.taskId });
        return content;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emitTaskEvent({ type: 'tool_result', callId, result: '', error, taskId: ctx.taskId });
        throw err;
      }
    },
    {
      name: 'file_read',
      description: 'Read the contents of a file in the sandbox.',
      schema: z.object({
        path: z.string().describe('Absolute path to read'),
      }),
    },
  );

  const fileList = tool(
    async (input: { path: string }) => {
      const callId = randomUUID();
      emitTaskEvent({
        type: 'tool_call',
        toolName: 'file.list',
        args: input,
        callId,
        taskId: ctx.taskId,
      });

      try {
        const entries = await ctx.sandbox.filesystem.list(input.path);
        const result = JSON.stringify(entries, null, 2);
        emitTaskEvent({ type: 'tool_result', callId, result, taskId: ctx.taskId });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emitTaskEvent({ type: 'tool_result', callId, result: '', error, taskId: ctx.taskId });
        throw err;
      }
    },
    {
      name: 'file_list',
      description: 'List files and directories at a path in the sandbox.',
      schema: z.object({
        path: z.string().describe('Absolute path to list'),
      }),
    },
  );

  return [shellExec, fileWrite, fileRead, fileList];
}
```

### 9. System prompt (apps/api/src/agent/prompts.ts)

```typescript
export const SYSTEM_PROMPT_VERSION = 'v1';

export const PHASE_1_SYSTEM_PROMPT = `
You are Handle, an autonomous AI agent operating in a sandboxed Linux environment.
You complete tasks iteratively by analyzing the user's goal, making a plan, executing
tools, observing results, and continuing until the goal is met.

<core_rules>
1. You must use tools to interact with the environment.
2. Plan your steps before executing. State your plan in plain text first.
3. After each step, briefly state what you did and what's next.
4. If a tool fails, analyze the error and try a different approach. Do not silently give up.
5. Save large data to files instead of returning it in your text response.
6. When finished, summarize what you accomplished.
</core_rules>

<sandbox_environment>
- OS: Ubuntu 22.04
- User: user (with sudo privileges)
- Home: /home/user
- Pre-installed: Python 3.10, Node.js 20, common Linux tools
- Working directory: /home/user (default), but tools can write anywhere
</sandbox_environment>

<available_tools>
- shell_exec: Run a bash command. Streams stdout/stderr in real time.
- file_write: Write content to a file at an absolute path.
- file_read: Read the contents of a file.
- file_list: List the contents of a directory.
</available_tools>

System prompt version: ${SYSTEM_PROMPT_VERSION}
`.trim();
```

### 10. Agent setup (apps/api/src/agent/createAgent.ts)

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { PHASE_1_SYSTEM_PROMPT } from './prompts';
import { createPhase1Tools, type ToolContext } from './tools';

export async function createPhase1Agent(ctx: ToolContext) {
  const tools = createPhase1Tools(ctx);

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    temperature: 0.7,
    streaming: true,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', PHASE_1_SYSTEM_PROMPT],
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const agent = await createOpenAIToolsAgent({ llm, tools, prompt });

  return new AgentExecutor({
    agent,
    tools,
    maxIterations: 25,
    returnIntermediateSteps: false,
    verbose: false,
  });
}
```

### 11. Run agent (apps/api/src/agent/runAgent.ts)

```typescript
import { Sandbox } from '@e2b/sdk';
import { createPhase1Agent } from './createAgent';
import { emitTaskEvent } from '../lib/eventBus';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export async function runAgent(taskId: string, goal: string) {
  let sandbox: Sandbox | null = null;

  try {
    emitTaskEvent({ type: 'status_update', status: 'RUNNING', taskId });

    sandbox = await Sandbox.create({ template: 'base' });

    await prisma.task.update({
      where: { id: taskId },
      data: { sandboxId: sandbox.id },
    });

    const agent = await createPhase1Agent({ taskId, sandbox });

    const stream = await agent.streamEvents(
      { input: goal, chat_history: [] },
      { version: 'v2' },
    );

    let finalAnswer = '';

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk;
        if (chunk?.content) {
          emitTaskEvent({
            type: 'thought',
            content: chunk.content,
            taskId,
          });
          finalAnswer += chunk.content;
        }
      }

      if (event.event === 'on_chain_end' && event.name === 'AgentExecutor') {
        finalAnswer = event.data?.output?.output ?? finalAnswer;
      }
    }

    await prisma.message.create({
      data: { taskId, role: 'ASSISTANT', content: finalAnswer },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'STOPPED' },
    });

    emitTaskEvent({ type: 'message', role: 'assistant', content: finalAnswer, taskId });
    emitTaskEvent({ type: 'status_update', status: 'STOPPED', taskId });
  } catch (err) {
    logger.error({ err, taskId }, 'Agent run failed');
    const message = err instanceof Error ? err.message : String(err);

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'ERROR' },
    }).catch(() => {});

    emitTaskEvent({ type: 'error', message, taskId });
    emitTaskEvent({ type: 'status_update', status: 'ERROR', taskId });
  } finally {
    if (sandbox) {
      await sandbox.kill().catch((err) => {
        logger.warn({ err }, 'Failed to kill sandbox');
      });
    }
  }
}
```

### 12. Tasks endpoint (apps/api/src/routes/tasks.ts)

```typescript
import { Router } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { runAgent } from '../agent/runAgent';
import { logger } from '../lib/logger';

export const tasksRouter = Router();

const createTaskSchema = z.object({
  goal: z.string().min(1).max(10000),
});

tasksRouter.post('/', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error });
  }

  // Ensure user exists in our DB
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: '' },  // Email synced from Clerk later
    update: {},
  });

  const task = await prisma.task.create({
    data: {
      userId,
      goal: parsed.data.goal,
      messages: {
        create: { role: 'USER', content: parsed.data.goal },
      },
    },
  });

  runAgent(task.id, parsed.data.goal).catch((err) => {
    logger.error({ err, taskId: task.id }, 'runAgent unhandled rejection');
  });

  res.json({ taskId: task.id });
});

tasksRouter.get('/:id', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).end();

  const task = await prisma.task.findUnique({
    where: { id: req.params.id, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});
```

==================================================
FRONTEND IMPLEMENTATION
==================================================

### 1. Clerk middleware (apps/web/middleware.ts)

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) auth().protect();
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

### 2. Root layout (apps/web/app/layout.tsx)

```tsx
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata = {
  title: 'Handle',
  description: 'Personal AI agent',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-bg-canvas text-text-primary font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

### 3. Workspace shell (apps/web/app/(workspace)/layout.tsx)

Implements Sidebar (244px) + main content area, per Screen 03
design.

```tsx
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-bg-canvas">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
```

### 4. Home page (apps/web/app/(workspace)/page.tsx)

Implements Screen 01 anatomy:

```tsx
import { HomeHero } from '@/components/home/HomeHero';
import { HomeComposer } from '@/components/home/HomeComposer';
import { ModePillRow } from '@/components/home/ModePillRow';
import { SuggestionChips } from '@/components/home/SuggestionChips';
import { ContinueBand } from '@/components/home/ContinueBand';

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto pt-[88px] pb-12">
      <HomeHero />
      <ModePillRow className="mt-8" />
      <HomeComposer className="mt-6" />
      <SuggestionChips className="mt-4" />
      <ContinueBand className="mt-16" />
    </div>
  );
}
```

The HomeHero shows the soft glyph tile, "Good morning, [Name]"
greeting (using Clerk's `useUser()` for the name), and tertiary
subtitle.

### 5. Workspace page (apps/web/app/(workspace)/tasks/[taskId]/page.tsx)

Implements Screen 03 (Live Workspace, 3-pane):

```tsx
'use client';
import { useAgentStream } from '@/hooks/useAgentStream';
import { StatusBarHeader } from '@/components/workspace/StatusBarHeader';
import { LeftPane } from '@/components/workspace/LeftPane';
import { CenterPane } from '@/components/workspace/CenterPane';
import { RightInspector } from '@/components/workspace/RightInspector';
import { BottomComposer } from '@/components/workspace/BottomComposer';
import { ApprovalModal } from '@/components/workspace/ApprovalModal';

export default function WorkspacePage({ params }: { params: { taskId: string } }) {
  const state = useAgentStream(params.taskId);

  return (
    <div className="flex flex-col h-full">
      <StatusBarHeader state={state} />
      <div className="flex-1 grid grid-cols-[320px_1fr_320px] gap-0 min-h-0">
        <LeftPane state={state} />
        <CenterPane state={state} />
        <RightInspector state={state} />
      </div>
      <BottomComposer taskId={params.taskId} />
      {state.pendingApproval && <ApprovalModal approval={state.pendingApproval} taskId={params.taskId} />}
    </div>
  );
}
```

### 6. SSE hook (apps/web/hooks/useAgentStream.ts)

```typescript
'use client';
import { useState, useEffect, useReducer } from 'react';
import type { SSEEvent, ApprovalRequestEvent } from '@handle/shared';

export interface AgentStreamState {
  status: 'IDLE' | 'RUNNING' | 'WAITING' | 'STOPPED' | 'ERROR' | 'PAUSED';
  thought: string;
  toolCalls: ToolCallState[];
  finalMessage: string | null;
  error: string | null;
  pendingApproval: ApprovalRequestEvent['request'] & { approvalId: string } | null;
  planSteps: PlanStep[];
}

interface ToolCallState {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  streams: Array<{ channel: 'stdout' | 'stderr'; content: string }>;
  result?: string;
  error?: string;
  exitCode?: number;
  status: 'running' | 'done' | 'error';
}

interface PlanStep {
  id: string;
  title: string;
  state: 'done' | 'active' | 'pending';
  requiresApproval?: boolean;
}

type Action =
  | { type: 'reset' }
  | { type: 'event'; event: SSEEvent };

function reducer(state: AgentStreamState, action: Action): AgentStreamState {
  if (action.type === 'reset') {
    return {
      status: 'IDLE',
      thought: '',
      toolCalls: [],
      finalMessage: null,
      error: null,
      pendingApproval: null,
      planSteps: [],
    };
  }

  const event = action.event;
  switch (event.type) {
    case 'status_update':
      return { ...state, status: event.status };
    case 'thought':
      return { ...state, thought: state.thought + event.content };
    case 'tool_call':
      return {
        ...state,
        toolCalls: [
          ...state.toolCalls,
          { callId: event.callId, toolName: event.toolName, args: event.args, streams: [], status: 'running' },
        ],
        thought: '',
      };
    case 'tool_stream':
      return {
        ...state,
        toolCalls: state.toolCalls.map((tc) =>
          tc.callId === event.callId
            ? { ...tc, streams: [...tc.streams, { channel: event.channel, content: event.content }] }
            : tc,
        ),
      };
    case 'tool_result':
      return {
        ...state,
        toolCalls: state.toolCalls.map((tc) =>
          tc.callId === event.callId
            ? {
                ...tc,
                result: event.result,
                error: event.error,
                exitCode: event.exitCode,
                status: event.error ? 'error' : 'done',
              }
            : tc,
        ),
      };
    case 'message':
      return { ...state, finalMessage: event.content };
    case 'error':
      return { ...state, error: event.message, status: 'ERROR' };
    case 'approval_request':
      return { ...state, pendingApproval: { ...event.request, approvalId: event.approvalId } };
    case 'plan_update':
      return { ...state, planSteps: event.steps };
    default:
      return state;
  }
}

export function useAgentStream(taskId: string | null) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'IDLE',
    thought: '',
    toolCalls: [],
    finalMessage: null,
    error: null,
    pendingApproval: null,
    planSteps: [],
  });

  useEffect(() => {
    if (!taskId) {
      dispatch({ type: 'reset' });
      return;
    }

    const eventSource = new EventSource(`/api/stream/${taskId}`);

    eventSource.onmessage = (event) => {
      const data: SSEEvent = JSON.parse(event.data);
      dispatch({ type: 'event', event: data });
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  return state;
}
```

### 7. SSE proxy (apps/web/app/api/stream/[taskId]/route.ts)

```typescript
import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { taskId: string } }) {
  const { sessionToken } = await auth();
  if (!sessionToken) return new Response('Unauthorized', { status: 401 });

  const upstream = await fetch(`http://127.0.0.1:3001/api/tasks/${params.taskId}/stream`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

==================================================
TESTS REQUIRED
==================================================

Backend:
1. clerkMiddleware rejects unauthenticated requests
2. redactSecrets redacts known patterns
3. eventBus emit/subscribe routes correctly
4. tools (each of 4) with mocked sandbox: emit events, return result
5. createPhase1Agent returns AgentExecutor with correct tool list
6. POST /api/tasks creates task and triggers agent
7. GET /health returns build info, no auth required
8. /api/* requires auth

Frontend:
1. useAgentStream reducer applies all event types
2. WorkspacePage renders with no errors
3. HomePage greets the user with their Clerk-provided name
4. Design system components render with correct token classes
5. Playwright: sign-in flow + submit task + see RUNNING status

==================================================
GATE CRITERIA
==================================================

Phase 1 is complete when:

1. All tests pass in CI three consecutive runs
2. User signs up via Clerk, signs in, lands on Home
3. Home shows greeting with user's name from Clerk
4. User submits the canonical task
5. Workspace page opens, shows status bar pulsing, plan tab
   populating, tool calls appearing in inspector with
   streaming output
6. Agent completes the task, final message appears
7. Status changes to STOPPED
8. Re-running the canonical task in a fresh session also works
9. Design system fidelity: all elements match design tokens, no
   ad-hoc colors or spacings
10. /health returns proper buildInfo
11. Logs land in ~/Library/Logs/Handle/api.log
12. SIGNOFF document at docs/phase-1/SIGNOFF.md

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase1-canonical-task.md:

1. Start Postgres: `pg_ctl start` (or via Docker)
2. Run migrations: `pnpm --filter @handle/api prisma migrate deploy`
3. Start backend: `pnpm --filter @handle/api dev`
4. Start frontend: `pnpm --filter @handle/web dev`
5. Open http://localhost:3000
6. Click Sign in, create account via Clerk
7. Verify Home renders with "Good morning, [your name]"
8. Submit canonical task in composer
9. Workspace screen opens
10. Verify status bar pulsing, "RUNNING" status
11. Verify plan steps populate in left pane
12. Verify tool calls stream in right inspector
13. Verify final answer arrives
14. Verify design fidelity against the screen specs
15. Repeat 2 more times — all 3 runs complete

User pastes results back. No DONE without confirmation.

==================================================
DELIVERABLES
==================================================

- Source code under apps/web, apps/api, packages/*
- Prisma schema and migrations
- design-tokens and design-refs packages populated from the design
  package zip
- All 16 design system components built
- Home screen + Workspace screen matching design
- Clerk auth working end-to-end
- E2B integration
- LangChain agent
- 4 tools with streaming
- CI workflow
- Manual audit harness
- SIGNOFF document
- README with quick-start

==================================================
IMPLEMENTATION ORDER
==================================================

1. Repo skeleton (pnpm workspace, configs)
2. design-tokens and design-refs packages (copy from design zip)
3. Tailwind config consuming tokens
4. shared package types
5. Database schema and migration
6. Backend core (server, Clerk middleware, health, build info,
   logger, redaction, event bus)
7. E2B integration and tool definitions
8. LangChain agent setup
9. Tasks and stream endpoints
10. Approval routes (infrastructure for later phases)
11. Frontend skeleton: Clerk provider, sign-in/up routes,
    workspace shell
12. Design system components (16 of them, in component-specs
    order)
13. Home screen
14. Workspace screen with all 5 sub-components
15. SSE hook and event reducer
16. SSE proxy route
17. Backend tests
18. Frontend tests
19. CI workflow
20. Manual audit harness
21. End-to-end verification
22. SIGNOFF

Per AGENTS.md Rule 11, each step is its own commit. Do not lump.

==================================================
END OF PHASE 1 SPEC
==================================================
