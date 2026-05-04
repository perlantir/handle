# Phase 7 Spec: Skills Platform

## Status

Stage 0 specification draft. No implementation is included in this commit.

Phase 7 ships the full Skills platform as `v0.7.0`. Skills are installable,
auditable, reusable workflow packages. They are not prompt presets and they are
not a paid marketplace.

This document is the canonical Phase 7 plan. It supersedes the older
`docs/codex-context/FINAL_PHASE_7_SKILLS.md` where that older roadmap conflicts
with the Phase 7 kickoff. In particular, custom user-created Skills,
project Skill libraries, multi-Skill workflows, scheduled Skill runs, import and
export, browser/computer runtime modes, and deeper artifact/trace UI are now in
scope for Phase 7.

Do not treat this document as SIGNOFF. Phase 7 still needs implementation,
Codex live smokes, manual audit, user signoff, and the phase merge gate.

## Branching and Coordination

Phase 7 work uses branch `phase-7/skills`.

Branch base rule:

- If Phase 6 has merged to `main`, Phase 7 is cut from updated `main`.
- If Phase 6 has not merged yet, Stage 0 spec work may be cut from
  `origin/phase-6/integrations` so the integration context is present.
- Implementation stages should rebase onto updated `main` after Phase 6 and
  Phase 6.5 land, unless the user explicitly approves another base.

Parallel branch boundaries:

- Do not touch `phase-6/integrations`.
- Do not touch `phase-6.5/agent-foundation`.
- If Phase 7 needs code from Phase 6.5, rebase or cherry-pick only after user
  approval and only onto `phase-7/skills`.

## References Checked

Stage 0 drafting checked:

- `AGENTS.md`
- `docs/codex-context/FINAL_AGENTS.md`
- `docs/codex-context/FINAL_PHASE_7_SKILLS.md`
- `docs/codex-context/FINAL_PHASE_6_INTEGRATIONS.md`
- `docs/phase-6/PHASE_6_SPEC.md`
- `docs/phase-6.5/PHASE_6.5_SPEC.md` from
  `origin/phase-6.5/agent-foundation`
- `docs/phase-1/SIGNOFF.md` through `docs/phase-5/SIGNOFF.md`
- Existing Prisma schema, API route patterns, integration tool runtime,
  approval routes, Settings UI patterns, workspace shell, Playwright smokes,
  and manual audit harness layout.

Phase 6 and Phase 6.5 audits are in parallel, so their final SIGNOFF documents
may not exist at Stage 0 drafting time. Stage 1 must re-check the current merged
state before implementation.

## Ground Truth Decisions

- Phase 7 is the Skills platform. Phase 6.5 remains the agent foundation
  extension layer.
- Five built-in Skills must ship:
  - Research a Company
  - Email Outreach
  - Plan a Trip
  - Code Review a PR
  - Summarize a Notion Workspace
- Custom user-created Skills are in scope.
- Project Skill libraries are in scope.
- Team libraries are out of scope.
- Paid marketplace, buying, selling, revenue sharing, public paid listings, and
  checkout are out of scope.
- Multi-Skill workflows are in scope.
- Scheduled Skill runs are in scope and use Phase 6.5 Temporal infrastructure.
- Browser/computer runtime, local browser mode, and sandbox runtime sessions are
  in scope.
- Wide Research orchestration is in scope.
- Skill import/export is in scope.
- Every UI-facing feature needs Playwright coverage and a real browser live
  walkthrough before handoff.
- Skills must never expose private chain-of-thought. Traces are user-safe event
  summaries only.

## Product Principles

1. Skills are workflow packages, not prompt snippets.
2. Skills are inspectable: metadata, integrations, permissions, runtime,
   outputs, examples, owner, visibility, version, recent runs, and traces.
3. Skills are safe: tool access is narrowed by policy, and policies can only
   reduce the user's effective permissions.
4. Skills are traceable: runs record safe trace events, tool summaries, approval
   events, artifacts, costs, models, and citations where relevant.
5. Skills produce artifacts, not only chat messages.
6. Skills support citations where factual claims rely on external sources.
7. Users can create, edit, test, import, export, and run custom Skills.
8. Users can save Skills to personal or project libraries.
9. Skills can compose into sequential and parallel workflows.
10. Skills can be scheduled through Temporal.
11. Skills can use browser/computer execution within explicit runtime policy.

## Non-Goals

- Paid Skill marketplace.
- Team-scoped Skill libraries.
- Public Skill listing, ranking, monetization, or revenue sharing.
- Native Tauri skill distribution UX.
- Running unreviewed imported scripts with host access.
- A custom agent loop. Skill execution uses the existing LangChain/LangGraph
  runtime and Phase 6.5 Temporal orchestration where durable execution is
  required.
- A parallel memory system. Persistent memory still goes through Zep.
- Custom OAuth. Third-party services still go through Nango except Obsidian
  local vault behavior from Phase 6.

## Existing Foundations Reused

Phase 7 builds on:

- Phase 1 SSE event bus, task creation, health route, and workspace shell.
- Phase 2 provider registry, provider fallback, provider settings, and model
  selection.
- Phase 3 browser and computer-use tooling.
- Phase 4 projects, conversations, approvals, SafetyGovernor, local execution,
  permission modes, and local browser modes.
- Phase 5 memory, action log, failure memory, trajectory memory, resumability,
  artifacts-adjacent action history, and shared-memory primitive.
- Phase 6 Nango integrations, explicit integration tools, execute fallback
  tools, connector memory allowlists, typed errors, multi-account state, and
  approval gates.
- Phase 6.5 Temporal, async task UX, Notifications, Search Providers,
  Critic/Verifier, `todo.md`, workflow templates, and saved agents.

If a foundation is not present on the branch when implementation starts, Stage 1
must stop and surface the mismatch before coding around it.

## Cross-Cutting Security and Observability

All Skills and Skill runs must follow these rules:

- Secrets never enter logs, prompts, traces, artifacts, Zep facts, action logs,
  failure memory, or Temporal workflow payloads without redaction.
- Skill packages cannot broaden project permissions. They can only narrow tools,
  runtimes, and approvals.
- Write and destructive actions use the Phase 4 approval flow.
- Destructive actions always require approval.
- Integration writes use Phase 6 approval gates and forbidden patterns.
- Host filesystem, local browser, real network, and real installed application
  actions are Rule 33 gated and audited.
- Imported Skills are disabled until validation succeeds.
- Skill traces store user-safe summaries, not private chain-of-thought.
- Every tool call records redacted input/output summaries and timing in
  `SkillRunStep`.
- Successful real-world outcomes write Phase 5 action log entries.
- Reusable failures write failure memory summaries with sensitive data removed.
- Diagnostic logging comes before speculative fixes when live smokes fail.

## Skill Package Format

