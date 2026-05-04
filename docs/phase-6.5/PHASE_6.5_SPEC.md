# Phase 6.5 Spec: Agent Foundation Extensions

## Status

Stage 0 specification draft. No implementation is included in this commit.

Phase 6.5 ships as `v0.6.5` between Phase 6 Integrations and Phase 7 Skills.
Phase 7 remains untouched on the roadmap. Phase 6.5 extends the agent runtime
foundation so the Skills layer can rely on durable async runs, explicit search
providers, critic review, persistent task tracking, workflow templates, and
saved cross-integration agents.

Branching rule:

- If Phase 6 has merged to `main`, implementation happens on
  `phase-6.5/agent-foundation` cut from updated `main`.
- If Phase 6 has not merged yet, only this Stage 0 spec may be drafted on
  `phase-6/integrations`. No Phase 6.5 implementation starts there.

Do not treat this document as SIGNOFF. Phase 6.5 still needs implementation,
live Codex smokes, manual audit, and user signoff.

## References Checked

Primary references consulted while drafting:

- Temporal TypeScript SDK API reference: `https://typescript.temporal.io/`.
  The SDK separates `@temporalio/client`, `@temporalio/worker`,
  `@temporalio/workflow`, and `@temporalio/activity`.
- Temporal product docs: `https://docs.temporal.io/`.
  Temporal provides durable workflow execution that resumes after crashes.
- Nango webhooks docs:
  `https://nango.dev/docs/guides/webhooks/webhooks-from-nango`.
  Nango sends auth, sync, and external API webhook notifications, and webhook
  signatures must be verified.
- Tavily Search API docs:
  `https://docs.tavily.com/documentation/api-reference/endpoint/search`.
- Brave Search API docs: `https://brave.com/search/api/`.
  Brave web search uses `https://api.search.brave.com/res/v1/web/search` and
  the `X-Subscription-Token` header.
- Serper official product/API site: `https://serper.dev/`.
  Stage 2 must re-verify the current endpoint contract before hardcoding.

## Ground Truth Decisions

- All six additions ship in Phase 6.5 as one version gate:
  - Async Task UX
  - BYOK Web Search Providers
  - Critic/Verifier Agent Role
  - `todo.md` Persistent Task Tracking
  - Workflow Templates
  - Cross-Integration Agents
- Temporal self-hosted replaces BullMQ + node-cron as the stack-of-record for
  jobs, schedules, async task execution, and workflow durability.
- Temporal runs locally in development beside Zep. Development uses the
  `temporal server start-dev` pattern, packaged through Docker/scripts.
  Production-grade Temporal deployment is Phase 11.
- Notification dispatch is opt-in per channel. Email, Slack, and webhook are
  all disabled until the user explicitly enables each.
- Critic/Verifier is off by default and opt-in per project.
- Critic intervention points are:
  - post-plan-before-execute
  - post-code-before-run
  - post-tool-result-before-next-step
- Critic verdicts are `APPROVE`, `REVISE`, and `REJECT`.
- `todo.md` auto-creates for multi-step requests. It is skipped for one-shot
  questions.
- Workflow runtime is shared with the agent runtime. Workflows are not a
  separate mini-agent process. Workflows reuse the Phase 5 shared memory
  primitive for collaboration within a task/run.
- Cross-integration agents have no connector access limit. Users configure
  freely. Rule 33 audit logging and Phase 4 permission gates still apply.

## Non-Goals

- Phase 7 Skills. No skill registry, skill marketplace, skill pack format, or
  skill authoring UI ships in Phase 6.5.
- Production Temporal deployment, high-availability Temporal, TLS/mTLS,
  database-backed Temporal clusters, and Tauri-native process supervision.
  These are Phase 11.
- macOS native notifications. Deferred to Phase 11 with Tauri.
- A custom workflow engine. Temporal owns durability, schedules, retries, and
  workflow history.
- A custom search index. BYOK search providers are live API calls unless a
  provider returns cached results itself.
- A general low-code automation platform. Workflow Templates are practical,
  connector-backed automations for Handle tasks.
- Running scheduled agents while approval is impossible. In `ASK`/`PLAN`, runs
  may pause in `WAITING`/`awaiting_approval` until the user returns.

## Stack Change: Temporal Replaces BullMQ

Phase 6.5 changes the locked stack:

- Old stack-of-record: BullMQ + node-cron for background jobs and schedules.
- New stack-of-record: Temporal Server + Temporal TypeScript SDK.

Implementation Stage 1 must update the stack-of-record docs:

- `docs/codex-context/FINAL_AGENTS.md`
- root `AGENTS.md` if it is still the canonical standing-rules file
- `docs/codex-context/FINAL_ROADMAP.md`
- `docs/codex-context/FINAL_PHASE_8_SCHEDULES.md` if Phase 8 still references
  BullMQ as future work

The rule change is narrow: Temporal replaces BullMQ/node-cron for durable jobs,
async task workflows, schedules, saved-agent schedules, and connector workflow
triggers. This does not change LangChain/LangGraph as the agent orchestration
stack.

