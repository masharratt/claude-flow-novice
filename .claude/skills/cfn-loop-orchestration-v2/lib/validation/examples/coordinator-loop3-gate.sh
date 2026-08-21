#!/usr/bin/env bash

##############################################################################
# Example: Loop 3 Confidence Gate Validation
#
# Scenario: Coordinator validates agent confidence before proceeding to Loop 2
# Use Case: Primary swarm (coder, tester) completes work, coordinator checks
#           if confidence is high enough to spawn validators
##############################################################################

set -euo pipefail

# Get script directory for relative path to validator
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="${SCRIPT_DIR}/../validate-iteration.sh"

# Configuration
MODE="standard"
TASK_ID="feature-user-authentication"
AGENT_ID="coordinator-loop3"

# Simulated agent execution with confidence score
echo "=== Loop 3: Primary Swarm Execution ==="
echo "Task: $TASK_ID"
echo "Mode: $MODE"
echo ""

# Simulate agent work (in real scenario, this would be actual agent execution)
echo "Executing primary swarm (coder + tester)..."
sleep 1

# Agent self-assessment confidence score (from agent's own evaluation)
AGENT_CONFIDENCE=0.85
echo "Agent reported confidence: $AGENT_CONFIDENCE"
echo ""

# Validate confidence gate
echo "=== Validating Loop 3 Confidence Gate ==="
ITERATION=1

VALIDATION_RESULT=$("$VALIDATOR" \
  --mode "$MODE" \
  --iteration "$ITERATION" \
  --confidence "$AGENT_CONFIDENCE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --json)

# Parse validation result
PASSED=$(echo "$VALIDATION_RESULT" | jq -r '.passed')
STATUS=$(echo "$VALIDATION_RESULT" | jq -r '.status')
THRESHOLD=$(echo "$VALIDATION_RESULT" | jq -r '.threshold')
CODE=$(echo "$VALIDATION_RESULT" | jq -r '.code')

echo ""
echo "Validation Result:"
echo "  Status: $STATUS"
echo "  Passed: $PASSED"
echo "  Confidence: $AGENT_CONFIDENCE"
echo "  Threshold: $THRESHOLD"
echo "  Exit Code: $CODE"
echo ""

# Decision logic based on validation
if [[ "$PASSED" == "true" ]]; then
  echo "✓ Confidence gate PASSED"
  echo "  → Proceeding to Loop 2 (spawning validators)"
  echo ""

  # Next step: Spawn validator swarm for consensus
  echo "Next Action: Spawn validators for consensus validation"
  # Example: npx claude-flow-novice swarm "validate feature-user-authentication" \
  #   --agents reviewer,security-specialist,tester,analyst

  exit 0

else
  echo "✗ Confidence gate FAILED"
  echo "  → Status: $STATUS"
  echo ""

  case "$CODE" in
    1)
      echo "Reason: Confidence below threshold"
      echo "Action: Injecting feedback and retrying Loop 3"
      echo ""

      # Extract feedback from agent reasoning
      echo "Suggested improvements:"
      echo "  - Review agent's reasoning for low confidence"
      echo "  - Inject targeted feedback"
      echo "  - Retry primary swarm execution"

      exit 1
      ;;

    2)
      echo "Reason: Maximum iterations exceeded"
      echo "Action: Escalating to human review"
      echo ""

      echo "Escalation details:"
      echo "  - Task attempted $ITERATION times"
      echo "  - Confidence never reached threshold"
      echo "  - Manual intervention required"

      exit 2
      ;;

    *)
      echo "Unexpected error: Code $CODE"
      exit "$CODE"
      ;;
  esac
fi