Built-in Skills live under:

```text
apps/api/src/skills/packages/<skill-id>/
  skill.json
  SKILL.md
  examples/
    activation.json
    negative-activation.json
  evals/
    happy-path.json
    safety.json
  resources/
  scripts/
  templates/
  ui-template.json
```

Custom Skills live in the database and can be exported to the same folder shape
as a portable bundle.

### `skill.json`

`skill.json` is the canonical manifest. Stage 1 adds a Zod schema and generated
TypeScript types.

```json
{
  "id": "research-company",
  "version": "1.0.0",
  "name": "Research a Company",
  "description": "Deep company research with cited report artifacts.",
  "category": "research",
  "icon": {
    "kind": "letter",
    "value": "R",
    "tone": "violet"
  },
  "package": {
    "source": "builtin",
    "author": "Handle",
    "license": "internal",
    "homepage": null
  },
  "activationExamples": [],
  "negativeActivationExamples": [],
  "inputSlots": [],
  "requiredIntegrations": [],
  "optionalIntegrations": ["NOTION"],
  "runtimePolicy": {},
  "toolPolicy": {},
  "approvalPolicy": {},
  "outputArtifactContract": {},
  "sourceCitationPolicy": {},
  "uiTemplate": "wide-research",
  "suggestedModel": null,
  "evalFixtures": ["evals/happy-path.json"],
  "resources": [],
  "scheduling": {
    "allowed": true
  },
  "visibility": "BUILTIN",
  "metadata": {}
}
```

### `SKILL.md`

`SKILL.md` contains user-inspectable operational instructions:

- Purpose.
- When to activate.
- When not to activate.
- Required inputs and clarification rules.
- Workflow steps.
- Tool usage guidance.
- Citation requirements.
- Artifact requirements.
- Safety and approval requirements.
- Failure handling.

`SKILL.md` is not a hidden system prompt. Users can view it before running the
Skill. For custom Skills, users can edit it.

### Activation Examples

Activation examples are positive and negative examples for classifier tests and
UI explanations. Negative examples are required so the classifier does not
over-trigger Skills.

### Required Input Slots

Input slots define the run form:

```typescript
interface SkillInputSlot {
  id: string;
  label: string;
  description?: string;
  type:
    | "text"
    | "textarea"
    | "url"
    | "email"
    | "number"
    | "select"
    | "multi_select"
    | "date"
    | "file"
    | "integration_account"
    | "repository"
    | "notion_page"
    | "calendar_range";
  required: boolean;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
  validation?: Record<string, unknown>;
}
```

### Runtime Policy

Runtime policy narrows where and how a Skill can run:

```typescript
interface SkillRuntimePolicy {
  executionBackends: Array<"E2B" | "LOCAL">;
  browserModes: Array<"NONE" | "SERVER_BROWSER" | "LOCAL_BROWSER" | "COMPUTER_USE">;
  filesystem: "EPHEMERAL" | "PROJECT_WORKSPACE" | "PERSISTENT_PROJECT";
  maxDurationMinutes: number;
  maxToolCalls: number;
  maxEstimatedCostUsd?: number;
  allowParallelSubtasks: boolean;
  requiresTodo: boolean;
  requiresCritic?: boolean;
  memoryScope: "INHERIT" | "NONE" | "PROJECT_ONLY" | "GLOBAL_AND_PROJECT";
}
```

The effective runtime is the intersection of:

- Skill runtime policy.
- Project permission mode and workspace scope.
- User selected backend/model.
- Connector availability and connection status.
- Phase 6.5 async/Temporal availability for scheduled runs.

### Tool Policy

Tool policy is an allowlist:

```typescript
interface SkillToolPolicy {
  allowedTools: string[];
  deniedTools?: string[];
  allowedConnectors: string[];
  writeToolsRequireApproval: boolean;
  destructiveToolsRequireApproval: true;
  localBrowserRequiresApproval: boolean;
  hostFilesystemRequiresApproval: boolean;
}
```

No Skill can request wildcard access to all tools unless it is a custom Skill
explicitly created by the user and the UI presents a warning. Built-in Skills
must use narrow allowlists.

### Approval Policy

Approval policy can make a Skill stricter than the project, not looser:

```typescript
interface SkillApprovalPolicy {
  requireBeforeRun?: boolean;
  requireBeforeWrites: boolean;
  requireBeforeExternalSend: boolean;
  requireBeforeLocalBrowser: boolean;
  requireBeforeHostFilesystem: boolean;
  batchApprovalAllowed: boolean;
  approvalCopyTemplate?: string;
}
```

Examples:

- Email Outreach always requires approval before sending.
- Code Review a PR requires approval before posting comments or reviews.
- Research a Company can read the web without approval, but saving to Notion
  requires approval unless the effective project permission allows it.

### Output Artifact Contract

Every Skill declares the artifacts it may produce:

```typescript
interface SkillArtifactContract {
  required: Array<{
    kind: SkillArtifactKind;
    title: string;
    mimeType: string;
    schema?: Record<string, unknown>;
    citationsRequired?: boolean;
  }>;
  optional?: Array<{
    kind: SkillArtifactKind;
    title: string;
    mimeType: string;
    schema?: Record<string, unknown>;
    citationsRequired?: boolean;
  }>;
}
```

Artifacts are stored as inline JSON/Markdown for small artifacts. Large files
use the existing file/storage path chosen by the implementation stage. If Phase
7 introduces Cloudflare R2 storage, it must follow the locked stack and avoid
committing credentials.

### Source and Citation Policy

Citation policy describes which claims require source attribution:

```typescript
interface SkillSourceCitationPolicy {
  required: boolean;
  citationStyle: "inline_links" | "numbered_sources" | "footnotes";
  minSourceCount?: number;
  preferredSources?: string[];
  disallowedSources?: string[];
  requireSourceSetArtifact: boolean;
}
```

Research, trip planning, Notion summaries, and web-supported factual claims
require citations. Email drafts and code review comments only require citations
when they quote or summarize an external source.

### UI Template

`uiTemplate` controls run/artifact presentation:

- `standard`
- `wide-research`
- `draft-review`
- `itinerary`
- `code-review`
- `notion-summary`
- `workflow`

The UI template cannot change permissions. It only changes presentation.

## Database Schema

Stage 1 adds Skill core models. Stage 2 adds custom creation, schedules, import,
export, and workflow models.

### Enums

