# Handle — Phase 8: Schedules (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-7 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add scheduled / recurring tasks to Handle. Users can create
schedules like "every Monday at 9am, summarize my unread Gmail."
Schedules run via Temporal after the Phase 6.5 stack update. UI matches Screen 08.

Phase 8 ships in 1-2 weeks.

==================================================
SCOPE
==================================================

In scope:
- Temporal schedule setup
- Schedule entity in DB
- Cron-based scheduling
- Schedule lifecycle (create, pause, resume, delete)
- Schedule UI (Screen 08)
- Scheduled task execution (spawns regular task)
- Schedule history (each firing → resulting task)
- Notifications on completion (UI banner + optional email)

Out of scope:
- Production-grade Temporal deployment (self-hosted dev only)
- Schedule conflict detection
- Email notifications (UI only for Phase 8; email in Phase 11)

==================================================
REDIS SETUP
==================================================

Redis is required. Document in docs/SETUP.md:

```
brew install redis
brew services start redis
```

Or via Docker:
```
docker run -d --name handle-redis -p 6379:6379 redis:7-alpine
```

==================================================
SCHEDULE SCHEMA
==================================================

```prisma
model Schedule {
  id             String    @id @default(cuid())
  userId         String
  name           String
  goal           String     // The task goal
  cron           String     // Cron expression
  timezone       String     @default("UTC")
  skillId        String?    // Optional skill to use
  isEnabled      Boolean    @default(true)
  workflowId     String?    // Temporal schedule/workflow ID
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  lastRunAt      DateTime?
  nextRunAt      DateTime?
  user           User       @relation(fields: [userId], references: [id])
  runs           ScheduleRun[]
}

model ScheduleRun {
  id          String    @id @default(cuid())
  scheduleId  String
  taskId      String?    // The Task this firing created
  status      String     // 'queued' | 'running' | 'completed' | 'error'
  error       String?
  ranAt       DateTime   @default(now())
  schedule    Schedule   @relation(fields: [scheduleId], references: [id])
}
```

==================================================
BULLMQ SETUP
==================================================

apps/api/src/schedules/queue.ts:

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const schedulesQueue = new Queue('handle-schedules', { connection });
export const schedulesEvents = new QueueEvents('handle-schedules', { connection });

export interface ScheduleJobData {
  scheduleId: string;
  userId: string;
  goal: string;
  skillId?: string;
}

export async function startSchedulesWorker() {
  const worker = new Worker<ScheduleJobData>(
    'handle-schedules',
    async (job) => {
      const { scheduleId, userId, goal, skillId } = job.data;
      
      // Create a task
      const task = await prisma.task.create({
        data: {
          userId,
          goal,
          skillId,
        },
      });
      
      // Record the run
      await prisma.scheduleRun.create({
        data: {
          scheduleId,
          taskId: task.id,
          status: 'running',
        },
      });
      
      // Update schedule lastRunAt
      await prisma.schedule.update({
        where: { id: scheduleId },
        data: { lastRunAt: new Date() },
      });
      
      // Spawn the agent
      runAgent(task.id, goal).catch((err) => {
        logger.error({ err, scheduleId, taskId: task.id }, 'scheduled task failed');
      });
      
      return { taskId: task.id };
    },
    { connection },
  );
  
  worker.on('completed', async (job, result) => {
    const taskId = result.taskId;
    // Wait for the task to actually complete and update ScheduleRun
    // (Could subscribe to event bus, or poll, or use a separate worker)
  });
  
  return worker;
}
```

==================================================
SCHEDULE LIFECYCLE
==================================================

apps/api/src/schedules/manager.ts:

```typescript
import { schedulesQueue } from './queue';
import { prisma } from '../lib/prisma';

export async function createSchedule(input: {
  userId: string;
  name: string;
  goal: string;
  cron: string;
  timezone?: string;
  skillId?: string;
}): Promise<string> {
  const schedule = await prisma.schedule.create({
    data: {
      userId: input.userId,
      name: input.name,
      goal: input.goal,
      cron: input.cron,
      timezone: input.timezone ?? 'UTC',
      skillId: input.skillId,
    },
  });
  
  const job = await schedulesQueue.add(
    `schedule-${schedule.id}`,
    { scheduleId: schedule.id, userId: input.userId, goal: input.goal, skillId: input.skillId },
    {
      repeat: {
        pattern: input.cron,
        tz: input.timezone ?? 'UTC',
      },
    },
  );
  
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { bullJobId: job.id },
  });
  
  return schedule.id;
}

export async function pauseSchedule(scheduleId: string) {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule?.bullJobId) return;
  
  await schedulesQueue.removeRepeatable(`schedule-${scheduleId}`, {
    pattern: schedule.cron,
    tz: schedule.timezone,
  });
  
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { isEnabled: false },
  });
}

