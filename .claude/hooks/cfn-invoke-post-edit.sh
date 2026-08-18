#!/usr/bin/env bash

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CONFIG_FILE="$SCRIPT_DIR/cfn-post-edit.config.json"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

# Ensure jq is available (fallback to local download if sudo unavailable)
JQ_CMD="jq"
if ! command -v jq >/dev/null 2>&1; then
    JQ_FALLBACK="$SCRIPT_DIR/../tools/jq"
    if [ ! -x "$JQ_FALLBACK" ]; then
        mkdir -p "$SCRIPT_DIR/../tools"
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL -o "$JQ_FALLBACK" https://github.com/stedolan/jq/releases/download/jq-1.6/jq-linux64 && chmod +x "$JQ_FALLBACK" || true
        elif command -v wget >/dev/null 2>&1; then
            wget -q -O "$JQ_FALLBACK" https://github.com/stedolan/jq/releases/download/jq-1.6/jq-linux64 && chmod +x "$JQ_FALLBACK" || true
        fi
    fi
    if [ -x "$JQ_FALLBACK" ]; then
        JQ_CMD="$JQ_FALLBACK"
    else
        echo "Error: jq not found and download failed. Install jq or ensure curl/wget access." >&2
        exit 1
    fi
else
    JQ_CMD="$(command -v jq)"
fi

# Parse arguments
FILE_PATH=""
AGENT_ID="${AGENT_ID:-unknown}"
BLOCKING=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --agent-id requires a value" >&2
                exit 1
            fi
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
ENABLED=$("$JQ_CMD" -r '.enabled // true' "$CONFIG_FILE" 2>/dev/null || echo "true")
if [ "$ENABLED" != "true" ]; then
    echo "Post-edit hooks disabled in config"
    exit 0
fi

# Get pipeline path from config. The default names the live, git-tracked
# pipeline that sits next to this script, which is now the ONLY implementation:
# the divergent second copy at config/hooks/post-edit-pipeline.js was deleted
# 2026-07-25 after its TypeScript/ESLint/Prettier phases were ported here.
PIPELINE=$("$JQ_CMD" -r '.pipeline // ".claude/hooks/post-edit-pipeline.js"' "$CONFIG_FILE")

# Resolve relative pipeline path against the CFN repo root so the hook works
# from any project that calls it via the ~/.claude/hooks symlink. SCRIPT_DIR is
# computed with `pwd -P`, so REPO_ROOT is the real CFN repo even when this
# script was invoked through that symlink.
if [[ "$PIPELINE" != /* ]]; then
    PIPELINE="$REPO_ROOT/$PIPELINE"
fi

if [ ! -f "$PIPELINE" ]; then
    echo "Error: Post-edit pipeline not found: $PIPELINE" >&2
    exit 1
fi

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
REDIS_ENABLED=$("$JQ_CMD" -r '.redis.enabled // false' "$CONFIG_FILE")
if [ "$REDIS_ENABLED" = "true" ] && command -v redis-cli >/dev/null 2>&1; then
    CHANNEL=$("$JQ_CMD" -r '.redis.publishChannel // "swarm:hooks:post-edit"' "$CONFIG_FILE")
    MESSAGE=$("$JQ_CMD" -n \
        --arg file "$FILE_PATH" \
        --arg agent "$AGENT_ID" \
        --arg exit "$EXIT_CODE" \
        --arg ts "$(date +%s)" \
        '{file: $file, agentId: $agent, exitCode: $exit, timestamp: $ts}')

    echo "$MESSAGE" | redis-cli -x PUBLISH "$CHANNEL" >/dev/null 2>&1 || true
fi

echo "✅ Post-edit validation complete (exit code: $EXIT_CODE)"
exit 0  # Always exit 0 unless blocking mode
