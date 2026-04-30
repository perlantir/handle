# Handle — Build Roadmap (FINAL)

This document summarizes the 11-phase build arc for Handle. Each
phase has a detailed spec in FINAL_PHASE_N_*.md.

==================================================
TIMELINE OVERVIEW
==================================================

```
Phase  Name                                  Duration
────────────────────────────────────────────────────────
1      Foundation                            2-3 weeks
2      Multi-Provider + Local LLM            2 weeks
3      Browser + Computer Use                2-3 weeks
4      Local Execution Backend               2 weeks
5      Memory (Zep)                          2-3 weeks
6      Integrations (Gmail/GitHub/Notion/Vercel) 3-4 weeks
7      Skills                                2 weeks
8      Schedules                             1-2 weeks
9      Multi-Agent + Voice                   3-4 weeks
10     Projects + History + Sharing + Templates  2 weeks
11     Onboarding + Polish + Tauri           2-3 weeks
────────────────────────────────────────────────────────
TOTAL                                        23-32 weeks
```

That's roughly 6-8 months of work for a single developer with
Codex doing implementation. Be realistic about the scope.

After Phase 11, Handle is feature-complete: a personal-use Manus
clone with multi-provider extensions, ready to distribute as a
Tauri Mac app.

==================================================
PHASE 1: FOUNDATION
==================================================

Scope:
- Monorepo (pnpm workspaces)
- Postgres + Prisma + pgvector
- Clerk authentication
- Design system (tokens + base components)
- Next.js frontend with Home + Live Workspace screens
- Express backend
- LangChain agent (OpenAI Tools agent)
- E2B sandbox integration
- Basic tools: shell.exec, file.write, file.read, file.list
- SSE streaming
- Approval modal infrastructure (used in later phases)
- Build identifier in /health
- File-based logging with redaction
- CI workflow

Out of scope (deferred):
- Multi-provider routing (Phase 2)
- Browser automation (Phase 3)
- Local execution (Phase 4)
- Memory (Phase 5)
- Integrations (Phase 6)
- Skills (Phase 7)
- Schedules (Phase 8)
- Multi-agent / voice (Phase 9)
- Sharing / templates (Phase 10)
- Onboarding / Tauri (Phase 11)

