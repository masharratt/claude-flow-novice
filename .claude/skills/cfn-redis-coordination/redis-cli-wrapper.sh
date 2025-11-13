#!/bin/bash
# Wrapper for redis-cli that enforces environment variable usage
# This ensures all Redis commands use REDIS_HOST/REDIS_PORT instead of hardcoded localhost:6379
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

exec redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "$@"
