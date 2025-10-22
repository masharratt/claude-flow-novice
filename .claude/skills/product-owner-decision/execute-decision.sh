#!/bin/bash
# Product Owner Decision Skill - Main Execution Wrapper
# Guarantees decision execution via output parsing (solves BUG #11)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
TASK_ID=""
AGENT_ID=""
CONSENSUS=""
THRESHOLD=""
ITERATION=""
MAX_ITERATIONS=""
SUCCESS_CRITERIA=""
EXPECTED_FILES=""

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
    --expected-files)
      EXPECTED_FILES="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONSENSUS" ] || \
   [ -z "$THRESHOLD" ] || [ -z "$ITERATION" ] || [ -z "$MAX_ITERATIONS" ]; then
  echo "ERROR: Missing required parameters" >&2
  echo "Usage: $0 --task-id TASK_ID --agent-id AGENT_ID --consensus CONSENSUS --threshold THRESHOLD --iteration ITERATION --max-iterations MAX_ITERATIONS [--success-criteria JSON]" >&2
  exit 1
fi

# Build Product Owner context
PO_CONTEXT="CFN Loop iteration $ITERATION complete.

Loop 2 Consensus: $CONSENSUS (threshold: $THRESHOLD)
Task ID: $TASK_ID
Agent ID: $AGENT_ID
Max Iterations: $MAX_ITERATIONS

Make your strategic decision: PROCEED, ITERATE, or ABORT

Decision Framework:
- PROCEED: Consensus >= $THRESHOLD AND deliverables verified
- ITERATE: Consensus < $THRESHOLD AND iteration < $MAX_ITERATIONS
- ABORT: Max iterations reached without consensus

Output your decision clearly with reasoning.
Format: Decision: [PROCEED|ITERATE|ABORT]"

# Get agent timeout (if get_agent_timeout function available)
if command -v get_agent_timeout &>/dev/null; then
  PO_TIMEOUT=$(get_agent_timeout "product-owner" "$TASK_ID")
else
  PO_TIMEOUT=900  # Default 15 minutes
fi

# Spawn Product Owner and capture output
PO_OUTPUT=$(timeout "$PO_TIMEOUT" npx claude-flow-novice agent product-owner \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$PO_CONTEXT" 2>&1 || true)

# Parse decision using skill parser
DECISION_TYPE=$("$SCRIPT_DIR/parse-decision.sh" --output "$PO_OUTPUT")

if [ -z "$DECISION_TYPE" ]; then
  echo "❌ ERROR: Could not parse Product Owner decision" >&2
  echo "Product Owner output:" >&2
  echo "$PO_OUTPUT" >&2

  # Fallback to ABORT on parse failure
  DECISION_TYPE="ABORT"
  REASONING="Failed to parse Product Owner decision from output"
  CONFIDENCE=0.50
else
  # Extract reasoning (context around decision)
  REASONING=$(echo "$PO_OUTPUT" | grep -A5 -i "decision" | tail -5 | tr '\n' ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  CONFIDENCE=0.90
fi

# Validate deliverables for PROCEED decisions
if [ "$DECISION_TYPE" = "PROCEED" ]; then
  DELIVERABLE_ARGS="--task-id $TASK_ID"
  if [ -n "$EXPECTED_FILES" ]; then
    DELIVERABLE_ARGS="$DELIVERABLE_ARGS --expected-files $EXPECTED_FILES"
  fi

  DELIVERABLE_STATUS=$("$SCRIPT_DIR/validate-deliverables.sh" $DELIVERABLE_ARGS)

  if [ "$DELIVERABLE_STATUS" = "FAILED" ]; then
    # Retrieve missing files from Redis (if available)
    MISSING_FILES_JSON=$(redis-cli get "swarm:${TASK_ID}:missing-files" 2>/dev/null || echo "[]")
    MISSING_FILES_LIST=$(echo "$MISSING_FILES_JSON" | jq -r '.[]' | tr '\n' ', ' | sed 's/,$//')

    # Override PROCEED → ITERATE
    DECISION_TYPE="ITERATE"
    if [ -n "$MISSING_FILES_LIST" ]; then
      REASONING="Deliverable verification failed - missing files: $MISSING_FILES_LIST"
    else
      REASONING="Deliverable verification failed - no files created (consensus on plans only)"
    fi
    CONFIDENCE=0.75
  fi
fi

# Build decision JSON
DECISION_JSON=$(jq -n \
  --arg decision "$DECISION_TYPE" \
  --arg reasoning "${REASONING:-Parsed from Product Owner output}" \
  --arg confidence "$CONFIDENCE" \
  --arg iteration "$ITERATION" \
  --arg consensus "$CONSENSUS" \
  '{
    decision: $decision,
    reasoning: $reasoning,
    confidence: ($confidence | tonumber),
    iteration: ($iteration | tonumber),
    consensus: ($consensus | tonumber),
    timestamp: (now | todate)
  }')

# Push decision to Redis (orchestrator's responsibility, not agent's)
DECISION_KEY="swarm:${TASK_ID}:${AGENT_ID}:decision"
echo "$DECISION_JSON" | redis-cli -x LPUSH "$DECISION_KEY" >/dev/null

# Signal Product Owner completion
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" >/dev/null

# Store decision in metrics
redis-cli LPUSH "swarm:${TASK_ID}:metrics:product_owner_decisions" "$DECISION_JSON" >/dev/null
redis-cli INCR "swarm:metrics:decisions:$(echo "$DECISION_TYPE" | tr '[:upper:]' '[:lower:]')" >/dev/null

# Output decision JSON for orchestrator
echo "$DECISION_JSON"
