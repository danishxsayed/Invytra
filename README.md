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
| `pnpm worker` | run queued actions automatically (see below) |
| `pnpm queue <label> …` | add actions to the queue |
| `pnpm queue:status [label]` | queue, limits, recent results and replies |

Every `pnpm linkedin` command checks working hours and daily/weekly limits first and is
logged in the `actions` table (SUCCEEDED / SKIPPED / FAILED, with duration and errors).

## Running on autopilot (queue + worker)

`pnpm linkedin …` runs one action immediately. For real use, queue actions and let the
worker run them:

```bash
pnpm worker                                   # keep this running in its own Terminal tab

pnpm queue test-1 invite <url> [<url> …] --note "Hi {firstName}, …"
pnpm queue test-1 file invite leads.csv --note "Hi {firstName}, …"   # one profile URL per line (first column)
pnpm queue test-1 message <url> --text "Hi {firstName}, …"
pnpm queue test-1 visit <url> …
pnpm queue:status                             # what's queued, usage vs limits, recent results, replies
pnpm queue:cancel test-1 [invite|message|…]   # cancel queued actions before they run
```

The worker:
- runs each account's actions **one at a time, oldest first**, with a random 45 s – 4 min gap
- only works inside the account's **working hours** (default Mon–Fri 9:00–18:00, its own time zone);
  anything queued outside them waits for the next window
- enforces **daily and weekly limits** before every action; over-limit actions wait and re-check
- **retries** failed visits/invites up to 2 times (never messages — a retry could double-send)
- pauses an account's invites for 3 days if LinkedIn reports the weekly invitation limit
- **reads every account's inbox about once an hour** and saves new replies
- stops an account on any checkpoint/captcha/restriction (its queued actions wait until
  `pnpm account:reactivate`)
- survives restarts: queued actions are kept, and anything interrupted is re-queued

**Free LinkedIn accounts get only a few custom invite notes per month.** When LinkedIn says
they're used up, Invytra sends the invite without the note and remembers it until the 1st of
next month (shown in `pnpm queue:status`). Add `--require-note` to skip those invites instead.

`{firstName}` and `{name}` in notes/messages are filled in from each profile. Notes and
messages that still contain placeholder text (`…`, `...`, `<…>`, `[…]`, unknown `{…}`) are
refused before anything is queued or sent.
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
