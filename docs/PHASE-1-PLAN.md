# Phase 1 — Web Dashboard (multi-tenant SaaS)

Decided 2026-10-22:
- **Users:** paying customers, not just the Crawlers team → multi-tenant from day one
- **Connecting LinkedIn:** a live browser inside the dashboard (Expandi-style), not cookies or CLI
- **Hosting during the build:** the founder's Mac; a cloud server is required before the first customer
- **First version includes:** accounts & status, lead lists, campaigns (sequences), inbox & activity

## Architecture

```
apps/web     Next.js (App Router) — dashboard UI + server actions / route handlers (the API)
apps/worker  Existing automation engine (browsers, queue, campaign engine, login streaming)
packages/db  Prisma schema — every tenant table has workspace_id
packages/shared  Limits, policy, templates
```

Change from Phase 0 plan: no separate NestJS API. Next.js server actions and route handlers
talk to Postgres directly and enqueue jobs; the worker stays the only process that touches
LinkedIn. One less service to build, deploy and secure.

**Tenant isolation rule:** every query from the web app goes through a helper that adds
`workspaceId` from the signed-in session. No query uses an id from the URL alone.

## Data model additions

- `workspaces` (id, name, plan, created_at)
- `users` (id, email, password_hash, name)
- `memberships` (user_id, workspace_id, role: OWNER | MEMBER)
- `linkedin_accounts.workspace_id`
- `lead_lists`, `leads` (profile_url, name, headline, list, status)
- `campaigns`, `campaign_steps` (VISIT, INVITE+note, WAIT_ACCEPT, MESSAGE, WAIT n days), `campaign_leads` (state machine per lead)
- `actions.campaign_lead_id`, `inbox_messages.lead_id`

## Progress

- [x] M1 (2026-10-22): workspaces/users/memberships + migration (Phase 0 accounts kept in the
  default workspace, claimed by the first sign-up); sign-up, log-in, log-out with signed
  session cookies, bcrypt passwords, login throttling; Overview (accounts with tick-strip
  allowances, latest activity, replies), Activity (filters), Inbox; tenant-isolation tests

## Milestones

| # | Milestone | What you can do after it | Est. |
|---|---|---|---|
| M1 | Workspaces, sign-up/login, dashboard shell | Sign up, log in, see your accounts, usage vs limits, recent activity and replies | 3–4 days |
| M2 | Accounts | Connect a LinkedIn account **through a live browser in the dashboard**; edit limits & working hours; reactivate; health | 1–1.5 weeks |
| M3 | Lead lists | Upload CSV / paste URLs; see each lead's status | 3–4 days |
| M4 | Campaigns | Build sequences (visit → invite → wait for accept → message → follow-ups), stop on reply, start/pause | 1.5–2 weeks |
| M5 | Inbox & activity | Replies across accounts linked to leads and campaigns; full action log with failure screenshots | 4–5 days |
| M6 | Go live | Cloud server + Docker, domain (invytra.com), HTTPS, backups, proxy per account, billing (Razorpay + Stripe), team invites | 1.5–2 weeks |

Total ≈ 7–9 weeks of focused work. Customers can only start after M6.

## Reference: SalesRobot (reviewed 2026-10-22) — match the flow, beat it on trust

Not copied — Invytra keeps its own design. What customers will expect, and where it lands:

| Expectation seen in SalesRobot | Invytra milestone |
|---|---|
| Account switcher in the sidebar with "Connected" state | M2 |
| Visible "Safe mode" indicator | M2 |
| Getting-started checklist (connect account → create campaign → …) | M2 (account step), grows each milestone |
| Accounts page: health, subscription, daily limits, "Configure daily limits" | M2 |
| Daily limits per action type, randomised within a range | M2 (we already randomise gaps; add per-day ranges) |
| Campaigns list with progress + performance; Prospects and Lead list tabs | M3 + M4 |
| Inbox filters: replied / unread / unanswered, by campaign, by account | M5 |
| Sequence templates | M4 |
| Weekly activity table on the dashboard | M5 |
| Agency view: campaigns across many accounts/clients | M6 (multi-workspace for agencies) |

Where Invytra must be better:
1. **Honest safety:** conservative defaults (20 invites/day, not 35–40), warm-up ramp for new
   accounts, and every wait/stop explained.
2. **Plain-language results** for every action ("Already connected", "Sent without note —
   LinkedIn's free-note limit") with a screenshot on failure.
3. **Less clutter:** lead with today's health, allowance and replies — not rows of zero stats
   and a permanent setup banner.
4. **Login inside the dashboard** (live browser) — no browser extension, no cookie copying.
5. **India + U.S. ready:** Razorpay and Stripe, per-account time zones.

## In-dashboard LinkedIn login (M2) — approach

The worker opens a real Chromium for the account, through the account's proxy, and streams
it to the dashboard:
- Video: Chrome DevTools `Page.startScreencast` frames → WebSocket → `<canvas>` in the page
- Input: mouse/keyboard events from the dashboard → `Input.dispatch*` on the browser
- When the LinkedIn feed loads, the session is encrypted and saved, the stream closes, and
  the account becomes ACTIVE. The customer types their own password and 2FA; Invytra never
  stores passwords.
- Locally this runs on the Mac; in production the stream goes over the dashboard's HTTPS
  domain.

## Risks to keep in view

- LinkedIn changes its page layout — keep the probe/evidence workflow and the fake-site tests.
- Customers' accounts can be restricted — conservative default limits, warm-up for new accounts,
  clear in-app warnings, and ToS language that the customer is responsible for their account.
- Free LinkedIn accounts have a monthly custom-note allowance (seen 2026-10-22) — the campaign
  builder must make "send without note" behaviour visible.
- One proxy per account is required in production (`ALLOW_NO_PROXY` is dev-only).
