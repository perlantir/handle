# Handle — Repository Standing Rules (FINAL)

This document is the standing operating manual for any AI assistant
(Claude, Codex, or otherwise) working on the Handle repository. Read
it at the start of every task. The rules here apply to all phases.

Handle is a personal-use Manus clone with extensions: multi-provider
model routing, local LLM support, local execution, and best-in-class
third-party integrations. The product runs as a web app during
development with a Tauri Mac wrapper planned for distribution.

==================================================
RULE 1: USE THIRD-PARTY, NOT CUSTOM
==================================================

Handle's operating principle is: when a top-tier third-party
solution exists, USE IT. Do not reimplement.

The locked-in third-party stack:

- Agent core: LangChain
- Multi-agent orchestration: LangGraph
- Memory / knowledge graph: Zep
- Browser automation: Browser-Use + Anthropic computer-use API
- Cloud sandbox: E2B
- Voice input: OpenAI Whisper API
- Voice output: OpenAI TTS
- Authentication: Clerk
- OAuth orchestration: Nango (for third-party integrations)
- Background jobs / schedules: BullMQ + node-cron
- Database: Postgres + Prisma
- Vector store: pgvector on Postgres
- Observability: LangSmith
- File storage: Cloudflare R2 (S3-compatible)
- Frontend: Next.js + React + Tailwind
- UI primitives: shadcn/ui
- Streaming: Server-Sent Events
- Mac packaging: Tauri (Phase 11)

If a task seems to require building something a service in the
list above already provides, stop and ask. Do not silently roll
your own.

==================================================
RULE 2: RULED-OUT APPROACHES ARE FORBIDDEN
==================================================

Some architectural choices have been explicitly rejected for Handle.
Do not propose, scaffold, or implement these as alternatives.

RULED OUT:

- Custom agent loop. Use LangChain or LangGraph for agent
  orchestration. Do not reimplement planning, step selection,
  tool dispatch, or memory.
- Custom event store with cryptographic chaining. Use Postgres
  via Prisma for storage.
- Encrypted-at-rest persistence. Standard Postgres storage is
  sufficient. Do not add SQLCipher equivalents.
- Replay determinism guarantees. Re-running a task may re-invoke
  models. Do not architect around byte-identical replay.
- Idempotency keys with tombstone logs. Standard retry semantics
  are sufficient.
- Three-tier verifier hierarchy. LangChain's standard tool call
  validation is sufficient.
- Failure taxonomy and recovery manager. Standard try/catch with
  user-visible error messages.
- Custom WebSocket protocol. Use Server-Sent Events with the
  schema defined in Phase 1.
- Custom OAuth flows for Gmail/GitHub/Notion/Vercel. Use Nango.
- Custom auth or session management. Use Clerk.
- Custom memory store. Use Zep.
- Native SwiftUI Mac app for the primary UI. Use Next.js + React.
  Tauri wraps it for Mac distribution in Phase 11.
- Custom voice / TTS pipelines. Use OpenAI Whisper + OpenAI TTS.
- Custom job queue. Use BullMQ.

If a task seems to require any of these, stop and ask.

==================================================
RULE 3: DESIGN SYSTEM IS LAW
==================================================

The design system in FINAL_DESIGN_SYSTEM.md is not a suggestion.
It is the visual specification for every screen, component, and
interaction in Handle.

- All colors come from the design tokens (tokens.json + tokens.css).
  Do not introduce ad-hoc colors.
- All spacing comes from the spacing scale.
- All radii come from the radius scale.
- All typography comes from the type system.
- All motion uses the defined easings and durations.
- Component shapes (Pill Button, Status Dot, Plan Step, etc.) match
  the component-specs.md descriptions exactly.
- Screen anatomies match screen-specs.md.

Reference JSX in handoff/refs/ shows working implementations of
each screen. Use these as starting points; do not reinvent the
component patterns shown there.

If a feature in a phase spec needs a UI element not specified in
the design system, stop and ask.

==================================================
RULE 4: ASK BEFORE BUILDING
==================================================

