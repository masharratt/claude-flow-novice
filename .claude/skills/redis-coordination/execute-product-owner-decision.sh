#!/bin/bash
##############################################################################
# Product Owner Decision Execution Script
#
# Handles the complete Product Owner decision protocol:
# 1. Query Loop 2 consensus from Redis
# 2. Apply GOAP decision framework
# 3. Push decision to Redis
# 4. Signal completion
# 5. Report confidence
#
# Usage:
#   ./execute-product-owner-decision.sh --task-id <task> --agent-id <agent>
##############################################################################

set -euo pipefail

# Parse arguments
TASK_ID=""
AGENT_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --agent-id)
      AGENT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --task-id <task> --agent-id <agent>"
      exit 1
      ;;
  esac
done

if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ]; then
  echo "Error: --task-id and --agent-id are required"
  exit 1
fi

echo "[Product Owner] Starting decision execution for task: $TASK_ID"
echo ""

# Step 1: Query Loop 2 consensus
echo "[Step 1] Querying Loop 2 consensus from Redis..."
CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.consensus')
ITERATION=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.iteration')

echo "  Loop 2 Consensus: $CONSENSUS"
echo "  Iteration: $ITERATION"
echo ""

# Step 2: Apply GOAP decision framework
echo "[Step 2] Applying GOAP decision framework..."

# Default threshold (standard mode)
CONSENSUS_THRESHOLD=0.90
MAX_ITERATIONS=10

# Determine decision
if (( $(echo "$CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
  DECISION_TYPE="PROCEED"
  DECISION_REASONING="Consensus threshold met ($CONSENSUS >= $CONSENSUS_THRESHOLD)"
  DECISION_CONFIDENCE=0.95
  echo "  Decision: PROCEED (consensus exceeds threshold)"
elif [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
  DECISION_TYPE="ITERATE"
  DECISION_REASONING="Consensus below threshold ($CONSENSUS < $CONSENSUS_THRESHOLD), targeted improvements needed"
  DECISION_CONFIDENCE=0.90
  echo "  Decision: ITERATE (consensus below threshold, iteration $ITERATION/$MAX_ITERATIONS)"
else
  DECISION_TYPE="ABORT"
  DECISION_REASONING="Max iterations reached ($ITERATION >= $MAX_ITERATIONS) without consensus"
  DECISION_CONFIDENCE=0.85
  echo "  Decision: ABORT (max iterations reached)"
fi

echo ""

# Build decision JSON
DECISION=$(jq -n \
  --arg decision "$DECISION_TYPE" \
  --arg reasoning "$DECISION_REASONING" \
  --arg confidence "$DECISION_CONFIDENCE" \
  '{decision: $decision, reasoning: $reasoning, confidence: ($confidence | tonumber)}')

echo "[Step 3] Pushing decision to Redis..."
DECISION_KEY="swarm:${TASK_ID}:${AGENT_ID}:decision"
echo "$DECISION" | redis-cli -x LPUSH "$DECISION_KEY" >/dev/null
echo "  ✓ Decision pushed to: $DECISION_KEY"
echo "  Content: $DECISION"
echo ""

# Step 4: Signal completion
echo "[Step 4] Signaling completion..."
DONE_KEY="swarm:${TASK_ID}:${AGENT_ID}:done"
redis-cli LPUSH "$DONE_KEY" "complete" >/dev/null
echo "  ✓ Completion signaled"
echo ""

# Step 5: Report confidence
echo "[Step 5] Reporting confidence..."
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence "$DECISION_CONFIDENCE"

echo ""
echo "🎉 Product Owner decision execution complete!"
echo "   Decision: $DECISION_TYPE"
echo "   Consensus: $CONSENSUS"
echo "   Iteration: $ITERATION"
