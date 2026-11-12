# Deploying Invytra

One server (Hostinger KVM, Ubuntu 24.04) runs everything: the web app (website, workspace,
channels), the worker, PostgreSQL, Redis and Caddy (HTTPS). Files: `deploy/`.

## DNS (once)

At the domain registrar: `A @ → <server IP>` and `A * → <server IP>` (every subdomain).

## First time (from the Mac, in the Invytra folder)

    bash deploy/go-live.sh <server IP>

1. `deploy/server-setup.sh` runs on the server as root: `invytra` user, SSH keys only, firewall
   (22, 80, 443), fail2ban, security updates, 4 GB swap, Node 22 + pnpm, Postgres + Redis (local
   only), ffmpeg, Chromium libraries, Caddy, systemd services, nightly DB backup, and a git repo
   to push to. It writes the server's own `~/shared/.env` (new database password and encryption
   key). Safe to run again.
2. API keys are copied from the Mac's `.env` to the server's (values never printed).
3. `git push live main` builds and starts the first release.

## Every update

    git push live main

The server builds a new release in `~/releases/`, runs database migrations, switches
`~/current` to it, restarts `invytra-web` and `invytra-worker`, and goes back to the previous
release if the new one doesn't answer. The last 3 releases are kept.

## Useful commands (ssh invytra@<server IP>)

- Logs: `journalctl -u invytra-web -f`, `journalctl -u invytra-worker -f`
- Restart: `sudo systemctl restart invytra-web` / `invytra-worker`
- Settings: `nano ~/shared/.env`, then restart both. New API keys from the Mac:
  `bash deploy/go-live.sh <ip> --keys`, then restart.
- Backups: `~/backups/invytra-*.dump` (02:30 daily, 14 days). Restore:
  `pg_restore --clean -d "<DATABASE_URL without ?schema=public>" <file>`
- Credits by hand: `cd ~/current && pnpm credits:add …`

## Addresses

`invytra.com` website · `app.` workspace · `linkedin.`, `email.` channels · `connect.` live
LinkedIn login windows (to the worker on port 3001). The Google Maps browser key must allow
`https://*.invytra.com/*` and `https://invytra.com/*`.
