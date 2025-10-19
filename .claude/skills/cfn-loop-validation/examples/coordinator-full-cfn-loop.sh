#!/usr/bin/env bash

##############################################################################
# Example: Full CFN Loop Integration
#
# Scenario: Complete CFN loop workflow with validation at each gate
# Flow: Loop 3 (confidence) → Loop 2 (consensus) → Loop 4 (product owner)
##############################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="${SCRIPT_DIR}/../validate-iteration.sh"

# Configuration
CFN_MODE="standard"
TASK_ID="feature-payment-processing"
MAX_LOOP3_RETRIES=3
MAX_LOOP2_RETRIES=2

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           CFN LOOP ORCHESTRATION - Full Example            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Task: $TASK_ID"
echo "Mode: $CFN_MODE"
echo "Max Loop 3 Retries: $MAX_LOOP3_RETRIES"
echo "Max Loop 2 Retries: $MAX_LOOP2_RETRIES"
echo ""

# ============================================================================
# LOOP 3: Primary Swarm Execution with Confidence Gate
# ============================================================================

echo "┌────────────────────────────────────────────────────────────┐"
echo "│ LOOP 3: Primary Swarm Execution (Confidence Gate)         │"
echo "└────────────────────────────────────────────────────────────┘"
echo ""

LOOP3_ITERATION=0
LOOP3_PASSED=false

while [[ $LOOP3_ITERATION -lt $MAX_LOOP3_RETRIES ]]; do
  LOOP3_ITERATION=$((LOOP3_ITERATION + 1))

  echo "--- Loop 3 Iteration $LOOP3_ITERATION ---"
  echo "Executing primary swarm (coder + tester)..."

  # Simulate agent work
  sleep 1

  # Simulated confidence score (improves with each iteration)
  case $LOOP3_ITERATION in
    1) AGENT_CONFIDENCE=0.75 ;;  # Below threshold
    2) AGENT_CONFIDENCE=0.82 ;;  # Above threshold
    3) AGENT_CONFIDENCE=0.88 ;;  # Well above threshold
  esac

  echo "Agent self-assessed confidence: $AGENT_CONFIDENCE"

  # Validate confidence gate
  GATE_RESULT=$("$VALIDATOR" \
    --mode "$CFN_MODE" \
    --iteration "$LOOP3_ITERATION" \
    --confidence "$AGENT_CONFIDENCE" \
    --task-id "$TASK_ID" \
    --agent-id "coordinator-loop3" \
    --json)

  GATE_PASSED=$(echo "$GATE_RESULT" | jq -r '.passed')
  GATE_STATUS=$(echo "$GATE_RESULT" | jq -r '.status')
  GATE_THRESHOLD=$(echo "$GATE_RESULT" | jq -r '.threshold')

  echo "Validation: $GATE_STATUS (threshold: $GATE_THRESHOLD)"

  if [[ "$GATE_PASSED" == "true" ]]; then
    echo "✓ Loop 3 gate PASSED"
    echo ""
    LOOP3_PASSED=true
    break
  else
    echo "✗ Loop 3 gate FAILED"
    echo "  → Injecting feedback and retrying..."
    echo ""
    sleep 1
  fi
done

if [[ "$LOOP3_PASSED" != "true" ]]; then
  echo "CRITICAL: Loop 3 failed after $MAX_LOOP3_RETRIES attempts"
  echo "Action: Escalating to human review"
  exit 2
fi

# ============================================================================
# LOOP 2: Validator Consensus
# ============================================================================

echo "┌────────────────────────────────────────────────────────────┐"
echo "│ LOOP 2: Validator Consensus (Byzantine Agreement)         │"
echo "└────────────────────────────────────────────────────────────┘"
echo ""

LOOP2_ITERATION=0
LOOP2_PASSED=false

