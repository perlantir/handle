# Handle — Codex Kickoff (FINAL)

This is the first document Codex reads when starting work on Handle.
Read it fully before any other action. It establishes context,
constraints, and the working pattern for the entire project.

==================================================
PROJECT OVERVIEW
==================================================

Handle is a personal-use Manus clone — an autonomous AI agent
product modeled on the Singapore-based agent product "Manus,"
with extensions and a custom design system.

Manus features Handle clones:

1. Agent that plans, executes tools, and completes complex
   multi-step tasks autonomously
2. Cloud sandbox for safe code/shell execution
3. Browser automation with computer-use vision
4. Memory: persistent knowledge graph across sessions
5. Skills: installable workflow packages
6. Schedules: cron-based recurring tasks
7. Integrations: first-class third-party connections
8. Multi-agent collaboration (named specialists)
9. Voice input and output
10. Onboarding, projects, history, sharing, templates
11. Approval flow for destructive actions

Handle's extensions over Manus:

1. Multi-provider model routing (OpenAI, Anthropic, QWEN, KIMI,
   xAI) with automatic fallback
2. Local LLM support via OpenAI-compatible endpoint
3. OpenAI OAuth as alternative to API keys
4. Hybrid execution: cloud sandbox (E2B) OR local execution
5. Browser automation modes: separate Chrome profile, your actual
   Chrome, or cloud browser

Initial integrations: Gmail, GitHub, Notion, Vercel. More added
later as needed.

==================================================
WHAT HANDLE IS NOT
==================================================

Handle is not Operator Dock (the predecessor). Operator Dock
pursued a custom architecture with encrypted event stores, replay
determinism, idempotency keys, and a custom agent loop. Handle
uses off-the-shelf libraries instead and accepts the tradeoffs:

- Re-running a task may re-invoke models
- Standard retry semantics (no idempotency tombstones)
- LangChain handles agent orchestration
- PostgreSQL 17 (Homebrew `postgresql@17`) + Prisma for storage
- Standard try/catch error handling

Do not propose, scaffold, or implement the ruled-out custom
alternatives. AGENTS.md Rule 2 lists them.

If you think "Operator Dock did this better," yes, sometimes.
And we are not Operator Dock. Handle's value is shipping fast
with proven infrastructure plus the architectural extensions
that matter.

==================================================
THIRD-PARTY STACK (LOCKED IN)
==================================================

The third-party stack is FIXED. Do not propose alternatives.

| Concern | Service |
|---|---|
| Agent core | LangChain |
| Multi-agent orchestration | LangGraph |
| Memory / knowledge graph | Zep |
| Cloud sandbox | E2B |
| Browser automation | Browser-Use + Anthropic computer-use |
| Voice input | OpenAI Whisper API |
| Voice output | OpenAI TTS |
| Authentication | Clerk |
| OAuth orchestration (third-party) | Nango |
| Background jobs / schedules | BullMQ |
| Database | PostgreSQL 17 (Homebrew `postgresql@17`) + Prisma |
| Vector store | pgvector on PostgreSQL 17 |
| Observability | LangSmith |
| File storage | Cloudflare R2 |
| Frontend | Next.js + React + Tailwind |
| UI primitives | shadcn/ui |
| Streaming | Server-Sent Events |
| Mac packaging | Tauri (Phase 11) |

If you find yourself needing functionality not in this list,
that's a sign to either (a) check whether one of the listed
services covers it after all, or (b) ask the user before adding
to the stack.

==================================================
LLM PROVIDERS (FIVE + LOCAL)
==================================================

API providers:

1. OpenAI
   - API key mode (default)
   - OpenAI OAuth mode (Phase 2)
   - Models: gpt-4o, gpt-4o-mini, o1, o3 (use latest available)

2. Anthropic
   - API key only
   - Models: claude-opus-4.5, claude-sonnet-4.5, claude-haiku-4.5
     (use latest available)

3. QWEN (Alibaba)
   - API key (DASHSCOPE_API_KEY)
   - Models: qwen-max, qwen-plus, qwen-turbo
   - Endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1
     (OpenAI-compatible)