```prisma
enum SkillSourceType {
  BUILTIN
  CUSTOM
  IMPORTED
}

enum SkillVisibility {
  BUILTIN
  PERSONAL
  PROJECT
}

enum SkillRunStatus {
  QUEUED
  RUNNING
  WAITING
  PAUSED
  COMPLETED
  FAILED
  CANCELLED
}

enum SkillRunTrigger {
  MANUAL
  SCHEDULED
  WORKFLOW
  API
  SUGGESTED
}

enum SkillRunStepType {
  PLAN
  TOOL
  APPROVAL
  ARTIFACT
  MEMORY
  BROWSER
  COMPUTER
  CRITIC
  WORKFLOW
  SCHEDULE
  ERROR
}

enum SkillArtifactKind {
  REPORT
  SOURCE_SET
  EMAIL_DRAFTS
  ITINERARY
  CODE_REVIEW
  NOTION_SUMMARY
  EXECUTION_PLAN
  FILE
  BROWSER_SESSION_SUMMARY
  TRACE_SUMMARY
  CUSTOM_JSON
  CUSTOM_MARKDOWN
}
```

### Stage 1 Models

```prisma
model Skill {
  id                         String          @id @default(cuid())
  slug                       String
  version                    String
  sourceType                 SkillSourceType
  visibility                 SkillVisibility
  ownerUserId                String?
  projectId                  String?
  name                       String
  description                String
  category                   String
  icon                       Json            @default("{}")
  packageMetadata            Json            @default("{}")
  packagePath                String?
  skillMd                    String
  activationExamples         Json            @default("[]")
  negativeActivationExamples Json            @default("[]")
  inputSlots                 Json            @default("[]")
  requiredIntegrations       String[]        @default([])
  optionalIntegrations       String[]        @default([])
  runtimePolicy              Json            @default("{}")
  toolPolicy                 Json            @default("{}")
  approvalPolicy             Json            @default("{}")
  outputArtifactContract     Json            @default("{}")
  sourceCitationPolicy       Json            @default("{}")
  uiTemplate                 String          @default("standard")
  suggestedProvider          String?
  suggestedModel             String?
  evalFixtures               Json            @default("[]")
  reusableResources          Json            @default("[]")
  schedulingConfig           Json            @default("{}")
  customMetadata             Json            @default("{}")
  enabled                    Boolean         @default(true)
  archivedAt                 DateTime?
  createdAt                  DateTime        @default(now())
  updatedAt                  DateTime        @updatedAt
  runs                       SkillRun[]

  @@unique([slug, version, sourceType, ownerUserId, projectId])
  @@index([visibility, projectId])
  @@index([ownerUserId, updatedAt])
}

model SkillRun {
  id                 String          @id @default(cuid())
  skillId            String
  skill              Skill           @relation(fields: [skillId], references: [id], onDelete: Cascade)
  userId             String
  projectId          String?
  conversationId     String?
  agentRunId         String?
  temporalWorkflowId String?
  temporalRunId      String?
  trigger            SkillRunTrigger @default(MANUAL)
  status             SkillRunStatus  @default(QUEUED)
  inputs             Json            @default("{}")
  effectivePolicies  Json            @default("{}")
  providerId         String?
  modelName          String?
  resultSummary      String?
  errorCode          String?
  errorMessage       String?
  costUsd            Decimal?        @db.Decimal(10, 4)
  startedAt          DateTime?
  completedAt        DateTime?
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt
  steps              SkillRunStep[]
  artifacts          SkillArtifact[]

  @@index([skillId, createdAt])
  @@index([userId, status, createdAt])
  @@index([projectId, createdAt])
  @@index([agentRunId])
}

model SkillRunStep {
  id             String           @id @default(cuid())
  skillRunId     String
  skillRun       SkillRun         @relation(fields: [skillRunId], references: [id], onDelete: Cascade)
  index          Int
  type           SkillRunStepType
  title          String
  status         String
  safeSummary    String
  toolName       String?
  connectorId    String?
  approvalId     String?
  artifactId     String?
  redactedInput  Json             @default("{}")
  redactedOutput Json             @default("{}")
  metadata       Json             @default("{}")
  startedAt      DateTime         @default(now())
  completedAt    DateTime?

  @@unique([skillRunId, index])
  @@index([skillRunId, type])
}

model SkillArtifact {
  id             String            @id @default(cuid())
  skillRunId     String
  skillRun       SkillRun          @relation(fields: [skillRunId], references: [id], onDelete: Cascade)
  kind           SkillArtifactKind
  title          String
  mimeType       String
  inlineContent  String?
  contentRef     String?
  metadata       Json              @default("{}")
  citations      Json              @default("[]")
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@index([skillRunId, kind])
}
```

### Stage 2 Models

```prisma
model SkillSchedule {
  id                 String   @id @default(cuid())
  skillId            String
  userId             String
  projectId          String?
  name               String
  enabled            Boolean  @default(false)
  cronExpression     String?
  runAt              DateTime?
  timezone           String
  inputs             Json     @default("{}")
  temporalScheduleId String?
  lastRunAt          DateTime?
  nextRunAt          DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([userId, enabled])
  @@index([skillId])
}

model SkillWorkflow {
  id          String   @id @default(cuid())
  userId      String
  projectId   String?
  name        String
  description String?
  visibility  SkillVisibility @default(PERSONAL)
  graph       Json     @default("{}")
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  runs        SkillWorkflowRun[]

  @@index([userId, projectId])
}

model SkillWorkflowRun {
  id                 String   @id @default(cuid())
  workflowId         String
  workflow           SkillWorkflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  userId             String
  projectId          String?
  status             SkillRunStatus @default(QUEUED)
  temporalWorkflowId String?
  inputs             Json     @default("{}")
  artifactMap        Json     @default("{}")
  errorCode          String?
  errorMessage       String?
  createdAt          DateTime @default(now())
  completedAt        DateTime?

  @@index([workflowId, createdAt])
  @@index([userId, status])
}

model SkillImportRecord {
  id             String   @id @default(cuid())
  userId         String
  skillId        String?
  sourceName     String
  validation     Json     @default("{}")
  status         String
  createdAt      DateTime @default(now())

  @@index([userId, createdAt])
}
```

The final schema may adjust relation fields to match merged Phase 6/6.5 models.
If a schema change requires modifying Phase 6.5 models, stop and ask.

## Backend Architecture

### Modules

Stage 1:

- `apps/api/src/skills/types.ts`
- `apps/api/src/skills/manifestSchema.ts`
- `apps/api/src/skills/packageLoader.ts`
- `apps/api/src/skills/skillRegistry.ts`
- `apps/api/src/skills/skillMarkdown.ts`
- `apps/api/src/skills/skillPolicy.ts`
- `apps/api/src/skills/skillRuntime.ts`
- `apps/api/src/skills/skillRunner.ts`
- `apps/api/src/skills/skillTrace.ts`
- `apps/api/src/skills/artifacts.ts`
- `apps/api/src/skills/citations.ts`
- `apps/api/src/skills/evals.ts`
- `apps/api/src/skills/builtin/`
- `apps/api/src/routes/skills.ts`
- `apps/api/src/routes/skillRuns.ts`

