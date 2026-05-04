# Phase 6 Integrations Handoff

Status: implementation complete through Stages 1-7 on
`phase-6/integrations`; ready for user manual audit.

Do not treat this as SIGNOFF. The user manual audit gate is still required.

## Stage Status

- Stage 1 - Nango infrastructure and Settings scaffold: PASS. User verified
  GitHub OAuth through Settings UI end-to-end.
- Stage 2 - Tier 1 read tools: PASS. Read tools registered for Gmail, Slack,
  Notion, Google Drive, and GitHub. GitHub live read smoke passed using the
  connected account.
- Stage 3 - Tier 1 write tools and approval gates: PASS. Write tools require
  approval in `ASK`/`PLAN`, honor `FULL_ACCESS` for non-destructive writes, deny
  forbidden patterns, and append integration action-log entries on success.
- Stage 4 - Tier 2 connectors: PASS for registered tool surface, mocked
  provider calls, approval gates, and forbidden patterns. Live OAuth still needs
  user BYOK credentials for Calendar, Cloudflare, Vercel, and Linear.
- Stage 5 - Tier 3 connectors: PASS for registered tool surface, mocked
  provider calls, approval gates, forbidden patterns, and Obsidian vault
  containment. Live OAuth still needs user BYOK credentials for Sheets, Docs,
  and Zapier.
- Stage 6 - Memory and UI hardening: PASS. Connector memory toggles are wired,
  per-message memory-off drops integration memory candidates, Settings UI
  exposes memory controls and Obsidian vault setup, and the integration health
  result is visible as green `Connected` or red `Failed`.
- Stage 7 - Manual audit harness: PASS. Audit checklist added at
  `scripts/manual-audit/phase6-integrations.md`.

## Codex Verification

Final local verification completed on 2026-05-03:

- `pnpm test`: PASS (web 8 tests, api 339 tests, shared no-test pass).
- `pnpm build`: PASS.
- `pnpm smoke:e2e-canonical`: PASS on alternate ports; produced 10 HN entries
  and ended `STOPPED`.
- `pnpm smoke:browser-tools`: PASS; extracted the HN first title and saved a
  164842 byte screenshot artifact.
- `NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3013 HANDLE_API_BASE_URL=http://127.0.0.1:3013 HANDLE_API_PORT=3013 pnpm smoke:computer-use-agent`:
  PASS; emitted a computer-use screenshot and a 3-sentence desktop
  description.
- `pnpm smoke:local-backend-basic`: PASS.
- `pnpm smoke:memory-recall`: PASS.
- `pnpm smoke:integrations-tier1-read`: PASS after applying local Prisma
  migrations; verified live GitHub `/user` and issue read paths through the
  connected Nango account.
- `pnpm smoke:integrations-tier1-write-approval`: PASS.
- `pnpm smoke:integrations-tier2`: PASS.
- `pnpm smoke:integrations-tier3`: PASS.
- `NEXT_PUBLIC_HANDLE_WEB_BASE_URL=http://127.0.0.1:3112 NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3001 pnpm smoke:integrations-memory-toggle`:
  PASS.
- `NEXT_PUBLIC_HANDLE_WEB_BASE_URL=http://127.0.0.1:3113 NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3001 pnpm smoke:approval-modal-types`:
  PASS.
- `NEXT_PUBLIC_HANDLE_WEB_BASE_URL=http://127.0.0.1:3114 NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3001 pnpm smoke:integrations-nango-connect`:
  PASS.

Notes:

- The default-port `computer-use-agent` smoke intentionally aborts when the
  user's dev API is already running on 3001. Codex reran it on port 3013
  instead of killing the user's open app.
- The canonical E2E smoke initially exposed that URL-fetch coding tasks were
  being routed to the desktop sandbox. That regression is fixed and covered by
  `apps/api/src/agent/runAgent.test.ts`.
- The working tree still has a pre-existing `AGENTS.md` typechange; it was not
  staged or modified by this Phase 6 batch.

## Credential Status

Verified live:

- GitHub connected via Nango Connect in Settings UI.

Requires user BYOK setup before full live audit:

- Gmail, Slack, Notion, Google Drive
- Google Calendar, Cloudflare, Vercel, Linear
- Google Sheets, Google Docs, Zapier

Local setup:

- Obsidian requires a real vault path in Settings -> Integrations. It does not
  use Nango.

## Smoke Commands

Run these before starting the manual audit if you want a fresh local baseline:

```bash
pnpm test
pnpm build
pnpm smoke:integrations-tier1-read
pnpm smoke:integrations-tier1-write-approval
pnpm smoke:integrations-tier2
pnpm smoke:integrations-tier3
NEXT_PUBLIC_HANDLE_WEB_BASE_URL=http://127.0.0.1:3112 NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3001 pnpm smoke:integrations-memory-toggle
NEXT_PUBLIC_HANDLE_WEB_BASE_URL=http://127.0.0.1:3111 NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3001 pnpm smoke:approval-modal-types
```

Use alternate web ports if port 3000 is already occupied.

## Manual Audit

Use `scripts/manual-audit/phase6-integrations.md`.

Audit all sections A-J before SIGNOFF. If any connector cannot be live-tested
because credentials or provider workspace permissions are unavailable, record it
as `PARTIAL` with the exact blocker rather than failing the entire phase.
