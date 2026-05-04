# Phase 6.5 Manual Audit - Agent Foundation Extensions

**Auditor: User. Codex does not run this manual audit.**

Phase 6.5 covers async task UX, opt-in notifications, BYOK web search,
critic/verifier review, persistent `todo.md` tracking, workflow templates, and
saved cross-integration agents.

## Pre-Audit Setup

1. Verify branch is `phase-6.5/agent-foundation`.
2. Pull and install:

```bash
git pull
pnpm install
```

3. Start memory and Temporal:

```bash
pnpm memory:up
pnpm temporal:up
```

4. Kill any LISTEN on ports 3000, 3001, 7233, and 8233 if stale processes are
   present.
5. Start the Temporal worker:

```bash
pnpm temporal:worker
```

6. Start backend and frontend:

```bash
pnpm --filter @handle/api dev
pnpm --filter @handle/web dev
```

7. Open `http://127.0.0.1:3000`.
8. Keep these logs visible:
   - `tail -f ~/Library/Logs/Handle/api.log`
   - `tail -f ~/Library/Logs/Handle/audit.log`
   - `tail -f ~/Library/Logs/Handle/actions.log`
   - `tail -f ~/Library/Logs/Handle/memory.log`

## Section A: Temporal Infrastructure And Async Task Lifecycle

1. Open Settings -> Notifications.
2. Verify Temporal status shows reachable when `pnpm temporal:up` is running.
3. Submit a multi-step local task in a project, for example:
   "Create a Python script that prints the first 10 primes, run it, then tell
   me the output."
4. Immediately navigate to Tasks.
5. Verify the task appears as queued or running.
6. Close the browser tab.
7. Reopen Handle and navigate to Tasks.
8. Click Continue on the running/recent task.
9. Stop Temporal, submit a small task, and verify inline fallback is surfaced
   cleanly.

Verify:

- [ ] AgentRun has `asyncMode=true` and a workflow id when Temporal is
      available.
- [ ] Task list shows queued, running, completed, failed, waiting, and cancelled
      states accurately.
- [ ] Closing and reopening the browser does not lose task state.
- [ ] Inline fallback works when Temporal is unavailable.
- [ ] No raw secrets or large tool outputs appear in Temporal payload logs.

## Section B: Notification Channels

1. Open Settings -> Notifications.
2. Confirm email, Slack, and webhook are disabled by default.
3. Enable webhook with a controlled local/request-bin URL.
4. Enable only `TASK_COMPLETED` and save.
5. Submit a task that completes.
6. Enable Slack if the Slack integration is connected and save a controlled
   test channel.
7. Submit a task that needs approval.

Verify:

- [ ] No notification channel sends until explicitly enabled.
- [ ] Webhook receives task completion payload with redacted summaries.
- [ ] Approval-needed notification fires only when selected.
- [ ] Slack/email paths fail gracefully when integrations are not connected.
- [ ] Notification deliveries are recorded with status and error detail.

## Section C: BYOK Web Search Providers

BYOK setup:

- Tavily: create an API key at `https://app.tavily.com/`.
- Serper: create an API key at `https://serper.dev/`.
- Brave Search: create an API key at `https://api.search.brave.com/`.

1. Open Settings -> Search.
2. Verify all providers are disabled or missing key by default.
3. Save one provider key, enable it, and click Test.
4. Set memory scope to `Project`, then back to `Memory off`.
5. In a project, ask: "Search the web for Handle repository news and summarize
   the top result."
6. Rate-limit or disable the preferred provider and verify fallback to the next
   configured provider.
7. Remove the key and verify built-in fallback remains available.

Verify:

- [ ] Keys are entered through Settings, not `.env`.
- [ ] Keys are never displayed after save.
- [ ] Test reports connected in green or failed in red.
- [ ] `web_search` routes through the selected BYOK provider.
- [ ] Provider failures surface typed errors and fallback details.
- [ ] Search results are not written to memory when memory scope is `NONE`.

## Section D: todo.md Persistent Task Tracking

1. Submit a one-shot question: "What's 2+2?"
2. Verify no `todo.md` is created.
3. Submit a multi-step task: "Research three UI options, pick one, implement a
   small example, and summarize the tradeoffs."
4. Verify `<conversation-id>.todo.md` is created as the first workspace file
   action.
5. Open the Files panel and verify the todo file is sticky at the top.
6. Let the agent complete several steps.
7. Open `todo.md` and verify items are marked as done or updated as work
   proceeds.
8. Manually edit `todo.md` to add a direction change, then send a follow-up.

Verify:

- [ ] Heuristic skips one-shot questions.
- [ ] Heuristic creates todo for multi-step build/create/research/plan work.
- [ ] Todo file lives in the current workspace and uses the conversation id.
- [ ] Todo content is included in the next turn context.
- [ ] Todo content is not written to Zep memory.

