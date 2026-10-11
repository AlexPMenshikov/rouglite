#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required. Install it from https://nodejs.org/" >&2
  exit 1
fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  echo "Node.js 18 or newer is required. Install it from https://nodejs.org/" >&2
  exit 1
fi

if [ ! -f node_modules/ws/package.json ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to install the LAN server dependency." >&2
    exit 1
  fi
  npm install
fi

exec node server.js