## Existing Phase 1-6 Foundations Reused

Phase 6.5 builds on:

- `AgentRun`, `Conversation`, `Message`, and `Project` Prisma models.
- Phase 4 approval flow and SafetyGovernor.
- Phase 4 project permission modes: `PLAN`, `ASK`, `FULL_ACCESS`.
- Phase 5 memory, failure memory, trajectory memory, action log, and shared
  memory primitive.
- Phase 6 Nango integration layer, connector settings, integration memory
  candidates, connector approval gates, and action logging.
- SSE event bus for live workspace updates.
- Settings UI patterns from Providers, Memory, Execution, Browser, and
  Integrations.

Where the kickoff says `TaskRun`, use the current codebase model:
`AgentRun`. The UI can still show "task" to the user.

## Cross-Cutting Security and Observability

All six additions must follow these rules:

- Secrets never enter logs, prompts, Zep facts, action logs, failure memory, or
  Temporal workflow payloads without redaction.
- Durable workflow payloads store identifiers and redacted summaries, not raw
  OAuth tokens, API keys, email bodies, private document bodies, or large tool
  outputs.
- Any real-world action writes Rule 33 audit entries and Phase 5 action-log
  entries after successful execution.
- Failures write structured failure memory when useful and privacy-safe.
- Diagnostic logging comes before speculative fixes when live smokes fail.
- UI errors are typed and actionable.
- Browser-facing surfaces require Playwright smokes plus live browser
  walkthroughs.

## Item 1: Async Task UX

### User Flow

User submits a task, closes the tab, and Handle keeps working. Later the user
gets an opt-in notification when the task completes, fails, needs approval, or
critic review blocks progress. The user can reopen Handle and continue from an
Inbox-like task list.

### Architecture

New backend modules:

- `apps/api/src/temporal/client.ts`
  - Reads Temporal connection settings from Settings/DB on every use.
  - Defaults to local dev server at `127.0.0.1:7233`.
- `apps/api/src/temporal/worker.ts`
  - Starts the Temporal worker for Handle task queues.
  - Registers workflows and activities.
- `apps/api/src/temporal/workflows/agentRunWorkflow.ts`
  - Thin deterministic workflow for `AgentRun` lifecycle orchestration.
  - Starts an agent run activity, handles pause/cancel/approval signals, and
    records completion/failure.
- `apps/api/src/temporal/activities/agentRunActivities.ts`
  - All non-deterministic work lives here: LLM calls, tool calls, DB writes,
    notifications, action logs, memory writes, and connector calls.
- `apps/api/src/asyncTasks/notificationDispatcher.ts`
  - Sends opt-in email/Slack/webhook notifications.
- `apps/api/src/asyncTasks/taskInbox.ts`
  - Queries running/recent/needs-attention tasks for UI.

Temporal workflow code must remain deterministic. It may call Temporal APIs,
set timers, receive signals, and schedule activities. It must not call LLMs,
fetch network resources, read files, or touch Prisma directly.

Development setup:

- Add `docker-compose.temporal.yaml` or equivalent scripts for a self-hosted
  Temporal dev server using the `temporal server start-dev` pattern.
- Add package scripts:
  - `pnpm temporal:up`
  - `pnpm temporal:down`
  - `pnpm temporal:logs`
  - `pnpm temporal:worker`
  - `pnpm smoke:temporal-up`
- Temporal UI should be exposed on a local port, expected default `8233`.

### Lifecycle

User-facing lifecycle states:

- `queued`
- `running`
- `paused`
- `completed`
- `failed`
- `awaiting_approval`
- `cancelled`

Database mapping:

- Add `QUEUED` to `AgentRunStatus`.
- Continue using existing `WAITING` for `awaiting_approval`.
- Existing `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED`, and `CANCELLED` stay.

### Schema

Prisma additions:

```prisma
model TemporalSettings {
  id            String   @id @default("global")
  enabled       Boolean  @default(true)
  address       String   @default("127.0.0.1:7233")
  namespace     String   @default("default")
  taskQueue     String   @default("handle-agent-runs")
  uiUrl         String   @default("http://127.0.0.1:8233")
  lastCheckedAt DateTime?
  lastErrorCode String?
  lastErrorMessage String?
  updatedAt     DateTime @default(now()) @updatedAt
}

model NotificationSettings {
  id        String   @id @default("global")
  emailEnabled Boolean @default(false)
  emailIntegrationId String?
  emailRecipient String?
  slackEnabled Boolean @default(false)
  slackIntegrationId String?
  slackChannelId String?
  webhookEnabled Boolean @default(false)
  webhookUrl String?
  webhookSecretRef String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ProjectNotificationSettings {
  id        String   @id @default(cuid())
  projectId String  @unique
  inheritGlobal Boolean @default(true)
  emailEnabled Boolean?
  emailRecipient String?
  slackEnabled Boolean?
  slackChannelId String?
  webhookEnabled Boolean?
  webhookUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model NotificationDelivery {
  id          String   @id @default(cuid())
  userId      String
  projectId   String?
  agentRunId  String?
  eventType   NotificationEventType
  channel     NotificationChannel
  recipient   String
  status      NotificationStatus @default(PENDING)
  errorCode   String?
  errorMessage String?
  dispatchedAt DateTime?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
  @@index([agentRunId])
}

enum NotificationEventType {
  TASK_COMPLETED
  TASK_FAILED
  APPROVAL_NEEDED
  CRITIC_REJECTED
}

enum NotificationChannel {
  EMAIL
  SLACK
  WEBHOOK
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
  SKIPPED_DISABLED
}
```