Stage 2:

- `apps/api/src/skills/customSkills.ts`
- `apps/api/src/skills/importExport.ts`
- `apps/api/src/skills/workflows.ts`
- `apps/api/src/skills/schedules.ts`
- `apps/api/src/skills/browserRuntime.ts`
- `apps/api/src/skills/wideResearch.ts`

### Registry

The registry merges:

1. Built-in packages from `apps/api/src/skills/packages/`.
2. User custom Skills from `Skill` rows.
3. Project Skills from `Skill` rows where `visibility = PROJECT`.
4. Imported Skills that pass validation.

Built-in Skills are idempotently seeded into the database at API startup or via
a script. The implementation must avoid duplicate rows when the server restarts.

Registry functions:

```typescript
listSkillsForUser(input: { userId: string; projectId?: string }): Promise<SkillSummary[]>
getSkillForUser(input: { skillIdOrSlug: string; userId: string; projectId?: string }): Promise<SkillDetail>
validateSkillManifest(manifest: unknown): SkillManifest
loadBuiltinSkillPackages(): Promise<SkillPackage[]>
syncBuiltinSkills(): Promise<void>
```

### Markdown Parser

`SKILL.md` parser extracts headings for display and runtime sections:

- Overview.
- Activation.
- Inputs.
- Workflow.
- Tools.
- Safety.
- Artifacts.
- Citations.
- Evaluation.

If required headings are missing in a custom Skill, validation returns a typed
error with line-level guidance.

### Skill Runner

The Skill runner creates a normal `SkillRun` plus a linked `AgentRun` when the
Skill needs agent execution. It then runs the existing agent runtime with:

- Skill instructions injected into a versioned prompt block.
- Skill tool allowlist enforced before tools reach LangChain.
- Effective runtime policy enforced before backend/session creation.
- Required input slots validated before starting.
- Required integrations checked before starting.
- Source/citation policy included in the prompt and artifact validator.
- Trace recorder subscribed to the same tool/action events as the workspace UI.

Prompt version:

- Stage 1 changes semantic agent instructions and must bump the system prompt
  version.
- Add a Skill-specific prompt identifier, for example
  `skill_runtime_prompt_v1`.

Skill prompt context format:

```xml
<active_skill id="research-company" version="1.0.0">
  <name>Research a Company</name>
  <instructions>...</instructions>
  <runtime_policy>...</runtime_policy>
  <tool_policy>...</tool_policy>
  <artifact_contract>...</artifact_contract>
  <citation_policy>...</citation_policy>
</active_skill>
```

### Tool Allowlisting

All tools pass through a Skill filter:

1. Start from the tools available to the project and user.
2. Remove tools not listed in `allowedTools`.
3. Remove connectors not listed in `allowedConnectors`.
4. Apply project permission mode.
5. Apply connector forbidden patterns.
6. Apply Skill approval policy.

If no usable tools remain, the run fails before model invocation with a typed
`skill_missing_capability` error.

### Artifact Validation

Before a Skill run completes, the artifact validator checks:

- Required artifacts exist.
- Required citation counts and citation shape are satisfied.
- Email drafts are drafts, not sent messages, until approval.
- Trip itinerary has dates, location, source set, and caveats.
- Code review artifact has file references, severity, rationale, and suggested
  patches or comments.
- Notion summary artifact has source page/database IDs and safe excerpts.

If validation fails, the agent can revise up to two times. After two failures,
the run fails with `artifact_contract_not_met`.

### Trace Safety

`SkillRunStep.safeSummary` is the primary trace text. It must be concise and
safe:

- Allowed: "Searched GitHub issues for label bug and found 12 open issues."
- Allowed: "Drafted 3 email messages and requested approval before sending."
- Forbidden: private chain-of-thought, raw OAuth tokens, full email bodies,
  sensitive document bodies, raw API keys, secret values, or unredacted stack
  traces.

### Memory Integration

Skill memory follows Phase 5 and Phase 6:

- Skill run inputs and artifacts are not automatically stored as facts.
- Memory writes happen only through existing memory tools or connector
  memoryCandidates.
- Per-message memory off disables memoryCandidates for Skill-triggered tool
  calls in that turn.
- `todo.md` content from Phase 6.5 is not extracted to memory.
- Skill traces are not user facts.
- Skill run summaries may become memory candidates only if the user's project
  memory setting allows it and the content passes redaction and extraction
  filters.

### Action Log and Failure Memory

Every successful real-world outcome writes action log entries after execution.

Examples:

- Gmail send from Email Outreach: `integration_action` with connector `GMAIL`.
- GitHub PR comment from Code Review a PR: `integration_action` with connector
  `GITHUB`.
- Local browser session from Research a Company: `browser_navigated` summaries
  where already supported by Phase 5 action logging.
- Exported artifact file: `file_created`.

Reusable failures write failure memory:

- Missing integration account.
- Approval denied for a write-heavy Skill.
- Citation validator failed due to weak sources.
- Imported Skill validation rejected unsafe tool policy.

Failure memory never stores private bodies, secrets, or unredacted API payloads.

## API Surface

All endpoints live under `/api` and follow existing Express route conventions.
Next.js proxy routes mirror these for browser calls where the app already uses
proxy routes.

### Skills

- `GET /api/skills`
  - Query: `projectId`, `visibility`, `category`, `q`.
  - Returns built-in, personal, and project-visible Skill summaries.
- `POST /api/skills`
  - Creates a custom Skill.
  - Stage 2.
- `GET /api/skills/:id`
  - Returns full detail, parsed `SKILL.md`, policies, examples, eval fixtures,
    recent runs, and artifact contract.
- `PUT /api/skills/:id`
  - Edits a custom or imported Skill.
  - Built-in Skills are read-only.
- `DELETE /api/skills/:id`
  - Archives a custom/imported Skill.
  - Built-ins cannot be deleted.
- `POST /api/skills/:id/test`
  - Runs validation/eval fixture without saving a scheduled run.
  - Stage 2.
- `POST /api/skills/:id/export`
  - Exports a portable Skill bundle.
  - Stage 2.
- `POST /api/skills/import`
  - Validates and imports a portable Skill bundle.
  - Stage 2.

### Skill Runs

- `POST /api/skills/:id/run`
  - Body: `projectId`, `conversationId?`, `inputs`, `backend?`, `providerId?`,
    `modelName?`, `memoryEnabled?`, `trigger?`.
  - Creates a `SkillRun` and starts execution.
- `GET /api/skill-runs`
  - Query by `skillId`, `projectId`, `status`, date range.
- `GET /api/skill-runs/:id`
  - Returns run, steps, artifacts, approvals, and linked AgentRun.
- `GET /api/skill-runs/:id/stream`
  - SSE stream for trace and artifact updates.
