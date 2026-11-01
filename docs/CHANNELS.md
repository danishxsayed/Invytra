# Omnichannel platform: one account, one workspace, many channels

Invytra is one platform with several outreach tools ("channels"). A user has **one account**
and **one sign-in**; their **workspace** owns everything; each channel is a tool on its own
subdomain.

| Address | What |
|---|---|
| `invytra.com` | Public website |
| `app.invytra.com` | Workspace hub (lands here after signing in), log in, sign up |
| `linkedin.invytra.com` | LinkedIn Outreach (live) |
| `email.invytra.com` | Email Outreach (live): mailboxes on the customer's own domains (`apps/web/src/app/email`, `packages/db/src/mailbox.ts`) |
| `whatsapp.` / `instagram.invytra.com` | Upcoming channels (cards shown disabled; the subdomain sends you to the hub) |

## How it fits together

- **Channel registry** — `packages/shared/src/channels.ts` (`CHANNELS`): id, name,
  description, status (`live` / `soon`), subdomain, base path, button text. The hub, the
  host routing and the access checks all read it. **Adding a channel = one entry here** plus
  its app; nothing in the hub changes.
- **Host routing** — `apps/web/src/lib/routing.ts` (pure, tested) applied by
  `src/middleware.ts`: decides by Host which part of the platform answers, rewrites
  `linkedin.<domain>/inbox` to the LinkedIn pages, sends signed-out visitors of the hub and
  channels to `app.<domain>/login?next=…`, and moves old links to the right subdomain.
- **One session** — `startSession` sets the signed session cookie on the parent domain
  (`.invytra.com`, from `ROOT_DOMAIN`), so every subdomain sees it. It holds only the user
  and workspace ids (HS256, `SESSION_ENCRYPTION_KEY`-derived key). Every request re-reads the
  membership, role, plan and channels from the database (`currentUser`), so removing someone
  or changing a plan takes effect at once. Signing out on any subdomain signs out everywhere.
- **Access** — `Workspace.channels` lists the channels a workspace's subscription includes
  (default `["linkedin"]`). `canUseChannel` (shared) = launched **and** included. Every page,
  route and server action of a channel starts with `requireChannel("<id>")`; all data is
  still filtered by the session's workspace id (CLAUDE.md rule 0).
- **After sign-in** — `safeNext` only allows a path on this site or a page on one of our own
  subdomains (no open redirects); otherwise the hub.
- **Status on the hub** — `apps/web/src/lib/channel-status.ts`: one small reader per channel
  ("2 accounts connected · 1 active campaign"). A channel without one shows "Ready to set up".

## Adding a channel (e.g. WhatsApp)

1. Set its entry in `CHANNELS` to `status: "live"`.
2. Build its pages under its `basePath` (`/whatsapp/...`) in this app, starting each page and
   server action with `requireChannel("whatsapp")` — or as a separate app on its subdomain
   that verifies the same session cookie with the same key (`lib/session-token.ts`) and reads
   the user/workspace from the shared database.
3. Add its status reader in `channel-status.ts` and its logo in `components/ChannelLogo.tsx`.
4. Include `"whatsapp"` in `Workspace.channels` for the packages that get it.

## Configuration

- `ROOT_DOMAIN` — e.g. `invytra.com` in production. Unset = everything on one address
  (local development as before: hub at `/workspace`, LinkedIn at `/app`).
- To try subdomains on your own computer: `ROOT_DOMAIN="lvh.me:3000"` and
  `WEB_ORIGIN="http://app.lvh.me:3000"`, then open http://app.lvh.me:3000 (lvh.me and its
  subdomains point to your own computer).
- DNS in production: `invytra.com`, `app.`, `linkedin.` (and future channel subdomains, or a
  wildcard `*.invytra.com`) all point to the web server; HTTPS for all of them (a wildcard
  certificate is simplest). `WEB_ORIGIN` starts with `https://` so cookies are Secure.
