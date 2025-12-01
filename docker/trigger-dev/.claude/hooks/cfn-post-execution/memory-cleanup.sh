#!/bin/bash

# CFN Post-Execution Memory Cleanup Hook
# Automatically cleans up memory resources after CFN operations

set -euo pipefail

# Hook configuration
HOOK_SCRIPT_PATH="$(dirname "$0")/memory-cleanup.sh"
MEMORY_MANAGEMENT_SKILL="$(dirname "$0")/../../skills/cfn-memory-management/cleanup-memory.sh"

# Use the memory management skill if available, otherwise use local fallback
if [[ -f "$MEMORY_MANAGEMENT_SKILL" ]]; then
    exec "$MEMORY_MANAGEMENT_SKILL" "$@"
elif [[ -f "$HOOK_SCRIPT_PATH" ]]; then
    exec "$HOOK_SCRIPT_PATH" "$@"
else
    echo "WARNING: Memory cleanup scripts not found, skipping cleanup"
    exit 0
fi