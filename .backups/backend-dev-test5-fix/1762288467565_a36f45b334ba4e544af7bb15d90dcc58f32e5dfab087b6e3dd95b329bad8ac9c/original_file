#!/bin/bash
# Product Owner Decision Execution Script
# Version: 1.0.0
# Purpose: Execute Product Owner decision with guaranteed Redis coordination

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
TASK_ID=""
AGENT_ID=""
CONSENSUS=""
THRESHOLD=""
ITERATION=""
MAX_ITERATIONS=""
SUCCESS_CRITERIA=""

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
    --consensus)
      CONSENSUS="$2"
      shift 2
      ;;
    --threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    --iteration)
      ITERATION="$2"
      shift 2
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --success-criteria)
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONSENSUS" ] || \
   [ -z "$THRESHOLD" ] || [ -z "$ITERATION" ] || [ -z "$MAX_ITERATIONS" ]; then
  echo -e "${RED}❌ ERROR: Missing required parameters${NC}"
  echo "Usage: $0 --task-id <id> --agent-id <id> --consensus <score> --threshold <score> --iteration <num> --max-iterations <num>"
  exit 1
fi

echo -e "${GREEN}🎯 Product Owner Decision Execution${NC}"
echo "Task ID: $TASK_ID"
echo "Agent ID: $AGENT_ID"
echo "Consensus: $CONSENSUS"
echo "Threshold: $THRESHOLD"
echo "Iteration: $ITERATION / $MAX_ITERATIONS"

# Retrieve Loop 2 context from Redis
echo -e "${YELLOW}📥 Retrieving Loop 2 context...${NC}"
LOOP2_FEEDBACK=$(redis-cli HGET "swarm:${TASK_ID}:loop2:consensus" "feedback" || echo "")
TASK_CONTEXT=$(redis-cli HGETALL "swarm:${TASK_ID}:context" || echo "")

# Build Product Owner context
PO_CONTEXT="
You are the Product Owner making a strategic decision for CFN Loop iteration $ITERATION of $MAX_ITERATIONS.

Loop 2 Consensus: $CONSENSUS
Threshold: $THRESHOLD
Success Criteria: ${SUCCESS_CRITERIA:-"Not specified"}

Loop 2 Feedback:
$LOOP2_FEEDBACK

Task Context:
$TASK_CONTEXT

Make a strategic decision:
- PROCEED: Quality threshold met, deliverables complete
- ITERATE: Improvements needed, iterations remaining
- ABORT: Max iterations reached or unrecoverable failure

Output format:
Decision: PROCEED|ITERATE|ABORT
Reasoning: [your explanation]
Confidence: [0.0-1.0]
"

# Spawn Product Owner agent
echo -e "${YELLOW}🚀 Spawning Product Owner agent...${NC}"
PO_OUTPUT_FILE="/tmp/product-owner-${TASK_ID}-${ITERATION}.log"

# Use timeout from agent config
PO_TIMEOUT=300  # 5 minutes default

set +e
timeout "$PO_TIMEOUT" npx claude-flow-novice agent product-owner \
  --task-id "$TASK_ID" \
  --context "$PO_CONTEXT" > "$PO_OUTPUT_FILE" 2>&1
PO_EXIT_CODE=$?
set -e

# Check timeout
if [ $PO_EXIT_CODE -eq 124 ]; then
  echo -e "${RED}❌ ERROR: Product Owner timed out after ${PO_TIMEOUT}s${NC}"
  DECISION_TYPE="ABORT"
  REASONING="Product Owner decision timeout after ${PO_TIMEOUT}s"
  CONFIDENCE=0.0
