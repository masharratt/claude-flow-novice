#!/usr/bin/env bash
set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

# Check for RuVector and vector-related implementations
echo "=== Checking for vector/db implementations ==="
ls -la $PROJECT_ROOT/docker/trigger-dev/src/lib/ 2>/dev/null | grep -E "vector|db|store" || echo "No matches in lib"

echo ""
echo "=== Checking planning documents ==="
ls -la $PROJECT_ROOT/planning/trigger/v4/ 2>/dev/null | head -20

echo ""
echo "=== Checking decomposition documentation ==="
find $PROJECT_ROOT -name "*DECOMPOSITION*" -o -name "*decompos*" 2>/dev/null | head -10
