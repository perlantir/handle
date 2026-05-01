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
  - OpenAI API key
  - OpenAI ChatGPT Subscription OAuth
  - Anthropic
  - KIMI
  - OpenRouter
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

The smoke test is local-only and skips in CI because mocking would defeat the purpose of this phase gate. It uses real Keychain credentials, real provider APIs, E2B, and the real agent loop. Expected runtime with all six provider configurations is 10-15 minutes; the script prints progress per provider so a slow model does not look hung.

The script starts an isolated API process on the first free port from 3001-3005, temporarily isolates each provider in `ProviderConfig`, then restores the original provider settings before exit. Do not change provider settings in the UI while this script is running.

The smoke test should run the canonical Hacker News task against:

- OpenAI API key mode (`gpt-4o`)
- OpenAI ChatGPT Subscription OAuth mode (Codex default model)
- Anthropic (`claude-opus-4-7`)
- KIMI (`kimi-k2.6`, `https://api.moonshot.ai/v1`)
- OpenRouter (`anthropic/claude-opus-4.7`)
- Local (`llama3.1:8b`)

Each configured provider must return more than 5 valid entries with `title`, `url`, and `score`, then finish with status `STOPPED`. Providers with missing credentials are reported as `SKIP`; the Phase 2 gate requires the user-run audit to show all six as `PASS`.

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
- [ ] KIMI key saves to Keychain and read-back verification succeeds.
- [ ] OpenRouter key saves to Keychain and read-back verification succeeds.
- [ ] Local provider settings save successfully.
- [ ] Test Connection surfaces provider-specific errors verbatim enough to distinguish invalid key, rate limit, and network unreachable.
- [ ] OpenAI API key mode runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] OpenAI ChatGPT Subscription OAuth mode runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] Anthropic runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] KIMI runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] OpenRouter runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] Local provider runs the canonical task and returns more than 5 valid Hacker News entries.
- [ ] Each provider task finishes with status `STOPPED`.
- [ ] Per-task provider override works.
- [ ] Primary provider failure falls back to the next configured provider.
- [ ] `provider_fallback` SSE event streams with `fromProvider`, `toProvider`, `reason`, and `taskId`.
- [ ] Workspace status bar updates the visible model name after fallback.
- [ ] Fallback toast appears.
- [ ] Cost counter splits usage across providers.
- [ ] OpenAI API key, ChatGPT Subscription OAuth, and Both (fallback) auth modes are visible in Settings.
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
- API key task id:
- API key final status:
- ChatGPT OAuth task id:
- ChatGPT OAuth final status:
- Notes:

Anthropic:
- Task id:
- Final status:
- Notes:

KIMI:
- Task id:
- Final status:
- Notes:

OpenRouter:
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

OpenAI OAuth notes:

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
