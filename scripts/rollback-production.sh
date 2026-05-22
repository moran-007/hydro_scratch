#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-}"
ADDONS_DIR="${HYDRO_ADDONS_DIR:-$HOME/.hydro/addons}"
PLUGIN_NAME="${HYDRO_PLUGIN_NAME:-hydro-plugin-scratch}"
TARGET_DIR="$ADDONS_DIR/$PLUGIN_NAME"

if [[ -z "$BACKUP_DIR" ]]; then
  echo "Usage: $0 /path/to/hydro-plugin-scratch.bak.YYYYmmddHHMMSS" >&2
  exit 2
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory not found: $BACKUP_DIR" >&2
  exit 2
fi

if command -v hydrooj >/dev/null 2>&1; then
  hydrooj addon remove "$TARGET_DIR" || true
fi

rm -rf "$TARGET_DIR"
mv "$BACKUP_DIR" "$TARGET_DIR"

if command -v hydrooj >/dev/null 2>&1; then
  hydrooj addon add "$TARGET_DIR"
fi

echo "Rolled back plugin to $TARGET_DIR"
echo "Restart Hydro with your server's process manager."

