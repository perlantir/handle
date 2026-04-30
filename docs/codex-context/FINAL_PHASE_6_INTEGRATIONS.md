# Handle — Phase 6: Integrations (Nango) (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-5 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add first-class integrations with Gmail, GitHub, Notion, and
Vercel. All use Nango for OAuth orchestration and token refresh.
The agent gets per-integration tools (gmail_send, github_create_pr,
notion_create_page, vercel_redeploy, etc.). Integrations UI matches
Screen 10.

Phase 6 ships in 3-4 weeks. This is the largest non-foundational
phase.

==================================================
SCOPE
==================================================

In scope:
- Nango setup (cloud or self-hosted)
- 4 integrations: Gmail, GitHub, Notion, Vercel
  - OAuth via Nango
  - Connection management
  - Per-integration tool sets
  - Approval requirements for destructive actions
- Integrations UI (Screen 10)
- Connection health monitoring
- Per-integration scope management

Out of scope:
- Custom integrations (Phase 7+)
- Multi-account-per-integration (one connection per integration
  per user for Phase 6)
- Integration data caching (always live API calls)

==================================================
NANGO SETUP
==================================================

Nango can be cloud-hosted (free tier covers personal use) or
self-hosted Docker. User picks during onboarding.

Server-side SDK: `@nangohq/node`
Client-side SDK: `@nangohq/frontend`

apps/api/src/integrations/nangoClient.ts:

```typescript
import { Nango } from '@nangohq/node';

let nango: Nango | null = null;

export function getNangoClient(): Nango {
  if (nango) return nango;
  nango = new Nango({
    secretKey: process.env.NANGO_SECRET_KEY!,
    host: process.env.NANGO_HOST ?? 'https://api.nango.dev',
  });
  return nango;
}

export async function getConnectionToken(
  providerConfigKey: 'gmail' | 'github' | 'notion' | 'vercel',
  connectionId: string,
): Promise<string> {
  const nango = getNangoClient();
  const connection = await nango.getConnection(providerConfigKey, connectionId);
  return connection.credentials?.access_token ?? '';
}
```

Provider configs in Nango dashboard (one-time setup, document in
docs/SETUP.md):
- Gmail: scopes for read + send + modify
- GitHub: scopes for repo, user
- Notion: full integration
- Vercel: scopes for deployments + projects

==================================================
INTEGRATION SCHEMA
==================================================

prisma/schema.prisma additions:

```prisma
model Integration {
  id              String   @id @default(cuid())
  userId          String
  provider        String   // 'gmail' | 'github' | 'notion' | 'vercel'
  connectionId    String   // Nango connectionId (often = userId-provider)
  accountLabel    String   // Display name (e.g., email or org)
  scopes          String[] // Granted scopes
  connectedAt     DateTime @default(now())
  healthCheckedAt DateTime?
  isHealthy       Boolean  @default(true)
  
  @@unique([userId, provider])
  @@index([userId])
}
```

==================================================
CONNECTION FLOW
==================================================

apps/api/src/routes/integrations.ts:

```
GET    /api/integrations                       List user's integrations
POST   /api/integrations/:provider/start       Get Nango session token
POST   /api/integrations/:provider/complete    Record successful connection
POST   /api/integrations/:provider/test        Health check
DELETE /api/integrations/:provider             Disconnect
```

Frontend flow:
1. User clicks "Connect Gmail"
2. Frontend POSTs /api/integrations/gmail/start → gets sessionToken
3. Frontend calls Nango.auth(sessionToken) → opens OAuth popup
4. After user authorizes, Nango calls back to frontend
5. Frontend POSTs /api/integrations/gmail/complete with the
   connectionId from Nango
6. Backend stores Integration row in DB

==================================================
PER-INTEGRATION TOOLS
==================================================

### Gmail

apps/api/src/integrations/gmail/tools.ts:

