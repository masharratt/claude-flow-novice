#!/usr/bin/env bash

# Auto-Resolve Wrapper - Convenience script for feedback resolution
# Part of Hook Pipeline Skill v1.3.0
#
# Usage:
#   ./auto-resolve.sh [--type TYPE] [--auto-fix] [--edit-id ID]
#
# Examples:
#   ./auto-resolve.sh                              # Resolve most recent feedback
#   ./auto-resolve.sh --auto-fix                   # Resolve with auto-fix enabled
#   ./auto-resolve.sh --type ROOT_WARNING          # Resolve specific type
#   ./auto-resolve.sh --type LINT_ISSUES --auto-fix

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default to resolve-last mode if no arguments
if [ $# -eq 0 ]; then
    echo "No arguments provided - resolving most recent pending feedback"
    exec "$SCRIPT_DIR/feedback-resolver.sh" --resolve-last
fi

# Parse arguments to determine if --auto-resolve should be added
AUTO_FIX=false
HAS_AUTO_RESOLVE=false
ARGS=()

for arg in "$@"; do
    case "$arg" in
        --auto-fix)
            AUTO_FIX=true
            ;;
        --auto-resolve)
            HAS_AUTO_RESOLVE=true
            ARGS+=("$arg")
            ;;
        *)
            ARGS+=("$arg")
            ;;
    esac
done

# Convert --auto-fix to --auto-resolve (user-friendly alias)
if [ "$AUTO_FIX" = true ] && [ "$HAS_AUTO_RESOLVE" = false ]; then
    ARGS+=("--auto-resolve")
fi

# If no --type or --edit-id provided, default to --resolve-last
HAS_TARGET=false
for arg in "${ARGS[@]}"; do
    if [[ "$arg" == "--type" ]] || [[ "$arg" == "--edit-id" ]] || [[ "$arg" == "--resolve-last" ]]; then
        HAS_TARGET=true
        break
    fi
done

if [ "$HAS_TARGET" = false ]; then
    ARGS+=("--resolve-last")
fi

# Execute feedback resolver with processed arguments
echo "Executing: feedback-resolver.sh ${ARGS[*]}"
exec "$SCRIPT_DIR/feedback-resolver.sh" "${ARGS[@]}"
