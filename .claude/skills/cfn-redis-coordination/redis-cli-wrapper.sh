#!/bin/bash
# Wrapper for redis-cli with graceful fallback for Task mode
# Enforces environment variable usage and handles Redis unavailability
#
# ANTI-023 Memory Leak Protection:
# - Task mode: Redis unavailable → soft fail (exit 0)
# - CLI/Docker mode: Redis available → normal execution
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-${CFN_REDIS_PASSWORD:-}}"  # Support both env vars

# Build auth arguments for redis-cli
AUTH_ARGS=()
if [ -n "$REDIS_PASSWORD" ]; then
    AUTH_ARGS=("-a" "$REDIS_PASSWORD")
fi

# Graceful Redis availability check (1 second timeout, with auth if provided)
if ! timeout 1 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${AUTH_ARGS[@]}" ping &>/dev/null; then
    # Redis unavailable - likely Task mode or Redis service down
    echo "⚠️ Redis unavailable - command skipped (soft fail)" >&2
    echo "💡 This is expected in Task mode (Main Chat coordination)" >&2
    echo "🔧 Agents should output JSON directly instead of Redis coordination" >&2
    exit 0  # Soft fail - don't break agent execution
fi

# Redis available - execute command normally (CLI/Docker mode, with auth if provided)
exec redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${AUTH_ARGS[@]}" "$@"
