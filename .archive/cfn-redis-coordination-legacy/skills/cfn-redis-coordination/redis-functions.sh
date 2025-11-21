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
# Support both REDIS_HOST and CFN_REDIS_HOST (TypeScript uses CFN_REDIS_HOST)
export REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-localhost}}"
export REDIS_PORT="${CFN_REDIS_PORT:-${REDIS_PORT:-6379}}"

# Helper: Check if Redis is available (useful for conditional logic)
is_redis_available() {
    timeout 1 "${REDIS_FUNCTIONS_DIR}/redis-cli-wrapper.sh" ping &>/dev/null
    return $?
}

export -f is_redis_available
