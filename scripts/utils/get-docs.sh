#!/usr/bin/env bash

# Read key planning documents
# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

echo "=== DECOMPOSITION SWARM RUVECTOR PLAN ==="
cat $PROJECT_ROOT/planning/DECOMPOSITION_SWARM_RUVECTOR_IMPLEMENTATION_PLAN.md 2>/dev/null || echo "File not found"

echo ""
echo "=== HANDOFF MDAP ATOMICITY ==="
cat $PROJECT_ROOT/planning/trigger/v4/HANDOFF_MDAP_ATOMICITY_2025-11-28.md 2>/dev/null | head -100 || echo "File not found"