4. KIMI (Moonshot AI)
   - API key (MOONSHOT_API_KEY)
   - Models: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k
   - Endpoint: https://api.moonshot.cn/v1
     (OpenAI-compatible)

5. xAI
   - API key (XAI_API_KEY)
   - Models: grok-4, grok-3 (use latest)
   - Endpoint: https://api.x.ai/v1
     (OpenAI-compatible)

Local LLM:
   - Configurable as OpenAI-compatible endpoint
   - User specifies: base URL, model name, optional API key
   - Works with Ollama, LM Studio, llama.cpp

Fallback chain (configurable, default order):

1. User's primary provider
2. User's secondary provider
3. Local LLM (if configured and reachable)
4. Surface error to user

==================================================
EXECUTION BACKEND CONFIGURATION
==================================================

Handle runs tools via one of two backends:

E2B (cloud, default):
- Tools execute in an isolated cloud sandbox
- Pre-installed: Python 3.10, Node.js 20, Playwright with Chromium
- Files persist for sandbox lifetime, then destroyed
- No access to user's local files
- Costs money

Local (Phase 4):
- Tools execute on user's Mac
- Files written to workspace directory
  (~/Documents/Handle/workspaces/<task-id>/)
- Has access to user's local environment
- Requires safety surface: predicate-based denial, approval flow
- Free
- Browser automation modes:
  - Default: separate Chrome profile (~/.config/handle/chrome-profile/)
  - Opt-in: user's actual Chrome via remote debugging port 9222

Switching:
- User toggles in settings (global default)
- Per-task override in chat UI
- Backend choice recorded in task record
- Cannot switch backend mid-task

==================================================
DESIGN SYSTEM
==================================================

Handle's visual design is fully specified in
FINAL_DESIGN_SYSTEM.md. Highlights:

- Warm bone canvas (#FAFAF7), white surfaces, near-black text
  (#1A1B1F). No pure black, no pure white-on-white.
- Single accent: vivid blue (oklch(0.62 0.18 250) — approximately
  #3D7CF1) for agent identity / running state.
- Status colors: green (success), amber (waiting/approval),
  red (error).
- SF Pro Display for headings, SF Pro Text for body, SF Mono
  for tool calls.
- Density: generous on Home, tight on Workspace.
- Subtle motion: dot pulse (1.6s), shimmer on running tags,
  knob-slide toggles (180ms).

The design system covers 11 screens:
01 · Home
02 · Tasks list
03 · Live Workspace (3-pane)
04 · Approval modal
05 · Wide Research
06 · Memory graph
07 · Skills
08 · Schedules
09 · Onboarding · Connect tools
10 · Integrations
11 · Settings · Profile

Reference JSX implementations of each screen exist in the design
package's handoff/refs/ folder. Treat these as starting points,
not as final code.

==================================================
REPO STRUCTURE
==================================================

```
Handle/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   ├── app/
│   │   ├── components/
│   │   │   ├── design-system/        # Tokens-driven primitives
│   │   │   ├── chat/                 # Workspace, Composer
│   │   │   ├── memory/               # Memory graph view
│   │   │   ├── skills/               # Skills marketplace
│   │   │   ├── integrations/         # Integrations grid
│   │   │   ├── schedules/            # Schedule UI
│   │   │   ├── onboarding/           # Onboarding flow
│   │   │   └── ui/                   # shadcn/ui re-exports
│   │   ├── hooks/
│   │   └── lib/
│   └── api/                          # Express backend
│       ├── src/
│       │   ├── agent/                # LangChain + LangGraph
│       │   ├── execution/            # E2B + Local backends
│       │   ├── memory/               # Zep client
│       │   ├── skills/               # Skill registry
│       │   ├── integrations/         # Nango clients per provider
│       │   ├── schedules/            # BullMQ workers
│       │   ├── voice/                # Whisper + TTS
│       │   ├── auth/                 # Clerk middleware
│       │   ├── routes/
│       │   └── lib/
│       └── prisma/
├── packages/
│   ├── shared/                       # Shared types
│   ├── tools/                        # Tool definitions
│   ├── design-tokens/                # tokens.json + tokens.css
│   └── design-refs/                  # Designer Claude's reference JSX
├── prisma/
├── docs/
│   ├── codex-context/                # FINAL_*.md spec docs
│   └── phase-N/                      # Per-phase signoffs
├── scripts/
│   ├── manual-audit/                 # Per-phase audit harnesses
│   └── dev-setup.sh
├── .github/workflows/                # CI configuration
├── AGENTS.md                         # Symlink or copy of FINAL_AGENTS.md
├── package.json                      # Root pnpm workspace
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

==================================================
EXISTING WORK TO REFERENCE
==================================================

There is a predecessor project at /Users/perlantir/projects/hipp0 V1
called Operator Dock. Three artifacts are worth referencing as
design guides (NOT code to copy):

1. apps/daemon/src/providers/modelRouter.ts in Operator Dock
   contains the design for the multi-provider model router.
   Reimplement on top of LangChain's provider abstractions.

2. The AGENTS.md anti-drift rules pattern. FINAL_AGENTS.md
   adapts it with 25 rules tailored to Handle.

3. Mac Keychain entry naming convention. Handle uses entries
   like:
   - service: com.perlantir.handle
   - account: openai:apiKey, anthropic:apiKey, etc.

Do NOT carry over:
- Any Swift or SwiftUI code
- Any custom event store code
- Any custom agent loop code
- Any encrypted persistence code
- Any failure taxonomy or recovery code
- Manual audit harness scripts

==================================================
DESIGN PACKAGE
==================================================

A separate design package was created (in `hipp0-2.zip` originally,
now incorporated into the Handle repo at `packages/design-tokens/`
and `packages/design-refs/`).

It contains:

- tokens.json + tokens.css (design tokens, W3C-style)
- 30+ inline SVG icons
- 11 screen reference implementations in JSX
- Component specs (Pill Button, Status Dot, etc.)
- Figma handoff documentation

Use these as the foundation. Do not reinvent the visual system.

==================================================
WORKING PATTERN
==================================================

Handle is built across 11 phases. Each phase is a 1-4 week unit.
Phases ship in order; do not start Phase N+1 until Phase N is
merged.

For each phase:

1. Read the phase spec fully before writing code
2. Acknowledge the spec in your response, summarize scope
3. Ask clarifying questions if anything is ambiguous
4. Branch from main: phase-N/<short-name>
5. Implement per-subsystem with a commit per subsystem
6. Open a Draft PR early
7. Run local tests after each subsystem
8. Push and verify CI passes
9. Repeat until all scope is implemented
10. Ensure CI passes three consecutive runs
11. Build manual audit harness if the phase requires one
12. Stop and ask user to run the manual audit
13. Wait for audit results
14. If audit passes, write SIGNOFF and flip PR Draft → Ready
15. User reviews and merges
16. Phase shipped

Do not skip steps. Do not flip Ready without manual audit. Do
not self-merge.

==================================================
WHEN TO STOP AND ASK
==================================================

- The spec describes an outcome but not the path
- Two parts of the spec conflict
- A library version or choice is not specified
- A third-party service not in the locked stack seems necessary
- An integration point with an unbuilt phase is needed
- A manual audit fails
- 30 minutes spent stuck
- Any rule in AGENTS.md triggers

Use clear language: "I am blocked because X. The options I see
are A and B. Which do you prefer?"

==================================================
PHASE 1 STARTING POINT
==================================================

Phase 1 delivers:

- Monorepo skeleton (Next.js frontend + Express backend)
- PostgreSQL 17 (Homebrew `postgresql@17`) + Prisma + pgvector
- Clerk auth (single user during dev, but properly set up)
- LangChain agent core (OpenAI Tools agent, OpenAI provider only)
- E2B sandbox integration
- Basic tools: shell.exec, file.write, file.read, file.list
- Live Workspace 3-pane chat UI matching the design system
- SSE streaming for real-time agent updates
- Design system tokens + base components
- Build identifier in /health
- Log file capture

Out of scope in Phase 1: multi-provider, browser, local backend,
memory, integrations, skills, schedules, multi-agent, voice,
onboarding (basic only).

The full Phase 1 spec is in FINAL_PHASE_1_FOUNDATION.md.

==================================================
SECURITY POSTURE
==================================================

Even though Handle is single-user during initial development:

- Bind to 127.0.0.1, never 0.0.0.0
- All API routes go through Clerk auth
- All credentials in macOS Keychain (not env files)
- All credentials redacted from logs
- Standard CSRF protection on Next.js
- Content Security Policy headers
- HTTPS not required for localhost; required for any future
  public deployment
- Nango handles OAuth token storage for integrations
- Zep handles memory storage; redact secrets before sending

==================================================
TESTING POSTURE
==================================================

- Vitest for unit tests
- Playwright for E2E tests (limited; mostly Phase 11)
- Manual audit harnesses for things automated tests can't cover

Coverage target: 70% for new code per phase.

Manual audit required for:
- Phase 2: provider switching + fallback
- Phase 3: browser automation
- Phase 4: local execution safety
- Phase 5: memory recall
- Phase 6: integration OAuth flows + tool execution
- Phase 7: skill triggering
- Phase 8: schedule firing
- Phase 9: voice end-to-end + multi-agent
- Phase 10: sharing flow
- Phase 11: onboarding + Tauri build

==================================================
ENVIRONMENT VARIABLES
==================================================

.env (gitignored) contains:

```
# Database
DATABASE_URL=postgresql://localhost:5432/handle

# Clerk
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...

# Sandbox
E2B_API_KEY=...

# Anthropic (for computer use in Phase 3)
ANTHROPIC_API_KEY=...

# Memory
ZEP_API_KEY=...
ZEP_BASE_URL=https://api.getzep.com  # or self-hosted URL

# OAuth orchestration
NANGO_SECRET_KEY=...
NANGO_PUBLIC_KEY=...

# Voice
OPENAI_API_KEY=...    # used for Whisper + TTS

# File storage
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET=handle
CLOUDFLARE_R2_ENDPOINT=...

# Local LLM (optional)
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=llama3.1:70b

# Observability
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=handle-dev

# Internal
HANDLE_API_PORT=3001
HANDLE_API_HOST=127.0.0.1
HANDLE_LOG_DIR=~/Library/Logs/Handle
```

Settings entered via UI take precedence over .env values.

==================================================
CODE STYLE
==================================================

- TypeScript strict mode on
- No `any` without an inline comment explaining why
- Prettier for formatting (default config)
- ESLint (next/core-web-vitals + standard)
- Imports sorted: external libs, internal packages, relative
- Functional patterns preferred where reasonable; classes fine
  for stateful services with clear lifecycle
- Async/await preferred over Promise chains
- No unhandled promises

==================================================
INITIAL SETUP COMMANDS
==================================================

```bash
# Create project
mkdir -p /Users/perlantir/projects/Handle
cd /Users/perlantir/projects/Handle
git init -b main

# Initialize as monorepo with pnpm
pnpm init

# Install root dev dependencies
pnpm add -Dw typescript @types/node prettier eslint vitest

# Workspace structure detailed in Phase 1 spec

# Initial commit
git add .
git commit -m "Initial commit: project skeleton"

# Create GitHub repo
gh repo create perlantir/handle --private --source=. --push
```

==================================================
WHY THIS PROJECT EXISTS
==================================================

The user (perlantir) previously built Operator Dock with a
custom agent architecture. Operator Dock is architecturally
rigorous but required months of foundation work before
delivering a usable product. The user pivoted to Handle to:

1. Get to a working product faster (months instead of years)
2. Use proven infrastructure (LangChain, Zep, E2B, Clerk, etc.)
   instead of reinventing primitives
3. Match Manus's full capability with extensions
4. Personal use first, others later via Tauri distribution

This pivot is intentional. Do not relitigate. The Operator Dock
custom architecture was right for a different product
(enterprise-grade local agent with replay/encryption/idempotency).
Handle is a different product (personal Manus clone with
multi-provider extensions).

If you find yourself wanting to build something Operator-Dock-like
in Handle, stop. The architectural choices here are deliberate.

==================================================
END OF KICKOFF
==================================================

Read FINAL_AGENTS.md, FINAL_DESIGN_SYSTEM.md, FINAL_ROADMAP.md,
then begin Phase 1 per FINAL_PHASE_1_FOUNDATION.md.

Acknowledge receipt, summarize Phase 1 scope, ask clarifying
questions, then begin implementation.