Extend `AgentRun`:

```prisma
temporalWorkflowId String?
temporalRunId      String?
queuedAt           DateTime?
lastHeartbeatAt    DateTime?
lastNotifiedAt     DateTime?
backgroundMode     Boolean @default(false)
```

### API Surface

- `GET /api/async/temporal/status`
- `POST /api/async/temporal/start`
- `POST /api/async/temporal/stop`
- `GET /api/tasks/inbox?status=running|needs_attention|recent`
- `POST /api/agent-runs/:id/background`
- `POST /api/agent-runs/:id/continue`
- `GET /api/settings/notifications`
- `PUT /api/settings/notifications`
- `GET /api/projects/:id/notifications`
- `PUT /api/projects/:id/notifications`

Existing task/conversation creation routes should enqueue Temporal workflows
instead of relying only on in-process execution when Temporal is enabled.

### UI Surface

- New Settings tab: `Settings -> Notifications`.
- New workspace/inbox surface:
  - Sidebar badge for running/needs-attention tasks.
  - Inbox-like list of active, awaiting approval, paused, failed, and recent
    completed tasks.
  - Continue button opens the conversation/task workspace.
  - Approval-needed items deep-link to the approval modal.
- Workspace status bar shows:
  - background mode
  - Temporal workflow status
  - last heartbeat
  - notification dispatch status, when applicable

### Permission Model

Notifications do not need per-send approval because they are user-configured
status notifications about the user's own tasks. Connector permissions still
apply to any agent-generated integration actions within the task.

Webhook notification URLs are user-configured and secrets are redacted. Webhook
notification sends must be audit logged.

### Memory Integration

Task completion summaries may become memory candidates only if Phase 5 memory is
enabled for that project/message. Notification payloads themselves are not
stored as memory.

### Action Log and Failure Memory

- Successful notification dispatch writes an action log entry:
  `notification_sent`.
- Failed async task workflows write failure memory with redacted root cause.
- Temporal workflow start/stop/worker errors are logged to
  `~/Library/Logs/Handle/temporal.log`.

### Smokes

- `pnpm smoke:temporal-up`
- `pnpm smoke:async-task-background`
- `pnpm smoke:async-task-approval-needed`
- `pnpm smoke:notifications-webhook`
- Playwright: submit task, close/reopen, see Inbox item, continue task.

## Item 2: BYOK Web Search Providers

### User Flow

The user configures Tavily, Serper, and/or Brave API keys in Settings. Projects
choose a default search provider. Agent `web_search` and `web_fetch` use the
preferred BYOK provider, fall back to the next configured provider on rate limit
or provider outage, and finally fall back to built-in/provider-native search
only when no BYOK provider can serve the request.

### Architecture

New modules:

- `apps/api/src/search/providers/types.ts`
- `apps/api/src/search/providers/tavily.ts`
- `apps/api/src/search/providers/serper.ts`
- `apps/api/src/search/providers/brave.ts`
- `apps/api/src/search/searchRouter.ts`
- `apps/api/src/search/searchTools.ts`
- `apps/api/src/routes/searchSettings.ts`

Normalized tool surface:

- `web_search({ query, maxResults?, providerOverride?, freshness?, domains? })`
- `web_fetch({ url, providerOverride?, format? })`

Provider-specific behavior:

- Tavily:
  - Search through Tavily Search API.
  - Fetch/extract through Tavily extract/map APIs if available; otherwise use
    safe direct fetch fallback.
- Serper:
  - Search through current Serper API contract verified in Stage 2.
  - Fetch uses safe direct fetch fallback unless Serper exposes an official
    content endpoint.
- Brave:
  - Search through Brave web search endpoint.
  - Optionally use Brave LLM context endpoint for answer-context formatting,
    but normalized `web_search` must preserve raw URL/title/snippet results.

### Schema

```prisma
model SearchProviderConfig {
  id             String @id @default(cuid())
  userId         String
  providerId     SearchProviderId
  enabled        Boolean @default(false)
  keychainAlias  String
  displayName    String?
  memoryScope    MemoryScope @default(NONE)
  rateLimitPerMinute Int?
  lastUsedAt     DateTime?
  lastErrorCode  String?
  lastErrorMessage String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([userId, providerId])
}

model ProjectSearchSettings {
  id              String @id @default(cuid())
  projectId       String @unique
  defaultProvider SearchProviderId?
  fallbackOrder   SearchProviderId[] @default([])
  memoryScope     MemoryScope @default(NONE)
  updatedAt       DateTime @default(now()) @updatedAt
}

enum SearchProviderId {
  TAVILY
  SERPER
  BRAVE
  BUILTIN
}
```

