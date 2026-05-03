# Phase 4 Manual Audit — Findings

Auditor: Nick (perlantir)
Audit date: May 2, 2026
Branch: phase-4/local-execution
Original audit tip commit: 7385411
Final fix tip before SIGNOFF: a8d54ee

## F-001: Local backend uses E2B system prompt; agent doesn't know about workspace dir
- Severity: P0 (blocks ship)
- Section: A
- Reproduction:
  1. Set default backend to Local Mac
  2. Submit task: "Write a Python script that prints the first 10 prime numbers and run it."
- Expected:
  - Agent uses file.write to create script in ~/Documents/Handle/workspaces/<task-id>/
  - All workspace files visible in workspace dir
- Actual:
  - Agent attempted file.write to /home/user/primes.py (E2B path)
  - Safety governor denied (path got rewritten to /System/Volumes/Data/home/user/primes.py)
  - Agent fell back to writing /tmp/primes.py via shell_exec heredoc, bypassing file.write
  - File ended up in /tmp/ on user's Mac, not in workspace dir
  - Workspace dir was created but empty
- Root cause hypothesis: System prompt for local backend wasn't updated. Agent thinks it's on E2B sandbox at /home/user.
- Impact: Local backend doesn't actually use workspace dir. Agent writes to wrong paths. Safety governor flags benign paths as forbidden because of macOS path resolution (/home/* gets rewritten to /System/Volumes/Data/home/*).
- Status: FIXED in Phase 4 audit fix commits before final SIGNOFF.

## F-002: UI shows wrong runtime label and provider
- Severity: P2 (cosmetic)
- Section: A
- Observed: Terminal shows "e2b" tab when backend is Local. UI shows "Model: OpenAI" when Anthropic is active provider.
- Expected: Terminal shows "Local" or "Mac" label. Model shows actual provider name.
- Status: FIXED in Phase 4 audit fix commits before final SIGNOFF.

## F-003: Agent self-refuses /System paths without invoking SafetyGovernor
- Severity: P2 (defense-in-depth, but obscures audit trail)
- Section: B step 1
- Reproduction:
  1. Submit "Write 'test' to /System/test.txt"
- Expected: Agent invokes file.write tool; SafetyGovernor denies; audit.log gets a deny entry.
- Actual: Agent refuses in reasoning before invoking tool; no audit log entry created; user sees agent refusal text instead of tool failure.
- Impact: Behavior is safer (two layers of refusal: agent reasoning + governor), but audit log doesn't capture the attempt, weakening forensic trail.
- Defer to: Phase 11 polish — consider system prompt update to encourage agent to attempt the action and let governor enforce, OR accept defense-in-depth as desired behavior.

## F-019: Rate limit fires silently
- Severity: P1 (must fix)
- Section: E
- Reproduction:
  1. Set backend to Local Mac.
  2. Submit: "Use shell_exec to run 50 separate echo commands, one per call, as fast as possible."
- Expected:
  - Rate-limited calls return a clear tool error to the agent.
  - Agent reports the rate limit to the user.
  - `audit.log` records rate-limited calls with `decision: "deny"` and `matchedPattern: "rate_limit"`.
- Actual:
  - Commands after the first burst were silently dropped from the agent's perspective.
  - No rate-limit audit entries were written.
- Fix:
  - `LocalBackend.shellExec` now logs rate-limit diagnostics and writes audit entries before returning a rate-limit tool observation.
  - The shell tool surfaces the rate-limit error to the agent instead of swallowing it.
  - Prompt v10 tells the agent to explain rate limits and suggest batching/continuation.
- Verification:
  - `pnpm smoke:rate-limit-error-surfaces` PASS.
  - `pnpm smoke:local-rate-limit` PASS.
- Status: FIXED.

## F-020: Actual Chrome connection fails and loops approvals
- Severity: P1 (must fix)
- Section: J
- Reproduction:
  1. Start Chrome with `--remote-debugging-port=9222`.
  2. Settings -> Browser -> Use my actual Chrome -> Test connection.
  3. Submit an actual-Chrome browser task.
- Expected:
  - Test connection uses the same CDP readiness check as runtime.
  - Unreachable Chrome returns an actionable error, not generic `fetch failed`.
  - A failed connection does not repeatedly re-open the approval modal.
- Actual:
  - Settings showed generic `fetch failed`.
  - Runtime retries could re-request approval after connection failure.
- Fix:
  - Added shared `testActualChromeConnection()` using `http://127.0.0.1:9222/json/version`.
  - Error detail now includes the underlying connection cause.
  - Actual-Chrome sessions remember approval for the session and do not retry idempotent actions after CDP connection failure.
- Verification:
  - `pnpm smoke:actual-chrome-connection-error` PASS with Chrome absent.
  - `pnpm smoke:local-browser-actual-chrome` PASS with Chrome launched on port 9222 using a temporary profile.
- Status: FIXED.

## F-021: Mid-conversation backend changes do not propagate
- Severity: P1 (must fix)
- Sections: G/H
- Reproduction:
  1. Start a conversation on E2B Cloud.
  2. Change composer backend to Local Mac.
  3. Send a follow-up message.
- Expected:
  - Current run remains on its original backend.
  - The next run uses the newly selected backend/scope/model.
  - System prompt is rebuilt per run with current project settings.
- Actual:
  - Follow-up run continued using stale E2B assumptions.
- Fix:
  - Composer persists project runtime changes before sending the next message.
  - Agent run creation logs and uses selected backend/scope/model at run start.
  - Prompt v10 explicitly tells the agent when prior turns used another backend.
- Verification:
  - `pnpm smoke:mid-conversation-backend-switch` PASS.
- Status: FIXED.

## F-022: Project and chat management missing from sidebar
- Severity: P1 (must fix)
- Section: Project UX regression pass
- Reproduction:
  1. Open sidebar with multiple projects and conversations.
  2. Try to rename or delete a project or chat.
  3. Observe project conversations.
- Expected:
  - Each project and chat has a three-dot action menu for rename/delete.
  - All chat titles remain visible underneath their project in the sidebar.
- Actual:
  - Projects/chats could not be deleted from the UI.
  - Chat titles were only surfaced after selecting a project.
- Fix:
  - Added project and chat action menus with rename/delete actions.
  - Added conversation rename/delete API routes.
  - Sidebar now loads and renders conversation titles for every project.
- Verification:
  - `pnpm smoke:workspace-ui-regression` PASS.
  - In-app browser check confirmed project/chat menus and always-visible chat titles.
- Status: FIXED.
