#!/usr/bin/env bash
# Next.js is built in CI — nothing to do here.
echo "[BUILD HOOK] Skipping build — .next already included in deployment bundle." >> /var/log/eb-hooks.log
