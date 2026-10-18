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

pnpm browsers:install                        # download Chromium for Playwright
pnpm db:up                                   # start Postgres + Redis (or Homebrew services)
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
| `pnpm test` | run all tests (unit + fake-LinkedIn browser tests) |
| `pnpm account:login <label>` | open a browser, log in to LinkedIn by hand, save the encrypted session |
| `pnpm account:check <label>` | check a saved session still works (stops the account on a checkpoint) |
| `pnpm typecheck` | type-check every package |

## LinkedIn test accounts

1. Add the account to `.env` as `ACCOUNT_1_LABEL`, `ACCOUNT_1_PROXY_URL`, `ACCOUNT_1_TIMEZONE`.
2. `pnpm account:login test-1` — a browser opens through the account's proxy. Log in by hand,
   including any 2FA. Invytra never types passwords.
3. `pnpm account:check test-1` — should print "Session OK".

If LinkedIn shows a checkpoint, captcha, restriction or login page, the account is set to
`NEEDS_ATTENTION` and a screenshot is saved in `.data/screenshots/`. Resolve it by hand,
then run `pnpm account:login <label>` again to reactivate the account.
