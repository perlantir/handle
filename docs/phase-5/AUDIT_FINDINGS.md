# Phase 5 Manual Audit — Findings (Pre-Fix Batch)

Auditor: Nick (perlantir)
Audit date: May 3, 2026
Branch: phase-5/memory
Audit covered: Sections A, B, C, D, E, F, G, I (partial), N (partial)
Sections NOT yet tested: J, K, L, M, O

## P0 — Block ship (7 findings)

- F-007/F-018: User messages stored as memory facts
- F-015: API-key-shaped input crashes agent response
- F-017: PROJECT_ONLY scope leaks global memory at retrieval
- F-021: No per-project scope override UI
- F-026: Per-message memory toggle reverts to on
- F-027: Memory writes leak across projects
- F-028: Resume after pause hallucinates task completion

## P1 — Must fix (6 findings)

- F-006: Agent confabulates memory recall
- F-009: Memory stores raw user text plus normalized version
- F-014: memory_forget only deletes from one scope
- F-016: Redacted facts still stored as memory entries
- F-019: New project missing model config
- F-022: Sidebar doesn't scroll

## P2 — Polish (deferred to Phase 11)

- F-008: Confidence display calibration
- F-010 / F-013: Force-directed graph view missing
- F-023: Projects list not collapsible
- F-025: Composer memory indicator doesn't reflect connection state
- F-005: Smoke fixture pollution (resolved by cleanup script)

## Status

Codex fix batch pushed through commit 35f651f. Awaiting destructive reset and full re-audit covering all sections A through O.