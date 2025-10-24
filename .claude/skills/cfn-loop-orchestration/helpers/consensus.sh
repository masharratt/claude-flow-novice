#!/usr/bin/env bash

##############################################################################
# Consensus Checker
# Collects and validates Loop 2 consensus scores
#
# Usage:
#   consensus.sh --task-id <id> \
#                --agents <agent1,agent2,...> \
#                --threshold <0.0-1.0> \
#                --min-quorum <n|n%|0.n>
#
# Returns:
#   Exit 0: Consensus reached
#   Exit 1: Consensus failed
##############################################################################

set -euo pipefail

# Parameters
TASK_ID=""
AGENTS=""
THRESHOLD=""
MIN_QUORUM=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agents) AGENTS="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --min-quorum) MIN_QUORUM="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ] || [ -z "$AGENTS" ] || [ -z "$THRESHOLD" ] || [ -z "$MIN_QUORUM" ]; then
  echo "Error: Missing required parameters"
  exit 1
fi

# Use Redis Coordination skill to collect consensus scores
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REDIS_COORD_SKILL="$SKILL_DIR/redis-coordination"

# Collect Loop 2 consensus scores
CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
  --task-id "$TASK_ID" \
  --agent-ids "$AGENTS" \
  --min-quorum "$MIN_QUORUM") || {
  echo "Error: Failed to collect Loop 2 consensus scores"
  exit 1
}

echo "Loop 2 Consensus Check:"
echo "  Consensus: $CONSENSUS"
echo "  Threshold: $THRESHOLD"
echo "  Required: >= $THRESHOLD"

# Compare consensus to threshold
if (( $(echo "$CONSENSUS >= $THRESHOLD" | bc -l) )); then
  echo "✅ Consensus REACHED - Loop 2 validation successful"
  exit 0
else
  echo "❌ Consensus FAILED - Iteration required"
  echo "   Gap: $(echo "$THRESHOLD - $CONSENSUS" | bc -l)"
  exit 1
fi