- `POST /api/skill-runs/:id/cancel`
- `POST /api/skill-runs/:id/pause`
- `POST /api/skill-runs/:id/resume`
- `POST /api/skill-runs/:id/approve`
  - Delegates to existing approval flow where possible.

### Artifacts

- `GET /api/skill-runs/:id/artifacts`
- `GET /api/skill-artifacts/:id`
- `GET /api/skill-artifacts/:id/download`
- `POST /api/skill-artifacts/:id/export`

### Schedules

Stage 2:

- `GET /api/skill-schedules`
- `POST /api/skills/:id/schedules`
- `PUT /api/skill-schedules/:id`
- `DELETE /api/skill-schedules/:id`
- `POST /api/skill-schedules/:id/run-now`

### Workflows

Stage 2:

- `GET /api/skill-workflows`
- `POST /api/skill-workflows`
- `GET /api/skill-workflows/:id`
- `PUT /api/skill-workflows/:id`
- `DELETE /api/skill-workflows/:id`
- `POST /api/skill-workflows/:id/run`
- `GET /api/skill-workflows/:id/runs`

### Skill Detection

- `POST /api/skills/detect`
  - Body: `projectId`, `message`, `availableIntegrationIds`.
  - Returns ranked Skill suggestions.

Detection is optional in Stage 1. If implemented, it must be conservative and
must not auto-run Skills without user confirmation.

## UI Surface

Phase 7 should use top-level `/skills` because the existing shell already has a
Skills nav item. Settings can contain Skill preferences later, but the main
library/run/history experience belongs on `/skills`.

### `/skills`

Primary layout:

- Header with search, category filters, and "Create Skill" in Stage 2.
- Tabs:
  - Built-in
  - Personal
  - Project
  - Recent Runs
  - Workflows (Stage 2)
  - Scheduled (Stage 2)
- Skill cards show:
  - icon
  - name
  - category
  - visibility
  - required integrations
  - status: ready, needs integration, disabled, validation error
  - recent run count and last run status
- Empty states explain what is missing without marketing copy.

### Skill Detail

Route: `/skills/:id`.

Sections:

- Overview.
- Required input slots.
- Required/optional integrations and account state.
- Runtime policy.
- Tool policy.
- Approval policy.
- Output artifacts.
- Source/citation policy.
- Examples and negative examples.
- Eval fixtures.
- Recent runs.
- Version, owner, visibility, and package source.

Built-ins are read-only. Custom/imported Skills show Edit, Export, Archive, and
Test actions.

### Skill Run

Route can be `/skills/:id/run` or an in-page drawer, but it must support:

- Input form generated from `inputSlots`.
- Integration account selectors.
- Backend/model controls inherited from composer patterns.
- Memory toggle consistent with Phase 5.
- Run button.
- Validation errors before run starts.
- Approval modal when policy requires it.
- Real-time progress and trace.

### Skill Trace

Route: `/skill-runs/:id`.

Displays:

- Run status, model, cost, duration.
- User-safe step timeline.
- Tool summaries.
- Approval events.
- Browser/computer session summaries and screenshots where available.
- Artifact list.
- Linked conversation/AgentRun.
- Errors with actionable next steps.

No chain-of-thought is displayed.

### Artifact UI

Artifact renderers:

- Markdown report with citations.
- Source set table.
- Email draft batch with approve/send controls.
- Trip itinerary with day cards and source list.
- Code review with findings, file refs, severity, and comment/draft controls.
- Notion summary with page/database source chips.
- File artifact viewer/download.
- JSON artifact viewer for custom Skills.

### Custom Skill Edit UI

Stage 2:

- Manifest editor with structured fields.
- `SKILL.md` editor.
- Input slot builder.
- Required/optional integration picker.
- Tool allowlist picker.
- Runtime policy controls.
- Approval policy controls.
- Artifact contract builder.
- Source/citation policy controls.
- Eval fixture editor.
- Test run panel.
- Save to Personal or Project library.

Imported Skills open in the same editor after validation.

### Multi-Skill Workflow UI

Stage 2:

- Workflow builder on `/skills` Workflows tab.
- Sequential steps.
- Parallel branches when every involved Skill allows parallel subtasks.
- Artifact passing: user selects output artifact from previous step as input to
  later step.
- Run history and trace.
- Approval pauses per step.

### Scheduling UI

Stage 2:

- One-time and repeating schedule controls.
- Temporal status indicator.
- Timezone selector.
- Recent scheduled runs.
- "Run now" button.
- Disabled state when required integrations are disconnected.
- Clear copy that scheduled write actions may pause for approval.

## Built-In Skills

### 1. Research a Company

ID: `research-company`

Category: `research`

Purpose: produce a cited company research report with source set artifact.

Required inputs:

- Company name or URL.
- Research depth: quick, standard, deep.
- Optional focus areas: product, market, leadership, financials, hiring,
  recent news, competitors.

Required integrations:

- None.

Optional integrations:

- Notion for saving the report.
- Google Drive/Docs for exporting.

Tools:

- BYOK web search and web fetch from Phase 6.5.
- Browser tools and computer-use when the source requires interaction.
- Notion create page if user requests save.
- Drive/Docs export if user requests export.
- Memory search/save only through existing memory controls.

Runtime:

- Allows server browser.
- Allows local browser only with explicit approval.
- Allows parallel research subtasks in Stage 2 Wide Research.
- Requires citations.

Artifacts:

- `REPORT`: Markdown company report.
- `SOURCE_SET`: sources with URL, title, publisher/domain, accessed timestamp,
  confidence, and claim coverage.
- Optional `BROWSER_SESSION_SUMMARY`.

Approvals:

- Reads run without approval.
- Saving to Notion/Drive/Docs follows integration write approval policy.
- Local browser requires approval.

Eval fixtures:

- "Research Anthropic"
- "Research a private startup from its website"
- Negative: "What is 2+2?"

Live smoke:

- Run from `/skills`.
- Research a controlled company.
- Verify cited report, sources, trace, and artifact download.

### 2. Email Outreach

ID: `email-outreach`

Category: `communication`

Purpose: draft and optionally send personalized outreach emails.

Required inputs:

- Recipient list or source.
- Campaign goal.
- Tone.
- Call to action.
- Sender identity/context.

Required integrations:

- Gmail for sending.

Optional integrations:

- Notion, Google Sheets, Google Docs, Google Drive for contact/source data.

Tools:

- Gmail search/get/list labels/send.
- Sheets/Docs/Drive read tools where connected.
- Notion read tools where connected.
- Memory search for user preferences if enabled.

Runtime:

- Draft-first. Sending is never automatic.
- Batch size limit defaults to 20 recipients per run unless user changes it.
- Requires approval before any send.

Artifacts:

