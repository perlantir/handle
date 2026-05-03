# Phase 4 SIGNOFF: Local Execution + Projects

## Status: SHIPPED

## What shipped

- ExecutionBackend abstraction and E2BBackend refactor.
- SafetyGovernor with project-aware scope boundaries, forbidden pattern denial, approval gates, rate limiting, and append-only audit log at `~/Library/Logs/Handle/audit.log`.
- LocalBackend file and shell execution on the user's Mac, with workspace roots under `~/Documents/Handle/workspaces/`.
- Local browser support: separate-profile Chrome and actual-Chrome CDP mode with heightened approval.
- Settings UI for Execution and Browser defaults.
- Project, Conversation, Message, and AgentRun data model replacing task-only UX.
- Sidebar project switcher, project creation/rename/delete, chat rename/delete, and always-visible project chat titles.
- Multi-turn workspace chat with stop control, interrupt-on-new-message behavior, model/backend/scope controls, and project-scoped system prompts.
- Composer scope controls: Default workspace, Specific folder, Desktop, plus permission levels Ask, Plan, Full access.
- Phase 4 manual audit harness at `scripts/manual-audit/phase4-local-execution.md`.

## CI verification

- Three consecutive green CI runs are still required on the pushed SIGNOFF tip before merge per Rule 12.
- Local verification on the pre-SIGNOFF tip `a8d54ee`:
  - `pnpm test` — PASS
  - `pnpm build` — PASS
  - `pnpm --filter @handle/api test -- localBackend localBrowser projects runAgent tools prompts settings` — PASS
  - `pnpm --filter @handle/web typecheck` — PASS

## Manual audit results

Audit run May 2, 2026. Sections A-D, G, H, and F-018 stop/interrupt verification passed before the final fix batch. Sections E and J surfaced F-019 and F-020, and a follow-up runtime switch check surfaced F-021. Those are now fixed and smoke-verified. See `docs/phase-4/AUDIT_FINDINGS.md`.

- Section A: Project container + default workspace scope — PASS after backend-aware prompt fix
- Section B: Custom folder scope — PASS
- Section C: Full access scope + forbidden patterns — PASS
- Section D: Shell safety edge cases — PASS
- Section E: Rate limiting — PASS after F-019 fix
- Section F: Multi-turn conversation — PASS
- Section G: Model/backend switching — PASS after F-021 fix
- Section H: Project switching + isolation — PASS
- Section I: Local browser separate profile — PASS
- Section J: Actual Chrome — PASS after F-020 fix
- Section K: Prior phase regressions — PASS per user audit and smoke runs

## Rule 34 smoke verification

- `pnpm smoke:rate-limit-error-surfaces` — PASS
- `pnpm smoke:local-rate-limit` — PASS
- `pnpm smoke:actual-chrome-connection-error` — PASS
- `pnpm smoke:local-browser-actual-chrome` — PASS with Chrome launched on port 9222 using a temporary profile
- `pnpm smoke:mid-conversation-backend-switch` — PASS
- `pnpm smoke:workspace-ui-regression` — PASS
- `pnpm smoke:agent-run-cancel` — PASS
- `pnpm smoke:message-interrupt` — PASS
- In-app browser verification on `http://127.0.0.1:3000` — PASS for composer controls, project/chat menus, and always-visible chat titles

## Architectural decisions locked in

- Local execution is always mediated by SafetyGovernor; tools do not bypass it.
- Agent prompts are backend-aware and rebuilt for each run, not cached at conversation start.
- Project settings apply to the next message; active runs keep their original runtime context.
- Full access is a project permission mode, but forbidden patterns still deny unconditionally.
- Actual Chrome mode is opt-in, approval-gated, and never auto-launches the user's normal Chrome from runtime code.
- Rate limits are user-visible tool errors and auditable denials, not silent drops.

## Deferrals to Phase 11

See `docs/phase-4/AUDIT_FINDINGS.md`:

- F-003: Agent may self-refuse forbidden paths before SafetyGovernor records an audit entry. This is safe defense-in-depth, but weakens forensic completeness.
- Native folder picker for Specific folder scope remains deferred until the Tauri wrapper. Phase 4 uses path entry/validation.
- Audit log rotation and log viewer UI remain deferred polish.

## Phase 5 prep

Phase 4 is ready for PR #4 review once the SIGNOFF commit is pushed and CI has three consecutive green runs on the branch tip.
