# Phase 0 — Proof of Concept: Automation Engine

**Goal:** prove that Invytra can reliably run LinkedIn actions for a small number of
accounts, from a cloud server, through a dedicated proxy, without getting the accounts
restricted. No UI, no billing, no multi-tenancy.

**Timeline:** 1–2 weeks build + 1 week soak test.

## Prerequisites (team to arrange)

- [ ] 2–3 LinkedIn test accounts owned by the team (aged, with real profile photo,
      headline and some connections — brand-new empty accounts get restricted fast)
- [ ] 2–3 static residential / ISP proxies, ideally in the same country as each account
- [ ] A small Linux server (2 vCPU / 4 GB RAM) or local machine with Docker
- [ ] `.env` filled from `.env.example`

## Progress

- [x] Step 1 — repo scaffold (2026-10-18)
- [x] Step 2 — Prisma schema + initial migration, limits/working-hours policy with tests (2026-10-18)
- [x] Step 3 — browser session manager: proxy launch, encrypted session save/restore, checkpoint/captcha/restriction detection, per-account Redis lock, `pnpm account:login` / `pnpm account:check` (2026-10-18)
- [x] Step 4 — LinkedIn actions: visit, status, invite (+note, More-menu fallback, email/weekly-limit handling), message, inbox sync; limit checks + `actions` log; `pnpm linkedin` CLI; `pnpm account:probe` (2026-10-18) — profile, invite and inbox confirmed on live LinkedIn (2026 layout); message overlay still to confirm on a real send
- [x] Step 5 — BullMQ queue + worker (2026-10-20): per-account FIFO with atomic slot claim, random gaps, working-hours/limit rescheduling, safe retries (never messages), invite pause on LinkedIn's weekly limit, hourly inbox sync, crash recovery
- [x] Step 6 — CLI (2026-10-20): `pnpm queue …` (incl. CSV import, {firstName} templates), `pnpm queue:status`, `pnpm worker`
- [ ] **Soak test** — 7 days at default limits on 2 accounts with zero restrictions (needs proxies + 2 test accounts)

## Scope — build in this order

### Step 1: Repo scaffold
- pnpm + Turborepo monorepo per `CLAUDE.md`
- Docker Compose with Postgres and Redis
- `.env.example` with: `DATABASE_URL`, `REDIS_URL`, `SESSION_ENCRYPTION_KEY`,
  and per-account test config (`ACCOUNT_1_EMAIL`, `ACCOUNT_1_PROXY_URL`, …)

### Step 2: Minimal database (Prisma)
Tables: `linkedin_accounts` (id, label, proxy_url, timezone, status, encrypted_session,
working_hours, limits), `actions` (id, account_id, type, target_url, payload, status,
error, screenshot_path, scheduled_at, executed_at, duration_ms).

### Step 3: Browser session manager (`apps/worker/src/browser/`)
- Launch Chromium via Playwright with the account's proxy
- Persistent browser profile per account
- Load saved session; if missing or invalid, log in (first login done manually in
  headed mode by a team member, then saved)
- Save encrypted session after every successful run
- Detect checkpoint / captcha / restriction pages → stop, screenshot, mark
  `needs_attention`

### Step 4: LinkedIn actions (`apps/worker/src/linkedin/`)
Implement each as a separate function, all selectors in `selectors.ts`:
1. `visitProfile(profileUrl)`
2. `sendConnectionRequest(profileUrl, note?)` — note max 300 chars
3. `checkConnectionStatus(profileUrl)` → `connected | pending | not_connected`
4. `sendMessage(profileUrl, text)` — only to 1st-degree connections
5. `fetchNewMessages(since)` → list of { from, profileUrl, text, timestamp }

### Step 5: Job queue + scheduler
- BullMQ queue `linkedin-actions`, one worker concurrency slot per account
- Redis lock per account (no parallel sessions)
- Before each job: check working hours + daily limits; if outside, reschedule
- Randomized delay between jobs for the same account

### Step 6: CLI to drive the PoC
`pnpm poc` commands:
- `poc login <accountLabel>` — headed login, saves session
- `poc enqueue-visit <accountLabel> <profileUrl>`
- `poc enqueue-invite <accountLabel> <profileUrl> [note]`
- `poc enqueue-message <accountLabel> <profileUrl> <text>`
- `poc sync-inbox <accountLabel>`
- `poc status` — prints accounts, today's counts vs limits, last errors

## Done when (acceptance criteria)

- [ ] Each of the 5 actions works end-to-end on at least 2 test accounts
- [ ] Sessions survive worker restarts (no re-login needed)
- [ ] Limits and working hours are enforced (unit tests prove it)
- [ ] A forced checkpoint/invalid session stops that account cleanly with a screenshot
- [ ] Every action is logged in the `actions` table
- [ ] **Soak test:** 7 days at default limits on 2 accounts with zero restrictions

## Out of scope for Phase 0

Dashboard UI, user auth, billing, campaigns/sequences builder, lead import, AI
personalization, multi-tenant workspaces.

## Suggested first prompt for Claude Code

> Read CLAUDE.md and docs/PHASE-0-POC.md. Phase 0 Steps 1–6 are built. Help me run
> the 7-day soak test: check `pnpm queue:status` daily and investigate any FAILED
> actions using the evidence folders in .data/screenshots.
