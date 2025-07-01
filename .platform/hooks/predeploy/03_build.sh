#!/usr/bin/env bash
set -e

# Debug info
echo "[BUILD HOOK] PWD=$(pwd)"         >> /var/log/eb-hooks.log
echo "[BUILD HOOK] Listing files…"     >> /var/log/eb-hooks.log
ls -la                                 >> /var/log/eb-hooks.log

# Run Next.js build and tee output into the EB hooks log
yarn build 2>&1 | tee -a /var/log/eb-hooks.log
echo "[BUILD HOOK] Next.js build completed" >> /var/log/eb-hooks.log