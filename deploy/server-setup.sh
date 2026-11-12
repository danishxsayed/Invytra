#!/usr/bin/env bash
# One-time setup of an Invytra server (Ubuntu 24.04), run as root:
#   ssh root@<ip> "DOMAIN=invytra.com bash -s" < deploy/server-setup.sh
# Safe to run again: it never replaces the database password, .env or data.
#
# What it sets up: a non-root `invytra` user (the app runs as it), SSH keys only, a firewall
# (SSH, HTTP, HTTPS), fail2ban, automatic security updates, 4 GB swap, Node 22 + pnpm,
# PostgreSQL 16 and Redis (local only), ffmpeg, Chromium's libraries, Caddy (HTTPS for
# every subdomain), systemd services for the web app and the worker, nightly database
# backups, and a git repo you push to (`git push live main` builds and starts a release).
set -euo pipefail

DOMAIN="${DOMAIN:-invytra.com}"
APP_USER=invytra
HOME_DIR=/home/$APP_USER
PLAYWRIGHT_VERSION=1.56.1
export DEBIAN_FRONTEND=noninteractive

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }

say "System updates"
apt-get update -q
apt-get -yq upgrade
apt-get install -yq curl ca-certificates gnupg git ufw fail2ban unattended-upgrades ffmpeg python3 openssl debian-keyring debian-archive-keyring apt-transport-https postgresql redis-server

say "Automatic security updates"
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

say "Swap (4 GB) so builds don't run out of memory"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/90-invytra.conf

say "App user"
id $APP_USER >/dev/null 2>&1 || adduser --disabled-password --gecos "" $APP_USER
install -d -m 700 -o $APP_USER -g $APP_USER $HOME_DIR/.ssh
if [ -s /root/.ssh/authorized_keys ]; then
  cat /root/.ssh/authorized_keys >> $HOME_DIR/.ssh/authorized_keys
  sort -u $HOME_DIR/.ssh/authorized_keys -o $HOME_DIR/.ssh/authorized_keys
  chown $APP_USER:$APP_USER $HOME_DIR/.ssh/authorized_keys && chmod 600 $HOME_DIR/.ssh/authorized_keys
fi
for d in shared data data/videos backups releases bin; do install -d -o $APP_USER -g $APP_USER $HOME_DIR/$d; done
cat > /etc/sudoers.d/invytra <<SUDO
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart invytra-web, /usr/bin/systemctl restart invytra-worker, /usr/bin/systemctl status invytra-web, /usr/bin/systemctl status invytra-worker
SUDO
chmod 440 /etc/sudoers.d/invytra

