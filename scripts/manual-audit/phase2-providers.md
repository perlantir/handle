# Phase 2 Manual Audit: Providers

Run this from a clean checkout of the `phase-2/multi-provider` branch after `.env` is populated and provider credentials are stored in Keychain. Paste the completed checklist and notes back into the PR/thread.

## Prerequisites

- PostgreSQL 17 is running.
- The `handle` database exists and has the `vector` extension enabled.
- `.env` exists at the repo root with:
  - `DATABASE_URL=postgresql://perlantir@localhost:5432/handle`
  - `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_HANDLE_WEB_BASE_URL=http://127.0.0.1:3000`
  - `NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3001`
  - `E2B_API_KEY`
  - `LANGSMITH_API_KEY` optional
- Provider credentials are configured through Settings and stored in Keychain:
  - OpenAI
  - Anthropic
  - QWEN
  - KIMI
  - xAI
  - Local LLM endpoint
- Ollama or LM Studio is running for the local provider.

API and web workspace commands load the root `.env` through `dotenv-cli`. Do not create local `.env` files under `apps/`; there should be no `apps/api/.env*` or `apps/web/.env*` files.

## Start

```bash
brew services start postgresql@17
pnpm install --frozen-lockfile
pnpm --filter @handle/api prisma generate
pnpm --filter @handle/api prisma migrate deploy
pnpm --filter @handle/api dev
```

Within 5 seconds, the API terminal should print a startup banner like:

```text
[Handle API] listening on http://127.0.0.1:3001 - log: ~/Library/Logs/Handle/api.log
```

If that banner does not appear, stop the audit and report the API terminal output.

In a second terminal:

```bash
pnpm --filter @handle/web dev
```

Open `http://127.0.0.1:3000`. This is the canonical local web URL; do not use `http://localhost:3000`.

## Provider Smoke

Run:

```bash
pnpm smoke:e2e-providers
```

The smoke test should run the canonical Hacker News task against OpenAI, Anthropic, QWEN, KIMI, xAI, and local. Each configured provider must return more than 5 valid entries with `title`, `url`, and `score`, then finish with status `STOPPED`.

## Canonical Task

Submit exactly for each provider when running manually:

```text
Write a Python script that fetches the top 10 Hacker News stories from https://news.ycombinator.com and saves them as JSON to /tmp/hn.json, then run the script once and show me the contents.
```

## Checklist

- [ ] Clerk sign-in/sign-up works.
- [ ] Settings → Providers renders.
- [ ] OpenAI key saves to Keychain and read-back verification succeeds.
- [ ] Anthropic key saves to Keychain and read-back verification succeeds.
- [ ] QWEN key saves to Keychain and read-back verification succeeds.
- [ ] KIMI key saves to Keychain and read-back verification succeeds.
- [ ] xAI key saves to Keychain and read-back verification succeeds.
- [ ] Local provider settings save successfully.
- [ ] Test Connection surfaces provider-specific errors verbatim enough to distinguish invalid key, rate limit, and network unreachable.
- [ ] OpenAI runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] Anthropic runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] QWEN runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] KIMI runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] xAI runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] Local provider runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] Each provider task finishes with status `STOPPED`.
- [ ] Per-task provider override works.
- [ ] Primary provider failure falls back to the next configured provider.
- [ ] `provider_fallback` SSE event streams with `fromProvider`, `toProvider`, `reason`, and `taskId`.
- [ ] Workspace status bar updates the visible model name after fallback.
- [ ] Fallback toast appears.
- [ ] Cost counter splits usage across providers.
- [ ] OpenAI is API-key-only unless public OpenAI OAuth for agentic API usage exists.
- [ ] Any OpenAI OAuth gap is visible in the UI and recorded in SIGNOFF.
- [ ] `/health` returns `service: "handle-api"`, `status: "ok"`, build info, and timestamp.
- [ ] Logs are present at `~/Library/Logs/Handle/api.log`.
- [ ] Design fidelity matches `docs/codex-context/FINAL_DESIGN_SYSTEM.md` and `packages/design-refs/screen-specs.md` for Settings and Workspace.

## Evidence To Paste Back

```text
Branch:
Commit:

Provider smoke:
- Command:
- Result:
- Notes:

OpenAI:
- Task id:
- Final status:
- Notes:

Anthropic:
- Task id:
- Final status:
- Notes:

QWEN:
- Task id:
- Final status:
- Notes:

KIMI:
- Task id:
- Final status:
- Notes:

xAI:
- Task id:
- Final status:
- Notes:

Local:
- Task id:
- Final status:
- Notes:

Fallback:
- From provider:
- To provider:
- Event observed:
- UI notes:

OpenAI OAuth availability:

/health output:

Log path check:

Design fidelity notes:

Failures or odd behavior:
```

## Health And Logs

```bash
curl http://127.0.0.1:3001/health
ls -l ~/Library/Logs/Handle/api.log
tail -n 120 ~/Library/Logs/Handle/api.log
```
