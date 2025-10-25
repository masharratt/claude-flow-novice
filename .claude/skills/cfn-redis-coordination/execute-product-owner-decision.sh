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

# Step 1: Query Loop 2 consensus and context
echo "[Step 1] Querying Loop 2 consensus and context from Redis..."
CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.consensus')
ITERATION=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.iteration')

# Get feedback from validators
FEEDBACK_JSON=$(redis-cli lrange "swarm:${TASK_ID}:loop2:feedback" 0 -1 | jq -s '.')

# Get acceptance criteria and scope
ACCEPTANCE_CRITERIA=$(redis-cli get "swarm:${TASK_ID}:success-criteria" | jq -r '.acceptanceCriteria // []')
EPIC_CONTEXT=$(redis-cli get "swarm:${TASK_ID}:epic-context")
IN_SCOPE=$(echo "$EPIC_CONTEXT" | jq -r '.inScope // []')
OUT_OF_SCOPE=$(echo "$EPIC_CONTEXT" | jq -r '.outOfScope // []')
EPIC_GOAL=$(echo "$EPIC_CONTEXT" | jq -r '.epicGoal // ""')

echo "  Loop 2 Consensus: $CONSENSUS"
echo "  Iteration: $ITERATION"
echo "  Validator Feedback Items: $(echo "$FEEDBACK_JSON" | jq 'length')"
echo ""

# Step 2: Apply scope categorization
echo "[Step 2] Categorizing validator feedback by scope..."

# Initialize arrays
IN_SCOPE_ITEMS="[]"
OUT_OF_SCOPE_ITEMS="[]"
IN_SCOPE_CONSENSUS=0
OUT_OF_SCOPE_CONSENSUS=0

# Process feedback if available
if [ "$FEEDBACK_JSON" != "null" ] && [ "$FEEDBACK_JSON" != "[]" ]; then
  # Categorize each feedback item
  for feedback_item in $(echo "$FEEDBACK_JSON" | jq -r '.[] | @base64'); do
    _jq() {
      echo "$feedback_item" | base64 --decode | jq -r "$1"
    }

    FEEDBACK_TEXT=$(_jq '.')
    IS_IN_SCOPE="false"

    # Check if feedback relates to acceptance criteria or inScope items
    for criterion in $(echo "$ACCEPTANCE_CRITERIA" | jq -r '.[] | @base64'); do
      CRITERION_TEXT=$(echo "$criterion" | base64 --decode)
      if echo "$FEEDBACK_TEXT" | grep -iq "$(echo "$CRITERION_TEXT" | head -c 20)"; then
        IS_IN_SCOPE="true"
        break
      fi
    done

    # Add to appropriate category
    if [ "$IS_IN_SCOPE" = "true" ]; then
      IN_SCOPE_ITEMS=$(echo "$IN_SCOPE_ITEMS" | jq --arg item "$FEEDBACK_TEXT" '. + [$item]')
    else
      OUT_OF_SCOPE_ITEMS=$(echo "$OUT_OF_SCOPE_ITEMS" | jq --arg item "$FEEDBACK_TEXT" '. + [$item]')
    fi
  done

  # Calculate in-scope consensus (consensus weighted by in-scope ratio)
  TOTAL_ITEMS=$(echo "$FEEDBACK_JSON" | jq 'length')
  IN_SCOPE_COUNT=$(echo "$IN_SCOPE_ITEMS" | jq 'length')

  if [ "$TOTAL_ITEMS" -gt 0 ]; then
    # If there's feedback, weight consensus by in-scope ratio
    IN_SCOPE_CONSENSUS=$(echo "scale=2; $CONSENSUS * $IN_SCOPE_COUNT / $TOTAL_ITEMS" | bc -l)
  else
    # No feedback means validators had no concerns - use full consensus
    IN_SCOPE_CONSENSUS=$CONSENSUS
  fi
else
  # No feedback at all - use full consensus as in-scope
  IN_SCOPE_CONSENSUS=$CONSENSUS
fi

echo "  In-Scope Items: $(echo "$IN_SCOPE_ITEMS" | jq 'length')"
echo "  Out-of-Scope Items: $(echo "$OUT_OF_SCOPE_ITEMS" | jq 'length')"
echo "  In-Scope Consensus: $IN_SCOPE_CONSENSUS"
echo ""

# Step 3: Apply GOAP decision framework with scope enforcement
echo "[Step 3] Applying GOAP decision framework with scope enforcement..."

# Default threshold (standard mode)
CONSENSUS_THRESHOLD=0.90
MAX_ITERATIONS=10

# Determine decision based on scope-aware consensus
DECISION_TYPE=""
DECISION_REASONING=""
DECISION_CONFIDENCE=0
BACKLOG_ITEMS="[]"

