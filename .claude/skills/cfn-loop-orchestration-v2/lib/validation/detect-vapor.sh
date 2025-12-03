#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/detect-vapor.js
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
# Detect Consensus on Vapor - TypeScript Wrapper
#
# Detects when agents claim completion but deliverables are missing.
#
# Usage:
#   ./detect-vapor.sh --output "agent_output.txt" --deliverables file1.js,file2.js [--json]
#   ./detect-vapor.sh --output "Completed the task" --deliverables file1.js,file2.js [--json]
#
# Returns JSON with vapor detection result
# Exit codes:
#   0 - No vapor detected
#   1 - Vapor detected
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS_DIST="$SCRIPT_DIR/dist/cli/detect-vapor.js"

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
