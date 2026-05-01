# Phase 1 Signoff: Foundation

Status: Ready for review

Branch: `phase-1/foundation`

Audited commit: `6455681`

Manual auditor: `perlantir`

Manual audit result: Passed

## Scope

Phase 1 established the Handle foundation:

- Next.js web workspace with Clerk authentication and the Phase 1 workspace shell.
- Express API workspace with Prisma/Postgres persistence, health reporting, file logging, and CORS configured for the canonical local origin.
- LangChain agent loop backed by E2B, with Phase 1 tools, SSE task streaming, plan/status/tool/file events, and UI rendering.
- Approval infrastructure data model, routes, and helper plumbing, with tool enforcement deferred to later phases as specified.
- Root `.env` loading from workspaces via `dotenv-cli`.
- Manual audit harness and smoke coverage for sign-in, task creation, SSE streaming, and the canonical Hacker News task.

## Manual Audit Evidence

The manual audit passed with three successful runs of the canonical Hacker News task.

### Run 1

Task: `cmom8xkcs00011k3421kfhr1e`

Final status: `STOPPED`

The agent recovered after its first script attempt produced empty output. It fetched the Hacker News HTML, inspected the real page structure, rewrote the parser using the current `titleline` and `score` selectors, and produced 10 valid stories with title, URL, and score.

### Run 2

Final status: `STOPPED`

The agent succeeded on its first script attempt and produced 10 valid stories.

### Run 3

Final status: `STOPPED`

The agent succeeded on its first script attempt and produced 10 valid stories.

## Gate Checks

- `/health` returns `service: "handle-api"`, `status: "ok"`, build commit `6455681`, and a valid timestamp.
- `~/Library/Logs/Handle/api.log` exists and rotation is configured.
- Home and Workspace screens match `FINAL_DESIGN_SYSTEM.md` and the screen-spec anatomy.
- Styling is design-token driven with no ad-hoc colors found during audit.
- Status pulse, plan steps, tool-call streaming, terminal output streaming, files touched, and inspector panels are functional.

## Issues Found And Resolved During Audit

- Prisma could not load the root `.env` from `apps/api`; fixed in `f373fe3` with `dotenv-cli`.
- API dev appeared hung because logs only went to file; fixed in `80728e4` with a stdout banner and dev-mode pretty logging.
- Next.js middleware had a self-proxy loop; fixed in `d42b255`.
- Browser task submission was blocked by CORS; fixed in `9bec11a` and `efa0fff` with the canonical allowlist and integration coverage.
- `apps/web/next-env.d.ts` was tracked despite being generated; fixed in `041f984`.
- LangChain treated JSON-style result markers as prompt template variables; fixed in `15c2c33` with a brace-free marker.
- The agent did not recover from missing Python `requests`; fixed in `3922203` and `68fbade` with prompt recovery guidance and common sandbox package preinstalls.
- The agent stopped after two scraping attempts with stale Hacker News selectors; fixed in `6455681` with `system_prompt_v5`, explicit recovery rules, and `maxIterations: 40`.

## Deferred By Spec

- Plan steps populate but do not progress through active/done states; Phase 9 LangGraph supervisor owns real plan tracking.
- Multi-provider routing is deferred to Phase 2.
- Browser automation is deferred to Phase 3.
- Local execution backend is deferred to Phase 4.

## Signoff

All Phase 1 gate criteria are met as of the audited commit. The branch remains unmerged for human review.