if (( $(echo "$CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
  # High consensus - check if there are out-of-scope items
  OUT_OF_SCOPE_COUNT=$(echo "$OUT_OF_SCOPE_ITEMS" | jq 'length')

  if [ "$OUT_OF_SCOPE_COUNT" -gt 0 ]; then
    DECISION_TYPE="DEFER_AND_PROCEED"
    DECISION_REASONING="In-scope work complete (consensus $CONSENSUS >= $CONSENSUS_THRESHOLD). Deferring $OUT_OF_SCOPE_COUNT out-of-scope items to backlog."
    DECISION_CONFIDENCE=0.92
    BACKLOG_ITEMS="$OUT_OF_SCOPE_ITEMS"
    echo "  Decision: DEFER_AND_PROCEED (moving out-of-scope items to backlog)"
  else
    DECISION_TYPE="PROCEED"
    DECISION_REASONING="All work complete, consensus threshold met ($CONSENSUS >= $CONSENSUS_THRESHOLD)"
    DECISION_CONFIDENCE=0.95
    echo "  Decision: PROCEED (consensus exceeds threshold, no out-of-scope items)"
  fi
elif [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
  # Below consensus - check if in-scope consensus would meet threshold
  if (( $(echo "$IN_SCOPE_CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
    # In-scope work is good, out-of-scope items preventing consensus
    DECISION_TYPE="DEFER_AND_PROCEED"
    DECISION_REASONING="In-scope consensus met ($IN_SCOPE_CONSENSUS >= $CONSENSUS_THRESHOLD). Out-of-scope items preventing overall consensus - deferring to backlog."
    DECISION_CONFIDENCE=0.88
    BACKLOG_ITEMS="$OUT_OF_SCOPE_ITEMS"
    echo "  Decision: DEFER_AND_PROCEED (in-scope work complete, deferring out-of-scope blockers)"
  else
    # In-scope work needs improvement
    DECISION_TYPE="ITERATE"
    DECISION_REASONING="In-scope consensus below threshold ($IN_SCOPE_CONSENSUS < $CONSENSUS_THRESHOLD), targeted improvements needed"
    DECISION_CONFIDENCE=0.90
    BACKLOG_ITEMS="$OUT_OF_SCOPE_ITEMS"
    echo "  Decision: ITERATE (in-scope work needs improvement, iteration $ITERATION/$MAX_ITERATIONS)"
  fi
else
  DECISION_TYPE="ABORT"
  DECISION_REASONING="Max iterations reached ($ITERATION >= $MAX_ITERATIONS) without meeting in-scope consensus threshold"
  DECISION_CONFIDENCE=0.85
  echo "  Decision: ABORT (max iterations reached)"
fi

echo ""

# Build structured decision JSON with scope analysis
DECISION=$(jq -n \
  --arg decision "$DECISION_TYPE" \
  --arg reasoning "$DECISION_REASONING" \
  --arg confidence "$DECISION_CONFIDENCE" \
  --argjson in_scope_items "$IN_SCOPE_ITEMS" \
  --argjson out_of_scope_items "$OUT_OF_SCOPE_ITEMS" \
  --arg in_scope_consensus "$IN_SCOPE_CONSENSUS" \
  --argjson backlog_items "$BACKLOG_ITEMS" \
  '{
    decision: $decision,
    reasoning: $reasoning,
    confidence: ($confidence | tonumber),
    scope_analysis: {
      in_scope_consensus: ($in_scope_consensus | tonumber),
      in_scope_items: $in_scope_items,
      out_of_scope_items: $out_of_scope_items
    },
    backlog_items: $backlog_items
  }')

echo "[Step 4] Managing backlog items..."
if [ "$(echo "$BACKLOG_ITEMS" | jq 'length')" -gt 0 ]; then
  # Store backlog items in Redis
  BACKLOG_KEY="swarm:${TASK_ID}:backlog"
  echo "$BACKLOG_ITEMS" | redis-cli -x LPUSH "$BACKLOG_KEY" >/dev/null
  echo "  ✓ Stored $(echo "$BACKLOG_ITEMS" | jq 'length') backlog items in Redis: $BACKLOG_KEY"

  # Persist backlog to file for human review
  BACKLOG_FILE=".claude/cfn-data/backlog/${TASK_ID}.json"
  mkdir -p "$(dirname "$BACKLOG_FILE")"

  BACKLOG_RECORD=$(jq -n \
    --arg task_id "$TASK_ID" \
    --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --arg epic_goal "$EPIC_GOAL" \
    --argjson items "$BACKLOG_ITEMS" \
    '{
      task_id: $task_id,
      timestamp: $timestamp,
      epic_goal: $epic_goal,
      deferred_items: $items,
      status: "pending_review"
    }')

  echo "$BACKLOG_RECORD" > "$BACKLOG_FILE"
  echo "  ✓ Backlog persisted to: $BACKLOG_FILE"
else
  echo "  No backlog items to store"
fi
echo ""

echo "[Step 5] Pushing decision to Redis..."
DECISION_KEY="swarm:${TASK_ID}:${AGENT_ID}:decision"
echo "$DECISION" | redis-cli -x LPUSH "$DECISION_KEY" >/dev/null
echo "  ✓ Decision pushed to: $DECISION_KEY"
echo "  Content: $DECISION"
echo ""

# Step 6: Signal completion
echo "[Step 6] Signaling completion..."
DONE_KEY="swarm:${TASK_ID}:${AGENT_ID}:done"
redis-cli LPUSH "$DONE_KEY" "complete" >/dev/null
echo "  ✓ Completion signaled"
echo ""

# Step 7: Report confidence
echo "[Step 7] Reporting confidence..."
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence "$DECISION_CONFIDENCE"

echo ""
echo "🎉 Product Owner decision execution complete!"
echo "   Decision: $DECISION_TYPE"
echo "   Consensus: $CONSENSUS"
echo "   Iteration: $ITERATION"