else
  # Parse decision from output
  PO_OUTPUT=$(cat "$PO_OUTPUT_FILE")

  # Try multiple parsing patterns
  DECISION_TYPE=$(echo "$PO_OUTPUT" | grep -oiE "Decision:\s*(PROCEED|ITERATE|ABORT)" | grep -oiE "(PROCEED|ITERATE|ABORT)" | head -1 | tr '[:lower:]' '[:upper:]' || echo "")

  if [ -z "$DECISION_TYPE" ]; then
    DECISION_TYPE=$(echo "$PO_OUTPUT" | grep -oE "(PROCEED|ITERATE|ABORT)" | head -1 || echo "")
  fi

  if [ -z "$DECISION_TYPE" ]; then
    DECISION_TYPE=$(echo "$PO_OUTPUT" | grep -oiE "(proceed|iterate|abort)" | head -1 | tr '[:lower:]' '[:upper:]' || echo "")
  fi

  # Parse reasoning
  REASONING=$(echo "$PO_OUTPUT" | grep -oiE "Reasoning:\s*.*" | sed 's/Reasoning:\s*//' || echo "No reasoning provided")

  # Parse confidence
  CONFIDENCE=$(echo "$PO_OUTPUT" | grep -oE "Confidence:\s*[0-9]+\.?[0-9]*" | grep -oE "[0-9]+\.?[0-9]*" || echo "0.85")
fi

# Validate decision parsing
if [ -z "$DECISION_TYPE" ]; then
  echo -e "${RED}❌ ERROR: Could not parse decision from Product Owner output${NC}"
  echo "Output sample:"
  echo "$PO_OUTPUT" | head -20
  DECISION_TYPE="ABORT"
  REASONING="Failed to parse Product Owner decision"
  CONFIDENCE=0.0
fi

echo -e "${GREEN}✅ Product Owner Decision: $DECISION_TYPE${NC}"
echo "Reasoning: $REASONING"
echo "Confidence: $CONFIDENCE"

# Deliverable verification for PROCEED decisions
if [ "$DECISION_TYPE" = "PROCEED" ]; then
  echo -e "${YELLOW}🔍 Verifying deliverables...${NC}"

  # Check if task requires implementation (keywords: create, build, implement, generate)
  REQUIRES_IMPLEMENTATION=$(echo "$TASK_CONTEXT" | grep -iE "(create|build|implement|generate|write|add)" || echo "")

  if [ -n "$REQUIRES_IMPLEMENTATION" ]; then
    # Check git status for file changes
    FILES_CHANGED=$(git status --short | grep -E "^(A|M|\?\?)" | wc -l || echo "0")

    if [ "$FILES_CHANGED" -eq 0 ]; then
      echo -e "${YELLOW}⚠️  WARNING: No deliverables created (consensus on plans only)${NC}"
      DECISION_TYPE="ITERATE"
      REASONING="Override PROCEED → ITERATE: No files created despite implementation task. Validators approved plans without actual code."
      CONFIDENCE=0.70

      # Add deliverable requirement to feedback
      DELIVERABLE_FEEDBACK="
Critical: Task requires implementation but zero files created.
Next iteration MUST create actual deliverables, not just plans.
"
      redis-cli HSET "swarm:${TASK_ID}:loop2:consensus" "deliverable_feedback" "$DELIVERABLE_FEEDBACK"
    else
      echo -e "${GREEN}✅ Deliverables verified: $FILES_CHANGED files changed${NC}"
    fi
  fi
fi

# Build decision JSON
DECISION_JSON=$(cat <<EOF
{
  "decision": "$DECISION_TYPE",
  "reasoning": "$REASONING",
  "confidence": $CONFIDENCE,
  "iteration": $ITERATION,
  "consensus": $CONSENSUS,
  "threshold": $THRESHOLD,
  "timestamp": $(date +%s)
}
EOF
)

# Store decision in Redis
echo -e "${YELLOW}💾 Storing decision in Redis...${NC}"
redis-cli LPUSH "swarm:${TASK_ID}:decision" "$DECISION_TYPE"
redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" "decision" "$DECISION_TYPE"
redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" "reasoning" "$REASONING"
redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" "confidence" "$CONFIDENCE"

# Store in metrics
redis-cli LPUSH "swarm:${TASK_ID}:metrics:product_owner_decisions" "$DECISION_JSON"
redis-cli INCR "swarm:metrics:decisions:$(echo "$DECISION_TYPE" | tr '[:upper:]' '[:lower:]')"

# Signal completion
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Report confidence (for orchestrator collection)
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence "$CONFIDENCE" \
  --iteration "$ITERATION"

# Output decision JSON for orchestrator
echo "$DECISION_JSON"

echo -e "${GREEN}✅ Product Owner decision execution complete${NC}"