### API Surface

- `GET /api/settings/search-providers`
- `PUT /api/settings/search-providers/:providerId`
- `POST /api/settings/search-providers/:providerId/key`
- `POST /api/settings/search-providers/:providerId/test`
- `DELETE /api/settings/search-providers/:providerId/key`
- `GET /api/projects/:id/search-settings`
- `PUT /api/projects/:id/search-settings`

### UI Surface

- New Settings tab: `Settings -> Search Providers`.
- Provider cards for Tavily, Serper, Brave:
  - API key field
  - enabled toggle
  - test button
  - status
  - quota/rate-limit note
  - memory toggle defaulting to `None`
- Project edit modal:
  - default search provider
  - fallback order
  - search memory toggle
- Composer:
  - optional search provider override in advanced controls.

### Permission Model

Search and fetch are read-only and do not require approval. Search providers
still use BYOK quotas and must expose rate-limit errors clearly.

### Memory Integration

Search result memory defaults to `NONE`. If enabled, only allowlisted metadata
may be written:

- query
- result title
- result URL
- result source/domain
- retrieval timestamp

Never store full page bodies, private content, API responses containing secrets,
or arbitrary snippets as durable facts.

Per-message memory off drops search memory candidates.

### Action Log and Failure Memory

- Successful search writes action log entry `web_search_executed`.
- Successful fetch writes action log entry `web_fetch_executed`.
- Rate-limit/provider failures write failure memory only as generalized lessons
  and only after redaction.

### Smokes

- `pnpm smoke:search-provider-tavily`
- `pnpm smoke:search-provider-serper`
- `pnpm smoke:search-provider-brave`
- `pnpm smoke:web-search-fallback`
- `pnpm smoke:search-memory-toggle`
- Playwright: add key, test provider, select project default, run a search task.

## Item 3: Critic/Verifier Agent Role

### User Flow

Critic review is off by default. In Project settings, the user enables Critic
Review and chooses scope/model settings. When active, the critic reviews plans,
code-before-run, and tool outputs before the main agent proceeds. The user sees
critic verdicts in the Inspector and can understand why a task revised or halted.

### Architecture

New modules:

- `apps/api/src/critic/criticPrompt.ts`
- `apps/api/src/critic/criticRunner.ts`
- `apps/api/src/critic/criticPolicy.ts`
- `apps/api/src/critic/criticMemory.ts`
- `apps/api/src/routes/criticSettings.ts`

Critic call inputs:

- decision point type
- current goal
- project context
- memory context
- failure memory relevant to this goal
- reduced trajectory context
- proposed action or observed result

Critic verdict:

```typescript
interface CriticVerdict {
  verdict: 'APPROVE' | 'REVISE' | 'REJECT';
  reason: string;
  suggestedRevision?: string;
  confidence: number;
  riskTags: string[];
}
```

Intervention points:

- `post_plan_before_execute`: after plan generation, before backend/tool work.
- `post_code_before_run`: after file write or code-generation tool output,
  before shell execution.
- `post_tool_result_before_next_step`: after a tool result, before next agent
  iteration.

Revise behavior:

- `APPROVE`: proceed.
- `REVISE`: feed critic feedback to the main agent and re-check.
- `REJECT`: halt the trajectory, mark run `FAILED` or `WAITING` depending on
  whether user intervention can recover it, and surface the reason.
- Max revise cycles defaults to 3. On exhaustion, escalate to `REJECT`.

### Schema

```prisma
model ProjectCriticSettings {
  id                 String @id @default(cuid())
  projectId          String @unique
  enabled            Boolean @default(false)
  providerId         String?
  modelName          String?
  interventionScope  CriticInterventionScope @default(RISKY_ONLY)
  maxReviseCycles    Int @default(3)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model CriticReview {
  id             String @id @default(cuid())
  agentRunId     String
  projectId      String
  stage          CriticReviewStage
  verdict        CriticVerdict
  reason         String
  suggestedRevision String?
  confidence     Float
  riskTags       String[] @default([])
  providerId     String?
  modelName      String?
  promptVersion  String
  createdAt      DateTime @default(now())

  @@index([agentRunId, createdAt])
  @@index([projectId, createdAt])
}

enum CriticInterventionScope {
  ALL_DECISIONS
  WRITES_ONLY
  RISKY_ONLY
}

enum CriticReviewStage {
  POST_PLAN_BEFORE_EXECUTE
  POST_CODE_BEFORE_RUN
  POST_TOOL_RESULT_BEFORE_NEXT_STEP
}

enum CriticVerdict {
  APPROVE
  REVISE
  REJECT
}
```

### API Surface

- `GET /api/projects/:id/critic`
- `PUT /api/projects/:id/critic`
- `GET /api/agent-runs/:id/critic-reviews`

### UI Surface

- Project edit modal:
  - Enable Critic Review
  - Critic model
  - Intervention scope
  - Max revise cycles
- Workspace Inspector:
  - Critic verdict timeline
  - Badges for APPROVE/REVISE/REJECT
  - Cost estimate for critic calls
