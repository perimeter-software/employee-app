#!/usr/bin/env bash
set -e

echo "[YARN HOOK] Installing dependencies"
yarn install --frozen-lockfile
