# Phase 3 Audit Findings

Manual audit completed May 2, 2026. All ship-blocking sections passed.
The items below are P2 polish/documentation issues deferred to Phase 11.

## F-001: UI Shows Wrong Provider Name And Zero Cost

- Severity: P2
- Area: Workspace UI
- Finding: Some Phase 3 browser/computer-use task states show a misleading provider name and `$0.00` cost even when Anthropic computer-use is doing real work.
- Impact: Cosmetic and accounting visibility issue. It does not block browser tools, computer-use execution, screenshot streaming, or task completion.
- Deferred to: Phase 11
- Recommended follow-up: Track actual provider/tool mode and cost metadata per task/tool call, then render that in the Workspace header/status bar.

## F-002: Audit Harness Section C Uses Unreachable Test URL

- Severity: P2
- Area: Manual audit harness documentation
- Finding: The risky-action approval section references a deterministic test URL path that can be unreachable unless the helper page is served exactly as documented.
- Impact: Documentation friction only. The risky-action classifier and approval flow passed once exercised against a reachable fixture.
- Deferred to: Phase 11
- Recommended follow-up: Make the audit harness use a single canonical fixture URL or add a tiny helper server script so Section C has no ambiguity.

## F-003: Duplicate "Working" And "Complete" Message Rendering

- Severity: P2
- Area: Workspace chat rendering
- Finding: The Workspace can show both an in-progress/working assistant message and the completed assistant message, resulting in apparent duplicate content.
- Impact: Cosmetic. It does not affect task status, tool execution, SSE streaming, or saved messages.
- Deferred to: Phase 11
- Recommended follow-up: Collapse the transient working assistant message once the final assistant message arrives, or render it as a distinct live-stream buffer that is replaced on completion.
