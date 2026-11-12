#!/usr/bin/env bash
# Builds a release (run by the server's git hook on `git push live main`), switches to it,
# restarts the web app and the worker, and goes back to the previous release if the new one
# doesn't answer.
set -euo pipefail
REL="$1"
cd "$REL"
step() { printf '\n\033[1m--> %s\033[0m\n' "$*"; }

ln -sf "$HOME/shared/.env" .env
step "Installing packages"
pnpm install --frozen-lockfile --reporter=append-only 2>&1 | tail -n 3
step "Database changes"
pnpm --filter @invytra/db migrate:deploy 2>&1 | tail -n 3
step "Building"
pnpm exec turbo run build --filter=@invytra/db --filter=@invytra/shared --output-logs=errors-only
pnpm --filter @invytra/worker browsers:install >/dev/null
NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @invytra/web build 2>&1 | grep -E "Compiled|error|Error|warn" | grep -v "^$" | tail -n 15 || true
[ -f apps/web/.next/BUILD_ID ] || { echo "Web build failed. The live site is unchanged."; exit 1; }

step "Starting the new release"
PREV=$(readlink -f "$HOME/current" 2>/dev/null || true)
ln -sfn "$REL" "$HOME/current.new" && mv -T "$HOME/current.new" "$HOME/current"
sudo /usr/bin/systemctl restart invytra-web
sudo /usr/bin/systemctl restart invytra-worker

DOMAIN=$(grep '^ROOT_DOMAIN=' .env | cut -d= -f2- | tr -d '"')
ok=""
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -H "Host: app.$DOMAIN" http://127.0.0.1:3000/login; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "The new release didn't start."
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    echo "Going back to the previous release."
    ln -sfn "$PREV" "$HOME/current.new" && mv -T "$HOME/current.new" "$HOME/current"
    sudo /usr/bin/systemctl restart invytra-web
    sudo /usr/bin/systemctl restart invytra-worker
  fi
  exit 1
fi

# Keep the last 3 releases (for going back by hand).
CUR=$(readlink -f "$HOME/current")
ls -1dt "$HOME"/releases/*/ | sed 's#/$##' | grep -vxF "$CUR" | tail -n +3 | xargs -r rm -rf
step "Live: https://app.$DOMAIN ($(basename "$REL"))"
