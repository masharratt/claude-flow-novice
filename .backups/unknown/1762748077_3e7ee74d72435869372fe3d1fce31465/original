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
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.claude/skills/cfn-cfn-.." && pwd)"
REDIS_COORD_SKILL="$SKILL_DIR/redis-coordination"

echo "Gate Check Configuration:"
echo "  Task ID: $TASK_ID"
echo "  Agent IDs: $AGENTS"
echo "  Min Quorum: $MIN_QUORUM"
echo ""

# Collect Loop 3 confidence scores
# Note: invoke-waiting-mode.sh outputs consensus to stdout and verbose messages to stderr
# We capture only stdout to get the numeric consensus value
CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
  --task-id "$TASK_ID" \
  --agent-ids "$AGENTS" \
  --min-quorum "$MIN_QUORUM") || {
  echo "❌ Error: Failed to collect Loop 3 confidence scores"
  echo "   Agent IDs: $AGENTS"
  echo "   Output: $CONSENSUS"
  exit 1
}

# Validate consensus is a valid number
if ! [[ "$CONSENSUS" =~ ^[0-9]+\.?[0-9]*$ ]]; then
  echo "⚠️  WARNING: Invalid consensus value: $CONSENSUS (expected numeric)"
  echo "   Defaulting to 0.0"
  CONSENSUS="0.0"
fi

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
