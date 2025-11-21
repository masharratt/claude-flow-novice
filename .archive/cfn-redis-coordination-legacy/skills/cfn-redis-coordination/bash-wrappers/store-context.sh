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

# Backward compatibility wrapper for store-context
# Delegates to TypeScript implementation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check if compiled TypeScript is available
if [ ! -f "$PROJECT_ROOT/dist/context-manager.js" ]; then
  echo "Error: TypeScript modules not built. Run 'npm run build' in $PROJECT_ROOT" >&2
  exit 1
fi

# For now, delegate to original shell script if it exists
if [ -f "$PROJECT_ROOT/store-context.sh" ]; then
  "$PROJECT_ROOT/store-context.sh" "$@"
else
  # Fallback message
  echo "Error: Original store-context.sh not found" >&2
  exit 1
fi