- Run status:
  - If rejected, show critic reason and recovery affordance.

### Permission Model

The critic does not bypass user permissions. It can recommend blocking or
revising actions but cannot approve on the user's behalf. Approval modals still
gate writes/destructive actions under Phase 4.

### Memory Integration

- Critic receives relevant failure memory.
- Critic verdicts may write failure memory when a pattern is reusable and
  privacy-safe.
- Critic reviews are not stored as user facts.

### Action Log and Failure Memory

- Each critic verdict writes an action log entry `critic_reviewed`.
- `REJECT` writes failure memory with root cause and prevention lesson.

### Smokes

- `pnpm smoke:critic-plan-approve`
- `pnpm smoke:critic-revise-loop`
- `pnpm smoke:critic-reject`
- Playwright: enable critic in project settings and observe verdicts in a task.

## Item 4: todo.md Persistent Task Tracking

### User Flow

For multi-step work, the agent creates a task-tracking file in the workspace
and maintains it through the conversation. The file is visible at the top of
the Files panel and can be edited by the user to redirect work.

### Architecture

New modules:

- `apps/api/src/todos/todoClassifier.ts`
- `apps/api/src/todos/todoFile.ts`
- `apps/api/src/todos/todoContext.ts`
- workspace UI additions for sticky file display

File path:

- `<workspace>/<conversationId>.todo.md`

Creation heuristic:

- Create for user messages containing multi-step verbs:
  `build`, `create`, `research`, `plan`, `setup`, `configure`, `deploy`,
  `automate`, `implement`, `fix`, `refactor`, `audit`, `integrate`, `migrate`.
- Create when the request implies 3 or more ordered steps.
- Skip for one-shot math, definitions, jokes, short factual questions, and
  single-message brainstorming.

Prompt rule:

- Prompt version bump required.
- For multi-step work, the agent must create/update todo.md before meaningful
  execution, mark completed items, add newly discovered tasks, and read the file
  at the start of each follow-up turn.

### Schema

No new schema. `todo.md` is a workspace file.

### API Surface

No new endpoint is required for agent usage. Existing file tools handle reads
and writes. UI may add:

- `GET /api/conversations/:id/todo`
- `PUT /api/conversations/:id/todo`

Only add these endpoints if direct UI editing is cleaner than routing through
existing file APIs.

### UI Surface

- Files panel pins `<conversationId>.todo.md` to the top.
- Use a todo/list icon and label `todo.md`.
- Plan tab can render live todo content instead of the ephemeral per-message
  plan when the file exists.
- User edits in the file panel are saved to workspace and included in next
  agent context.

### Permission Model

Writing todo.md inside the workspace follows existing Phase 4 file-write rules.
No extra approval.

### Memory Integration

todo.md content is never extracted to memory. It is transient project/task
state and may contain sensitive details.

### Action Log and Failure Memory

- Creating/updating todo.md writes action-log entries like other file writes.
- Failure to maintain todo.md can write failure memory only if it caused a real
  task failure.

### Smokes

- `pnpm smoke:todo-auto-create`
- `pnpm smoke:todo-skip-one-shot`
- `pnpm smoke:todo-follow-up-context`
- Playwright: multi-step task creates sticky todo, user edits, follow-up uses
  edit.

## Item 5: Workflow Templates

### User Flow

The user creates automations such as: "If a GitHub PR merges, post to Slack
#releases." A connector event triggers a workflow; the workflow agent evaluates
conditions and executes configured actions with normal permission gates.

### Architecture

New modules:

- `apps/api/src/workflows/templates.ts`
- `apps/api/src/workflows/triggerAdapters/`
- `apps/api/src/workflows/workflowRuntime.ts`
- `apps/api/src/workflows/workflowAgent.ts`
- `apps/api/src/routes/workflows.ts`
- `apps/web/components/settings/WorkflowsSettings.tsx`

Trigger sources:

- Nango auth/sync/external webhook forwarding for supported connectors.
- Polling for connectors/events where webhooks are unavailable or not enabled.
- Manual trigger for testing.

Runtime:

- Shared with standard agent runtime.
- Runs as Temporal workflows/activities.
- Uses Phase 5 `SharedMemoryNamespace` for per-workflow-run coordination.
- Executes configured connector tools, not custom connector code paths.

Condition/filter format:

- JSON filter object in Phase 6.5.
- UI provides structured fields for common filters.
- Free-form advanced filter may be deferred unless easy.

### Schema

```prisma
model WorkflowTemplate {
  id                String @id @default(cuid())
  userId            String
  name              String
  enabled           Boolean @default(false)
  triggerConnectorId IntegrationConnectorId
  triggerEventType  String
  triggerFilter     Json @default("{}")
  actions           Json @default("[]")
  permissionModeOverride String?
  memoryScope       MemoryScope @default(NONE)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  runs              WorkflowRun[]

  @@index([userId, enabled])
  @@index([triggerConnectorId, triggerEventType])
}

model WorkflowRun {
  id             String @id @default(cuid())
  workflowId     String
  workflow        WorkflowTemplate @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  temporalWorkflowId String?
  temporalRunId  String?
  triggeredAt    DateTime @default(now())
  completedAt    DateTime?
  status         WorkflowRunStatus @default(QUEUED)
  triggerPayload Json @default("{}")
  actionLogIds   String[] @default([])
  errorCode      String?
  errorMessage   String?
  agentRunId     String?

  @@index([workflowId, triggeredAt])
  @@index([status])
}

enum WorkflowRunStatus {
  QUEUED
  RUNNING
  WAITING
  COMPLETED
  FAILED
  CANCELLED
}
```