- `EMAIL_DRAFTS`: one draft per recipient with subject, body, recipient,
  personalization notes, source references, and send status.
- `SOURCE_SET` when sources are used.

Approvals:

- Sending requires explicit approval.
- Batch approval is allowed only after all drafts are visible.
- Forbidden patterns deny mass sends like "all contacts" unless the connector
  policy supports a safe explicit allow path.

Eval fixtures:

- Draft 3 outreach emails from supplied fake contacts.
- Negative: "Send this to everyone in my inbox."

Live smoke:

- Draft emails without Gmail credentials using fixture mode.
- With Gmail connected, send only to a controlled test address after approval.

### 3. Plan a Trip

ID: `plan-trip`

Category: `planning`

Purpose: create a cited travel itinerary.

Required inputs:

- Destination.
- Dates or duration.
- Travelers and constraints.
- Budget range.
- Interests.

Required integrations:

- None.

Optional integrations:

- Google Calendar for scheduling.
- Gmail for reading relevant travel confirmations only when user points to them.
- Google Drive/Docs for export.

Tools:

- Web search/fetch.
- Browser tools for travel sites where needed.
- Calendar create event with approval.
- Drive/Docs export with approval.

Runtime:

- Allows server browser.
- Requires citations for external claims.
- Local browser only with approval.

Artifacts:

- `ITINERARY`: day-by-day plan.
- `SOURCE_SET`: sources for lodging, transport, opening hours, constraints,
  and recommendations.
- Optional calendar draft events.

Approvals:

- Read/search no approval.
- Calendar creation requires approval.
- Purchases/bookings are out of scope and denied.

Eval fixtures:

- Plan a 3-day trip to Tokyo.
- Negative: "Book the cheapest hotel now."

Live smoke:

- Plan a trip and verify citations, artifact, and no purchase action.

### 4. Code Review a PR

ID: `code-review-pr`

Category: `engineering`

Purpose: review a GitHub pull request and produce actionable findings.

Required inputs:

- GitHub repo owner/name.
- PR number or URL.
- Review mode: summary, deep, security-focused.

Required integrations:

- GitHub.

Optional integrations:

- Slack for posting summary.
- Linear for issue follow-up.

Tools:

- GitHub list/get pull requests.
- GitHub list/get issues.
- GitHub search code.
- GitHub comment/update/create PR operations only after approval.
- Local shell/read-only tools only if repo is checked out inside project
  workspace and policy allows.

Runtime:

- Prefer read-only GitHub API review first.
- Local clone/build/test requires project workspace approval and normal
  execution gates.
- Critic review is recommended when Phase 6.5 critic is enabled.

Artifacts:

- `CODE_REVIEW`: findings with severity, file/path, line or range when
  available, rationale, suggested fix, and confidence.
- `SOURCE_SET`: PR files, commits, and linked issues reviewed.

Approvals:

- Posting comments/reviews requires approval.
- Closing issues, merging PRs, pushing commits, or force-pushing are denied
  unless a later phase explicitly enables them.

Eval fixtures:

- Review a fixture PR diff.
- Negative: "Merge this PR immediately."

Live smoke:

- With GitHub connected, review a controlled PR and produce artifact.
- Posting a comment remains approval-gated.

### 5. Summarize a Notion Workspace

ID: `summarize-notion-workspace`

Category: `analysis`

Purpose: summarize a Notion workspace, database, page set, or recent notes with
source attribution.

Required inputs:

- Notion page/database/workspace target.
- Time range or scope.
- Summary style: executive, detailed, action-item focused.

Required integrations:

- Notion.

Optional integrations:

- Slack/email for sending summary after approval.

Tools:

- Notion search/get/list databases/read pages.
- Notion create/update page only after approval.
- Slack/Gmail send only after approval.

Runtime:

- Read-only by default.
- Large workspaces use pagination and source set artifacts.
- Memory writes only through explicit allowlists and user memory settings.

Artifacts:

- `NOTION_SUMMARY`: summary sections, key decisions, action items, and open
  questions.
- `SOURCE_SET`: Notion page/database IDs, titles, timestamps, and safe excerpts.

Approvals:

- Read no approval.
- Creating/updating pages or sending summary requires approval.

Eval fixtures:

- Summarize a fixture workspace export.
- Negative: "Delete all old pages."

Live smoke:

- With Notion connected, summarize controlled test pages and verify citations.

## Skill Detection and Activation

Skill detection is conservative and user-confirmed.

Flow:

1. User submits or drafts a goal.
2. A lightweight classifier scores available Skills.
3. If top score is above threshold and the Skill is usable, UI shows a
   suggestion banner.
4. User clicks "Use Skill" or dismisses.
5. No Skill auto-runs without user confirmation.

Detection inputs:

- User message.
- Active project.
- Connected integrations.
- Skill activation/negative examples.

Detection output:

```typescript
interface SkillDetectionResult {
  skillId: string | null;
  confidence: number;
  reason: string;
  missingRequirements: string[];
}
```

Threshold:

- Default suggestion threshold: `0.75`.
- Below threshold: no banner.
- If required integrations are missing, show "available after connecting X"
  rather than a run button.

## Scheduling

Scheduled Skill runs use Phase 6.5 Temporal schedules.

Rules:

- Scheduled runs create normal `SkillRun` records.
- Scheduled runs can create linked `AgentRun` records.
- Scheduled write actions pause for approval in `ASK`/`PLAN`.
- Required integrations are checked at schedule creation and each run start.
- Disconnected/expired integrations cause a typed `integration_unavailable`
  failure and optional notification.
- Schedule payloads store identifiers and redacted input summaries, not secrets
  or private document bodies.

## Multi-Skill Workflows

Stage 2 supports sequential and parallel workflows.

Workflow graph:

```typescript
interface SkillWorkflowGraph {
  nodes: Array<{
    id: string;
    skillId: string;
    inputs: Record<string, unknown>;
    dependsOn: string[];
    parallelGroup?: string;
  }>;
  artifactBindings: Array<{
    fromNodeId: string;
    artifactKind: string;
    toNodeId: string;
    inputSlotId: string;
  }>;
}
```

Sequential mode:

- Node B starts after Node A completes and required artifacts validate.

Parallel mode:

- Nodes in a parallel group run together only if all involved Skills allow
  parallel subtasks.
- Parallel runs share a Phase 5 shared-memory namespace scoped to the workflow
  run.
- Artifact aggregation happens after all required nodes complete.

Failure behavior:

- Required node failure fails the workflow.
- Optional node failure marks partial and continues.
- Approval pauses only the affected node/branch.

## Browser and Computer Runtime

Skills can use browser/computer runtime only when runtime policy allows it.

Modes:

- `SERVER_BROWSER`: sandbox/browser tools in E2B or configured backend.
- `LOCAL_BROWSER`: user's local Chrome profile path or actual-Chrome flow from
  Phase 4, approval-gated.
