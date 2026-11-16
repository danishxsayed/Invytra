# Invytra — Project Context for Claude Code

Invytra is a cloud-based outreach automation SaaS (Expandi / Instantly-style), built by
Crawlers Technologies Pvt Ltd. Channels: LinkedIn Outreach (live), Email Outreach (live:
mailboxes on the customer's own domains, SMTP/IMAP), WhatsApp and Instagram (coming soon).

Each customer connects one or more LinkedIn accounts. Invytra runs every account in
its own cloud browser, through its own dedicated proxy, and executes outreach
campaigns (profile visit → connection request → message → follow-ups) on a
human-like schedule with strict daily limits.

## Current phase

**Phase 1 — Web dashboard (multi-tenant).** See `docs/PHASE-1-PLAN.md`. M1 (workspaces,
auth, dashboard), M2 (accounts, live in-dashboard LinkedIn login, limits/working hours),
M3 (lead lists) and M4 (campaigns: sequence builder + worker engine in
`apps/worker/src/campaigns/`, rules in `packages/shared/src/campaign-flow.ts`) and M5
(inbox with needs-reply/done, activity filters, failure screenshots, weekly table) are built;
multi-sender campaigns are built too (`campaign_senders`; each lead is assigned one sender in
`campaign_leads.account_id` and keeps it; removed senders' uncontacted leads move to others);
Workspace level (hub, outside every channel; `apps/web/src/app/workspace/`): onboarding questions
once after sign-up (`users.onboarding`, rules in `packages/shared/src/onboarding.ts`), overview (setup plan
made from those answers, weekly numbers, needs attention), unified inbox (LinkedIn + email), people matched across channels (`people`, linked by
`syncPeople`, no page of its own; someone who replied on one channel isn't contacted on another),
do-not-contact list (`do_not_contact`, checked by every channel), settings (owner can delete the
workspace: `lib/delete-workspace.ts`, paid invoices kept in `archived_invoices`), billing (owner only,
Razorpay). Plans (`packages/shared/src/pricing.ts`): 7-day trial (1 channel, 1 sender, 20 credits),
Starter $39 (2 channels, 250 credits), Growth $49 (all 3, 500), VIP custom (`pnpm plan:set`); 1 sender per
channel + add-ons (LinkedIn $20, mailbox $5), yearly 15% off; `subscriptions` table + history, Razorpay
Subscriptions (`lib/plan-checkout.ts`, `lib/plan-webhook.ts`), limits enforced server-side (`lib/subscriptions.ts`:
sendingProblem / senderProblem), worker expires trials and pauses campaigns. Message extras (LinkedIn, paid in AI credits): handwritten notes, voice notes (ElevenLabs
voice copies, `/workspace/voices`) and video notes (`/workspace/videos`: one recording, the opening
"Hi there," re-spoken per person and lip-synced with HeyGen (or sync.so), one video per greeting reused;
`packages/db/src/video.ts` + `lipsync.ts`, files in VIDEO_DIR). Ask Invy (`/workspace/invy`): find businesses from a sentence: worker
`apps/worker/src/invy/` (Google Places, safe website checks incl. public emails and social links, OpenAI criteria + reasoning, 3 AI credits per business
shown), rules in `packages/shared/src/invy.ts`, map + cards in `apps/web/src/components/invy/`. Deployment: `docs/DEPLOY.md` (one Hostinger VPS, `deploy/go-live.sh` once, then `git push live main`). Team: the owner invites teammates by email (`lib/team.ts`, `workspace_invites`, link `/invite?token=`, 7 days, one use, hash stored), resends/cancels, removes members. WhatsApp (in progress, `status: soon`; open on a server with PREVIEW_CHANNELS + PREVIEW_EMAILS, `lib/preview.ts`): official Cloud API, number connected with Meta's Embedded Signup (`lib/whatsapp.ts`, Graph client `packages/db/src/whatsapp-api.ts`, token sealed), templates synced and built (`packages/shared/src/whatsapp.ts` rules, `/whatsapp/templates`; builder is 2 steps: category Marketing/Utility/Authentication + type, then draft with header none/text/image/video/document, buttons incl. copy code, OTP options, Android/iOS preview `WaPhone`; sample values asked in a popup on submit, `SampleDialog`), webhook `/api/whatsapp/webhook` (`lib/whatsapp-webhook.ts`), contacts with consent source, tags and opt-outs (`lib/whatsapp-contacts.ts`, `/whatsapp/contacts`; "Add contacts" side panel `CreateContacts`: bulk upload of CSV/.xlsx (exceljs, in the browser) then full-screen field mapping `ImportMapper` + preview, or add one by hand; User ID = `external_id`, matched first on re-import; appointment time and location are vars; contacts without consent (`consent_source` null) are saved but never messaged; page = views (all, active 30 days, not on WhatsApp, not opted in, opted out) + segments sidebar, tag/city filters, bulk bar (tag, campaign via a `selected-…` tag, export CSV `/whatsapp/contacts/export`, opt out, delete); `location` and `wa_status` columns (ON from delivered/read/inbound, NOT_FOUND from error 131026 — Meta has no lookup API, so it's learnt from sends); segments `whatsapp_segments` (rules in `packages/shared/src/whatsapp-segments.ts`, filter `segmentWhere` in `packages/db`, `lib/whatsapp-segments.ts`), campaigns can target a segment (`segment_id`); Manage tags & segments dialog renames/deletes tags in bulk (segment rules follow); clicking a row opens the contact panel `ContactPanel` (details, consent on file, segments, activity; Edit = `lib/whatsapp-contact-detail.ts`); a STOP reply or opting out puts the number on the do-not-contact list as PHONE); Invytra pays Meta (credit line, META_CREDIT_LINE_ID); campaigns (`lib/whatsapp-campaigns.ts`, `/whatsapp/campaigns`; worker `apps/worker/src/whatsapp/campaigns.ts` adds recipients when due and sends batches within the number's 24h tier; rules in `packages/shared/src/whatsapp-campaigns.ts`; `whatsapp_messages` gets delivery/read/failed from the webhook and replies). Emails (platform mailer in `packages/db/src/platform-mail.ts`, `noticeEmail`): template approved/rejected/paused/disabled to owners (`packages/db/src/whatsapp-notices.ts`, from the webhook, and from the worker which asks Meta every 5 minutes about templates still in review: `apps/worker/src/whatsapp/templates.ts`), campaign report 3 hours after start to owners + maker (worker `whatsapp/reports.ts`, `report_sent_at`). Inbox `/whatsapp/inbox` (`lib/whatsapp-inbox.ts` list/filters/chat, `lib/whatsapp-inbox-send.ts` replies; every incoming message is stored by the webhook with its media id; chat state on the contact: `chat_at`, `chat_preview`, `chat_from`, `unread`, `assigned_to`, `starred`, `chat_done_at`; free-form text/files only within 24h of their last message, templates any time; read receipts on open; notes `whatsapp_notes`, saved replies `whatsapp_saved_replies` ("/" in the composer); files shown through `/whatsapp/media/[id]`; the page polls every 5 s). Next: WhatsApp credits (Invytra paying Meta), WhatsApp chats in the workspace's unified inbox. Phase 0's engine is done (`docs/PHASE-0-POC.md`); its
7-day soak test still needs spare accounts and proxies.

## Tech stack

- Language: TypeScript everywhere (Node.js 20+, strict mode)
- Monorepo: pnpm workspaces + Turborepo
- Frontend: Next.js (App Router) + Tailwind + shadcn/ui
- API: Next.js server actions and route handlers (no separate API service — see docs/PHASE-1-PLAN.md)
- Worker: Node.js + Playwright (Chromium) + BullMQ
- Database: PostgreSQL + Prisma
- Queue / cache: Redis
- Local dev: Docker Compose (Postgres + Redis)
- Tests: Vitest (unit), Playwright test runner only for worker integration tests

## Folder structure

```
/apps/web        Next.js dashboard + API (server actions / route handlers)
/apps/worker     Automation engine: browsers, actions, queue, worker
/packages/db     Prisma schema + client
/packages/shared Shared types, constants, limits
/docs            Specs and decisions
```

## Architecture rules (always follow)

0. **Tenant isolation.** Every web query filters by the signed-in user's `workspaceId`
   (from `requireUser()`), passed as the first argument to helpers in `apps/web/src/lib/data.ts`.
   Never trust a workspace or account id from the URL or form without checking it belongs
   to that workspace.

0b. **One platform, many channels.** One account, one workspace, one sign-in; each
   outreach channel (LinkedIn, later WhatsApp, Email, Instagram) is a tool on its own
   subdomain, listed in `CHANNELS` (`packages/shared/src/channels.ts`). Every page, route and
   server action of a channel starts with `requireChannel("<id>")`. See `docs/CHANNELS.md`.

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
   Exception: a REPLY the user types in the dashboard inbox is sent right away at any hour
   (no daily limit; it still waits for the account's turn gap and never runs alongside
   another action on that account). REPLY is never retried automatically.
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