while [[ $LOOP2_ITERATION -lt $MAX_LOOP2_RETRIES ]]; do
  LOOP2_ITERATION=$((LOOP2_ITERATION + 1))

  echo "--- Loop 2 Iteration $LOOP2_ITERATION ---"
  echo "Spawning validator swarm..."
  echo "  - reviewer"
  echo "  - security-specialist"
  echo "  - tester"
  echo "  - analyst"
  echo ""

  sleep 1

  # Simulated consensus (improves with each iteration)
  case $LOOP2_ITERATION in
    1) CONSENSUS_SCORE=0.88 ;;  # Below threshold
    2) CONSENSUS_SCORE=0.92 ;;  # Above threshold
  esac

  echo "Byzantine consensus result: $CONSENSUS_SCORE"

  # Validate consensus
  CONSENSUS_RESULT=$("$VALIDATOR" \
    --mode "$CFN_MODE" \
    --iteration "$LOOP2_ITERATION" \
    --confidence "$AGENT_CONFIDENCE" \
    --consensus "$CONSENSUS_SCORE" \
    --task-id "$TASK_ID" \
    --agent-id "coordinator-loop2" \
    --json)

  CONSENSUS_PASSED=$(echo "$CONSENSUS_RESULT" | jq -r '.passed')
  CONSENSUS_STATUS=$(echo "$CONSENSUS_RESULT" | jq -r '.status')
  CONSENSUS_THRESHOLD=$(echo "$CONSENSUS_RESULT" | jq -r '.threshold')

  echo "Validation: $CONSENSUS_STATUS (threshold: $CONSENSUS_THRESHOLD)"

  if [[ "$CONSENSUS_PASSED" == "true" ]]; then
    echo "✓ Loop 2 consensus ACHIEVED"
    echo ""
    LOOP2_PASSED=true
    break
  else
    echo "✗ Loop 2 consensus FAILED"
    echo "  → Analyzing validator feedback and retrying..."
    echo ""
    sleep 1
  fi
done

if [[ "$LOOP2_PASSED" != "true" ]]; then
  echo "CRITICAL: Loop 2 consensus failed after $LOOP2_RETRIES attempts"
  echo "Action: Escalating to human review"
  exit 2
fi

# ============================================================================
# LOOP 4: Product Owner Decision Gate (GOAP)
# ============================================================================

echo "┌────────────────────────────────────────────────────────────┐"
echo "│ LOOP 4: Product Owner Decision Gate (GOAP)                │"
echo "└────────────────────────────────────────────────────────────┘"
echo ""

echo "Invoking product owner decision..."
sleep 1

# Simulated product owner decision
PO_DECISION="PROCEED"
PO_CONFIDENCE=0.92
PO_REASONING="Payment processing implementation meets security and compliance standards. Ready for deployment."

echo "Product Owner Decision:"
echo "  Decision: $PO_DECISION"
echo "  Confidence: $PO_CONFIDENCE"
echo "  Reasoning: $PO_REASONING"
echo ""

case "$PO_DECISION" in
  PROCEED)
    echo "✓ Product Owner APPROVED"
    echo "  → Phase complete, proceeding to next phase"
    echo ""
    ;;

  LOOP)
    echo "↻ Product Owner requested LOOP"
    echo "  → Returning to Loop 3 with updated requirements"
    echo ""
    exit 1
    ;;

  DEFER)
    echo "⊗ Product Owner DEFERRED items to backlog"
    echo "  → Proceeding with reduced scope"
    echo ""
    ;;

  ESCALATE)
    echo "⚠ Product Owner ESCALATED to human"
    echo "  → Critical blockers require manual review"
    echo ""
    exit 2
    ;;
esac

# ============================================================================
# SUCCESS: Phase Complete
# ============================================================================

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  PHASE COMPLETE - SUCCESS                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Summary:"
echo "  Task: $TASK_ID"
echo "  Mode: $CFN_MODE"
echo "  Loop 3 Iterations: $LOOP3_ITERATION"
echo "  Loop 2 Iterations: $LOOP2_ITERATION"
echo "  Final Confidence: $AGENT_CONFIDENCE"
echo "  Final Consensus: $CONSENSUS_SCORE"
echo "  Product Owner: $PO_DECISION ($PO_CONFIDENCE confidence)"
echo ""
echo "Next Action: Proceed to next phase or deployment"

exit 0
