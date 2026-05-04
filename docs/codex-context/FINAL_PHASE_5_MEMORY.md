# Handle — Phase 5: Memory (Zep) (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-4 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add persistent memory to Handle via Zep. Memory has two layers:

1. Session memory: conversation history per task, retained across
   sessions
2. Knowledge graph: entities (people, projects, contacts,
   preferences) with relationships and confidence scores

The agent automatically retrieves relevant memory when starting
new tasks, and explicitly saves/recalls/forgets via tools.

The Memory graph UI matches Screen 06 from the design system.

Phase 5 ships in 2-3 weeks.

==================================================
SCOPE
==================================================

In scope:
- Zep client integration (cloud or self-hosted)
- Session memory: every Task's messages threaded into Zep
- Knowledge graph: entities + relations + confidence scores
- Memory recall: agent retrieves relevant memory at task start
- Memory tools: memory_save, memory_search, memory_forget
- Memory graph UI (Screen 06)
- Memory inspector in Workspace right pane
- Redaction layer before sending to Zep
- Bi-temporal fact validity (`valid_at` / `invalid_at`) for current
  versus historical facts
- Semantic action-consequence log for real-world outcomes

Out of scope:
- Cross-user memory (single-user only)
- Memory export/import (Phase 11 polish)
- Memory budget management (don't optimize yet)
- Procedural memory / task trajectory templates (Phase 6)
- Failure memory / root cause traces from past failures (Phase 6)
- Long-running task resumability (Phase 6)
- Latency optimization; measure in Phase 5, optimize in Phase 6 only
  if p95 memory latency exceeds 500ms
- Sub-agent shared memory (no parallel agents yet)

==================================================
ZEP SETUP
==================================================

Zep options:
1. Self-hosted Zep on the user's Mac — default for Handle Phase 5
2. Zep Cloud (https://www.getzep.com/) — managed alternate

User chooses in onboarding (Phase 11) or Settings → Memory.

Current docs note (May 2026): Zep's official docs and repository now
emphasize Zep Cloud and mark Community Edition as legacy/deprecated.
Handle still implements the requested self-hosted default because local
personal memory is a product requirement. This is a known dependency
risk: if the legacy self-hosted image stops working, Phase 5 must either
pin a working legacy image or switch the self-hosted path to Graphiti
with an approved spec update. Cloud Zep remains the supported alternate.

==================================================
SELF-HOSTED SETUP
==================================================

Add `docker-compose.zep.yaml` at the repo root. It runs the memory
layer locally:

- Zep server container, using `zepai/zep:latest` or the current working
  legacy image if `latest` is unavailable.
- Postgres with the pgvector extension enabled.
- Persistent volumes for Postgres/Zep data so memory survives container
  restarts.
- A dedicated bridge network for inter-container communication.
- Zep API exposed on `127.0.0.1:8000`.
- Healthchecks for Postgres and Zep.

The user starts memory with:

```bash
docker compose -f docker-compose.zep.yaml up -d
```

Stops memory with:

```bash
docker compose -f docker-compose.zep.yaml down
```

Add root package scripts:

- `pnpm memory:up`
- `pnpm memory:down`
- `pnpm memory:logs`

Smoke:

- `pnpm smoke:zep-self-hosted-up` starts containers, waits for
  healthcheck, and verifies the Zep API responds.

==================================================
MEMORY SCOPE MODEL
==================================================

Memory is configurable at three levels:

1. Settings → Memory: default for new projects
2. Project settings: per-project override
3. Composer per-message toggle: rare opt-out for a single message

```typescript
enum MemoryScope {
  GLOBAL_AND_PROJECT  // default - reads/writes both layers
  PROJECT_ONLY        // isolated project memory
  NONE                // memory disabled for this project/message
}
```

`Project` gets `memoryScope: MemoryScope` with default
`GLOBAL_AND_PROJECT`.

Settings gets `defaultMemoryScopeForNewProjects: MemoryScope`.

`Message` gets `memoryEnabled: boolean` so a single message can opt out
of recall/save without mutating project settings.

Composer adds a small memory control next to scope/permission/backend/
model controls. It defaults from the current project's `memoryScope`.
When toggled off, the next message sends `memoryEnabled: false`.

==================================================
ZEP NAMESPACE MAPPING
==================================================

Global memory:

- Zep `userId` = Handle's user ID, one per install/user.

Project memory:

- Zep `groupId` = `project_<projectId>`, one group per project.

Conversation/session:

- Zep `sessionId`/`threadId` = `conv_<conversationId>`, one per
  conversation.

Memory writes:

- `GLOBAL_AND_PROJECT`: write to both `userId` and `groupId` where the
  SDK/server supports group graphs. Zep may deduplicate.
- `PROJECT_ONLY`: write only to `groupId`.
- `NONE`: write nothing.

Memory reads:

- `GLOBAL_AND_PROJECT`: query both global and project memory, merge and
  deduplicate results by fact text/id.
- `PROJECT_ONLY`: query only project memory.
- `NONE`: return empty context.

If the active self-hosted Zep build lacks group APIs, emulate project
memory by namespacing project facts in the local adapter while keeping
the public Handle contract unchanged.

==================================================
BI-TEMPORAL FACT VALIDITY
==================================================

Every fact written to memory carries validity timestamps:

- `valid_at`: when the fact became true. Defaults to write time.
- `invalid_at`: when the fact stopped being true. Set when a later
  contradictory fact supersedes it.

Zep stores these fields natively for graph facts. Handle wires them
through every memory boundary:

- `memory_save` accepts optional `valid_at`; if omitted, use now.
- Automatic message memory writes include `valid_at`.
- Contradicting facts should result in the older fact receiving
  `invalid_at`. Zep should do this natively; Phase 5 verifies and, if
  needed for the self-hosted adapter, mirrors it in Handle metadata.
- `getRelevantMemoryForTask` formats validity timestamps in the
  injected context.

Memory context format:

```text
[stated, valid since 2026-03-15] User lives in Austin
[stated, valid 2026-01-01 to 2026-03-15] User lived in Chicago
[inferred, valid since 2026-04-22] User prefers concise responses
```

Agent system prompt addition:

```text
When a fact has both valid since and valid to dates, the user's current
state is the one without valid to. Past facts (with valid to dates)
provide history but do not reflect current reality. When the user asks
something time-sensitive, prefer current facts. When asked about
history, use past facts. Never confuse them.
```

Memory list view:

- Show `valid_at` as a small label: `since Mar 15, 2026`.
- If `invalid_at` is set, dim the row and label it `(historical)`.

Memory detail panel:

- Show a simple timeline of the fact's history when related facts or
  superseded facts are available.

Smoke:

- `pnpm smoke:memory-bitemporal`
- Submit `I live in Chicago`.
- Submit `I moved to Austin`.
- Verify Chicago has `invalid_at`, Austin has `valid_at`.
- Ask `Where do I live?`, verify current answer is Austin.

==================================================
GRACEFUL DEGRADATION
==================================================

When Zep is unreachable, agent runs continue without memory. Memory is
an enhancement, not a hard dependency for task execution.

UI behavior:

- Workspace shows a subtle `Memory offline` banner.
- Settings → Memory shows connection status with red/green dot.
- SSE emits `memory_status` events whenever status changes.

Retry behavior:

- Background retry with exponential backoff: 5s, 10s, 30s, 60s, then
  60s steady.

Failure modes handled:

- Docker not running (self-hosted)
- Zep container not started (self-hosted)
- Network failure (cloud)
- Auth failure (cloud, missing/wrong API key)
- Quota exceeded (cloud, paid tier limits)

`apps/api/src/memory/zepClient.ts` wraps every operation in try/catch.
Failures are logged to `~/Library/Logs/Handle/memory.log`, not thrown to
the agent loop. The wrapper returns empty memory context or falsey
operation results as appropriate.

Every memory operation logs a JSON line to `memory.log` with:

```typescript
interface MemoryLogEntry {
  timestamp: string;
  operation: string;
  provider: 'self-hosted' | 'cloud';
  scope: 'GLOBAL_AND_PROJECT' | 'PROJECT_ONLY' | 'NONE';
  projectId?: string;
  conversationId?: string;
  status: 'ok' | 'offline' | 'error';
  errorType?: string;
  durationMs: number;
}
```

apps/api/src/memory/zepClient.ts:

```typescript
import { ZepClient } from '@getzep/zep-cloud';
// or @getzep/zep-js for self-hosted

let client: ZepClient | null = null;

export function getZepClient(): ZepClient {
  if (client) return client;
  
  const apiKey = process.env.ZEP_API_KEY;
  const baseURL = process.env.ZEP_BASE_URL ?? 'https://api.getzep.com';
  
  if (!apiKey) throw new Error('ZEP_API_KEY not set');
  
  client = new ZepClient({ apiKey, baseURL });
  return client;
}

export async function ensureUser(userId: string, email: string) {
  const client = getZepClient();
  await client.user.add({ userId, email }).catch(() => {
    // User already exists
  });
}

export async function ensureSession(userId: string, sessionId: string) {
  const client = getZepClient();
  await client.memory.addSession({ sessionId, userId }).catch(() => {});
}
```

NOTE: The Zep SDK API has evolved. Check current docs at
https://docs.getzep.com when implementing for current method
signatures.

==================================================
SESSION MEMORY
==================================================

Each Handle Task corresponds to a Zep Session. Messages flow into
Zep as they're created.

apps/api/src/memory/sessionMemory.ts:

```typescript
import { getZepClient, ensureSession } from './zepClient';
import { redactSecrets } from '../lib/redact';

export async function appendMessageToZep(
  taskId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
) {
  await ensureSession(userId, taskId);
  
  const redacted = redactSecrets(content);
  
  await getZepClient().memory.add({
    sessionId: taskId,
    messages: [{
      role,
      roleType: role === 'user' ? 'user' : 'assistant',
      content: redacted,
    }],
  });
}

export async function getRelevantMemoryForTask(
  taskId: string,
  userId: string,
  goal: string,
): Promise<string> {
  // Pull session context
  const memory = await getZepClient().memory.get({ sessionId: taskId });
  
  // Pull facts from knowledge graph relevant to goal
  const facts = await getZepClient().graph.search({
    userId,
    query: goal,
    limit: 10,
  });
  
  // Format as string for system prompt injection
  let context = '';
  if (memory?.context) context += `Conversation context: ${memory.context}\n\n`;
  if (facts.length) {
    context += 'Known facts:\n';
    for (const fact of facts) {
      context += `- ${fact.fact} (confidence: ${(fact.score * 100).toFixed(0)}%)\n`;
    }
  }
  
  return context;
}
```

==================================================
KNOWLEDGE GRAPH
==================================================

Zep automatically extracts entities and relations from messages
sent via memory.add. We complement this with explicit memory_save
calls.

apps/api/src/memory/knowledgeGraph.ts:

```typescript
import { getZepClient } from './zepClient';

export async function saveFact(
  userId: string,
  fact: string,
  metadata?: Record<string, unknown>,
) {
  await getZepClient().graph.add({
    userId,
    type: 'text',
    data: fact,
    metadata,
  });
}

export async function searchFacts(
  userId: string,
  query: string,
  limit = 10,
): Promise<Array<{ fact: string; score: number; metadata?: any }>> {
  const results = await getZepClient().graph.search({
    userId,
    query,
    limit,
  });
  return results.map((r: any) => ({
    fact: r.fact,
    score: r.score,
    metadata: r.metadata,
  }));
}

export async function forgetFact(userId: string, factId: string) {
  await getZepClient().graph.delete({ userId, factId });
}

export async function listAllFacts(userId: string) {
  return getZepClient().graph.list({ userId });
}
```

==================================================
MEMORY TOOLS FOR THE AGENT
==================================================

apps/api/src/agent/memoryTools.ts:

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { saveFact, searchFacts, forgetFact } from '../memory/knowledgeGraph';
import type { ToolContext } from './tools';

export function createMemoryTools(ctx: ToolContext) {
  const memorySave = tool(
    async (input: { fact: string; tags?: string[] }) => {
      await saveFact(ctx.userId, input.fact, { tags: input.tags });
      return `Saved: ${input.fact}`;
    },
    {
      name: 'memory_save',
      description: 'Save a durable fact about the user, their projects, preferences, or relationships. Use when the user states something worth remembering across sessions.',
      schema: z.object({
        fact: z.string().describe('The fact to save (e.g., "User prefers dark mode" or "User\'s startup is named Acme")'),
        tags: z.array(z.string()).optional(),
      }),
    },
  );

  const memorySearch = tool(
    async (input: { query: string; limit?: number }) => {
      const results = await searchFacts(ctx.userId, input.query, input.limit ?? 5);
      if (!results.length) return 'No relevant memories found.';
      return results.map((r, i) => `${i + 1}. ${r.fact} (${(r.score * 100).toFixed(0)}%)`).join('\n');
    },
    {
      name: 'memory_search',
      description: 'Search the user\'s knowledge graph for facts relevant to a query.',
      schema: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
    },
  );

  const memoryForget = tool(
    async (input: { factId: string }) => {
      // Memory deletion is destructive — require approval
      const approved = await requestApproval(ctx.taskId, {
        type: 'memory_forget',
        reason: `Forget memory ${input.factId}`,
      });
      if (!approved) throw new Error('User denied memory deletion');
      
      await forgetFact(ctx.userId, input.factId);
      return `Forgotten: ${input.factId}`;
    },
    {
      name: 'memory_forget',
      description: 'Permanently delete a fact from the knowledge graph. Requires user approval.',
      schema: z.object({
        factId: z.string(),
      }),
    },
  );

  return [memorySave, memorySearch, memoryForget];
}
```

==================================================
AUTOMATIC RECALL AT TASK START
==================================================

Inject relevant memory into the agent's system prompt at the
start of each task:

```typescript
// apps/api/src/agent/runAgent.ts
const memoryContext = await getRelevantMemoryForTask(taskId, userId, goal);

const enhancedSystemPrompt = `
${BASE_SYSTEM_PROMPT}

<memory_context>
${memoryContext}
</memory_context>
`.trim();

// Pass to createPhase1Agent
```

The agent sees relevant facts at task start without explicit
search.

==================================================
MEMORY UI V2 (SCREEN 06)
==================================================

apps/web/app/(workspace)/memory/page.tsx has two levels of tabs:

Top tabs:

- `All`
- `Global`
- one tab per project name

Inside each top tab:

- `Graph`
- `List`

Graph view:

3-column layout:
- Left (220): Facets — Kind (Project / Contact / Preference / 
  Idea) with color swatches and counts. Source filter.
- Center (1fr): Graph — SVG nodes color-coded by kind, lines for
  relations, primary entity highlighted
- Right (320): Entity detail — name, key facts with confidence
  bars, recent updates

Implement graph as a force-directed layout using react-force-graph
or d3-force. Nodes are entities; edges are relations.

Confidence bars are 4px high, fill to score percentage in
`accent` color.

List view:

- Search bar at top for full-text search.
- Filter pills:
  - Source: Global / Project A / Project B / ...
  - Type: Project / Contact / Preference / Idea
  - Confidence: >50% / >80%
- Table columns:
  - Fact
  - Source
  - Type
  - Confidence
  - Last updated
  - Actions (Edit/Delete)
- Pagination if more than 100 results.

Both Graph and List views support a detail panel on the right (320px)
when a fact/entity is selected:

- Full fact text
- Confidence
- Source attribution
- Created/updated timestamps
- Related facts (graph neighbors)
- Edit / Delete buttons

Delete requires approval per the existing approval flow.

==================================================
MEMORY INSPECTOR IN WORKSPACE
==================================================

In Screen 03 right inspector, add Memory Used section:

```tsx
<InspectorBlock label="Memory used">
  {usedMemories.map((m) => (
    <div key={m.id} className="flex items-center gap-2 py-2 border-b border-border-subtle last:border-0">
      <div className="w-[22px] h-[22px] rounded-md bg-bg-subtle" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">{m.label}</div>
        <div className="text-[10.5px] text-text-tertiary truncate">{m.subtext}</div>
      </div>
    </div>
  ))}
</InspectorBlock>
```

The agent emits a memory_recall event when it injects memory:

```typescript
export interface MemoryRecallEvent {
  type: 'memory_recall';
  facts: Array<{ id: string; fact: string; score: number }>;
  taskId: string;
}
```

Workspace listens and updates the inspector.

==================================================
SEMANTIC ACTION-CONSEQUENCE LOG
==================================================

Phase 4's `audit.log` records safety decisions. Phase 5 adds
`~/Library/Logs/Handle/actions.log` for semantic outcomes that change
the world or durable app state.

`apps/api/src/lib/actionLog.ts`:

```typescript
interface ActionLogEntry {
  timestamp: string;          // ISO 8601
  taskId: string;
  conversationId: string;
  projectId: string;
  outcomeType: ActionOutcomeType;
  description: string;
  target: string;
  metadata: Record<string, unknown>;
  reversible: boolean;
  undoCommand?: string;
}

type ActionOutcomeType =
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'shell_command_executed'
  | 'browser_navigated'
  | 'memory_saved'
  | 'memory_forgotten';
```

Write an action log entry after successful tool execution only. Failed
tool calls do not write action outcomes.

Examples:

- `file_write` succeeds:
  - `file_created` or `file_modified`
  - `reversible: true` for files created in the workspace
  - `undoCommand: rm <path>` only when safe
- `shell_exec` succeeds:
  - `shell_command_executed`
  - `reversible: false`
- `browser_navigate` succeeds:
  - `browser_navigated`
  - `reversible: false`
- `memory_save` succeeds:
  - `memory_saved`
  - `reversible: true`
  - `undoCommand: memory_forget <factId>`

Add `/actions` page:

- Tabs: All / By Project / By Conversation
- Table: Timestamp | Outcome | Description | Target | Reversible |
  Undo
- Filter by outcome type
- Filter by date range
- Search by description/target

Agent prompt addition:

```text
Recent actions you've taken in this conversation: [last 10 entries from
action log]

Past actions provide context for "what's the state of the world right
now." If the user asks "what did you do" or "what files did you create",
reference these.
```

Smoke:

- `pnpm smoke:action-log`
- Submit a task that writes a file.
- Verify `actions.log` contains `file_created`.
- Submit a task that runs a shell command.
- Verify `actions.log` contains `shell_command_executed`.
- Open `/actions`, verify both entries are shown.

==================================================
SETTINGS → MEMORY TAB
==================================================

apps/web/components/settings/MemorySettings.tsx:

- Provider radio: Self-hosted Zep / Zep Cloud
- For Cloud: API key input
- For Self-hosted: base URL input, status indicator, start/stop/logs
  controls backed by the root docker compose scripts
- Test connection button
- Memory storage stats (count of sessions, facts, last update)
- Default scope for new projects dropdown:
  - Global + project
  - Project only
  - None
- Reset memory button (deletes all — high-risk, require typing
  "delete" to confirm)

==================================================
PER-MESSAGE MEMORY TOGGLE IN COMPOSER
==================================================

Add a small memory icon button to the composer row with scope,
permission, backend, and model controls.

- Icon: `💭` or lucide equivalent if one exists in the app's icon set.
- State: on/off.
- Tooltip when on: `Save & recall memory for this message`.
- Tooltip when off: `Memory disabled for this message`.
- Default: on when project `memoryScope` is `GLOBAL_AND_PROJECT` or
  `PROJECT_ONLY`; off when project `memoryScope` is `NONE`.
- Clicking toggles memory for this message only. It does not change
  project settings.

==================================================
REDACTION
==================================================

Before sending to Zep, redact secrets from message content. Use
the existing redactSecrets helper. Add additional patterns for:

- Credit card numbers
- SSN patterns
- API keys (already covered)

```typescript
// apps/api/src/lib/redact.ts (additions)
const PATTERNS = [
  ...EXISTING_SECRET_PATTERNS,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,  // Credit card
  /\b\d{3}-\d{2}-\d{4}\b/g,                          // SSN
];
```

==================================================
TESTS
==================================================

1. zepClient initializes with env vars
2. saveFact / searchFacts / forgetFact round-trip with mocked
   Zep client
3. appendMessageToZep redacts secrets before sending
4. getRelevantMemoryForTask returns context string
5. memory_save tool calls saveFact
6. memory_forget tool requires approval
7. Workspace memory inspector renders facts
8. Memory graph page renders entities and edges
9. Scope behavior:
   - `GLOBAL_AND_PROJECT` reads/writes both global and project layers
   - `PROJECT_ONLY` reads/writes project layer only
   - `NONE` performs no memory reads/writes
10. Graceful degradation:
   - Zep offline does not fail agent runs
   - `memory_status` SSE emits offline/online changes
   - `memory.log` records failures without secrets
11. Bi-temporal contradiction handling:
   - Current facts have `valid_at` and no `invalid_at`
   - Superseded facts have `invalid_at`
   - Agent answers current-state questions from current facts
12. Action log:
   - Successful real-world outcomes append `actions.log`
   - Failed tool calls do not append action outcomes
   - Reversible workspace file creation exposes a safe undo

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-4 tests pass
2. Phase 5 tests pass 3 consecutive CI runs
3. User runs three related tasks in different sessions
4. Agent recalls relevant context from earlier tasks without
   being told
5. Memory graph UI shows entities and relations
6. memory_save / memory_search / memory_forget tools work
7. Redaction prevents secrets from being stored
8. Bi-temporal current/historical fact reasoning works
9. Action log records outcomes and `/actions` displays them
10. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase5-memory.md:

Section A: Automatic recall
1. Submit: "My favorite color is teal."
2. Wait for completion.
3. New task: "Suggest a website background color for me."
4. Verify response references teal (memory recall worked)

Section B: Memory tools
1. Submit: "Remember that my project is named Handle."
2. Verify memory_save called.
3. New task: "What's my project name?"
4. Verify memory_search called, response is "Handle".

Section C: Memory graph UI
1. Open /memory
2. Verify facets show kinds with counts
3. Verify graph renders entities
4. Click an entity, verify detail panel shows facts with
   confidence bars

Section D: Forget
1. Submit: "Forget my favorite color."
2. Verify approval modal
3. Approve, verify memory removed

Section E: Redaction
1. Submit a message containing a fake API key (e.g., sk-test-1234567890)
2. Verify Zep storage does NOT contain the key

Section F: Project memory isolation
1. Project A with `GLOBAL_AND_PROJECT`: save "favorite color is teal"
2. Project B with `GLOBAL_AND_PROJECT`: ask favorite color, verify teal
3. Project C with `PROJECT_ONLY`: ask favorite color, verify agent does
   not know unless project memory contains it

Section G: Graceful degradation
1. Stop Zep Docker containers
2. Submit a normal task
3. Verify task runs without memory and Workspace shows Memory offline
4. Restart Zep
5. Verify reconnection within 60 seconds

Section H: Memory UI
1. Open `/memory`
2. Verify top tabs All / Global / project names
3. Verify Graph view renders
4. Switch to List view, search/filter facts
5. Click a fact and verify detail panel
6. Edit fact
7. Delete fact with approval

Section I: Per-message override
1. In a project with memory enabled, toggle memory off for one message
2. Submit a memorable fact
3. Verify that fact is not written
4. Toggle memory on and submit another fact
5. Verify the second fact is written

Section J: Bi-temporal fact reasoning
1. Submit: "I live in Chicago"
2. Wait for completion
3. Submit: "Actually, I moved to Austin last week"
4. New conversation: submit "Where do I live?"
5. Verify response says Austin as current state
6. Open `/memory`, verify Chicago is historical and Austin is current
7. Open detail panel, verify timeline shows the move

Section K: Action-consequence log
1. Submit: "Create a file called test.txt with 'hello' in it"
2. Open `/actions`
3. Verify `file_created` entry with workspace target and
   `reversible=true`
4. Click Undo
5. Verify file is deleted
6. Verify a new `file_deleted` action entry exists

==================================================
IMPLEMENTATION ORDER
==================================================

1. Zep client setup
2. Session memory: appendMessageToZep on every message create
3. Auto-recall in runAgent
4. Knowledge graph helpers
5. memory_save / memory_search / memory_forget tools
6. Memory inspector in Workspace right pane
7. Memory graph page (/memory)
8. Settings → Memory tab
9. Per-message memory toggle
10. Redaction additions
11. Tests
12. Manual audit harness
13. Bi-temporal fact storage and reasoning
14. Semantic action-consequence log
15. Manual audit harness updates for bi-temporal/action log
16. SIGNOFF

==================================================
END OF PHASE 5 SPEC
==================================================