```typescript
import { google } from 'googleapis';
import { getConnectionToken } from '../nangoClient';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function createGmailTools(ctx: ToolContext, connectionId: string) {
  async function getGmail() {
    const token = await getConnectionToken('gmail', connectionId);
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    return google.gmail({ version: 'v1', auth });
  }

  const gmailSearch = tool(
    async (input: { query: string; maxResults?: number }) => {
      const gmail = await getGmail();
      const { data } = await gmail.users.messages.list({
        userId: 'me',
        q: input.query,
        maxResults: input.maxResults ?? 10,
      });
      return JSON.stringify(data.messages ?? []);
    },
    {
      name: 'gmail_search',
      description: 'Search Gmail messages using Gmail query syntax (e.g., "from:alice@example.com is:unread").',
      schema: z.object({
        query: z.string(),
        maxResults: z.number().optional(),
      }),
    },
  );

  const gmailRead = tool(
    async (input: { messageId: string }) => {
      const gmail = await getGmail();
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: input.messageId,
        format: 'full',
      });
      return JSON.stringify(data);
    },
    {
      name: 'gmail_read',
      description: 'Read a Gmail message by ID.',
      schema: z.object({ messageId: z.string() }),
    },
  );

  const gmailSend = tool(
    async (input: { to: string; subject: string; body: string }) => {
      // Approval required
      const approved = await requestApproval(ctx.taskId, {
        type: 'destructive_integration_action',
        integration: 'gmail',
        action: 'send',
        reason: `Send email to ${input.to}: "${input.subject}"`,
      });
      if (!approved) throw new Error('User denied gmail send');
      
      const gmail = await getGmail();
      const message = `From: me\r\nTo: ${input.to}\r\nSubject: ${input.subject}\r\n\r\n${input.body}`;
      const encoded = Buffer.from(message).toString('base64url');
      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
      });
      return `Sent: ${data.id}`;
    },
    {
      name: 'gmail_send',
      description: 'Send an email. Requires user approval.',
      schema: z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
      }),
    },
  );

  const gmailArchive = tool(
    async (input: { messageId: string }) => {
      const approved = await requestApproval(ctx.taskId, {
        type: 'destructive_integration_action',
        integration: 'gmail',
        action: 'archive',
        reason: `Archive message ${input.messageId}`,
      });
      if (!approved) throw new Error('User denied gmail archive');
      
      const gmail = await getGmail();
      await gmail.users.messages.modify({
        userId: 'me',
        id: input.messageId,
        requestBody: { removeLabelIds: ['INBOX'] },
      });
      return 'Archived';
    },
    {
      name: 'gmail_archive',
      description: 'Archive a Gmail message. Requires user approval.',
      schema: z.object({ messageId: z.string() }),
    },
  );

  return [gmailSearch, gmailRead, gmailSend, gmailArchive];
}
```

### GitHub

apps/api/src/integrations/github/tools.ts:

Similar pattern. Tools:
- github_search_repos
- github_read_file (read repo file)
- github_list_issues
- github_create_issue (approval required)
- github_list_prs
- github_create_pr (approval required)
- github_add_comment (approval required)

Use Octokit:
```typescript
import { Octokit } from '@octokit/rest';
const octokit = new Octokit({ auth: token });
```

### Notion

apps/api/src/integrations/notion/tools.ts:

Tools:
- notion_search
- notion_read_page
- notion_create_page (approval required)
- notion_update_page (approval required)
- notion_query_database

Use:
```typescript
import { Client } from '@notionhq/client';
const notion = new Client({ auth: token });
```

### Vercel

apps/api/src/integrations/vercel/tools.ts:

Tools:
- vercel_list_projects
- vercel_list_deployments
- vercel_create_deployment (approval required)
- vercel_redeploy (approval required)
- vercel_get_logs

Use Vercel REST API directly:
```typescript
async function vercelFetch(path: string, init?: RequestInit) {
  const token = await getConnectionToken('vercel', connectionId);
  return fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
}
```

==================================================
TOOL REGISTRATION
==================================================

apps/api/src/agent/runAgent.ts:

```typescript
const baseTools = createPhase1Tools(ctx);
const browserTools = createBrowserTools(ctx, browser);
const memoryTools = createMemoryTools(ctx);

// Add integration tools for connected integrations
const integrations = await prisma.integration.findMany({
  where: { userId, isHealthy: true },
});

const integrationTools = [];
for (const integ of integrations) {
  if (integ.provider === 'gmail') integrationTools.push(...createGmailTools(ctx, integ.connectionId));
  if (integ.provider === 'github') integrationTools.push(...createGitHubTools(ctx, integ.connectionId));
  if (integ.provider === 'notion') integrationTools.push(...createNotionTools(ctx, integ.connectionId));
  if (integ.provider === 'vercel') integrationTools.push(...createVercelTools(ctx, integ.connectionId));
}

const allTools = [...baseTools, ...browserTools, ...memoryTools, ...integrationTools];
```

==================================================
INTEGRATIONS UI (SCREEN 10)
==================================================

apps/web/app/(workspace)/integrations/page.tsx:

Two sections:

### Connected (top)

2x2 grid (or wider) of IntegrationCard components per the design.
Each card:
- 38x38 letter avatar in colored bg (Gmail red, GitHub black,
  Notion white, Vercel black)
- Provider name + account label (email or org)
- Scope chips (read, send, modify, ...)
- Health pill (Connected / Reconnect needed / Failed)
- More button (disconnect, reconnect, manage scopes)

### Available (bottom)

4-column letter grid with Connect pills for unconnected providers.

Implement IntegrationCard in design-system if not already there.

==================================================
HEALTH MONITORING
==================================================

A daily cron job (BullMQ from Phase 8, but for now setInterval at
backend startup) tests each integration:

```typescript
async function healthCheckIntegrations() {
  const integrations = await prisma.integration.findMany();
  for (const integ of integrations) {
    try {
      // Simple health check per provider
      if (integ.provider === 'gmail') {
        const token = await getConnectionToken('gmail', integ.connectionId);
        const gmail = google.gmail({ version: 'v1', auth: makeAuth(token) });
        await gmail.users.getProfile({ userId: 'me' });
      }
      // ... similar for github, notion, vercel
      
      await prisma.integration.update({
        where: { id: integ.id },
        data: { isHealthy: true, healthCheckedAt: new Date() },
      });
    } catch (err) {
      await prisma.integration.update({
        where: { id: integ.id },
        data: { isHealthy: false, healthCheckedAt: new Date() },
      });
    }
  }
}
```

==================================================
TESTS
==================================================

1. Nango client initializes from env
2. Each integration's tools call API correctly with mocked
   tokens
3. Approval required for destructive actions
4. /api/integrations/start returns session token
5. /api/integrations/complete records integration
6. Health check updates isHealthy
7. IntegrationCard renders correctly
8. Integrations page lists connected + available

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-5 tests pass
2. Phase 6 tests pass 3 consecutive CI runs
3. All 4 integrations connect via OAuth
4. Each integration's tools work in agent task
5. Approval flow triggers on destructive actions
6. Token refresh works (long-running session test)
7. Disconnect clears integration
8. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase6-integrations.md:

Section A: Connect each integration
1. /integrations → Connect Gmail → OAuth popup → authorize
2. Verify card appears in Connected section
3. Repeat for GitHub, Notion, Vercel

Section B: Use each integration in task
1. Submit: "Search my unread Gmail for messages from acme.com"
2. Verify gmail_search results
3. Submit: "Create a GitHub issue in my repo X about Y"
4. Verify approval, approve, verify issue created
5. Submit: "Create a Notion page titled 'Test Page' in my workspace"
6. Verify approval, approve, verify page created
7. Submit: "List my Vercel projects"
8. Verify response

Section C: Disconnect
1. /integrations → Gmail card → More → Disconnect
2. Verify card moves to Available
3. Submit: "Search my Gmail" → verify error or no gmail tools

==================================================
IMPLEMENTATION ORDER
==================================================

1. Nango setup + client
2. Integration schema migration
3. /api/integrations routes (start, complete, list, disconnect)
4. Gmail tools
5. GitHub tools
6. Notion tools
7. Vercel tools
8. Tool registration in runAgent
9. IntegrationCard component
10. Integrations page UI
11. Health check
12. Tests
13. Manual audit
14. SIGNOFF

==================================================
END OF PHASE 6 SPEC
==================================================
