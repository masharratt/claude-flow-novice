#!/usr/bin/env bash
# CFN Loop Orchestration CLI Wrapper
# Bash wrapper that routes to the TypeScript implementation

set -euo pipefail

# Get skill directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Paths
CLI_RESOLVER="$SCRIPT_DIR/resolve-provider-model.cjs"

# Check if resolver exists
if [[ ! -f "$CLI_RESOLVER" ]]; then
  echo "Error: CLI resolver not found at $CLI_RESOLVER" >&2
  exit 1
fi

# Execute with node
exec node "$CLI_RESOLVER" "$@"