# Invytra

Cloud LinkedIn outreach automation by Crawlers Technologies.
Read `CLAUDE.md` for architecture rules and `docs/PHASE-0-POC.md` for the current task.

## Requirements

- Node.js 20+ (22 recommended — see `.nvmrc`)
- pnpm 9 — `npm i -g pnpm@9`
- Docker Desktop (for Postgres + Redis)

## First-time setup

```bash
pnpm install
cp .env.example .env
# generate the session encryption key and paste it into .env:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

pnpm db:up                                   # start Postgres + Redis
pnpm db:deploy                               # create tables
pnpm build
pnpm test
```

## Layout

```
apps/worker       automation engine (Playwright + BullMQ)
packages/db       Prisma schema, migrations, client
packages/shared   limits, working hours, policy checks (pure, unit-tested)
docs/             specs
```

## Useful commands

| Command | What it does |
|---|---|
| `pnpm db:up` / `pnpm db:down` | start / stop Postgres and Redis |
| `pnpm db:migrate` | create a new migration after editing `schema.prisma` |
| `pnpm db:studio` | browse the database |
| `pnpm test` | run all unit tests |
| `pnpm typecheck` | type-check every package |
