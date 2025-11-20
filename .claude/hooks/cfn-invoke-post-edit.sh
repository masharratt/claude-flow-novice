#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/post-edit-hook.js
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

#
# Post-Edit Hook Invocation Script
# Simplifies calling the post-edit pipeline from any agent
#
# Usage:
#   ./.claude/hooks/invoke-post-edit.sh <file_path> [--agent-id <id>] [--blocking]
#
# Examples:
#   ./.claude/hooks/invoke-post-edit.sh src/file.ts
#   ./.claude/hooks/invoke-post-edit.sh src/file.ts --agent-id "coder-1"
#   ./.claude/hooks/invoke-post-edit.sh src/file.ts --blocking

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/cfn-post-edit.config.json"

# Parse arguments
FILE_PATH=""
AGENT_ID="${AGENT_ID:-unknown}"
BLOCKING=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --blocking)
            BLOCKING=true
            shift
            ;;
        *)
            FILE_PATH="$1"
            shift
            ;;
    esac
done

# Validate file path
if [ -z "$FILE_PATH" ]; then
    echo "Error: File path required"
    echo "Usage: $0 <file_path> [--agent-id <id>] [--blocking]"
    exit 1
fi

# Check if hooks are enabled
ENABLED=$(jq -r '.enabled // true' "$CONFIG_FILE" 2>/dev/null || echo "true")
if [ "$ENABLED" != "true" ]; then
    echo "Post-edit hooks disabled in config"
    exit 0
fi

# Get pipeline path from config
PIPELINE=$(jq -r '.pipeline // "config/hooks/post-edit-pipeline.js"' "$CONFIG_FILE")

# Build memory key
MEMORY_KEY="swarm/${AGENT_ID}/hook-results"

# Execute pipeline
echo "Running post-edit validation: $FILE_PATH"
EXIT_CODE=0
node "$PIPELINE" "$FILE_PATH" --memory-key "$MEMORY_KEY" || EXIT_CODE=$?

# Handle exit codes based on blocking mode
if [ "$BLOCKING" = true ] && [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Post-edit validation failed (blocking mode)"
    exit $EXIT_CODE
fi

# Publish to Redis if enabled
REDIS_ENABLED=$(jq -r '.redis.enabled // false' "$CONFIG_FILE")
if [ "$REDIS_ENABLED" = "true" ] && command -v redis-cli >/dev/null 2>&1; then
    CHANNEL=$(jq -r '.redis.publishChannel // "swarm:hooks:post-edit"' "$CONFIG_FILE")
    MESSAGE=$(jq -n \
        --arg file "$FILE_PATH" \
        --arg agent "$AGENT_ID" \
        --arg exit "$EXIT_CODE" \
        --arg ts "$(date +%s)" \
        '{file: $file, agentId: $agent, exitCode: $exit, timestamp: $ts}')

    echo "$MESSAGE" | redis-cli -x PUBLISH "$CHANNEL" >/dev/null 2>&1 || true
fi

echo "✅ Post-edit validation complete (exit code: $EXIT_CODE)"
exit 0  # Always exit 0 unless blocking mode
