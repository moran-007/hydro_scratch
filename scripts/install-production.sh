#!/usr/bin/env bash
set -euo pipefail

PACKAGE_PATH="${1:-}"
ADDONS_DIR="${HYDRO_ADDONS_DIR:-$HOME/.hydro/addons}"
PLUGIN_NAME="${HYDRO_PLUGIN_NAME:-hydro-plugin-scratch}"
TARGET_DIR="$ADDONS_DIR/$PLUGIN_NAME"
BACKUP_DIR="$ADDONS_DIR/${PLUGIN_NAME}.bak.$(date +%Y%m%d%H%M%S)"

if [[ -z "$PACKAGE_PATH" ]]; then
  echo "Usage: $0 /path/to/hydro-plugin-scratch-0.2.4.tgz" >&2
  exit 2
fi

if [[ ! -f "$PACKAGE_PATH" ]]; then
  echo "Package not found: $PACKAGE_PATH" >&2
  exit 2
fi

if ! command -v hydrooj >/dev/null 2>&1; then
  echo "hydrooj command not found. Run this as the Hydro runtime user on the server." >&2
  exit 2
fi

if ! command -v yarn >/dev/null 2>&1; then
  echo "yarn command not found. Hydro addon installation expects Yarn 1.x." >&2
  exit 2
fi

YARN_MAJOR="$(yarn --version | cut -d. -f1)"
if [[ "$YARN_MAJOR" != "1" ]]; then
  echo "Yarn 1.x is required, found: $(yarn --version)" >&2
  exit 2
fi

mkdir -p "$ADDONS_DIR"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Backing up existing plugin to $BACKUP_DIR"
  mv "$TARGET_DIR" "$BACKUP_DIR"
fi

mkdir -p "$TARGET_DIR"
tar -xzf "$PACKAGE_PATH" -C "$TARGET_DIR" --strip-components=1

if [[ ! -f "$TARGET_DIR/package.json" || ! -f "$TARGET_DIR/index.js" ]]; then
  echo "Invalid plugin package after extraction." >&2
  [[ -d "$BACKUP_DIR" ]] && rm -rf "$TARGET_DIR" && mv "$BACKUP_DIR" "$TARGET_DIR"
  exit 1
fi

echo "Installing production dependencies..."
yarn --production --cwd "$TARGET_DIR"

echo "Registering Hydro addon..."
hydrooj addon add "$TARGET_DIR"

cat <<EOF
Plugin installed at:
  $TARGET_DIR

Backup:
  ${BACKUP_DIR:-none}

Next step:
  Restart Hydro with your server's process manager, then check logs.
EOF