Gate: User signs in via Clerk, opens the Workspace screen, submits
the canonical task ("Write a Python script that fetches the top 10
Hacker News stories to /tmp/hn.json then run it"), watches the
agent plan and execute via E2B with full design-system fidelity,
and receives a final answer.

==================================================
PHASE 2: MULTI-PROVIDER + LOCAL LLM
==================================================

Scope:
- Provider abstraction (LangChain provider wrapper)
- Five API providers: OpenAI, Anthropic, QWEN, KIMI, xAI
- Local LLM via OpenAI-compatible endpoint
- Provider fallback chain
- Mac Keychain credential storage
- Settings → Providers tab (matching the design system)
- OpenAI OAuth (via custom flow; Nango doesn't natively support
  OpenAI OAuth at this time)
- Per-task provider override

Gate: Each of 5 API providers + local LLM can run the canonical
task. Fallback works. OpenAI OAuth works.

==================================================
PHASE 3: BROWSER + COMPUTER USE
==================================================

Scope:
- Browser-Use integration (in E2B sandbox)
- Browser tools: navigate, click, type, extract_text, screenshot
- Anthropic computer-use API integration
  - Vision-based browser interaction
  - Coordinate-based clicks (when DOM selectors fail)
  - Screenshot understanding
- Computer-use safety surface (require approval for risky actions)
- Browser tab in Workspace (per Screen 03 design)

Gate: Agent navigates a complex web app (e.g., a SaaS dashboard),
extracts data via DOM and via computer-use vision, completes a
task that requires both modes.

==================================================
PHASE 4: LOCAL EXECUTION BACKEND
==================================================

Scope:
- ExecutionBackend abstraction
- Local backend implementation
- Workspace directory management (~/Documents/Handle/workspaces/)
- Safety governor with predicate-based denial
- Approval flow (uses Phase 1's modal infrastructure)
- Local browser modes:
  - Default: separate Chrome profile
  - Opt-in: actual Chrome via remote debugging (port 9222)
- Backend toggle in Workspace UI and Settings
- Settings → Execution and Settings → Browser tabs

Gate: User runs a task with backend=local. Workspace files appear
on disk. Dangerous commands denied/require approval. Browser modes
both work.

==================================================
PHASE 5: MEMORY (ZEP)
==================================================

Scope:
- Zep client integration
- Session memory: conversation history per task threaded into Zep
- Knowledge graph: entities (people, projects, contacts, prefs)
  with confidence scores
- Memory recall: agent automatically retrieves relevant memory
  for new tasks
- Memory tools: explicit memory_save, memory_search,
  memory_forget
- Memory graph UI (Screen 06 from design)
- Memory inspector in Workspace (which entities were used in
  current task)
- Memory privacy: redaction before sending to Zep

Gate: User runs three related tasks across sessions. The agent
recalls relevant context from earlier tasks without being told.
The memory graph UI shows the entities and relations.

==================================================
PHASE 6: INTEGRATIONS (NANGO)
==================================================

Scope:
- Nango integration (self-hosted or cloud)
- Gmail integration
  - OAuth via Nango
  - Tools: gmail_send, gmail_read, gmail_search, gmail_archive
  - Approval required for send + archive
- GitHub integration
  - OAuth via Nango
  - Tools: github_search_repos, github_read_file,
    github_create_issue, github_create_pr
  - Approval required for create_issue + create_pr
- Notion integration
  - OAuth via Nango
  - Tools: notion_search, notion_read_page, notion_create_page,
    notion_update_page
  - Approval required for create + update
- Vercel integration
  - OAuth via Nango
  - Tools: vercel_list_projects, vercel_list_deployments,
    vercel_create_deployment, vercel_redeploy
  - Approval required for create + redeploy
- Integrations UI (Screen 10 from design)
- Connection health monitoring
- Per-integration scope management

Gate: All four integrations can be connected via OAuth and used
in tasks. Token refresh works across long-running sessions.
Approval flow integrates with each.

==================================================
PHASE 7: SKILLS
==================================================

Scope:
- Skill abstraction:
  - Manifest (name, description, required integrations, prompt
    template, tool list, suggested model)
  - Manifest validation
- Built-in skills (ship with Handle):
  - Research a company
  - Email outreach to a list
  - Plan a trip
  - Code review a PR
  - Summarize a Notion workspace
  - (5 to start; more added later)
- Skill detection: agent determines when a skill applies, asks
  user to confirm
- Skill execution: skill prompt template injected into system
  prompt, skill's tool list narrowed
- Skills UI (Screen 07 from design)
- Skill recent runs view
- Wide Research screen (Screen 05) implements the Research skill

Gate: User triggers all 5 built-in skills, each completes its
intended workflow. Skill detection works for ambiguous prompts.

==================================================
PHASE 8: SCHEDULES
==================================================

Scope:
- BullMQ setup (Redis)
- Schedule entity in database
- Cron-based scheduling
- Schedule UI (Screen 08 from design)
- Schedule lifecycle: create, pause, resume, delete
- Scheduled task execution: spawns a regular task with the
  configured goal
- Schedule history: each firing records the resulting task
- Notifications on schedule completion (via UI; email/push later)

Gate: User creates a schedule "every Monday at 9am, summarize my
unread Gmail." Schedule fires on Monday, task runs, summary
delivered.

==================================================
PHASE 9: MULTI-AGENT + VOICE
==================================================

Scope:

Multi-agent (LangGraph):
- Specialist agent definitions:
  - Researcher
  - Coder
  - Designer
  - Operator (browser-heavy)
  - Writer
- Supervisor agent that delegates to specialists
- Per-specialist system prompt + tool subset + model preference
- UI to pick a specialist or "auto" (supervisor routes)
- Multi-agent tracing in LangSmith

Voice:
- Voice input: Whisper API (push-to-talk, click mic in composer)
- Voice output: OpenAI TTS (read agent responses aloud)
- Voice toggle in Settings
- Voice approval flow (verbal "approve" / "deny")

Gate: User picks "Researcher" specialist for a task; uses voice
input to give the goal; agent works; agent reads back the result
via voice output.

==================================================
PHASE 10: PROJECTS + HISTORY + SHARING + TEMPLATES
==================================================

Scope:

Projects:
- Project entity in database (name, master instruction, members)
- Project switcher in sidebar
- Master instruction per project (Markdown)
- Default project per user

History:
- Tasks list (Screen 02 from design)
- Search across history
- Resume a task (continue conversation)
- Export task as markdown

Sharing:
- Make a task public (read-only link)
- Clone a public task (creates a new task with same goal/history)
- Share permissions (view / edit / clone)

Templates:
- Save a task as a template
- Browse templates
- Instantiate a template

Gate: User creates two projects, runs tasks in each with master
instruction applied. User shares a task; another user (or
incognito) views it. User saves a task as template, instantiates
it.

==================================================
PHASE 11: ONBOARDING + POLISH + TAURI
==================================================

Scope:

Onboarding:
- First-run flow (Screen 09 from design):
  - Welcome
  - Sign in with Clerk
  - Connect at least one provider
  - Connect optional integrations
  - Pick default backend
  - Pick default browser mode
  - Tour of the Workspace screen
- Documentation:
  - README.md
  - SETUP.md
  - PROVIDERS.md
  - LOCAL_EXECUTION.md
  - INTEGRATIONS.md
  - SKILLS.md
  - SCHEDULES.md

Polish:
- Loading states everywhere
- Error states with actionable messages
- Keyboard shortcuts
- Dark mode
- Responsive layout (1280px breakpoint, 1024px breakpoint)
- Empty states
- Settings completeness:
  - Profile (Screen 11)
  - Providers
  - Integrations
  - Execution
  - Browser
  - Memory (manage Zep entries)
  - Skills (installed list)
  - Schedules (link to Schedule UI)
  - Voice
  - Observability
  - Sharing defaults
  - General (theme, reset, about)

Tauri:
- Tauri configuration
- Code signing setup
- App icon and metadata
- Build pipeline producing .app bundle and DMG
- Native menu bar integration
- Auto-update mechanism

Gate: User experiences full onboarding flow. Every settings tab
works. Dark mode works. Tauri produces a signed DMG that runs
natively on Mac without a terminal.

==================================================
ARCHITECTURAL DEPENDENCIES
==================================================

Phase order is somewhat flexible after Phase 1 establishes
foundation, but recommended sequencing:

```
Phase 1 ──> Phase 2 (provider abstraction extends agent)
        ──> Phase 4 (execution abstraction needed before browser)
        
Phase 4 ──> Phase 3 (browser uses execution abstraction)
        
Phase 5 ──┬── independent of Phase 6
        └── Memory needs the agent loop established by Phase 1
        
Phase 6 ──> Phase 7 (skills can use integrations)
Phase 7 ──> Phase 8 (schedules can trigger skill tasks)
Phase 8 ──> Phase 9 (multi-agent doesn't need schedules but they fit)
Phase 9 ──> Phase 10 (sharing needs auth + project context)
Phase 10 ──> Phase 11 (polish phase wraps everything)
```

Cross-phase dependencies:

- Phase 2 multi-provider must use the provider abstraction;
  Phase 1 hardcodes OpenAI as the implementation
- Phase 4 execution backend abstraction must support both E2B
  (existing) and local
- Phase 5 memory tools become available to the agent loop;
  Phase 7 skills can reference memory
- Phase 6 integration tools become available; Phase 7 skills
  can require integrations
- Phase 9 multi-agent supervisor needs to know about all tools
  (provider + browser + memory + integrations + skills)
- Phase 10 project entity migrates existing tasks
- Phase 11 Tauri requires no app code changes if Phase 1-10 used
  patterns correctly

==================================================
DESIGN PATTERNS PERSISTING ACROSS PHASES
==================================================

These are established in Phase 1 and apply throughout:

1. **Streaming over polling** — all agent updates flow via SSE
2. **Clerk auth on every API call** — no exceptions
3. **Credential redaction at every boundary** — log lines, error
   messages, LLM prompts, Zep memory entries
4. **Provider abstraction** — code that wants to invoke an LLM
   uses the provider abstraction, not direct provider SDKs
5. **Tool definition pattern** — every tool has name, description,
   input schema, sideEffectClass, requiresApproval flag,
   implementation function, backend support flags
6. **Task lifecycle states** — RUNNING, WAITING, STOPPED, ERROR,
   PAUSED
7. **No raw secrets in frontend** — backend resolves credentials
8. **Approval flow** — uses the Phase 1 modal infrastructure for
   all destructive actions
9. **Design system fidelity** — every screen uses tokens; no
   ad-hoc styling
10. **Per-subsystem commits** — no lumped changes
11. **Manual audit gates** — non-negotiable per AGENTS.md

==================================================
TESTING STRATEGY ACROSS PHASES
==================================================

Per phase:
- Unit tests for new logic (target 70% coverage on new code)
- Integration tests for new API endpoints
- Manual audit harness for user-facing features

Cross-phase regression:
- Each phase's CI runs all earlier phases' tests
- Manual audit re-runs only the new phase's audit (not earlier)
- Schema migrations are tested up + down

Aggregate coverage target: 70% on new code per phase.

==================================================
OBSERVABILITY STRATEGY
==================================================

Phase 1: Pino logging to file. Every LLM call, tool call, state
transition.

Phase 2-4: Per-provider, per-tool, per-backend log breakdown.

Phase 5: Zep tracing.

Phase 6: Per-integration log breakdown including OAuth events.

Phase 7: Skill detection events, skill execution events.

Phase 8: BullMQ queue events (job added, started, completed,
failed).

Phase 9: LangGraph multi-agent traces.

Phase 11: Surface log directory in About screen.

LangSmith integration is opt-in throughout; configured via env
var or Settings.

==================================================
SECURITY POSTURE
==================================================

Maintained throughout:

- Clerk auth on all API routes
- Bearer tokens never logged
- API keys never logged (per Rule 17)
- OAuth tokens stored in Nango / Keychain, not in DB or env
- File system access scoped to workspace in Local mode
- Browser actual-Chrome mode requires explicit confirmation
- Approval required for destructive actions (per Rule 18)
- No secrets in Zep memory entries (redaction layer)
- No secrets in LangSmith traces (LangChain default redaction +
  ours)

==================================================
LOCKED-IN DECISIONS
==================================================

Do not relitigate:

1. LangChain for agent core (not custom)
2. LangGraph for multi-agent (not custom)
3. Postgres + Prisma + pgvector (not custom event store, not SQLite
   in production)
4. Express for backend (not Fastify, Hono, etc. — pick one and
   stick)
5. Next.js + React + Tailwind for frontend
6. shadcn/ui for primitives
7. SSE for streaming (not WebSocket)
8. E2B for cloud sandbox (not custom)
9. Browser-Use for browser automation
10. Anthropic computer-use API for vision-based browser
11. Zep for memory (not Mem0, not custom)
12. Nango for OAuth orchestration (not Pipedream, not custom)
13. Clerk for auth (not Auth.js, not custom)
14. BullMQ for jobs (not Bree, Agenda, or custom)
15. OpenAI Whisper + OpenAI TTS for voice (not ElevenLabs,
    not Deepgram)
16. Cloudflare R2 for file storage (not S3, not local disk for
    user files)
17. LangSmith for observability (not custom dashboards)
18. Tauri for Mac packaging (not Electron)

==================================================
DEFERRED ITEMS NOT IN ANY PHASE
==================================================

- Mobile / iOS UI
- Image generation tools (could be Phase 12+)
- Video generation tools
- Multi-user team features (Clerk supports it; not in scope)
- Public app store distribution (Mac App Store sandbox is
  different; out of scope)
- Windows or Linux Tauri builds
- Plugin marketplace for third-party skills
- API for third-party integrations (i.e., letting other apps
  trigger Handle)

If you want any of these, plan a Phase 12+ for them. Don't sneak
them into earlier phases.

==================================================
END OF ROADMAP
==================================================

Phase 1 begins with FINAL_PHASE_1_FOUNDATION.md. Read it, then
begin implementation per the working pattern in FINAL_KICKOFF.md.