export async function resumeSchedule(scheduleId: string) {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return;
  
  await schedulesQueue.add(
    `schedule-${scheduleId}`,
    { scheduleId, userId: schedule.userId, goal: schedule.goal, skillId: schedule.skillId ?? undefined },
    {
      repeat: {
        pattern: schedule.cron,
        tz: schedule.timezone,
      },
    },
  );
  
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { isEnabled: true },
  });
}

export async function deleteSchedule(scheduleId: string) {
  await pauseSchedule(scheduleId);
  await prisma.schedule.delete({ where: { id: scheduleId } });
}
```

==================================================
SCHEDULE API
==================================================

apps/api/src/routes/schedules.ts:

```
GET    /api/schedules                List user's schedules
POST   /api/schedules                Create new schedule
GET    /api/schedules/:id            Get schedule + runs
PUT    /api/schedules/:id            Update (rename, change goal/cron)
POST   /api/schedules/:id/pause      Pause
POST   /api/schedules/:id/resume     Resume
POST   /api/schedules/:id/run        Run immediately (one-off)
DELETE /api/schedules/:id            Delete
```

==================================================
SCHEDULE UI (SCREEN 08)
==================================================

apps/web/app/(workspace)/schedules/page.tsx:

Top: Today timeline strip
- 24-hour scrubber
- NOW vertical line
- Pill events for each scheduled run today
- Color-coded by status (running/waiting/done)

Bottom: All schedules table
- Status dot (running/paused/error)
- Name + cron expression (e.g., "Every Monday 9:00 AM")
- Last run (relative time)
- Next run
- Toggle (pause/resume)
- More menu (edit, delete, run now)

Implementation: use a simple cron parsing library like cronstrue
to convert cron expressions to human-readable strings.

==================================================
SCHEDULE CREATION UI
==================================================

apps/web/components/schedules/CreateScheduleModal.tsx:

Modal (using Phase 1's Modal component) with form:
- Name (input)
- Goal (textarea)
- Frequency (select):
  - Every hour
  - Every day at...
  - Every Monday at...
  - Custom cron (advanced)
- Time picker for hour-of-day
- Timezone (default user's local)
- Skill (optional dropdown of installed skills)
- Save button

Frequency selects map to cron expressions:
- "Every day at 9 AM" → "0 9 * * *"
- "Every Monday at 9 AM" → "0 9 * * 1"
- "Every hour" → "0 * * * *"

==================================================
NOTIFICATIONS
==================================================

When a scheduled task completes (or fails), show a toast in the
UI if the user is online:

```typescript
// emit on schedule run completion
emitTaskEvent({
  type: 'schedule_completed',
  scheduleId,
  scheduleName,
  status: 'success' | 'error',
  ...
});
```

The frontend listens via a global SSE channel (separate from
per-task channel) and shows a toast.

Phase 11 polish adds: email notifications, push notifications.

==================================================
TESTS
==================================================

1. createSchedule registers Temporal schedule
2. pauseSchedule removes repeatable job
3. resumeSchedule re-adds it
4. deleteSchedule cleans up
5. Worker processes job and creates Task
6. Schedule API endpoints work
7. CreateScheduleModal validates input
8. Schedule timeline renders today's events

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-7 tests pass
2. Phase 8 tests pass 3 consecutive CI runs
3. User creates schedule "every minute, log timestamp"
4. Schedule fires multiple times, ScheduleRuns recorded
5. Pause stops firing
6. Resume restarts firing
7. Delete removes everything
8. Toast appears on completion
9. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase8-schedules.md:

Section A: Create + run
1. /schedules → New
2. Name: "Test", Goal: "Write timestamp to /tmp/test.txt", every minute
3. Save
4. Wait 1-2 minutes
5. Verify ScheduleRun records exist
6. Check /tmp/test.txt contains timestamps

Section B: Pause + resume
1. Click pause on the schedule
2. Wait 2 minutes
3. Verify no new runs
4. Click resume
5. Wait 1 minute
6. Verify new run

Section C: Delete
1. Delete the schedule
2. Verify removed from list
3. Verify no further runs in next 2 minutes

Section D: Notification
1. Create schedule "every 30 seconds, do nothing"
2. Stay on /schedules page
3. Verify toast on completion

==================================================
IMPLEMENTATION ORDER
==================================================

1. Schedule schema
2. Temporal setup
3. Worker process
4. Schedule lifecycle (create/pause/resume/delete)
5. Schedule API
6. Schedule UI (table + timeline)
7. CreateScheduleModal
8. Notifications (toasts)
9. Tests
10. Manual audit
11. SIGNOFF

==================================================
END OF PHASE 8 SPEC
==================================================
