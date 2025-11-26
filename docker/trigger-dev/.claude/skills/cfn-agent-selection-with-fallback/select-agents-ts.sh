#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli.cjs
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

# TypeScript wrapper for agent selection
# Replaces select-agents.sh with TypeScript implementation
# Usage: ./select-agents-ts.sh "task description" [--min-validators N]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-.}"

# Build TypeScript if dist doesn't exist or is stale
if [ ! -f "$SCRIPT_DIR/dist/cli.cjs" ] || [ "$SCRIPT_DIR/src/cli.ts" -nt "$SCRIPT_DIR/dist/cli.cjs" ]; then
  echo "[INFO] Building TypeScript agent selector..." >&2
  npx tsc --skipLibCheck --project "$SCRIPT_DIR/tsconfig.json" 2>/dev/null || true
fi

# Run the compiled CLI
if [ -f "$SCRIPT_DIR/dist/cli.cjs" ]; then
  PROJECT_ROOT="$PROJECT_ROOT" node "$SCRIPT_DIR/dist/cli.cjs" "$@"
else
  echo '{"error": "TypeScript compilation failed", "loop3": ["backend-developer", "devops-engineer"], "loop2": ["code-reviewer", "tester", "code-quality-validator"], "product_owner": "product-owner", "category": "default", "confidence": 0.70}'
  exit 1
fi
