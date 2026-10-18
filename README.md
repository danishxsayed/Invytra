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
| `pnpm account:reactivate <label>` | set a stopped account back to ACTIVE after you've checked its screenshot |
| `pnpm account:probe <label> <profile-url> …` | read-only capture of real LinkedIn pages into `.data/probe/` to verify selectors |
| `pnpm linkedin <label> visit <url>` | visit a profile (scrolls like a person) |
| `pnpm linkedin <label> status <url>` | connected / pending / not connected |
| `pnpm linkedin <label> invite <url> ["note"]` | send a connection request (note ≤ 300 chars) |
| `pnpm linkedin <label> message <url> "text"` | message a 1st-degree connection |
| `pnpm linkedin <label> inbox` | read conversations and save new replies |
| `pnpm linkedin <label> usage` | today's counts against the account's limits |

Every `pnpm linkedin` command checks working hours and daily/weekly limits first and is
logged in the `actions` table (SUCCEEDED / SKIPPED / FAILED, with duration and errors).
| `pnpm typecheck` | type-check every package |

## LinkedIn test accounts

1. Add the account to `.env` as `ACCOUNT_1_LABEL`, `ACCOUNT_1_PROXY_URL`, `ACCOUNT_1_TIMEZONE`.
2. `pnpm account:login test-1` — a browser opens through the account's proxy. Log in by hand,
   including any 2FA. Invytra never types passwords.
3. `pnpm account:check test-1` — should print "Session OK".

If LinkedIn shows a checkpoint, captcha, restriction or login page, the account is set to
`NEEDS_ATTENTION` and a screenshot is saved in `.data/screenshots/`. Look at the screenshot:
if it was a false alarm, run `pnpm account:reactivate <label>`; if LinkedIn really asked for
verification, resolve it by hand, then run `pnpm account:login <label>`.
