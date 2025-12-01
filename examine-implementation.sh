#!/bin/bash
set -euo pipefail

# Check for RuVector and vector-related implementations
echo "=== Checking for vector/db implementations ==="
ls -la /mnt/c/Users/masha/Documents/claude-flow-novice/docker/trigger-dev/src/lib/ 2>/dev/null | grep -E "vector|db|store" || echo "No matches in lib"

echo ""
echo "=== Checking planning documents ==="
ls -la /mnt/c/Users/masha/Documents/claude-flow-novice/planning/trigger/v4/ 2>/dev/null | head -20

echo ""
echo "=== Checking decomposition documentation ==="
find /mnt/c/Users/masha/Documents/claude-flow-novice -name "*DECOMPOSITION*" -o -name "*decompos*" 2>/dev/null | head -10