say "SSH: keys only (no passwords)"
if [ -s /root/.ssh/authorized_keys ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-invytra.conf
  systemctl reload ssh
else
  echo "No SSH key for root yet: password login left on. Add a key, then run this again."
fi

say "Firewall"
ufw default deny incoming >/dev/null && ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

say "Node 22 and pnpm"
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi
npm install -g pnpm@9.15.4 >/dev/null

say "Chromium libraries (for the worker's browsers)"
npx -y playwright@$PLAYWRIGHT_VERSION install-deps chromium >/dev/null

say "PostgreSQL and Redis (reachable only from this server)"
sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
systemctl enable --now postgresql redis-server >/dev/null
systemctl restart redis-server
ENV_FILE=$HOME_DIR/shared/.env
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS=$(openssl rand -hex 24)
  sudo -u postgres psql -qtc "SELECT 1 FROM pg_roles WHERE rolname='invytra'" | grep -q 1 \
    && sudo -u postgres psql -qc "ALTER ROLE invytra WITH LOGIN PASSWORD '$DB_PASS'" \
    || sudo -u postgres psql -qc "CREATE ROLE invytra LOGIN PASSWORD '$DB_PASS'"
  sudo -u postgres psql -qtc "SELECT 1 FROM pg_database WHERE datname='invytra'" | grep -q 1 || sudo -u postgres createdb -O invytra invytra
  cat > "$ENV_FILE" <<ENV
# Production settings (made by deploy/server-setup.sh). API keys are added by deploy/go-live.sh.
DATABASE_URL="postgresql://invytra:$DB_PASS@127.0.0.1:5432/invytra?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
SESSION_ENCRYPTION_KEY="$(openssl rand -base64 32)"
DATA_DIR="$HOME_DIR/data"
VIDEO_DIR="$HOME_DIR/data/videos"
HEADLESS="true"
ALLOW_NO_PROXY="false"
IGNORE_WORKING_HOURS="false"
ROOT_DOMAIN="$DOMAIN"
WEB_ORIGIN="https://app.$DOMAIN,https://linkedin.$DOMAIN,https://email.$DOMAIN"
PUBLIC_URL="https://app.$DOMAIN"
CONNECT_PORT="3001"
CONNECT_WS_URL="wss://connect.$DOMAIN"
ENV
  chown $APP_USER:$APP_USER "$ENV_FILE" && chmod 600 "$ENV_FILE"
fi

say "Helper: add API keys to .env without showing them"
cat > $HOME_DIR/bin/merge-env <<'PY'
#!/usr/bin/env python3
# Reads KEY=VALUE lines on stdin and sets them in ~/shared/.env (replacing old values).
import os, re, sys
path = os.path.expanduser("~/shared/.env")
new = {}
for line in sys.stdin:
    m = re.match(r"^([A-Z][A-Z0-9_]*)=(.*)$", line.rstrip("\n"))
    if m and m.group(2).strip():
        new[m.group(1)] = line.rstrip("\n")
lines = open(path).read().splitlines() if os.path.exists(path) else []
out = [l for l in lines if l.split("=", 1)[0] not in new]
out += list(new.values())
tmp = path + ".tmp"
with open(tmp, "w") as f:
    f.write("\n".join(out) + "\n")
os.chmod(tmp, 0o600)
os.replace(tmp, path)
print(f"Set {len(new)} keys: {', '.join(sorted(new))}")
PY
chmod 755 $HOME_DIR/bin/merge-env && chown $APP_USER:$APP_USER $HOME_DIR/bin/merge-env

say "Git repo to push to (git push live main = deploy)"
REPO=$HOME_DIR/invytra.git
[ -d $REPO ] || sudo -u $APP_USER git init -q --bare $REPO
cat > $REPO/hooks/post-receive <<'HOOK'
#!/usr/bin/env bash
# Builds and starts each push to main as a new release (see deploy/deploy.sh).
set -euo pipefail
unset GIT_DIR
while read -r _old new ref; do
  [ "$ref" = "refs/heads/main" ] || { echo "Ignoring $ref (only main is deployed)."; continue; }
  REL=$HOME/releases/$(date +%Y%m%d-%H%M%S)-${new:0:7}
  mkdir -p "$REL"
  git --git-dir="$HOME/invytra.git" --work-tree="$REL" checkout -q -f "$new"
  exec 9>"$HOME/.deploy.lock"; flock -n 9 || { echo "Another deploy is running. Try again in a few minutes."; exit 1; }
  bash "$REL/deploy/deploy.sh" "$REL"
done
HOOK
chmod 755 $REPO/hooks/post-receive && chown -R $APP_USER:$APP_USER $REPO

say "Services"
cat > /etc/systemd/system/invytra-web.service <<UNIT
[Unit]
Description=Invytra web app
After=network.target postgresql.service redis-server.service

[Service]
User=$APP_USER
WorkingDirectory=$HOME_DIR/current/apps/web
Environment=NODE_ENV=production
ExecStart=$HOME_DIR/current/apps/web/node_modules/.bin/next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/invytra-worker.service <<UNIT
[Unit]
Description=Invytra worker (outreach jobs, email, Ask Invy, login windows)
After=network.target postgresql.service redis-server.service

[Service]
User=$APP_USER
WorkingDirectory=$HOME_DIR/current/apps/worker
Environment=NODE_ENV=production
ExecStart=$HOME_DIR/current/apps/worker/node_modules/.bin/tsx src/worker.ts
Restart=always
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=90

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable invytra-web invytra-worker >/dev/null 2>&1

say "Caddy (HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi
cat > /etc/caddy/Caddyfile <<CADDY
# Invytra: the website, the workspace and each channel go to the web app; connect.
# carries the live LinkedIn login windows to the worker. Certificates are automatic.
$DOMAIN, app.$DOMAIN, linkedin.$DOMAIN, email.$DOMAIN, whatsapp.$DOMAIN, instagram.$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
connect.$DOMAIN {
	reverse_proxy 127.0.0.1:3001
}
CADDY
systemctl enable caddy >/dev/null 2>&1 && systemctl reload-or-restart caddy

say "Nightly database backup (02:30 server time, 14 days kept)"
cat > $HOME_DIR/bin/backup-db <<'SH'
#!/usr/bin/env bash
set -euo pipefail
URL=$(grep '^DATABASE_URL=' "$HOME/shared/.env" | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')
pg_dump "$URL" -Fc -f "$HOME/backups/invytra-$(date +%Y%m%d-%H%M).dump"
find "$HOME/backups" -name 'invytra-*.dump' -mtime +14 -delete
SH
chmod 755 $HOME_DIR/bin/backup-db && chown $APP_USER:$APP_USER $HOME_DIR/bin/backup-db
echo "30 2 * * * $HOME_DIR/bin/backup-db" | crontab -u $APP_USER -

say "Done. Server is ready for: git push live main"
