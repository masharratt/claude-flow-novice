#!/bin/bash

# CFN Dependency Management - Skill Wrapper
# Main entry point for the CFN Loop system

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_SCRIPT="${SCRIPT_DIR}/execute.sh"

# Check if the main script exists
if [[ ! -f "$MAIN_SCRIPT" ]]; then
    echo "Error: Main execution script not found: $MAIN_SCRIPT" >&2
    exit 1
fi

# Forward all arguments to the main script
exec "$MAIN_SCRIPT" "$@"