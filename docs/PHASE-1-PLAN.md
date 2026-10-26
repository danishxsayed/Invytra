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
- [x] UI redesign (2026-10-22, founder feedback "too basic"): modern minimal SaaS style —
  Geist (bundled), Lucide icons; colours per founder: lime brand #C4FA13 (fills, with near-black
  text; olive #47590A for small text/links), warm background #F5F5EB, stone greys; sidebar with LinkedIn account
  switcher, Safe-mode badge, icon nav; dashboard with get-set-up checklist, 7-day stat cards,
  account cards with usage bars, icon activity timeline, replies with avatars; searchable
  inbox; glow-card log-in/sign-up; mobile drawer; text and spacing enlarged twice on request
- [x] M2 (2026-10-23): Accounts page (add, health in plain language, pause/resume, reconnect,
  remove) and per-account settings (daily/weekly limits, working days/hours, time zone, proxy —
  stored encrypted); **live LinkedIn login inside the dashboard** — the worker serves a WebSocket
  (port 3001) streaming a real Chromium via CDP screencast, the dashboard forwards mouse/keys/paste;
  one-time 2-minute signed tickets, tenant re-check and per-account lock in the worker, origin
  check; on reaching the feed the session is encrypted and saved, profile name read, account
  ACTIVE. Safe mode: daily totals vary 80–100%, 14-day warm-up for new accounts (about a third
  of limits on day 1). Sidebar switcher and checklist connect step wired. Verified end-to-end
  against the fake LinkedIn; live login confirmed by the founder on the Mac (2026-10-23)
- [x] M3 (2026-10-23): Lead lists — `lead_lists` / `leads` tables (workspace-scoped, canonical
  profile URL shared with the worker). New list / add leads from a CSV (auto-detected columns for
  Sales Navigator, Apollo and Excel exports, editable mapping, headerless files, `,` `;` tab) or
  pasted links; preview before saving (ready / duplicates in file / skipped rows with reasons);
  re-parsed on the server; 10,000 leads and 5 MB per upload; other CSV columns kept in `extra`
  for personalisation. List page: search, per-lead status from all of the workspace's actions
  (not contacted / queued / visited / invited / connected / messaged / failed), remove selected,
  rename, delete; lists page with contacted progress; checklist "Add leads" step. Sales Navigator
  *search URL* import deliberately deferred (account would browse search pages — more risk)

- [x] M4 (2026-10-24): Campaigns — `campaigns`, `campaign_leads`, `actions.campaign_lead_id`.
  One sending account + one lead list (leads added to the list later join). Builder with presets
  (invite + follow-ups / invite only / message connections), visit toggle, note (300, warning
  over 200 for free accounts), messages and follow-ups with waits, placeholders {firstName}
  {lastName} {name} {company} {title} (lead list first, LinkedIn name as fallback; a lead whose
  file lacks {company}/{title} is skipped, never sent "Hi ,"), live preview with real leads,
  launch confirmation with time estimate. Worker engine (every minute, only *queues* steps —
  limits/hours/pacing unchanged; max 2 waiting campaign actions per type per account): skips
  anyone already invited/messaged by the workspace or in another campaign; waits for acceptance
  with ~daily connection checks (which now count as profile visits) up to N days (default 21);
  weekly-invite-limit holds the lead 3 days; messages never retried. **Stop on reply**: inbox
  replies matched by name; and a campaign message is only sent after the inbox has been read
  since that person was last contacted (otherwise an inbox read is queued first and the message
  waits). Pause cancels queued steps; resume continues where each lead was. Launched campaigns:
  texts/waits editable and follow-ups can be added, structure/sender/list locked. Campaign page:
  leads, invited, accepted %, messaged, replied %, sequence, leads by state with step/next
  action/reason. Verified end-to-end against the fake LinkedIn (accept + reply test hooks).
  Known limit: replies matched by name (2026 inbox list has no profile links)
- [x] M5 (2026-10-24): Inbox & activity — `inbox_messages.campaign_lead_id / done_at / answered_at`.
  New replies are linked to their campaign lead (by name) when the inbox is read; a conversation
  whose latest message is ours ("You: …") counts as answered. Inbox tabs Needs reply / All /
  Done, filters by account and campaign, search, mark done / undo, lead details + campaign chip,
  sidebar badge with the needs-reply count. Activity: filters by result, type, account and
  campaign, pagination, lead names and campaign links, and **failure screenshots** served by
  `/app/evidence/<actionId>` (workspace-checked, only from DATA_DIR, symlinks refused).
  Dashboard "This week" table: visits, invites, accepted, messages, replies per day in the
  account's time zone. Note for M6: screenshots are read from the worker's disk — on separate
  servers they must move to shared/object storage
