# Phase 5 Manual Audit — Memory + Zep

**Auditor: User (Nick). Codex does not run this manual audit.**

## Setup

1. Verify branch is `phase-5/memory` and CI is green.
2. Pull latest and install: `git pull && pnpm install`
3. Start memory: `pnpm memory:up`
4. Verify memory status: `pnpm smoke:zep-client-connect`
5. Kill any LISTEN on ports 3000 and 3001.
6. Start backend: `pnpm --filter @handle/api dev`
7. Start frontend: `pnpm --filter @handle/web dev`
8. Open `http://127.0.0.1:3000` in Chrome.

## Section A: Automatic Recall

1. In Project A, submit: `My favorite color is teal.`
2. Wait for completion.
3. Open a new conversation in Project A.
4. Submit: `Suggest a website background color for me.`

Verify:

- [ ] Agent response references teal.
- [ ] Workspace inspector shows Memory Used entries.
- [ ] `~/Library/Logs/Handle/memory.log` has successful write/search entries.

## Section B: Memory Tools

1. Submit: `Remember that my project is named Handle.`
2. Wait for completion.
3. Submit: `What's my project name?`

Verify:

- [ ] Agent saves the fact to memory.
- [ ] Agent recalls Handle in the later turn.
- [ ] No secrets appear in memory logs.

## Section C: Memory Graph UI

1. Open `/memory`.
2. Select the `All` tab.
3. Switch to Graph view.
4. Click a memory node.

Verify:

- [ ] Top tabs include All, Global, and project names.
- [ ] Graph view renders facts/entities.
- [ ] Detail panel opens with fact text, source, confidence, and timestamps.

## Section D: Forget

1. Submit: `Forget my favorite color.`
2. Wait for the memory forget approval modal.
3. Click Approve.
4. Ask again: `What is my favorite color?`

Verify:

- [ ] Approval modal appears before deletion.
- [ ] Agent reports the memory was forgotten.
- [ ] Later recall no longer returns the deleted fact.

## Section E: Redaction

1. Submit a fake secret message:
   `My test card is 4111-1111-1111-1111, SSN is 123-45-6789, and API key is sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.`
2. Open `/memory` and search for `4111`, `123-45`, and `sk-`.

Verify:

- [ ] Raw fake card number is not shown.
- [ ] Raw fake SSN is not shown.
- [ ] Raw fake API key is not shown.
- [ ] Stored text uses `[REDACTED]`.

## Section F: Project Memory Isolation

1. Project A memory scope: `GLOBAL_AND_PROJECT`.
2. Submit in Project A: `My preferred dashboard accent is teal.`
3. Project B memory scope: `GLOBAL_AND_PROJECT`.
4. Ask in Project B: `What dashboard accent do I prefer?`
5. Project C memory scope: `PROJECT_ONLY`.
6. Ask in Project C: `What dashboard accent do I prefer?`

Verify:

- [ ] Project B can recall teal through global memory.
- [ ] Project C does not recall teal unless it has its own project memory.
- [ ] `/memory` can filter Global versus project facts.

## Section G: Graceful Degradation

1. Stop memory: `pnpm memory:down`
2. Submit a normal task in any project.
3. Restart memory: `pnpm memory:up`
4. Wait up to 60 seconds.

Verify:

- [ ] Agent task still runs while memory is offline.
- [ ] Workspace shows a Memory offline state.
- [ ] Settings → Memory shows offline while Zep is stopped.
- [ ] Settings → Memory returns to connected after restart.

## Section H: Memory UI

1. Open `/memory`.
2. Use List view.
3. Search and filter memory facts.
4. Click a fact.
5. Delete a memory namespace.

Verify:

- [ ] List view table shows Fact, Source, Type, Confidence, and Actions.
- [ ] Search narrows results.
- [ ] Detail panel updates when a fact is selected.
- [ ] Delete asks for confirmation and removes the namespace.

## Section I: Per-Message Override

1. In a project with memory enabled, toggle the composer Memory button off.
2. Submit: `Do not remember that my temporary code is banana.`
3. Toggle Memory on.
4. Submit: `Remember that my stable code word is teal.`
5. Open a new conversation and ask: `What code words do you know?`

Verify:

- [ ] Temporary `banana` fact is not recalled.
- [ ] Stable `teal` fact is recalled.
- [ ] Composer toggle returns to the project default after sending.

## Section J: Prior Phase Regression

Run the existing regression smokes:

- [ ] `pnpm smoke:e2e-canonical`
- [ ] `pnpm smoke:browser-tools`
- [ ] `pnpm smoke:computer-use-agent`
- [ ] `pnpm smoke:local-backend-basic`

## Failure Handling

If anything fails, write findings to:

- `docs/phase-5/AUDIT_FINDINGS.md`

Use one section per finding with:

- Severity: P0 (blocks ship), P1 (must fix), P2 (post-ship polish)
- Reproduction steps
- Expected behavior
- Actual behavior
- Relevant logs/screenshots

## After All Sections Pass

Write SIGNOFF at `docs/phase-5/SIGNOFF.md`:

- Summary of what shipped
- CI run links (3 consecutive green)
- Audit results (this checklist, all checked)
- Known deferrals with rationale
- Phase 11 backlog additions
