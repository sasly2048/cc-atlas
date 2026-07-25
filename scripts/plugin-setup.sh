#!/usr/bin/env bash
# Installs cc-atlas's dependencies and builds it from source into the
# plugin's persistent data directory (${CLAUDE_PLUGIN_DATA}), which
# survives plugin updates — unlike ${CLAUDE_PLUGIN_ROOT}, which is
# replaced on every update and should be treated as read-only/ephemeral.
#
# Runs on every SessionStart (see hooks/hooks.json) but is a fast no-op
# after the first successful run: it only reinstalls/rebuilds when the
# bundled package.json differs from the copy left in the data directory
# (i.e. first run, or a plugin update that bumped a dependency).
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT not set — this script must run as a cc-atlas plugin hook}"
DATA="${CLAUDE_PLUGIN_DATA:?CLAUDE_PLUGIN_DATA not set — this script must run as a cc-atlas plugin hook}"

mkdir -p "$DATA"

if diff -q "$ROOT/package.json" "$DATA/package.json" >/dev/null 2>&1 && [ -f "$DATA/dist/cli.js" ]; then
  exit 0
fi

setup() {
  cd "$DATA"
  cp "$ROOT/package.json" .
  if [ -f "$ROOT/package-lock.json" ]; then
    cp "$ROOT/package-lock.json" .
  fi
  npm install --no-audit --no-fund --loglevel=error
  rm -rf "$DATA/dist"
  "$DATA/node_modules/.bin/tsc" -p "$ROOT/tsconfig.json" --outDir "$DATA/dist"
}

if setup; then
  echo "cc-atlas: ready." >&2
else
  # Remove the copied manifest so the diff check above fails next time,
  # forcing a retry instead of silently staying broken.
  rm -f "$DATA/package.json"
  echo "cc-atlas: setup failed — will retry next session. To retry now, run:" >&2
  echo "  bash \"$ROOT/scripts/plugin-setup.sh\"" >&2
fi
