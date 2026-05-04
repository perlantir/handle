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

Final all-repo verification:

- `pnpm test` - PASS. API: 57 files / 364 tests. Web: 2 files / 8 tests.
- `pnpm build` - PASS. Shared, API, and Web built successfully.

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
