#!/usr/bin/env bash
set -e

# Clean stale caches so Next doesn't expect files from a previous deploy (fixes
# "Cannot find module .../debug-env/route.ts", webpack PackFileCacheStrategy,
# and SWC/next-middleware-loader resolution errors).
echo "[BUILD HOOK] Cleaning .next and caches…" >> /var/log/eb-hooks.log
rm -rf .next
rm -rf node_modules/.cache
# Debug info
echo "[BUILD HOOK] PWD=$(pwd)"         >> /var/log/eb-hooks.log
echo "[BUILD HOOK] Listing files…"     >> /var/log/eb-hooks.log
ls -la                                 >> /var/log/eb-hooks.log

# Run Next.js build and tee output into the EB hooks log
yarn build 2>&1 | tee -a /var/log/eb-hooks.log
echo "[BUILD HOOK] Next.js build completed" >> /var/log/eb-hooks.log