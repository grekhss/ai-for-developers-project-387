#!/bin/sh
set -e

# Ensure data directory exists and has correct permissions
mkdir -p /app/data
chown -R node:node /app/data 2>/dev/null || true

# If running as root (e.g. in some environments), drop to node
if [ "$(id -u)" = "0" ]; then
  exec gosu node "$@"
fi

exec "$@"