- [x] Pricing + multi-sender (2026-10-25): per-sender packages in `packages/shared/src/pricing.ts`
  (Solo $29 → Scale $12, 14-day trial up to 3 senders) on the website. Campaigns can send from
  several accounts: `campaign_senders` (migration `20261027000000_campaign_senders` moves the old
  `campaigns.account_id` over). New leads go to the connected sender with the fewest leads that
  has room; `campaign_leads.account_id` then pins the lead to it (replies are matched in that
  sender's inbox). Senders can be added/removed while running; a removed sender's queued actions
  are cancelled, its uncontacted leads move to others, contacted ones end as SKIPPED
  `SENDER_REMOVED`. Builder sender picker, per-sender table on the campaign page.
- [x] Campaign schedule (2026-10-25): `settings.days` (any of Mon–Sun, default Mon–Fri) and
  `settings.startAt` (optional start date). A campaign step runs on its campaign's days within
  the sender's working hours (`apps/worker/src/campaigns/sending-days.ts`); inbox checks may
  also run on any day a running campaign of that account sends, so weekend follow-ups still get
  a fresh inbox read. Launched campaigns wait for their start date ("Scheduled" badge); the start
  date can only change until it has passed. Account working days now apply to non-campaign work.
- [x] Search imports, likes, withdrawals (2026-10-25): paste a LinkedIn people search, a Sales
  Navigator lead search or a Sales Navigator lead list (`packages/shared/src/search-url.ts`);
  `lead_imports` + SEARCH_PAGE actions read one results page at a time
  (`apps/worker/src/linkedin/search.ts`, `apps/worker/src/imports/importer.ts`), max 50 pages a
  day per account, inside working hours. Sales Navigator people are stored as member-id links
  (`/in/ACwAA…/`, case kept) and swapped for the real profile link after the first visit.
  Stops on LinkedIn's monthly search limit (SEARCH_LIMIT) or no Sales Navigator (NO_SALES_NAV).
  New step LIKE_POST (latest post on the activity page; skipped if none). Setting
  `withdrawExpired` (default on): expired invites get a WITHDRAW_INVITE before the lead ends as
  NOT_ACCEPTED/EXPIRED_WITHDRAWN. Likes and withdrawals count as profile visits.
  **Selectors for search results, Sales Navigator, likes and withdraw are untested on the real
  site** — try a small import (10 people) and one campaign with a like first, and fix
  `apps/worker/src/linkedin/selectors.ts` from what you see.
- [x] Reply from the inbox (2026-10-26): Reply box on each inbox message; the web app writes a
  QUEUED REPLY action (`actions.inbox_message_id`), the worker picks it up within ~5 s, opens
  Messaging, clicks the conversation by name, types and confirms (`apps/worker/src/linkedin/reply.ts`);
  falls back to messaging from the profile for campaign leads. Any hour, ahead of queued
  campaign work, never retried; a reply interrupted by a crash is marked failed, not resent.
  Sent replies show under the message and mark it answered.
- [x] Settings (2026-10-24): profile (name; email change needs the current password), change
  password (signs out every other session via `users.sessions_valid_after`, this browser stays
  in), "sign out other devices", workspace name (owner only), team list. Team invites by email
  wait for M6 (needs email sending)
- [x] Marketing website (2026-10-24), inside apps/web (route group `(site)`, static pages):
  Home (hero "one account, one week" pacing calendar, lead journey, safety, features, $29 band,
  FAQ), Pricing ($29 per LinkedIn account / month, 7-day trial), Compare (Expandi, HeyReach,
  SalesRobot, Dripify, Waalaxy — prices as published, checked Oct 2026, dated on the page; plus
  "when another tool may suit you better"), Privacy + Terms drafts (marked draft, for legal
  review), sitemap, robots (keeps /app out of search), share image. Business details live in
  `apps/web/src/lib/site.ts`. Headline font Bricolage Grotesque (OFL, bundled locally).
  Claims that depend on M6: runs in the cloud, payments in USD/INR, trial handling

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
