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


# Post-Edit Hook Invocation Script (TypeScript Implementation)
# Validates files after modifications
#
# Usage:
#   ./.claude/hooks/cfn-invoke-post-edit-ts.sh <file_path> [--agent-id <id>] [--blocking]
#
# Examples:
#   ./.claude/hooks/cfn-invoke-post-edit-ts.sh src/file.ts
#   ./.claude/hooks/cfn-invoke-post-edit-ts.sh src/file.ts --agent-id "coder-1"
#   ./.claude/hooks/cfn-invoke-post-edit-ts.sh src/file.ts --blocking

set -euo pipefail

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
if [[ -z "$FILE_PATH" ]]; then
    echo "Error: File path required"
    echo "Usage: $0 <file_path> [--agent-id <id>] [--blocking]"
    exit 1
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel)" || exit 1

# Try TypeScript implementation first
if command -v node >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/dist/cli/post-edit-hook.js" ]]; then
    echo "Running post-edit validation: $FILE_PATH"

    # Run TypeScript implementation
    VALIDATION_RESULT=$(node "$PROJECT_ROOT/dist/cli/post-edit-hook.js" "$FILE_PATH" --agent-id "$AGENT_ID" 2>&1 || true)
    VALIDATION_EXIT=$?

    # Check if validation failed and blocking is enabled
    if [[ "$BLOCKING" == "true" ]] && [[ $VALIDATION_EXIT -ne 0 ]]; then
        echo "❌ Post-edit validation failed (blocking mode)"
        exit 1
    fi

    echo "✅ Post-edit validation complete"
    exit 0
else
    # Fall back to bash implementation
    PIPELINE="${PROJECT_ROOT}/.claude/hooks/cfn-invoke-post-edit.sh"

    if [[ ! -f "$PIPELINE" ]]; then
        echo "Error: Post-edit handler not found"
        exit 1
    fi

    # Call bash implementation
    if "$PIPELINE" "$FILE_PATH" --agent-id "$AGENT_ID" $([ "$BLOCKING" = "true" ] && echo "--blocking" || true); then
        exit 0
    else
        exit 1
    fi
fi
