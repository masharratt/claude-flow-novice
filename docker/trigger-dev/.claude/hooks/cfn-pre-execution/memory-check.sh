#!/bin/bash

# CFN Pre-Execution Memory Check Hook
# Automatically checks memory availability before CFN operations

set -euo pipefail

# Hook configuration
HOOK_SCRIPT_PATH="$(dirname "$0")/memory-check.sh"
MEMORY_MANAGEMENT_SKILL="$(dirname "$0")/../../skills/cfn-memory-management/check-memory.sh"

# Use the memory management skill if available, otherwise use local fallback
if [[ -f "$MEMORY_MANAGEMENT_SKILL" ]]; then
    exec "$MEMORY_MANAGEMENT_SKILL" "$@"
elif [[ -f "$HOOK_SCRIPT_PATH" ]]; then
    exec "$HOOK_SCRIPT_PATH" "$@"
else
    echo "WARNING: Memory check scripts not found, proceeding without memory validation"
    exit 0
fi