# Phase 4 Manual Audit — Findings

Auditor: Nick (perlantir)
Audit date: May 2, 2026
Branch: phase-4/local-execution
Tip commit: 7385411

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

## F-002: UI shows wrong runtime label and provider
- Severity: P2 (cosmetic)
- Section: A
- Observed: Terminal shows "e2b" tab when backend is Local. UI shows "Model: OpenAI" when Anthropic is active provider.
- Expected: Terminal shows "Local" or "Mac" label. Model shows actual provider name.
- Defer to Phase 11 polish.

## F-003: Agent self-refuses /System paths without invoking SafetyGovernor
- Severity: P2 (defense-in-depth, but obscures audit trail)
- Section: B step 1
- Reproduction:
  1. Submit "Write 'test' to /System/test.txt"
- Expected: Agent invokes file.write tool; SafetyGovernor denies; audit.log gets a deny entry.
- Actual: Agent refuses in reasoning before invoking tool; no audit log entry created; user sees agent refusal text instead of tool failure.
- Impact: Behavior is safer (two layers of refusal: agent reasoning + governor), but audit log doesn't capture the attempt, weakening forensic trail.
- Defer to: Phase 11 polish — consider system prompt update to encourage agent to attempt the action and let governor enforce, OR accept defense-in-depth as desired behavior.
