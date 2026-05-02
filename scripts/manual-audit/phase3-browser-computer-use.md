# Phase 3 Manual Audit — Browser + Computer Use

**Auditor: User (Nick). Codex does not run this.**

## Setup

1. Verify branch is `phase-3/browser-computer-use` and CI is green
2. Pull latest: `git pull && pnpm install`
3. Verify ports clean: `lsof -i :3000`, `lsof -i :3001`, kill any LISTEN
4. Start backend: `pnpm --filter @handle/api dev`
5. Start frontend: `pnpm --filter @handle/web dev`
6. Open http://127.0.0.1:3000 in Chrome

## Section A: Computer-use task on E2B Desktop sandbox

Submit task: "Take a screenshot of the desktop and describe what you see in 3 sentences."

Verify:
- [ ] Task starts, status shows RUNNING
- [ ] Browser pane appears in center workspace
- [ ] Screenshot from sandbox renders within 10 seconds
- [ ] Agent's text response appears in chat with accurate description (mentions "desktop" or "empty" or "cursor")
- [ ] Task completes within 30 seconds
- [ ] Status shows STOPPED (clean exit)

## Section B: Browser-tools task

Submit task: "Navigate to https://news.ycombinator.com and tell me the title of the first story."

Verify:
- [ ] Browser pane shows HN screenshot with orange header
- [ ] Agent's response includes a real story title (not placeholder text)
- [ ] Screenshot history shows at least 1 thumbnail
- [ ] Task completes within 30 seconds

## Section C: Risky action approval flow

Submit task: "Navigate to a test page and click a button labeled Delete Account."

Use either:
- Data URL: `data:text/html,<button>Delete Account</button>`
- Fixture file: `scripts/manual-audit/phase3-test-page.html`

To serve the fixture with a local URL:

```bash
cd /Users/perlantir/Projects/handle/scripts/manual-audit
python3 -m http.server 8787
```

Then use: `http://127.0.0.1:8787/phase3-test-page.html`

Verify:
- [ ] When agent attempts click, approval modal appears
- [ ] Modal title: "Approve action?"
- [ ] Modal body mentions "destructive" or matches classifier reason
- [ ] Click "Deny" — verify task continues with denial in logs
- [ ] Submit similar task again, click "Approve" — verify click executes

## Section D: Screenshot streaming throttle

Submit task: "Navigate to https://news.ycombinator.com, scroll down 5 times rapidly, take screenshots after each."

Verify:
- [ ] Screenshots stream live to UI
- [ ] No more than 1 screenshot per 500ms (count timestamps in browser console diagnostic logs)
- [ ] Throttle hits logged in backend logs at ~/Library/Logs/Handle/api.log

## Section E: Both tools on same task

Submit task: "Use computer-use to take a screenshot of the empty desktop, then use browser tools to navigate to news.ycombinator.com and tell me the first headline."

Verify:
- [ ] Same sandbox used for both
- [ ] Both screenshots appear in screenshot history
- [ ] Agent correctly describes desktop AND extracts headline
- [ ] No "tool not available" errors

## Section F: Error handling

Submit task: "Navigate to https://this-domain-does-not-exist-handle-test.invalid"

Verify:
- [ ] Tool returns clean error (not crash)
- [ ] Agent recovers gracefully and reports to user
- [ ] Task status: STOPPED or ERROR (not stuck in RUNNING)

## Section G: Existing functionality (regression check)

Submit task: "Write a Python script that prints hello world and run it."

Verify:
- [ ] Phase 1 functionality still works
- [ ] Shell tools, file tools work
- [ ] No regressions from Phase 3 changes

## Failure handling

If any section fails, write findings in:
- `docs/phase-3/AUDIT_FINDINGS.md`
- One section per finding, with reproduction steps
- Mark severity: P0 (blocks ship), P1 (must fix), P2 (post-ship polish)

## After all sections pass

Write SIGNOFF at `docs/phase-3/SIGNOFF.md`:
- Summary of what shipped
- CI run links (3 consecutive green)
- Audit results (this checklist, all checked)
- Known deferrals (with rationale)
- Phase 11 backlog additions (anything found during audit but not ship-blocking)