- `COMPUTER_USE`: vision-based computer-use path with Rule 32 diagnostics.

Rules:

- Local browser mode always needs clear approval copy before first use in a
  Skill run.
- Computer-use traces include screenshots and summaries but never raw secrets.
- Browser sessions produce `BROWSER_SESSION_SUMMARY` artifacts where useful.
- Skills cannot silently switch from server browser to local browser.

## Wide Research Orchestration

Wide Research is the advanced mode for Research a Company and custom research
Skills.

Architecture:

- Uses Phase 6.5 shared runtime and shared memory primitive.
- Fans out sub-research tasks by topic/source type.
- Aggregates sources and claims into a single report artifact.
- Runs parallel subtasks only when project settings and Skill policy allow it.
- Requires source set artifact and citation validation.

Initial topics for Research a Company:

- Identity and official sources.
- Products/services.
- Leadership and history.
- Recent news.
- Market/competitors.
- Financials if public.
- Hiring/operations if relevant.

## Import and Export

Stage 2 implements portable bundles.

Export:

- Produces a zip/folder bundle with `skill.json`, `SKILL.md`, examples, evals,
  templates, and resources.
- Does not include secrets, run history, execution traces, or artifacts unless
  the user explicitly exports a separate run artifact package.

Import:

- Validates manifest schema.
- Validates `SKILL.md` required headings.
- Rejects forbidden tool policies.
- Flags high-risk policies for user review.
- Creates disabled imported Skill until user enables it.

Imported scripts:

- Scripts/templates can be included.
- Running scripts requires the same Phase 4 approval and SafetyGovernor gates
  as other local execution.
- Import does not auto-run scripts.

## Eval Fixtures and Tests

Each built-in Skill includes:

- Positive activation fixtures.
- Negative activation fixtures.
- Happy path fixture with mocked external dependencies.
- Safety fixture for approval/denial behavior.
- Artifact contract fixture.
- Citation fixture where required.

Test categories:

- Unit: manifest validation, parser, registry, policy intersection,
  artifact validation, citation validation.
- Integration: Skill run with mocked provider/tool runtime.
- Playwright: Skills list/detail/run/recent/artifact/approval UI.
- Smoke: live or controlled end-to-end flows where credentials are available.

## Implementation Stages

### Stage 0: Specification

Commit:

- `Phase 7: Specification draft`

Deliverable:

- `docs/phase-7/PHASE_7_SPEC.md`

No implementation starts until user review and approval.

### Stage 1: Foundation and 5 Built-In Skills

Goal: Skills work end-to-end for built-ins. Users can browse, inspect, run,
trace, and view artifacts.

Expected commits:

- `Phase 7 Stage 1: Add Skill package format and Prisma schema`
- `Phase 7 Stage 1: Add Skill registry and SKILL.md parser`
- `Phase 7 Stage 1: Add Skill execution runtime`
- `Phase 7 Stage 1: Add Research a Company built-in Skill`
- `Phase 7 Stage 1: Add Email Outreach built-in Skill`
- `Phase 7 Stage 1: Add Plan a Trip built-in Skill`
- `Phase 7 Stage 1: Add Code Review a PR built-in Skill`
- `Phase 7 Stage 1: Add Summarize a Notion Workspace built-in Skill`
- `Phase 7 Stage 1: Add Skill detail and run UI`
- `Phase 7 Stage 1: Add trace UI and artifact UI`
- `Phase 7 Stage 1: Add approval gates for Skill writes`
- `Phase 7 Stage 1: Add Skill eval fixtures and tests`

Stage 1 smokes:

- `pnpm smoke:skills-registry`
- `pnpm smoke:skill-run-research-company`
- `pnpm smoke:skill-run-email-outreach`
- `pnpm smoke:skill-run-plan-trip`
- `pnpm smoke:skill-run-code-review-pr`
- `pnpm smoke:skill-run-notion-summary`
- `pnpm smoke:skill-artifacts`
- `pnpm smoke:skill-approval-gates`
- Playwright: list/detail/run/trace/artifact UI.

Live walkthroughs:

- Run each of the 5 built-ins from `/skills`.
- For OAuth-blocked Skills, walk to the missing-credential state and document
  the exact user setup steps.

### Stage 2: Advanced Features

Goal: Custom Skills, project libraries, workflows, scheduling, browser/computer
runtime depth, Wide Research, and import/export.

Expected commits:

- `Phase 7 Stage 2: Add custom Skill creation UI`
- `Phase 7 Stage 2: Add custom Skill testing harness`
- `Phase 7 Stage 2: Add personal vs project library scoping`
- `Phase 7 Stage 2: Add multi-Skill workflow runtime sequential mode`
- `Phase 7 Stage 2: Add multi-Skill workflow runtime parallel mode`
- `Phase 7 Stage 2: Add Temporal-based Skill scheduling`
- `Phase 7 Stage 2: Add deeper browser/computer Skill runtime`
- `Phase 7 Stage 2: Add local browser mode for Skills`
- `Phase 7 Stage 2: Add Wide Research orchestration`
- `Phase 7 Stage 2: Add Skill import/export`
- `Phase 7 Stage 2: Add extended Recent Runs UI`

Stage 2 smokes:

- `pnpm smoke:custom-skill-crud`
- `pnpm smoke:custom-skill-test-run`
- `pnpm smoke:project-skill-library`
- `pnpm smoke:skill-workflow-sequential`
- `pnpm smoke:skill-workflow-parallel`
- `pnpm smoke:skill-schedule-once`
- `pnpm smoke:skill-schedule-cron`
- `pnpm smoke:skill-browser-runtime`
- `pnpm smoke:skill-local-browser-approval`
- `pnpm smoke:wide-research-orchestration`
- `pnpm smoke:skill-import-export`
- Playwright: create/edit/test/import/export/workflow/schedule UI.

### Final Hardening

After Stage 2:

- Add `scripts/manual-audit/phase7-skills.md`.
- Run `pnpm test`.
- Run `pnpm build`.
- Run Phase 1-6.5 regression smokes that remain credential-valid.
- Run all Phase 7 smokes.
- Perform Rule 35 live browser walkthroughs.
- Hand off for user audit.
- Do not write SIGNOFF until user audit passes.

## Manual Audit Harness

Stage 2 creates `scripts/manual-audit/phase7-skills.md`.

Sections:

### Section A: Registry and Built-In Library

- Open `/skills`.
- Verify all 5 built-in Skills appear.
- Verify metadata, required integrations, policies, examples, and versions.
- Verify built-ins are read-only.

### Section B: Research a Company

- Run "Research Anthropic" or another controlled company.
- Verify Wide Research layout.
- Verify plan/progress, cited report artifact, source set, and trace.
- Verify no write approval appears for reads.