### API Surface

- `GET /api/workflows`
- `POST /api/workflows`
- `GET /api/workflows/:id`
- `PUT /api/workflows/:id`
- `DELETE /api/workflows/:id`
- `POST /api/workflows/:id/test`
- `POST /api/workflows/:id/run-now`
- `GET /api/workflows/:id/runs`
- `POST /api/integrations/webhooks/nango`

Webhook endpoint must verify Nango signatures and ignore unknown webhook types.

### UI Surface

Settings -> Workflows:

- Workflow list cards:
  - name
  - enabled toggle
  - trigger
  - actions summary
  - last run status
  - run now
- New Workflow wizard:
  - Step 1: connector + event
  - Step 2: optional filter
  - Step 3: one or more actions
  - Step 4: permissions/memory/review and enable

### Permission Model

Workflow actions respect the effective Phase 4 permission mode:

- `PLAN`: workflow pauses before writes.
- `ASK`: workflow pauses for write/destructive actions.
- `FULL_ACCESS`: non-destructive writes may run, forbidden patterns still deny.
- Destructive actions always require approval.

If a workflow pauses for approval, async notifications may alert the user if
the approval-needed notification channel is enabled.

### Memory Integration

Workflow trigger events and outcomes can become memory candidates only when the
workflow memory scope is not `NONE` and only through connector allowlists. Raw
payloads are never written to memory.

### Action Log and Failure Memory

- Each successful action writes Phase 5 action log entries.
- Workflow run result writes summary action log entry `workflow_run_completed`
  or failure memory on failure.

### Smokes

- `pnpm smoke:workflow-template-crud`
- `pnpm smoke:workflow-run-manual`
- `pnpm smoke:workflow-approval-pauses`
- `pnpm smoke:nango-webhook-ingest`
- Playwright: create workflow, run now, inspect run log.

## Item 6: Cross-Integration Agents

### User Flow

The user saves prompts that span integrations, such as "Read inbox, summarize
urgent emails, and post a summary to Slack #updates." Saved agents can run
manually or on a schedule. Outputs can appear in Handle, Slack, Notion, or
email.

### Architecture

New modules:

- `apps/api/src/savedAgents/savedAgentRuntime.ts`
- `apps/api/src/savedAgents/savedAgentScheduler.ts`
- `apps/api/src/savedAgents/outputDispatch.ts`
- `apps/api/src/routes/savedAgents.ts`
- `apps/web/components/settings/SavedAgentsSettings.tsx`

Runtime:

- Reuses standard agent runtime.
- Scheduled runs use Temporal schedules/cron workflows.
- Manual runs create an immediate `AgentRun`.
- Connector access list is unrestricted by count but displayed clearly.
- Output dispatch uses Phase 6 integration tools when possible.

### Schema

```prisma
model SavedAgent {
  id              String @id @default(cuid())
  userId          String
  name            String
  prompt          String
  connectorAccess IntegrationConnectorId[] @default([])
  triggerType     SavedAgentTriggerType @default(MANUAL)
  scheduleCron    String?
  outputTarget    Json @default("{\"type\":\"handle_inbox\"}")
  memoryScope     MemoryScope @default(NONE)
  permissionModeOverride String?
  enabled         Boolean @default(true)
  temporalScheduleId String?
  lastRunAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  runs            SavedAgentRun[]

  @@index([userId, enabled])
}

model SavedAgentRun {
  id             String @id @default(cuid())
  savedAgentId   String
  savedAgent     SavedAgent @relation(fields: [savedAgentId], references: [id], onDelete: Cascade)
  agentRunId     String?
  temporalWorkflowId String?
  temporalRunId  String?
  status         SavedAgentRunStatus @default(QUEUED)
  outputSummary  String?
  errorCode      String?
  errorMessage   String?
  ranAt          DateTime @default(now())
  completedAt    DateTime?

  @@index([savedAgentId, ranAt])
  @@index([status])
}

enum SavedAgentTriggerType {
  MANUAL
  SCHEDULED
}

enum SavedAgentRunStatus {
  QUEUED
  RUNNING
  WAITING
  COMPLETED
  FAILED
  CANCELLED
}
```

### API Surface

- `GET /api/saved-agents`
- `POST /api/saved-agents`
- `GET /api/saved-agents/:id`
- `PUT /api/saved-agents/:id`
- `DELETE /api/saved-agents/:id`
- `POST /api/saved-agents/:id/run`
- `GET /api/saved-agents/:id/runs`

### UI Surface

Settings -> Saved Agents:

