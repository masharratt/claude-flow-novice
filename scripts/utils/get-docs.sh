#!/usr/bin/env bash

# Read key planning documents
echo "=== DECOMPOSITION SWARM RUVECTOR PLAN ==="
cat /mnt/c/Users/masha/Documents/claude-flow-novice/planning/DECOMPOSITION_SWARM_RUVECTOR_IMPLEMENTATION_PLAN.md 2>/dev/null || echo "File not found"

echo ""
echo "=== HANDOFF MDAP ATOMICITY ==="
cat /mnt/c/Users/masha/Documents/claude-flow-novice/planning/trigger/v4/HANDOFF_MDAP_ATOMICITY_2025-11-28.md 2>/dev/null | head -100 || echo "File not found"
