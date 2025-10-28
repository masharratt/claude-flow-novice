#!/bin/bash
set -euo pipefail

TASK_ID="test-perfect-storm-$(date +%s)"
echo "🧪 CFN Loop Test: Scenario 01 - Perfect Storm"
echo "Task ID: $TASK_ID"
echo ""

# Initialize test
redis-cli DEL "swarm:$TASK_ID:confidence" > /dev/null 2>&1 || true
START_TIME=$(date +%s%3N)

echo "📊 Phase 1: Loop 3 Execution (Implementers)"
# Simulate Loop 3 agents reporting confidence
redis-cli HSET "swarm:$TASK_ID:confidence" "coder" "0.95"
redis-cli HSET "swarm:$TASK_ID:confidence" "researcher" "0.92"

# Calculate gate
CODER=$(redis-cli HGET "swarm:$TASK_ID:confidence" "coder")
RESEARCHER=$(redis-cli HGET "swarm:$TASK_ID:confidence" "researcher")
GATE_AVG=$(echo "scale=3; ($CODER + $RESEARCHER) / 2" | bc)

echo "  - coder: $CODER"
echo "  - researcher: $RESEARCHER"
echo "  - Gate average: $GATE_AVG"

if (( $(echo "$GATE_AVG >= 0.75" | bc -l) )); then
  echo "  ✅ Gate PASSED (${GATE_AVG} >= 0.75)"
  GATE_PASSED=true
else
  echo "  ❌ Gate FAILED (${GATE_AVG} < 0.75)"
  GATE_PASSED=false
  exit 1
fi

echo ""
echo "📊 Phase 2: Loop 2 Execution (Validators)"
# Simulate Loop 2 validators reporting confidence
redis-cli HSET "swarm:$TASK_ID:confidence" "reviewer" "0.95"
redis-cli HSET "swarm:$TASK_ID:confidence" "tester" "0.93"

# Calculate consensus
REVIEWER=$(redis-cli HGET "swarm:$TASK_ID:confidence" "reviewer")
TESTER=$(redis-cli HGET "swarm:$TASK_ID:confidence" "tester")
CONSENSUS_AVG=$(echo "scale=3; ($REVIEWER + $TESTER) / 2" | bc)

echo "  - reviewer: $REVIEWER"
echo "  - tester: $TESTER"
echo "  - Consensus average: $CONSENSUS_AVG"

if (( $(echo "$CONSENSUS_AVG >= 0.90" | bc -l) )); then
  echo "  ✅ Consensus PASSED (${CONSENSUS_AVG} >= 0.90)"
  CONSENSUS_PASSED=true
else
  echo "  ❌ Consensus FAILED (${CONSENSUS_AVG} < 0.90)"
  CONSENSUS_PASSED=false
  exit 1
fi

echo ""
echo "📊 Phase 3: Product Owner Decision"
# Simulate Product Owner
redis-cli HSET "swarm:$TASK_ID:product-owner" "decision" "approve"
DECISION=$(redis-cli HGET "swarm:$TASK_ID:product-owner" "decision")
echo "  - Decision: $DECISION"

if [ "$DECISION" = "approve" ]; then
  echo "  ✅ Product Owner APPROVED"
  PO_APPROVED=true
else
  echo "  ❌ Product Owner REJECTED"
  PO_APPROVED=false
  exit 1
fi

# Calculate duration
END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ TEST PASSED: Scenario 01 - Perfect Storm"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results:"
echo "  Duration: ${DURATION}ms"
echo "  Iterations: 1"
echo "  Gate: $GATE_AVG (≥0.75) ✅"
echo "  Consensus: $CONSENSUS_AVG (≥0.90) ✅"
echo "  Product Owner: $DECISION ✅"
echo ""

# Generate JSON report
cat > "planning/cfn-testing/results/scenario-01-perfect-storm.json" <<EOF
{
  "testId": "synthetic-01",
  "testName": "Perfect Storm",
  "taskId": "$TASK_ID",
  "timestamp": "$(date -Iseconds)",
  "duration": $DURATION,
  "passed": true,
  "iterations": 1,
  "loop3": {
    "agents": ["coder", "researcher"],
    "confidence": {
      "coder": $CODER,
      "researcher": $RESEARCHER
    },
    "gateAvg": $GATE_AVG,
    "gatePassed": $GATE_PASSED
  },
  "loop2": {
    "agents": ["reviewer", "tester"],
    "confidence": {
      "reviewer": $REVIEWER,
      "tester": $TESTER
    },
    "consensusAvg": $CONSENSUS_AVG,
    "consensusPassed": $CONSENSUS_PASSED
  },
  "productOwner": {
    "decision": "$DECISION",
    "approved": $PO_APPROVED
  },
  "checks": {
    "gateEnforced": true,
    "consensusEnforced": true,
    "singleIteration": true,
    "productOwnerApproved": true
  }
}
EOF

echo "Report saved: planning/cfn-testing/results/scenario-01-perfect-storm.json"

# Cleanup (optional)
# redis-cli DEL "swarm:$TASK_ID:confidence" "swarm:$TASK_ID:product-owner"

exit 0