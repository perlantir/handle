# Phase 1 Manual Audit: Canonical Task

Run this from a clean checkout of the `phase-1/foundation` branch after `.env` is populated. Paste the completed checklist and notes back into the PR/thread.

## Prerequisites

- PostgreSQL 17 is running.
- The `handle` database exists and has the `vector` extension enabled.
- `.env` exists at the repo root with:
  - `DATABASE_URL=postgresql://perlantir@localhost:5432/handle`
  - `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `OPENAI_API_KEY`
  - `E2B_API_KEY`
  - `LANGSMITH_API_KEY` optional

The API workspace loads this root `.env` through `dotenv-cli`; do not create a separate `apps/api/.env`.

## Start

```bash
brew services start postgresql@17
pnpm install --frozen-lockfile
pnpm --filter @handle/api prisma generate
pnpm --filter @handle/api prisma migrate deploy
pnpm --filter @handle/api dev
```

In a second terminal:

```bash
pnpm --filter @handle/web dev
```

Open `http://127.0.0.1:3000`.

## Canonical Task

Submit exactly:

```text
Write a Python script that fetches the top 10 Hacker News stories from https://news.ycombinator.com and saves them as JSON to /tmp/hn.json, then run the script once and show me the contents.
```

## Checklist

- [ ] Clerk sign-in/sign-up works.
- [ ] Home renders `Good morning, [your name].`
- [ ] Submitting the canonical task opens `/tasks/[taskId]`.
- [ ] Workspace status dot pulses while the task is running.
- [ ] Plan tab receives 3-7 plan steps.
- [ ] Inspector shows tool calls as they happen.
- [ ] Terminal surface streams shell output in real time.
- [ ] Agent writes a Python script in E2B.
- [ ] Agent runs the script once.
- [ ] Agent reads `/tmp/hn.json`.
- [ ] Final assistant message appears.
- [ ] Status changes to `STOPPED` or the UI clearly indicates completion.
- [ ] `/health` returns `service: "handle-api"`, `status: "ok"`, build info, and timestamp.
- [ ] Logs are present at `~/Library/Logs/Handle/api.log`.
- [ ] Design fidelity matches `docs/codex-context/FINAL_DESIGN_SYSTEM.md` and `packages/design-refs/screen-specs.md` for Home and Workspace.
- [ ] Repeat the canonical task two more times in fresh sessions. All 3 runs complete.

## Evidence To Paste Back

```text
Branch:
Commit:

Run 1:
- Task id:
- Final status:
- Notes:

Run 2:
- Task id:
- Final status:
- Notes:

Run 3:
- Task id:
- Final status:
- Notes:

/health output:

Log path check:

Design fidelity notes:

Failures or odd behavior:
```

## Health And Logs

```bash
curl http://127.0.0.1:3001/health
ls -l ~/Library/Logs/Handle/api.log
tail -n 80 ~/Library/Logs/Handle/api.log
```