If a phase spec leaves something ambiguous, stop and ask.
Examples requiring a question:

- Implementation detail not specified
- Conflict between two parts of the spec
- Library version not pinned
- API shape not specified at the field level
- Error handling behavior not specified
- Integration point with another phase not yet built
- A new third-party service is being considered

Acceptable defaults without asking:

- Standard idiomatic patterns for the framework
- Naming conventions consistent with the codebase
- Error message phrasing
- Code formatting and linting choices

When in doubt, ask. Asking adds minutes; getting it wrong adds days.

==================================================
RULE 5: AMBIGUITY EQUALS ASK
==================================================

If the user's instruction is ambiguous, ask. Common ambiguity
patterns:

- "Build X" without specifying which third-party service
- "Add Y" without specifying where it goes architecturally
- Pronouns referring to multiple possible antecedents
- Implicit scope ("fix the auth bug" — which one, where)

Do not pick the most likely interpretation and proceed. State the
ambiguity, list the interpretations, ask which one.

==================================================
RULE 6: SCOPE CREEP IS REJECTED
==================================================

If, while working on a task, you notice an issue outside the
task's scope:

1. Note it and move on; surface it in your final report.
2. If it blocks the task, ask before expanding scope.

Do not:

- Silently fix unrelated bugs
- Refactor code outside the task's scope
- "Improve" code style or structure outside the task
- Add features not in the spec because they "seem useful"
- Remove features not in the spec because they "seem unused"

Scope is what the spec and the user's message explicitly request.

==================================================
RULE 7: HONEST SIGN-OFFS
==================================================

When declaring complete:

- DONE: implemented, tested in CI, manually verified, all gate
  criteria met
- BLOCKED: cannot complete due to dependency, decision, or
  environment issue. State what is needed to unblock.
- DEFERRED: explicitly out of scope or moved to a later phase.
  State what is being deferred and why.

Do not declare DONE if any of the following are true:

- A test is failing
- A spec gate criterion is unverified
- You skipped a manual audit the spec called for
- You substituted an easier approach without explicit approval
- You are unsure whether the implementation matches the spec

Honest BLOCKED is always better than dishonest DONE.

==================================================
RULE 8: BUILD IDENTIFIER IN /health
==================================================

Every backend service exposes a /health endpoint that returns:

- service: string (the service name)
- status: "ok" | "degraded" | "starting"
- build: { gitCommit: string, builtAt: ISO timestamp }
- timestamp: ISO timestamp

The gitCommit field reflects the actually-running code. Use git
rev-parse HEAD captured at build time, baked into the binary or
read from a build-info file shipped with the binary.

==================================================
RULE 9: LOG TO FILES, NOT /dev/null
==================================================

All backend processes log stdout/stderr to a file the user can
find. Default: ~/Library/Logs/Handle/<service>.log on Mac.
Configurable via env var.

Rotate at 10 MB. Keep last 5 rotations. Surface log path in any
error reported to the user.

==================================================
RULE 10: MANUAL AUDIT GATES ARE NON-NEGOTIABLE
==================================================

Some phase gate criteria require manual user audit. The spec
marks these clearly. When you reach a manual audit gate:

1. Implement the audit harness fully
2. Document how to run it
3. Stop and ask the user to run it
4. Wait for the user's audit results before declaring DONE

Do not skip the audit and rely on automated tests alone.
Do not run the audit yourself in a sandbox and claim it as user
audit.
Do not mark the gate DONE without explicit user confirmation.

==================================================
RULE 11: PER-SUBSYSTEM COMMITS
==================================================

Commit per subsystem with descriptive messages.

Acceptable:
- "Phase X: Add Y subsystem with Z tests"
- "Phase X: Fix W in Y subsystem"
- "Phase X: SIGNOFF: record manual audit completion"

Unacceptable:
- "Phase X" (no description)
- "WIP" or "fixes" or "stuff"
- A single commit with 30 files across 10 unrelated subsystems

==================================================
RULE 12: CI MUST PASS THREE CONSECUTIVE RUNS
==================================================

