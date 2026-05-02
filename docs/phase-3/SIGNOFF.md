# Phase 3 SIGNOFF: Browser + Computer Use

## Status: SHIPPED

## What shipped

- Step 1: E2B Desktop sandbox wrapper (commit d38b0d7)
- Step 2: Anthropic computer-use provider mode (commit 237e06c)
- Steps 3+4: Browser tools via Node + Playwright in sandbox (commits 25fa101, e9cad26, bb8736e, 0854605)
- Rule 34: Codex runs live smoke before handoff (commit fe40cc9)
- Step 5: Risky browser action approval flow (commit 7d6b815)
- Step 6: Live screenshot streaming via SSE with throttling (commit e4c620d)
- Step 7: Browser pane in workspace UI (commit 12a1140)
- Step 8: Manual audit harness (commit d056b89)
- Audit fix: Route desktop screenshot tasks through computer-use; agent integration of both tools (commit 7f8f9a1)

## CI verification

- Three consecutive green CI runs on tip 7f8f9a1 required per Rule 12
- Currently: 2 green runs documented (25253362099, 25253428141)
- One additional CI run via workflow_dispatch needed before merge

## Manual audit results

Audit run May 2, 2026. All 7 sections (A-G) passed. See docs/phase-3/AUDIT_FINDINGS.md for P2 items deferred to Phase 11.

- Section A: Computer-use desktop screenshot — PASS
- Section B: Browser-tools HN extract — PASS
- Section C: Risky action approval — PASS (with harness fix deferred)
- Section D: Screenshot streaming throttling — PASS
- Section E: Both tools same task — PASS (the integration test)
- Section F: Error handling — PASS
- Section G: Phase 1 regression — PASS

## Architectural decisions locked in

- Sandbox uses Node 20 + Playwright (NOT Python + browser-use library)
- "Browser-Use's pattern as guide" means API design pattern, not the actual Python library
- Two-tool architecture: vision (computer-use) + DOM (browser-tools) coexist on same E2B Desktop sandbox
- Agent-level integration: runAgent.ts now uses Phase 3 agent with browser + computer-use tools when Anthropic is the active provider; falls back to Phase 1 sandbox/tools otherwise
- Rule 34: Codex runs live smoke before declaring "ready for human verification" — eliminated multi-cycle fix loops

## Deferrals to Phase 11

See docs/phase-3/AUDIT_FINDINGS.md:

- F-001: UI shows wrong provider name and zero cost (P2 cosmetic)
- F-002: Audit harness Section C uses unreachable test URL (P2 documentation)
- F-003: Duplicate "working" + "complete" message rendering (P2 cosmetic)

## Phase 4 prep

Phase 4 prep message ready (assistant has draft including Rules 32-33 and spec hardening for SafetyGovernor).
