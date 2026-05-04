# Phase 5 Manual Audit — Findings

Auditor: Nick (perlantir)
Audit date: May 3, 2026
Branch: phase-5/memory
Final status: PASS

## Summary

Phase 5 manual audit passed after fix batches. All audited sections passed and all P0/P1 findings discovered during audit were verified fixed by the auditor.

## Fixed P0/P1 Findings

- F-006: Agent confabulates memory recall — FIXED
- F-007/F-018: User messages stored as memory facts — FIXED
- F-009: Memory stores raw user text plus normalized version — FIXED
- F-014: memory_forget only deletes from one scope — FIXED
- F-015: API-key-shaped input crashes agent response — FIXED
- F-016: Redacted facts still stored as memory entries — FIXED
- F-017: PROJECT_ONLY scope leaks global memory at retrieval — FIXED
- F-019: New project missing model config — FIXED
- F-021: No per-project scope override UI — FIXED
- F-022: Sidebar does not scroll — FIXED
- F-026: Per-message memory toggle reverts to on — FIXED
- F-027: Memory writes leak across projects — FIXED
- F-028: Resume after pause hallucinates task completion — FIXED
- F-031: Anthropic memory.save flow crashes — FIXED
- F-032: Agent misleads user about secret storage — FIXED
- F-033: memory_forget overdeletes entire namespaces — FIXED
- F-034: Backend default reverts to E2B after Local selected — FIXED
- F-035: Procedural memory not extracting templates — FIXED

## Deferred P2 Items

Deferred to Phase 11 polish unless pulled forward explicitly:

- F-005: Smoke fixture pollution cleanup ergonomics. Cleanup script exists.
- F-008: Confidence display calibration.
- F-010/F-013: Full force-directed graph view polish.
- F-023: Projects list collapsibility polish.
- F-025: Composer memory indicator should reflect Zep connection state.

## Final Audit Result

Phase 5 final audit: PASS. Foundation solid. Sections A through O passed, including memory scope isolation, redaction, per-message memory toggles, bi-temporal facts, action-consequence log, procedural memory, failure memory, resumability, and shared-memory primitive.
