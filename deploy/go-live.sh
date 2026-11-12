#!/usr/bin/env bash
# Run on your Mac, from the Invytra folder:
#   bash deploy/go-live.sh 200.141.14.28            (first time: sets up the server, then deploys)
#   bash deploy/go-live.sh 200.141.14.28 --keys     (only copy API keys again, e.g. after adding one)
# After the first time, deploy updates with:  git push live main
set -euo pipefail
IP="${1:?Usage: bash deploy/go-live.sh <server-ip> [--keys]}"
DOMAIN="${DOMAIN:-invytra.com}"
cd "$(dirname "$0")/.."

# API keys copied from your .env to the server's (values never shown). Local-only settings
# (database, Redis, encryption key, dev flags) are not copied: the server has its own.
KEYS='^(UNIPILE_DSN|UNIPILE_API_KEY|OPENAI_API_KEY|OPENAI_MODEL|RESEND_API_KEY|PLATFORM_EMAIL_FROM|PLATFORM_SMTP_[A-Z]+|REOON_API_KEY|MILLIONVERIFIER_API_KEY|ELEVENLABS_API_KEY|ELEVENLABS_MODEL|HEYGEN_API_KEY|HEYGEN_LIPSYNC_MODE|SYNC_API_KEY|SYNC_MODEL|LIPSYNC_PROVIDER|RAZORPAY_KEY_ID|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|INVOICE_SELLER_[A-Z]+|GOOGLE_MAPS_API_KEY|NEXT_PUBLIC_GOOGLE_MAPS_KEY|NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID|OPENAI_[A-Z_]+)='
copy_keys() {
  echo "==> Copying API keys to the server"
  grep -E "$KEYS" .env | ssh "invytra@$IP" 'bin/merge-env'
}

if [ "${2:-}" = "--keys" ]; then copy_keys; exit 0; fi

echo "==> 1/3 Setting up the server (5-10 minutes)"
ssh -o StrictHostKeyChecking=accept-new "root@$IP" "DOMAIN=$DOMAIN bash -s" < deploy/server-setup.sh

echo "==> 2/3 API keys"
copy_keys

echo "==> 3/3 First deploy (build takes 5-10 minutes)"
git remote get-url live >/dev/null 2>&1 && git remote set-url live "invytra@$IP:invytra.git" || git remote add live "invytra@$IP:invytra.git"
git push live main

echo
echo "Live: https://$DOMAIN  ·  workspace: https://app.$DOMAIN"
echo "From now on, to deploy changes:  git push live main"
