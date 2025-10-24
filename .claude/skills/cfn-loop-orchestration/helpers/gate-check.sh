#!/usr/bin/env bash

##############################################################################
# Gate Check Helper
# Validates Loop 3 self-assessment against gate threshold
#
# Usage:
#   gate-check.sh --task-id <id> \
#                 --agents <agent1,agent2,...> \
#                 --threshold <0.0-1.0> \
#                 --min-quorum <n|n%|0.n>
#
# Returns:
#   Exit 0: Gate passed (Loop 3 meets threshold)
#   Exit 1: Gate failed (Loop 3 needs iteration)
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

# Use Redis Coordination skill to collect confidence scores
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REDIS_COORD_SKILL="$SKILL_DIR/redis-coordination"

# Collect Loop 3 confidence scores
CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
  --task-id "$TASK_ID" \
  --agent-ids "$AGENTS" \
  --min-quorum "$MIN_QUORUM") || {
  echo "Error: Failed to collect Loop 3 confidence scores"
  exit 1
}

echo "Loop 3 Gate Check:"
echo "  Consensus: $CONSENSUS"
echo "  Threshold: $THRESHOLD"
echo "  Required: >= $THRESHOLD"

# Compare consensus to gate threshold
if (( $(echo "$CONSENSUS >= $THRESHOLD" | bc -l) )); then
  echo "✅ Gate PASSED - Loop 3 self-validation successful"

  # NOTE: Orchestrator controls Loop 2 spawn timing directly (orchestrate.sh line 520)
  # No signal broadcast needed - Loop 2 agents spawn after this helper returns 0

  exit 0
else
  echo "❌ Gate FAILED - Loop 3 needs improvement"
  echo "   Gap: $(echo "$THRESHOLD - $CONSENSUS" | bc -l)"
  exit 1
fi