Before any phase is declared complete, GitHub Actions CI must
pass three consecutive runs on the phase's tip commit. Not
"the tests pass locally" — three green CI runs on origin.

If a CI run fails, fix the cause. Do not retry hoping it passes.

==================================================
RULE 13: DRAFT PR UNTIL TRULY DONE
==================================================

Phase work happens on a feature branch. Open a Draft PR early.
Do not flip from Draft to Ready for Review until:

- All gate criteria for the phase are met (or honestly DEFERRED)
- CI has passed three consecutive runs
- Manual audits have passed
- SIGNOFF document is committed

The user merges. Not Codex.

==================================================
RULE 14: DAILY MAINTENANCE
==================================================

At the start of any new task in an existing repo:

```
git status
git log --oneline -5
pnpm test
```

If git status is dirty, stop and ask. If tests fail on main,
stop and ask.

==================================================
RULE 15: PRESERVE EVIDENCE
==================================================

When a manual audit fails or a production bug surfaces:

- Snapshot the application state directory
- Save the relevant log files
- Record the steps that produced the failure
- Document the snapshot location in the eventual fix's commit

==================================================
RULE 16: AGENT PROMPTS ARE VERSIONED
==================================================

System prompts, agent instructions, and tool descriptions sent
to LLMs are versioned. Each prompt has a string identifier like
"system_prompt_v3" baked into the prompt. The version is logged
with each LLM call.

Increment the version when the prompt's semantic meaning changes.
Whitespace and typo fixes don't require a bump.

==================================================
RULE 17: NO SECRETS IN LOGS, COMMITS, OR PROMPTS
==================================================

API keys, OAuth tokens, bearer tokens, passwords — never appear
in:

- Log files
- Git commits
- LLM prompts (system, user, or assistant turns)
- Error messages surfaced to the user
- Stack traces in production
- Zep memory entries

A redaction layer in src/lib/redact.ts scrubs these from any
payload at every boundary.

==================================================
RULE 18: HUMAN-IN-THE-LOOP FOR DESTRUCTIVE ACTIONS
==================================================

The agent must request explicit user approval before:

- Running shell commands that delete files
- Sending emails or messages
- Making purchases or financial transactions
- Modifying or deleting files outside the agent's working directory
- Pushing to git branches the user owns
- Posting to social media
- Revoking OAuth permissions
- Deleting Zep memory entries
- Modifying integration data (e.g., archiving GitHub issues)

The approval flow uses the WAITING state machine described in
Phase 1.

==================================================
RULE 19: ONE PROVIDER FAILURE DOES NOT KILL THE TASK
==================================================

When a model provider fails (rate limit, outage, malformed
response), fall back to the next configured provider.

Default fallback chain:
1. User's primary configured provider
2. User's secondary configured provider (if any)
3. Local LLM if running

If all fail, surface a clear error including which providers
were tried and how each failed.

==================================================
RULE 20: TOOL OUTPUT STREAMING IS REAL-TIME
==================================================

When a tool produces output (shell command stdout, file contents,
browser screenshot, integration response), that output streams
to the UI in real time, not at the end.

Enforced by the SSE event protocol in Phase 1. Any new tool added
in later phases produces streaming output events.

==================================================
RULE 21: NEVER COMMIT API KEYS
==================================================

Even synthetic-looking API keys in test fixtures get scraped by
GitHub's secret scanning. Test fixtures use clearly-fake values
like "test-key-not-real". Real values come from environment
variables loaded at test runtime.

==================================================
RULE 22: PHASE GATES BLOCK PROGRESSION
==================================================

You cannot start Phase N+1 until Phase N's gate criteria are met
and Phase N is merged to main.

If you think a Phase N+1 task is urgent, ask the user.

==================================================
RULE 23: INTEGRATIONS GO THROUGH NANGO
==================================================

Every third-party OAuth integration (Gmail, GitHub, Notion,
Vercel, future ones) goes through Nango. Do not implement
custom OAuth flows even if you "just need this one quick."

Reasons:
- Token refresh is hard to get right; Nango handles it
- Scope management is consistent
- Connection UI is consistent
- Adding a new integration becomes adding a config, not coding