## Section E: Critic/Verifier Role

1. Create or edit a project and enable Critic Review.
2. Use `risky-only` scope first.
3. Submit a plan-heavy request and verify post-plan review appears in logs.
4. Submit a code-writing request and verify post-code-before-run review.
5. Submit a tool-heavy request and verify tool-result review on risky/write
   actions.
6. Change critic scope to `writes-only`, then `all`, and repeat a small task.
7. Trigger a critic rejection with an obviously unsafe instruction.

Verify:

- [ ] Critic is off by default.
- [ ] Per-project critic settings persist after refresh.
- [ ] Verdicts are `APPROVE`, `REVISE`, or `REJECT`.
- [ ] `REVISE` feedback is fed back to the agent.
- [ ] `REJECT` halts the run and surfaces reasoning to the user.
- [ ] Critic reviews are action-logged and privacy-safe.

## Section F: Workflow Templates

1. Open Settings -> Workflows.
2. Create workflow:
   - Trigger: GitHub -> `pull_request.merged`
   - Filter: `{ "label": "release" }`
   - Action: Slack -> `slack.send_message`
3. Save and refresh.
4. Click Run now with a controlled sample event payload.
5. Inspect `actions.log`.
6. If real Nango webhook support is configured, trigger an actual connector
   event and verify the workflow run.

Verify:

- [ ] Workflow template persists after refresh.
- [ ] Manual Run now creates a workflow run and action log entries.
- [ ] Action parameters are redacted before logs.
- [ ] Writes still respect Phase 4 permission mode.
- [ ] Real webhook/poll trigger behavior is marked PASS only if exercised with
      provider credentials.

## Section G: Cross-Integration Saved Agents

1. Open Settings -> Saved Agents.
2. Create saved agent:
   "Read inbox, summarize urgent emails, and post the summary to Slack
   #updates."
3. Select connector access: Gmail, Slack, Notion, GitHub.
4. Leave memory off and save.
5. Click Run now.
6. Open Tasks and continue the queued saved-agent run.
7. Create a scheduled saved agent if schedule support is enabled.

Verify:

- [ ] Saved agent persists after refresh.
- [ ] Connector access list is stored.
- [ ] Manual Run now creates an async AgentRun.
- [ ] Memory scope is respected.
- [ ] Output target does not bypass approval gates.
- [ ] Scheduled saved agents are marked PASS only if the Temporal schedule path
      is exercised.

## Section H: Memory Integration

1. Confirm Search Providers, Workflow Templates, and Saved Agents default to
   memory off.
2. Toggle per-message memory off in the composer.
3. Run a search or integration-backed task.
4. Open `/memory`.
5. Enable project memory on a controlled search provider and repeat.
6. Run a workflow with memory off, then with memory on if supported.

Verify:

- [ ] Per-message memory off drops integration/search memory candidates.
- [ ] No raw payload bodies, email bodies, document bodies, tokens, or secrets
      are stored.
- [ ] Only conservative metadata allowlist items enter memory.
- [ ] Memory offline does not break async tasks, search, workflows, or saved
      agents.

## Section I: Action Log And Failure Memory

1. Run one async task to completion.
2. Run one task that fails cleanly.
3. Run one workflow template manually.
4. Run one saved agent manually.
5. Trigger one critic rejection.
6. Open `/actions` and inspect `~/Library/Logs/Handle/actions.log`.
7. Open `/memory` Procedures/Failures sections.

Verify:

- [ ] Successful real-world outcomes create action log entries.
- [ ] Failed workflow/saved-agent/search/critic paths produce typed errors.
- [ ] Useful failures are captured in failure memory without sensitive payloads.
- [ ] Action log entries include project/conversation/task identifiers where
      available.

## Section J: Regression Across Phases 1-6

Run the core regression suite:

```bash
pnpm smoke:e2e-canonical
pnpm smoke:projects-crud
pnpm smoke:memory-recall
pnpm smoke:integrations-nango-connect
pnpm smoke:integrations-tier1-read
pnpm smoke:local-backend-basic
pnpm smoke:workspace-ui-regression
```

Verify:

- [ ] Phase 1 canonical task still passes.
- [ ] Phase 4 local execution and approval gates still pass.
- [ ] Phase 5 memory recall and redaction still pass.
- [ ] Phase 6 integration settings and connected-account tests still pass.
- [ ] New Phase 6.5 UI does not regress Settings navigation or workspace panes.

## Failure Handling

If anything fails, append findings to `docs/phase-6.5/AUDIT_FINDINGS.md`.

Severity:

- P0: blocks ship.
- P1: must fix before SIGNOFF.
- P2: can defer to Phase 7, Phase 8, or Phase 11 if explicitly accepted.

Do not write Phase 6.5 SIGNOFF until every required section is PASS or has an
explicit user-approved deferral.
