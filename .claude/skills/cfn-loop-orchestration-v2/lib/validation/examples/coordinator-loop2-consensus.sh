#!/usr/bin/env bash

##############################################################################
# Example: Loop 2 Consensus Validation
#
# Scenario: Coordinator validates consensus from validator swarm
# Use Case: Validators (reviewer, security, tester, analyst) complete review,
#           coordinator checks if consensus is strong enough for product owner
##############################################################################

set -euo pipefail

# Get script directory for relative path to validator
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="${SCRIPT_DIR}/../validate-iteration.sh"

# Configuration
MODE="enterprise"
TASK_ID="compliance-gdpr-implementation"
AGENT_ID="coordinator-loop2"

echo "=== Loop 2: Consensus Validation ==="
echo "Task: $TASK_ID"
echo "Mode: $MODE"
echo ""

# Simulated validator execution
echo "Spawning validator swarm..."
echo "  - Validator 1: reviewer (confidence: 0.92)"
echo "  - Validator 2: security-specialist (confidence: 0.95)"
echo "  - Validator 3: tester (confidence: 0.88)"
echo "  - Validator 4: analyst (confidence: 0.91)"
echo "  - Validator 5: architect (confidence: 0.93)"
echo ""

sleep 1

# Aggregate scores from validators
AGENT_CONFIDENCE=0.918  # Average of validator confidences
CONSENSUS_SCORE=0.952   # Byzantine consensus algorithm result

echo "Consensus Results:"
echo "  Average Confidence: $AGENT_CONFIDENCE"
echo "  Consensus Score: $CONSENSUS_SCORE"
echo ""

# Validate consensus
echo "=== Validating Loop 2 Consensus Threshold ==="
ITERATION=1

VALIDATION_RESULT=$("$VALIDATOR" \
  --mode "$MODE" \
  --iteration "$ITERATION" \
  --confidence "$AGENT_CONFIDENCE" \
  --consensus "$CONSENSUS_SCORE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --json)

# Parse validation result
PASSED=$(echo "$VALIDATION_RESULT" | jq -r '.passed')
STATUS=$(echo "$VALIDATION_RESULT" | jq -r '.status')
VALIDATION_TYPE=$(echo "$VALIDATION_RESULT" | jq -r '.validationType')
THRESHOLD=$(echo "$VALIDATION_RESULT" | jq -r '.threshold')
CODE=$(echo "$VALIDATION_RESULT" | jq -r '.code')

echo ""
echo "Validation Result:"
echo "  Type: $VALIDATION_TYPE"
echo "  Status: $STATUS"
echo "  Passed: $PASSED"
echo "  Consensus: $CONSENSUS_SCORE"
echo "  Threshold: $THRESHOLD"
echo "  Exit Code: $CODE"
echo ""

# Decision logic
case "$CODE" in
  0)
    echo "✓ Consensus ACHIEVED"
    echo "  → Proceeding to Loop 4 (Product Owner Decision Gate)"
    echo ""

    echo "Next Action: Invoke product owner decision"
    echo "  - Enterprise mode: Stakeholder board decision"
    echo "  - CTO vote (weight: 0.35)"
    echo "  - Product Owner vote (weight: 0.30)"
    echo "  - User Power vote (weight: 0.20)"
    echo "  - User Accessibility vote (weight: 0.15)"

    # Example: Invoke product owner team decision
    # The board will decide: PROCEED | LOOP | DEFER | ESCALATE

    exit 0
    ;;

  1)
    echo "✗ Consensus BELOW THRESHOLD"
    echo "  → Retrying validators with targeted feedback"
    echo ""

    # Analyze which validators had low confidence
    echo "Analysis: Validators with concerns"
    echo "  - tester: 0.88 (concerns about edge cases)"
    echo ""

    echo "Feedback injection strategy:"
    echo "  1. Add edge case tests for identified gaps"
    echo "  2. Re-run tester validator with enhanced test suite"
    echo "  3. Validate consensus again"

    exit 1
    ;;

  2)
    echo "✗ MAX ITERATIONS REACHED"
    echo "  → Escalating to human review"
    echo ""

    echo "Escalation reason:"
    echo "  - Unable to achieve consensus after $ITERATION attempts"
    echo "  - Fundamental disagreement among validators"
    echo "  - Requires human architectural decision"

    exit 2
    ;;

  *)
    echo "Unexpected error: Code $CODE"
    exit "$CODE"
    ;;
esac
