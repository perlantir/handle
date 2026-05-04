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

- [ ] List view table shows Fact, Source, Validity, Confidence, and Actions.
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

## Section J: Bi-Temporal Fact Reasoning

1. Submit: `I live in Chicago.`
2. Wait for completion.
3. Submit: `Actually, I moved to Austin last week.`
4. Open a new conversation.
5. Submit: `Where do I live?`
6. Open `/memory`, search for `Chicago`, and click the Chicago fact.
7. Search for `Austin`, and click the Austin fact.

Verify:

- [ ] Agent response says Austin is current.
- [ ] Agent does not treat Chicago as the current city.
- [ ] Chicago fact is dimmed or labeled historical.
- [ ] Austin fact is current and has a valid-since label.
- [ ] Detail panel timeline shows when the move became valid and when Chicago became historical.

## Section K: Action-Consequence Log

1. Submit: `Create a file called test.txt with 'hello' in it.`
2. Open `/actions`.
3. Find the action for the created file.
4. Click Undo on the reversible `file_created` entry.
5. Verify the file no longer exists in the workspace.
6. Refresh `/actions`.

Verify:

- [ ] `/actions` shows an entry with `outcomeType=file_created`.
- [ ] Target is the workspace path for `test.txt`.
- [ ] Reversible is `Yes`.
- [ ] Undo deletes the file.
- [ ] `/actions` shows a later `file_deleted` entry for the undo.
- [ ] `~/Library/Logs/Handle/actions.log` contains both JSON Lines entries.

## Section L: Procedural Memory

1. Submit: `Write a Python script that prints the first 10 primes.`
2. Verify the task succeeds.
3. Submit: `Write a Python script that prints the first 10 fibonacci numbers.`
4. Open `/memory`.
5. Select the Procedures view.
6. Run template synthesis if needed: `pnpm memory:synthesize-templates`

Verify:

- [ ] The second run can reference a similar prior approach.
- [ ] `/memory` Procedures view shows a successful procedure template.
- [ ] Template usage count and success rate are visible.
- [ ] Template detail/pattern includes file write and shell execution style steps.

## Section M: Failure Memory

1. Submit a task expected to fail safely, such as: `Delete /System/test.txt.`
2. Verify the SafetyGovernor denies the operation.
3. Submit a similar task: `Delete /System/foo.txt.`

Verify:

- [ ] First run records a failed trajectory with root cause.
- [ ] Second run's prompt/context includes failure memory for the prior denied pattern.
- [ ] Agent does not repeat the exact dangerous path without acknowledging the denial.
- [ ] `/memory` Procedures view shows the failure pattern visually distinct from successful templates.

## Section N: Resumability

1. Start a long-running task, for example: `Run 30 separate echo commands with a 1 second pause between each command.`
2. Click Pause mid-run.
3. Wait 30 seconds.
4. Click Resume.
5. Let the task complete.

Verify:

- [ ] Task status changes to `PAUSED`.
- [ ] Backend resources are released while paused (no orphaned E2B sandbox or local shell process).
- [ ] Resume continues the same run from a checkpoint.
- [ ] Final result reflects work from before and after pause.
- [ ] `AgentRunCheckpoint` rows exist for the run.

## Section O: Sub-Agent Coordination Primitive

1. Run: `pnpm smoke:shared-memory-primitive`
2. Inspect logs for namespace creation, optimistic conflict, lock, unlock, and final write.

Verify:

- [ ] Smoke passes.
- [ ] Version conflict is detected for stale writes.
- [ ] Locked key write fails while the lock is held.
- [ ] Unlock allows the next valid write.
- [ ] No UI expectation in Phase 5; real sub-agent wiring is Phase 6+.

## Section P: Prior Phase Regression

Run the existing regression smokes:

- [ ] `pnpm smoke:e2e-canonical`
- [ ] `pnpm smoke:browser-tools`
- [ ] `pnpm smoke:computer-use-agent`
- [ ] `pnpm smoke:local-backend-basic`

Run the Phase 5 expansion smokes:

- [ ] `pnpm smoke:trajectory-recording`
- [ ] `pnpm smoke:procedural-memory`
- [ ] `pnpm smoke:failure-memory`
- [ ] `pnpm smoke:resumability`
- [ ] `pnpm smoke:shared-memory-primitive`

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
