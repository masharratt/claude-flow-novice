#!/bin/bash
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
