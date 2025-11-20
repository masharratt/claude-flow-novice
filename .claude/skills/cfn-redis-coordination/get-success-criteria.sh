#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: coordination-wrapper.js
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

set -euo pipefail

# Retrieve success criteria from Redis
# Usage: get-success-criteria.sh --task-id TASK_ID
# Output: JSON string (stdout) or error message (stderr)

TASK_ID=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        *)
            echo "❌ Unknown option: $1" >&2
            echo "Usage: get-success-criteria.sh --task-id TASK_ID" >&2
            exit 1
            ;;
    esac
done

# Validate input
if [[ -z "$TASK_ID" ]]; then
    echo "❌ --task-id required" >&2
    exit 1
fi

# SECURITY FIX: Validate TASK_ID format (prevent Redis key injection)
if ! [[ "$TASK_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "❌ Invalid TASK_ID format: $TASK_ID (must be alphanumeric, dash, underscore only)" >&2
    exit 1
fi

# Retrieve from Redis
REDIS_KEY="swarm:${TASK_ID}:config:success_criteria"
CRITERIA=$(redis-cli GET "$REDIS_KEY" 2>/dev/null || echo "")

# Check if criteria exists
if [[ -z "$CRITERIA" ]] || [[ "$CRITERIA" == "null" ]]; then
    echo "⚠️  No success criteria found for task $TASK_ID" >&2
    exit 1
fi

# Validate JSON before output
if ! echo "$CRITERIA" | jq empty 2>/dev/null; then
    echo "❌ Invalid JSON in stored criteria" >&2
    exit 1
fi

# Output to stdout (clean output for piping)
echo "$CRITERIA"
