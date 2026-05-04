# Phase 6 Integrations Handoff

Status: implementation complete through Stages 1-7 on
`phase-6/integrations`; ready for user manual audit after final smoke pass.

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
pnpm --filter @handle/api typecheck
pnpm --filter @handle/web typecheck
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