- Saved agent cards:
  - name
  - trigger
  - connector access summary
  - output target
  - last run status
  - run now
  - enabled toggle
- New Saved Agent wizard:
  - name
  - prompt template
  - connector access checkboxes
  - trigger manual/scheduled
  - cron picker for scheduled
  - output target
  - memory toggle
  - permission behavior

### Permission Model

Saved agents respect Phase 4 permission mode:

- User may preconfigure a permission override at saved-agent creation.
- If effective permission is `ASK`, scheduled runs pause when approval is
  needed.
- `FULL_ACCESS` still cannot bypass connector forbidden patterns or destructive
  approval rules.

### Memory Integration

Saved-agent memory defaults to `NONE`. When enabled, only final summaries and
allowlisted integration memory candidates may be written. Raw integration
payloads are never stored.

### Action Log and Failure Memory

- Each saved-agent run writes action log entry `saved_agent_run_started` and
  final success/failure entry.
- Failures write failure memory with generalized lessons.

### Smokes

- `pnpm smoke:saved-agent-crud`
- `pnpm smoke:saved-agent-run-now`
- `pnpm smoke:saved-agent-schedule`
- `pnpm smoke:saved-agent-output-slack`
- Playwright: create saved agent, run now, see output in Handle Inbox.

## Stage Breakdown

### Stage 0: Spec

Commit:

- `Phase 6.5: Specification draft`

Deliverable:

- `docs/phase-6.5/PHASE_6.5_SPEC.md`

### Stage 1: Temporal Infrastructure and Async Task UX

Expected commits:

- `Phase 6.5 Stage 1: Add Temporal dev server and worker scaffold`
- `Phase 6.5 Stage 1: Add async AgentRun workflow fields and migration`
- `Phase 6.5 Stage 1: Queue agent runs through Temporal`
- `Phase 6.5 Stage 1: Add task Inbox and background continuation UI`
- `Phase 6.5 Stage 1: Add notification settings and dispatch`
- `Phase 6.5 Stage 1: Update stack-of-record docs from BullMQ to Temporal`
- `Phase 6.5 Stage 1: Add async task smokes`

Smokes:

- `pnpm smoke:temporal-up`
- `pnpm smoke:async-task-background`
- `pnpm smoke:notifications-webhook`
- Playwright task close/reopen flow.

### Stage 2: BYOK Web Search Providers

Expected commits:

- `Phase 6.5 Stage 2: Add search provider schema and key storage`
- `Phase 6.5 Stage 2: Add Tavily, Serper, and Brave provider clients`
- `Phase 6.5 Stage 2: Route web_search and web_fetch through BYOK providers`
- `Phase 6.5 Stage 2: Add Settings -> Search Providers UI`
- `Phase 6.5 Stage 2: Add search provider smokes`

### Stage 3: todo.md Persistent Task Tracking

Expected commits:

- `Phase 6.5 Stage 3: Add todo.md classifier and workspace file lifecycle`
- `Phase 6.5 Stage 3: Update agent prompt for persistent todo tracking`
- `Phase 6.5 Stage 3: Pin todo.md in workspace UI`
- `Phase 6.5 Stage 3: Add todo.md smokes`

### Stage 4: Critic/Verifier Agent Role

Expected commits:

- `Phase 6.5 Stage 4: Add critic settings schema`
- `Phase 6.5 Stage 4: Add critic runner and verdict model`
- `Phase 6.5 Stage 4: Wire critic intervention points`
- `Phase 6.5 Stage 4: Add critic UI and inspector timeline`
- `Phase 6.5 Stage 4: Add critic memory/action-log integration`
- `Phase 6.5 Stage 4: Add critic smokes`

### Stage 5: Workflow Templates

Expected commits:

- `Phase 6.5 Stage 5: Add workflow template schema`
- `Phase 6.5 Stage 5: Add Nango webhook ingest and trigger adapters`
- `Phase 6.5 Stage 5: Add workflow runtime on shared agent runtime`
- `Phase 6.5 Stage 5: Add Settings -> Workflows UI`
- `Phase 6.5 Stage 5: Add workflow approval and action logging`
- `Phase 6.5 Stage 5: Add workflow smokes`

### Stage 6: Cross-Integration Agents

Expected commits:

- `Phase 6.5 Stage 6: Add saved agent schema`
- `Phase 6.5 Stage 6: Add saved agent runtime and run-now flow`
- `Phase 6.5 Stage 6: Add Temporal scheduling for saved agents`
- `Phase 6.5 Stage 6: Add output dispatch targets`
- `Phase 6.5 Stage 6: Add Settings -> Saved Agents UI`
- `Phase 6.5 Stage 6: Add saved agent smokes`

### Stage 7: Hardening, Audit Harness, Regression

Expected commits:

- `Phase 6.5 Stage 7: Add manual audit harness`
- `Phase 6.5 Stage 7: Add final regression smokes`
- `Phase 6.5 Stage 7: Record handoff evidence`

Deliverables:

- `scripts/manual-audit/phase6.5-additions.md`
- `docs/phase-6.5/HANDOFF.md`

