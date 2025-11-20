#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/validate-gate.js
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


##############################################################################
# Validate Gate - TypeScript Wrapper
#
# Checks if test pass rate meets mode-specific thresholds.
#
# Usage:
#   ./validate-gate.sh --pass-rate 0.95 [--mode standard] [--json]
#
# Mode-Specific Thresholds:
#   mvp:        0.70 (70%)
#   standard:   0.95 (95%)
#   enterprise: 0.98 (98%)
#
# Returns JSON with gate validation result
# Exit codes:
#   0 - Gate passed
#   1 - Gate failed
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS_DIST="$SCRIPT_DIR/dist/cli/validate-gate.js"

# Check if TypeScript implementation exists
if [ ! -f "$TS_DIST" ]; then
  echo "Error: TypeScript implementation not found at: $TS_DIST" >&2
  echo "Run 'npm run build' in $SCRIPT_DIR" >&2
  exit 1
fi

# Check if node is available
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required but not found in PATH" >&2
  exit 1
fi

# Execute TypeScript implementation
exec node "$TS_DIST" "$@"
