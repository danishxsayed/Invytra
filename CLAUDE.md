# Invytra — Project Context for Claude Code

Invytra is a cloud-based LinkedIn outreach automation SaaS (Expandi-style), built by
Crawlers Technologies Pvt Ltd. LinkedIn-only — no email or WhatsApp channels.

Each customer connects one or more LinkedIn accounts. Invytra runs every account in
its own cloud browser, through its own dedicated proxy, and executes outreach
campaigns (profile visit → connection request → message → follow-ups) on a
human-like schedule with strict daily limits.

## Current phase

**Phase 0 — Proof of concept.** See `docs/PHASE-0-POC.md`. Steps 1–6 are built; the 7-day
soak test is next. Do NOT build the dashboard, billing, or multi-tenant features until
Phase 0 is signed off.

## Tech stack

- Language: TypeScript everywhere (Node.js 20+, strict mode)
- Monorepo: pnpm workspaces + Turborepo
- Frontend: Next.js (App Router) + Tailwind + shadcn/ui
- API: NestJS
- Worker: Node.js + Playwright (Chromium) + BullMQ
- Database: PostgreSQL + Prisma
- Queue / cache: Redis
- Local dev: Docker Compose (Postgres + Redis)
- Tests: Vitest (unit), Playwright test runner only for worker integration tests

## Folder structure

```
/apps/web        Next.js customer dashboard           (Phase 1+)
/apps/api        NestJS REST API                       (Phase 1+)
/apps/worker     Automation engine: browsers, actions, queue, worker
/packages/db     Prisma schema + client
/packages/shared Shared types, constants, limits
/docs            Specs and decisions
```

## Architecture rules (always follow)

1. **Every LinkedIn action is a queued job.** API routes never touch a browser.
   The worker picks jobs from BullMQ and executes them.
2. **One LinkedIn account = one browser profile = one proxy.** Never share a proxy or
   browser profile between accounts. Never run two sessions for the same account at
   the same time (use a per-account lock in Redis).
3. **Sessions are persisted, not re-created.** Store the browser storage state after
   login, encrypted at rest (AES-256-GCM, key from env). Log in again only when the
   session is invalid.
4. **Human pacing.** Randomized delays between actions (not fixed intervals), actions
   only inside the account's working hours in its own time zone, and daily limits
   enforced before a job is executed — not after.
5. **Default daily limits per account** (configurable, live in `packages/shared/limits.ts`):
   - connection requests: 20/day (max allowed setting: 40)
   - messages: 50/day
   - profile visits: 80/day
   - weekly connection requests cap: 150
6. **Selectors live in one place.** All LinkedIn DOM selectors go in
   `apps/worker/src/linkedin/selectors.ts` so UI changes are fixed in one file.
7. **Fail safe.** On any unexpected page (security checkpoint, captcha, restriction
   notice, login wall), STOP all jobs for that account, mark it `needs_attention`,
   save a screenshot, and alert. Never try to solve captchas or checkpoints
   automatically — a human handles those.
8. **Secrets.** Credentials, proxy passwords, encryption keys only in `.env`
   (never committed). Never log passwords, cookies or session tokens.
9. **Observability.** Every action writes a row to an `actions` log: account, type,
   target profile, status, error, duration, screenshot path on failure.

## Coding conventions

- Small, focused modules; no file over ~300 lines.
- Validate all external input with Zod.
- Use async/await; no unhandled promises.
- Write unit tests for the scheduler, limits and sequence logic.
- Commit in small steps with clear messages.

## Testing rules

- Use only LinkedIn test accounts owned by the Crawlers team — never personal or
  company profiles.
- Never run against more than 3 accounts during Phase 0.

## Roadmap (for context only — build in order)

- **Phase 0:** PoC automation engine (`docs/PHASE-0-POC.md`)
- **Phase 1:** DB schema, auth, workspaces, account connection UI, lead import
  (CSV + Sales Navigator search URL), campaign/sequence builder, scheduler
- **Phase 2:** Unified inbox, AI message personalization (Claude API), analytics
- **Phase 3:** Agency features (multi-sender, white-label), billing (Razorpay + Stripe),
  beta launch