Do not write SIGNOFF before user audit passes.

## Manual Audit Harness

Stage 7 creates `scripts/manual-audit/phase6.5-additions.md` with:

- Section A: Temporal infrastructure and async task lifecycle
- Section B: Notification channels: email, Slack, webhook opt-in
- Section C: BYOK Search providers: Tavily, Serper, Brave
- Section D: todo.md auto-create, maintenance, and UI visibility
- Section E: Critic/Verifier opt-in, verdicts, revise/reject behavior, cost
- Section F: Workflow templates: trigger, filter, action, approval
- Section G: Cross-Integration Agents: manual, scheduled, connector access,
  output target
- Section H: Memory integration for all six items
- Section I: Action log and failure memory for all six items
- Section J: Regression: Phase 1-6 still works

## Required Final Smokes

Before Phase 6.5 handoff:

- `pnpm test`
- `pnpm build`
- Phase 1-6 regression smokes used in Phase 6 handoff:
  - `pnpm smoke:e2e-canonical`
  - `pnpm smoke:browser-tools`
  - `pnpm smoke:computer-use-agent`
  - `pnpm smoke:local-backend-basic`
  - `pnpm smoke:memory-recall`
  - Phase 6 integration smokes that remain credential-valid
- Phase 6.5 smokes:
  - `pnpm smoke:temporal-up`
  - `pnpm smoke:async-task-background`
  - `pnpm smoke:notifications-webhook`
  - `pnpm smoke:search-provider-tavily`
  - `pnpm smoke:search-provider-serper`
  - `pnpm smoke:search-provider-brave`
  - `pnpm smoke:web-search-fallback`
  - `pnpm smoke:todo-auto-create`
  - `pnpm smoke:todo-skip-one-shot`
  - `pnpm smoke:critic-plan-approve`
  - `pnpm smoke:critic-revise-loop`
  - `pnpm smoke:critic-reject`
  - `pnpm smoke:workflow-template-crud`
  - `pnpm smoke:workflow-run-manual`
  - `pnpm smoke:saved-agent-crud`
  - `pnpm smoke:saved-agent-run-now`
  - `pnpm smoke:saved-agent-schedule`

Each UI feature requires a real browser walkthrough in addition to headless
Playwright.

## Risk Summary

- Temporal determinism: Workflow code must stay thin. All LLM/tool/network/DB
  work belongs in activities.
- Temporal dev server packaging: Docker image/CLI details may require
  adjustment during Stage 1. If blocked for more than 1 hour, stop and surface.
- Async approvals: Scheduled/background tasks can pause indefinitely in `ASK`
  mode. UI and notifications must make this obvious.
- Search provider drift: Serper/Brave/Tavily contracts may change. Stage 2 must
  verify docs and add typed provider errors before smokes.
- Critic cost: Critic can multiply LLM calls. UI must show that the feature is
  opt-in and may increase cost.
- todo.md false positives: Bad heuristics could create noise. Smokes must cover
  both create and skip paths.
- Nango webhook dependencies: Some workflow triggers may be unavailable or need
  provider-side webhook setup. Mark connector-specific blockers as PARTIAL and
  continue.
- Saved-agent schedules: Scheduled runs plus approval gates need careful UX so
  unattended tasks do not silently stall.
- Memory pollution: Workflow/search/saved-agent outputs must use conservative
  allowlists and per-message memory-off behavior.

## Open Questions

These should be resolved before or during implementation review:

1. Should webhook notifications include an HMAC signature using a user-provided
   secret, or is a static bearer token enough for Phase 6.5?
2. What default Temporal UI port should the app surface if `8233` is occupied?
3. For scheduled saved agents in `ASK` mode, should Handle notify immediately
   on first approval need or batch approvals for the run?
4. Should `web_fetch` use direct HTTP fetch for all providers when provider
   extract APIs are unavailable, or should it fail over to browser tools for
   JavaScript-heavy pages?
5. What default polling interval should Workflow Templates use for connectors
   without webhooks? Suggested Phase 6.5 default: 15 minutes.
6. Should Workflow Templates allow free-form natural-language conditions in
   Phase 6.5, or only structured filters?
7. Should Saved Agent scheduled output default to Handle Inbox even when Slack
   or email connectors are configured? Suggested default: Handle Inbox.

## Stop Conditions

Stop and surface if:

- Temporal self-hosted setup blocks for more than 1 hour.
- A Temporal SDK/runtime constraint requires moving LLM or tool calls into
  workflow code directly.
- BYOK search provider API contracts have changed enough to require a new
  provider abstraction.
- Critic role conflicts with LangChain/LangGraph state in a way that cannot be
  patched locally.
- todo.md heuristic produces unacceptable false positives in smoke.
- Nango workflow trigger support is unavailable for a connector needed by the
  audit section.
- Saved-agent runtime conflicts with Phase 5 shared memory primitive.
- Any smoke fails 3 times with the same root cause.
- Any stage has more than 30 minutes of stuck time.

If one connector/provider is blocked, mark that connector as PARTIAL, document
the exact blocker, and continue with the next provider unless the blocker is
architectural.

