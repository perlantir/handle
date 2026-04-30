# Handle

Handle is a personal-use autonomous AI agent with a Next.js web UI, Express API, Clerk auth, LangChain agent runtime, E2B sandbox execution, Prisma/Postgres storage, SSE streaming, and the Handle design system.

Phase 1 is the foundation: OpenAI-only model calls, E2B-only execution, four streaming tools, Home and Workspace screens, approval plumbing, and local Mac development.

## Requirements

- Node.js `>=20`
- pnpm `>=9`
- PostgreSQL 17
- pgvector

Mac setup:

```bash
brew install postgresql@17
brew install pgvector
brew services start postgresql@17
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
createdb handle
psql -d handle -c 'CREATE EXTENSION IF NOT EXISTS vector;'
```

## Environment

```bash
cp .env.example .env
```

Fill in:

```bash
DATABASE_URL=postgresql://perlantir@localhost:5432/handle
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_HANDLE_WEB_BASE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_HANDLE_API_BASE_URL=http://127.0.0.1:3001
OPENAI_API_KEY=
E2B_API_KEY=
LANGSMITH_API_KEY=
```

`LANGSMITH_API_KEY` is optional. When present, LangChain tracing is enabled.

There is exactly one `.env` file: the repo-root `.env`. API and web workspace commands load it through `dotenv-cli`; do not create local `.env` files under `apps/`.

## Install And Database

```bash
pnpm install --frozen-lockfile
pnpm --filter @handle/api prisma generate
pnpm --filter @handle/api prisma migrate deploy
```

## Development

Run the API:

```bash
pnpm --filter @handle/api dev
```

Run the web app in a second terminal:

```bash
pnpm --filter @handle/web dev
```

Open `http://127.0.0.1:3000`. This is the canonical local web URL; do not use `http://localhost:3000`.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm smoke:web-signin
pnpm build
```

`pnpm build` runs Turborepo. Next.js may rewrite `apps/web/next-env.d.ts` during local builds; keep the source-controlled version unchanged.
`pnpm smoke:web-signin` starts the web dev server, checks `/sign-in`, verifies protected-route redirects do not self-proxy through `localhost:3000`, and checks task POST CORS headers when the API is already running.

## Health And Logs

```bash
curl http://127.0.0.1:3001/health
tail -n 80 ~/Library/Logs/Handle/api.log
```

The API log path can be changed with `HANDLE_LOG_DIR`. Logs rotate at 10 MB and keep 5 rotations.

## Phase 1 Audit

Manual audit instructions live at:

```text
scripts/manual-audit/phase1-canonical-task.md
```

Phase 1 is not complete until the manual audit passes and CI has passed three consecutive runs on the phase branch tip.