The exception: OpenAI OAuth, which Clerk + Nango may not natively
support. Phase 2 specifies the path; do not generalize from there.

==================================================
RULE 24: MEMORY GOES THROUGH ZEP
==================================================

Every persistent fact about the user, their projects, their
preferences, or their conversation history that should be
recalled in future tasks goes through Zep.

Do not:
- Build a parallel memory system in the database
- Store "memorable facts" in user settings
- Use long system prompts with hardcoded context

Use Zep's session API for conversation memory. Use Zep's
knowledge graph API for entity memory. Both are documented in
Phase 5.

==================================================
RULE 25: SCHEDULES GO THROUGH BULLMQ
==================================================

Every scheduled or recurring task uses BullMQ. Do not roll setTimeout
or setInterval-based schedulers.

Reasons:
- Persistence across server restarts
- Retry semantics
- Visibility into queue state
- Distributed-ready if Handle ever scales

==================================================
RULE 26: ENV LOADING IS A FIRST-CLASS CONCERN
==================================================

When introducing a workspace or service that reads from the root
.env file, configure dotenv-cli (or equivalent) explicitly. Do not
assume the runtime will walk up the tree to find .env.

Verification before any phase signoff:
- Each workspace's dev/build/start scripts wrap the runtime with
  `dotenv -e ../../.env --` (or appropriate relative path)
- No workspace creates its own .env that would shadow the root
- Variables prefixed NEXT_PUBLIC_ are exposed to client; same key
  WITHOUT prefix may also be required for server-side code

==================================================
RULE 27: NEVER MODIFY USER-OWNED .env FILES
==================================================

When testing env loading, do not modify, overwrite, or delete the
user's .env file. Use a separate file (.env.test, .env.local) or
inline environment variables for the duration of the test.

Treat .env as user data — read-only from your perspective.

==================================================
RULE 28: REAL-WORLD STARTUP IS A TEST
==================================================

Unit tests and integration tests with mocked dependencies are not
sufficient evidence that a phase works. Before declaring any phase
gate-ready, the user must be able to start the app from a clean
checkout and run the phase's gate task end-to-end.

Every phase adds its own smoke:e2e-* test that exercises the new
functionality through a real browser-or-CLI path with real
services where reasonable. CI may skip if credentials aren't
configured. Local must pass.

==================================================
RULE 29: BROWSER-FACING WORK NEEDS PLAYWRIGHT TESTS
==================================================

Any phase work that adds or modifies a user-facing screen
(Settings, Workspace, Home, Memory, Skills, etc.) requires a
Playwright test exercising the user flow before that subsystem's
commit.

Playwright tests must:
- Launch a real browser (chromium)
- Sign in via Clerk's test mode (or skip auth via test bypass)
- Navigate to the new screen
- Perform the user action (type, click, save)
- Assert the expected result is visible

Mock providers and external APIs at the network layer (route
intercepts), not at the application layer. The point is to verify
the React + Next.js + Clerk + middleware + API stack actually
works end-to-end.

Per phase, expect 1-3 new Playwright tests covering the new
screens. Phase 1 added smoke:web-signin and smoke:e2e-task as the
floor. Each phase adds more.

==================================================
COORDINATION: WHEN TO STOP AND ASK
==================================================

Stop and ask before:

- Starting work that involves any RULED OUT pattern (Rule 2)
- Implementing something the spec describes ambiguously (Rule 5)
- Deviating from the design system (Rule 3)
- Considering a third-party library not in the locked stack (Rule 1)
- A manual audit fails (Rule 10)
- Encountering a failing test on main (Rule 14)
- Encountering an unfamiliar uncommitted change in working tree
- You hit five consecutive failures or 30 minutes of stuck-time

Use clear language: "I am blocked because X. The options I see
are A and B. Which do you prefer?"

==================================================
END OF STANDING RULES
==================================================

These rules update over time. Updates land via PR with explicit
discussion. Rule changes do not retroactively invalidate work
that followed prior rules.
