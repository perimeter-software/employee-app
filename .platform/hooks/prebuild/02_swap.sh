#!/usr/bin/env bash
# Add swap so the instance has headroom under memory pressure.
# Idempotent, persists across reboots via fstab. Non-fatal: swap failure does not block deploy.
set -e

SWAP_FILE=/var/swapfile
SWAP_SIZE_MB=2048
FSTAB_ENTRY="/var/swapfile none swap sw 0 0"

# Already active
if grep -q "$SWAP_FILE" /proc/swaps 2>/dev/null; then
  echo "[SWAP] Swap already active at $SWAP_FILE"
  exit 0
fi

# Create swap file if missing
if [ ! -f "$SWAP_FILE" ]; then
  echo "[SWAP] Creating ${SWAP_SIZE_MB}MB swap file at $SWAP_FILE"
  if command -v fallocate >/dev/null 2>&1; then
    fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null || true
  fi
  if [ ! -s "$SWAP_FILE" ]; then
    dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=none 2>/dev/null || true
  fi
  if [ ! -s "$SWAP_FILE" ]; then
    echo "[SWAP] Could not create swap file (non-fatal)"
    exit 0
  fi
  chmod 600 "$SWAP_FILE"
fi

# Initialize and enable
if ! grep -q "$SWAP_FILE" /proc/swaps 2>/dev/null; then
  mkswap "$SWAP_FILE" 2>/dev/null || true
  swapon "$SWAP_FILE" 2>/dev/null || true
  if grep -q "$SWAP_FILE" /proc/swaps 2>/dev/null; then
    echo "[SWAP] Swap enabled (${SWAP_SIZE_MB}MB)"
    # Persist across reboots
    if ! grep -q "^$FSTAB_ENTRY" /etc/fstab 2>/dev/null; then
      echo "$FSTAB_ENTRY" >> /etc/fstab
      echo "[SWAP] Added to /etc/fstab"
    fi
  else
    echo "[SWAP] Could not enable swap (non-fatal)"
  fi
fi
exit 0