### Section C: Email Outreach

- Run with fake contact fixture.
- Verify draft batch artifact.
- Verify Gmail send requires approval.
- With Gmail connected, send only to controlled test address.
- Verify action log entry after send.

### Section D: Plan a Trip

- Plan a 3-day trip.
- Verify itinerary artifact and source citations.
- Verify booking/purchase actions are denied.
- Verify Calendar writes require approval.

### Section E: Code Review a PR

- Review controlled GitHub PR.
- Verify code review artifact with findings.
- Verify posting a comment requires approval.
- Verify no merge/push action is available.

### Section F: Summarize a Notion Workspace

- Summarize controlled Notion test pages/database.
- Verify source set and summary artifact.
- Verify writes/sends require approval.

### Section G: Custom Skill Creation and Import/Export

- Create a custom Skill.
- Edit `SKILL.md`, input slots, tools, and artifact contract.
- Run a test fixture.
- Export and re-import.
- Verify unsafe import policies are rejected or disabled.

### Section H: Project Libraries

- Save a Skill to a project library.
- Verify it appears only for that project.
- Verify personal library Skills appear across projects.
- Verify project deletion/archive behavior does not expose stale Skills.

### Section I: Multi-Skill Workflows

- Create sequential workflow.
- Create parallel workflow where safe.
- Pass artifact from one Skill to another.
- Verify partial failure/approval behavior.

### Section J: Scheduling

- Create one-time scheduled Skill run.
- Create repeating scheduled Skill run.
- Verify Temporal status and recent run badge.
- Verify write action pauses for approval.

### Section K: Browser and Computer Runtime

- Run Skill using server browser.
- Run local browser mode with approval.
- Verify screenshots/session summaries and Rule 32 diagnostics.

### Section L: Artifacts, Citations, and Trace Safety

- Verify artifact renderers.
- Verify citations render and link to sources.
- Verify trace contains safe summaries only.
- Search logs/artifacts for secrets and chain-of-thought markers.

### Section M: Memory, Action Log, and Failure Memory

- Verify memory writes are opt-in and allowlisted.
- Verify action log entries for successful writes.
- Verify failure memory for reusable Skill failures.
- Verify secrets are redacted.

### Section N: Regression

- Phase 1 canonical task.
- Phase 2 provider settings smoke.
- Phase 3 browser/computer smoke.
- Phase 4 project/local execution smoke.
- Phase 5 memory recall/forget smoke.
- Phase 6 integration read/write smoke where credentials exist.
- Phase 6.5 async/task/search/critic/todo/workflow/saved-agent smoke where
  available.

## Required Final Verification

Before Phase 7 handoff:

- `pnpm test`
- `pnpm build`
- All Phase 7 unit/integration tests.
- All Phase 7 Playwright tests.
- All Phase 7 smokes.
- Phase 1-6.5 regression smokes that remain credential-valid.
- Rule 35 live browser walkthroughs for every UI feature.

OAuth-dependent Skills can be marked `PARTIAL` only when the UI and backend
reach the exact missing-credential/user-auth boundary and the handoff includes a
clear setup checklist.

## Risk Summary

- Branch drift: Phase 7 depends on Phase 6 and Phase 6.5 work that may still be
  under audit. Stage 1 must rebase/verify before implementation.
- Scope: Phase 7 is large. Keep commits per subsystem and stop on architecture
  mismatches.
- Tool narrowing: mistakes could expose too many tools. Policy intersection and
  tests are mandatory.
- Artifact quality: Skills must produce structured artifacts, not just chat
  text. Artifact validator is a gate.
- Citation quality: Research/travel/Notion summaries need source discipline.
- Trace safety: avoiding chain-of-thought exposure is non-negotiable.
- Imported Skills: validation must be conservative.
- Scheduling: Temporal must own durable schedules; no custom cron/setInterval.
- Local browser/computer: real-machine actions require approvals and audit logs.
- OAuth credentials: Gmail/GitHub/Notion/Calendar/Drive tests may require user
  credentials. Mark partial honestly when blocked.

## Stop Conditions

Stop and surface if:

- Skill package format requires a breaking change to Phase 1-6 architecture.
- Temporal Skill scheduling requires Phase 6.5 changes.
- Browser/computer runtime requires Phase 3-4 architecture changes.
- Wide Research conflicts with Phase 5 shared memory primitive.
- Skill tool policy cannot reliably narrow tools before LangChain sees them.
- Artifact/citation enforcement would require exposing chain-of-thought.
- Imported Skill safety cannot be validated locally.
- Any stage takes more than two days of stuck-time.
- A smoke fails three times with the same root cause.

## Open Questions Before Stage 1

These should be reviewed before implementation. Reasonable defaults are proposed
so Stage 1 can proceed if the user approves them.

1. Artifact storage for large files:
   - Proposed: inline DB content for small Markdown/JSON artifacts, project
     workspace files for generated files in development, and Cloudflare R2 only
     when the existing storage layer is ready.
2. Skill import scripts:
   - Proposed: import scripts/templates as inert files; running any script uses
     Phase 4 approval and SafetyGovernor.
3. Skill detection in Stage 1:
   - Proposed: implement manual run first, then conservative suggestion banner
     if low-risk within Stage 1. Auto-run is forbidden.
4. Wide Research parallelism default:
   - Proposed: max 4 parallel subtasks by default, configurable later.
5. Local browser mode per Skill:
   - Proposed: every Skill run requests approval before first local browser
     session, even if project is `FULL_ACCESS`.
6. Built-in Skill versions:
   - Proposed: all built-ins start at `1.0.0`; edits require version bump and
     migration/seed update.

## Success Criteria

Phase 7 is ready for user audit when:

- Stage 0 spec is approved.
- Stage 1 and Stage 2 implementation commits are complete.
- Five built-in Skills run end-to-end or reach documented credential boundaries.
- Custom Skill creation/edit/test/import/export works.
- Project and personal libraries work.
- Multi-Skill workflows run sequentially and in safe parallel mode.
- Scheduled Skill runs use Temporal.
- Browser/computer runtime and local browser mode are approval-gated.
- Wide Research produces cited artifacts.
- Artifacts, traces, approvals, recent runs, and eval fixtures are visible in UI.
- `pnpm test`, `pnpm build`, Playwright, smokes, and live browser walkthroughs
  pass or are honestly marked `PARTIAL` for credential-only blockers.
- Manual audit harness is committed.
- User manual audit passes.
- SIGNOFF is written only after the user confirms audit pass.

## Do Not Do

- Do not open a PR during Stage 0.
- Do not tag `v0.7.0`.
- Do not write SIGNOFF.
- Do not implement paid marketplace functionality.
- Do not implement team libraries.
- Do not start Stage 1 before user review and approval of this spec.

