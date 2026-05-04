# Phase 6.5 Implementation Handoff

This is not SIGNOFF. It records Codex's implementation status and local
verification before user manual audit.

## Stage Status

- Stage 0 - Spec: PASS. Canonical spec is in
  `docs/phase-6.5/PHASE_6.5_SPEC.md`.
- Stage 1 - Temporal and Async Task UX: PASS for local Temporal dev stack,
  async dispatch fallback, notification settings, and async task list UI.
- Stage 2 - BYOK Web Search: PASS for Settings UI, encrypted key storage,
  provider routing, typed errors, and fallback logic. Live provider calls are
  audit-dependent on user-supplied Tavily, Serper, or Brave keys.
- Stage 3 - `todo.md`: PASS for multi-step heuristic, workspace file creation,
  prompt context injection, and Files panel stickiness.
- Stage 4 - Critic/Verifier: PASS for per-project config, plan/tool review
  hooks, verdict persistence, and action logging. Live critic quality still
  needs user audit with real model runs.
- Stage 5 - Workflow Templates: PARTIAL. Template CRUD, Settings UI, manual
  Run now, action logging, and redaction are implemented. Real provider
  webhook/poll trigger ingestion needs connected provider credentials and is
  marked for manual audit before it can be called PASS.
- Stage 6 - Saved Cross-Integration Agents: PARTIAL. Saved-agent CRUD, Settings
  UI, connector access list, memory scope storage, and manual Run now queuing
  are implemented. Temporal cron scheduling for saved agents is schema-ready
  but must be audited before PASS.
- Stage 7 - Audit Harness and Hardening: PASS for manual audit harness and
  Next proxy hardening for Search, Workflows, and Saved Agents.

## Local Verification

Focused smokes run during implementation:

- `pnpm smoke:temporal-dev-stack`
- `pnpm smoke:settings-notifications-ui`
- `pnpm smoke:async-tasks-ui`
- `pnpm smoke:web-search-routing`
- `pnpm smoke:settings-search-providers-ui`
- `pnpm smoke:todo-md-tracking`
- `pnpm smoke:critic-review`
- `pnpm smoke:workflow-templates`
- `pnpm smoke:saved-agents`
- `pnpm --filter @handle/api typecheck`
- `pnpm --filter @handle/web typecheck`
- `pnpm --filter @handle/api exec vitest run src/search/searchProviderService.test.ts src/routes/searchSettings.test.ts src/routes/savedAgents.test.ts --no-file-parallelism`

Final all-repo verification:

- `pnpm test` - PASS. API: 57 files / 364 tests. Web: 2 files / 8 tests.
- `pnpm build` - PASS. Shared, API, and Web built successfully.

## Live Browser Walkthrough

Codex applied local migrations with `pnpm --filter @handle/api prisma migrate deploy`
before the browser walkthrough so the Phase 6.5 tables existed in the dev DB.

- Settings -> Search loaded Tavily, Serper, and Brave provider cards after
  fixing a StrictMode/concurrent-request bootstrap race in provider row
  creation.
- Settings -> Workflows: created `UI smoke release workflow`, saved it, clicked
  Run now, and saw `Workflow run completed`.
- Settings -> Saved Agents: created `UI smoke digest`, clicked Run now, and saw
  `Saved agent queued`. A follow-up DB check found the inline fallback path could
  leave `SavedAgentRun` stuck in `QUEUED`; the route now syncs terminal
  inline-fallback status back to the saved-agent run record.
- Tasks page was loaded again with matching frontend/backend auth-bypass
  settings and no Clerk-token or fetch errors. The previously queued saved-agent
  run had been created under an earlier test server/session, so the user audit
  should verify Tasks visibility on the normal `3000`/`3001` setup with one
  consistent browser session.

## Audit Needs From User

- BYOK keys for Tavily, Serper, and Brave if all three live search providers
  should be audited.
- Connected Gmail and Slack accounts if notification dispatch through
  integrations should be audited.
- Connected provider accounts for Workflow Template webhook or poll trigger
  audits.
- Connected integrations for saved cross-integration agents that actually read
  and act across Gmail, Slack, Notion, GitHub, or other providers.

## BYOK Search Checklist

- Tavily: create an API key at `https://app.tavily.com/`, paste it in
  Settings -> Search -> Tavily, enable, save, then Test.
- Serper: create an API key at `https://serper.dev/`, paste it in
  Settings -> Search -> Serper, enable, save, then Test.
- Brave Search: create an API key at `https://api.search.brave.com/`, paste it
  in Settings -> Search -> Brave Search, enable, save, then Test.

## Manual Audit Harness

Use `scripts/manual-audit/phase6.5-additions.md`.

Do not write SIGNOFF until that audit passes or the user explicitly approves
deferred items.
