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

Out of scope:
- Cross-user memory (single-user only)
- Memory export/import (Phase 11 polish)
- Memory budget management (don't optimize yet)

==================================================
ZEP SETUP
==================================================

Zep options:
1. Zep Cloud (https://www.getzep.com/) — managed, paid
2. Zep Community Edition (self-hosted Docker)

User chooses in onboarding (Phase 11) or Settings → Memory.

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
MEMORY GRAPH UI (SCREEN 06)
==================================================

apps/web/app/(workspace)/memory/page.tsx:

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
SETTINGS → MEMORY TAB
==================================================

apps/web/components/settings/MemorySettings.tsx:

- Provider radio: Zep Cloud / Self-hosted Zep
- For Cloud: API key input
- For Self-hosted: base URL input
- Test connection button
- Memory storage stats (count of sessions, facts, last update)
- Reset memory button (deletes all — high-risk, require typing
  "delete" to confirm)

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
8. SIGNOFF document

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
9. Redaction additions
10. Tests
11. Manual audit harness
12. SIGNOFF

==================================================
END OF PHASE 5 SPEC
==================================================
