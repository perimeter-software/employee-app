#!/usr/bin/env bash
set -e

# Debug info
echo "[BUILD HOOK] PWD=$(pwd)"         >> /var/log/eb-hooks.log
echo "[BUILD HOOK] Listing files…"     >> /var/log/eb-hooks.log
ls -la                                 >> /var/log/eb-hooks.log

# Cap Node heap so the instance stays responsive (avoids OOM/hang during deploy)
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=2048"

# Run Next.js build and tee output into the EB hooks log
yarn build 2>&1 | tee -a /var/log/eb-hooks.log
echo "[BUILD HOOK] Next.js build completed" >> /var/log/eb-hooks.log