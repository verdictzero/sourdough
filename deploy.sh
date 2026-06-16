#!/usr/bin/env bash
#
# One-command deploy of Sourdough to DreamHost shared hosting.
#
# Usage:
#   REMOTE=sshuser@yourserver.dreamhost.com ./deploy.sh
#
# Optional overrides:
#   APPDIR=sourdough.vaportrash.net   # app dir relative to the server home
#
# What it does: sync source up (keeping the server's node_modules/.next/data),
# then build and restart Passenger on the server. Building on the server avoids
# cross-architecture issues (your Pi is arm64, DreamHost is x86-64).
#
# If `npm run build` gets killed by shared-hosting memory limits, switch to the
# LOCAL-BUILD path noted at the bottom of this script.

set -euo pipefail

REMOTE="${REMOTE:?Set REMOTE=sshuser@yourserver (find the SSH user in the DreamHost panel > Users)}"
APPDIR="${APPDIR:-sourdough.vaportrash.net}"

echo "▶ Syncing source → ${REMOTE}:~/${APPDIR} (excluding node_modules/.next/data) ..."
rsync -avz --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'data' \
  --exclude '.env*' \
  ./ "${REMOTE}:${APPDIR}/"

echo "▶ Installing deps, building, restarting Passenger on the server ..."
# NODE_OPTIONS=--jitless: DreamHost shared blocks V8's JIT, so Node must run
# without it (build + runtime). See deploy/dreamhost-setup.sh for the full setup.
ssh "${REMOTE}" "bash -lc 'cd ${APPDIR} && export NODE_OPTIONS=--jitless && npm ci && npm run build && mkdir -p tmp && touch tmp/restart.txt'"

echo "✓ Deployed → https://sourdough.vaportrash.net"

# ----------------------------------------------------------------------------
# LOCAL-BUILD fallback (if the server can't build within its memory limit):
#   1. Build on the Pi:           npm ci && npm run build
#   2. In the rsync above, REMOVE the `--exclude '.next'` line so .next uploads.
#   3. Replace the ssh line with: ssh "${REMOTE}" "bash -lc 'cd ${APPDIR} && \
#        npm ci --omit=dev && mkdir -p tmp && touch tmp/restart.txt'"
# (The .next build output is portable across architectures; only the build
#  toolchain is native, and that's not needed to *serve* a prebuilt app.)
# ----------------------------------------------------------------------------
