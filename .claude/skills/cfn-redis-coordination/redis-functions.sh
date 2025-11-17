#!/bin/bash
# Centralized Redis functions for CFN Loop coordination
# Source this file in coordination scripts to get graceful Redis fallback
#
# Usage:
#   source ./.claude/skills/cfn-redis-coordination/redis-functions.sh
#   redis-cli LPUSH "key" "value"  # Automatically uses wrapper with fallback
#
# ANTI-023 Memory Leak Protection:
# All redis-cli calls automatically fail gracefully in Task mode

# Get the directory where this script is located
REDIS_FUNCTIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Override redis-cli to always use the wrapper
redis-cli() {
    "${REDIS_FUNCTIONS_DIR}/redis-cli-wrapper.sh" "$@"
}

# Export the function so it's available in subshells
export -f redis-cli

# Optional: Set Redis connection defaults
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"

# Helper: Check if Redis is available (useful for conditional logic)
is_redis_available() {
    timeout 1 "${REDIS_FUNCTIONS_DIR}/redis-cli-wrapper.sh" ping &>/dev/null
    return $?
}

export -f is_redis_available
