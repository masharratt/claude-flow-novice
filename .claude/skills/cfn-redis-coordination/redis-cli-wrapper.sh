#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: redis-client.ts
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################

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

# Smart AUTH detection - test Redis connectivity and auth requirements
AUTH_ARGS=()

# First, test if Redis is reachable at all (no auth)
if timeout 1 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then
    # Redis accepts no-auth connections - use it directly
    AUTH_ARGS=()
elif [ -n "$REDIS_PASSWORD" ]; then
    # Redis rejected no-auth, try with password
    AUTH_ARGS=("-a" "$REDIS_PASSWORD")
    if ! timeout 1 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${AUTH_ARGS[@]}" ping &>/dev/null; then
        # Password provided but AUTH failed - likely wrong password or Redis down
        # Treat as unavailable (soft fail for Task mode compatibility)
        echo "⚠️ Redis unavailable - command skipped (soft fail)" >&2
        echo "💡 This is expected in Task mode (Main Chat coordination)" >&2
        echo "🔧 Agents should output JSON directly instead of Redis coordination" >&2
        exit 0  # Soft fail - don't break agent execution
    fi
    # Auth successful with password
else
    # Redis requires auth but no password provided, OR Redis is completely down
    # Treat as unavailable (soft fail for Task mode compatibility)
    echo "⚠️ Redis unavailable - command skipped (soft fail)" >&2
    echo "💡 This is expected in Task mode (Main Chat coordination)" >&2
    echo "🔧 Agents should output JSON directly instead of Redis coordination" >&2
    exit 0  # Soft fail - don't break agent execution
fi

# Redis available and auth validated (if needed) - execute command normally
exec redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${AUTH_ARGS[@]}" "$@"
