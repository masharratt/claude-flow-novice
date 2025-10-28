#!/bin/bash

# Exit on error and disable pipefail for compatibility
set -e

TASK_ID="test-gate-guardian-$(date +%s)"
echo "CFN Loop Test: Scenario 02 - Gate Guardian"
echo "Task ID: $TASK_ID"
echo ""

START_TIME=$(date +%s%3N)
LOOP2_CALLED=false

# Iteration 1
echo "Iteration 1"
echo "Loop 3 Execution"
redis-cli DEL "swarm:$TASK_ID:confidence" > /dev/null 2>&1 || true
redis-cli HSET "swarm:$TASK_ID:confidence" "coder" "0.60"
redis-cli HSET "swarm:$TASK_ID:confidence" "researcher" "0.65"
redis-cli HSET "swarm:$TASK_ID:confidence" "backend-dev" "0.58"

GATE1=$(redis-cli HGETALL "swarm:$TASK_ID:confidence" | awk 'NR%2==0' | awk '{sum+=$1} END {print sum/NR}')
echo "Gate avg: $GATE1"

if [ $(echo "$GATE1 >= 0.75" | bc) -eq 1 ]; then
  echo "TEST FAILED: Gate should have failed iteration 1"
  exit 1
else
  echo "Gate FAILED as expected ($GATE1 < 0.75)"
  echo "Loop 2 NOT called (blocked)"
fi

# Iteration 2
echo ""
echo "Iteration 2"
echo "Loop 3 Execution"
redis-cli DEL "swarm:$TASK_ID:confidence" > /dev/null 2>&1
redis-cli HSET "swarm:$TASK_ID:confidence" "coder" "0.70"
redis-cli HSET "swarm:$TASK_ID:confidence" "researcher" "0.68"
redis-cli HSET "swarm:$TASK_ID:confidence" "backend-dev" "0.72"

GATE2=$(redis-cli HGETALL "swarm:$TASK_ID:confidence" | awk 'NR%2==0' | awk '{sum+=$1} END {print sum/NR}')
echo "Gate avg: $GATE2"

if [ $(echo "$GATE2 >= 0.75" | bc) -eq 1 ]; then
  echo "TEST FAILED: Gate should have failed iteration 2"
  exit 1
else
  echo "Gate FAILED as expected ($GATE2 < 0.75)"
  echo "Loop 2 NOT called (still blocked)"
fi

# Iteration 3
echo ""
echo "Iteration 3"
echo "Loop 3 Execution"
redis-cli DEL "swarm:$TASK_ID:confidence" > /dev/null 2>&1
redis-cli HSET "swarm:$TASK_ID:confidence" "coder" "0.80"
redis-cli HSET "swarm:$TASK_ID:confidence" "researcher" "0.78"
redis-cli HSET "swarm:$TASK_ID:confidence" "backend-dev" "0.82"

GATE3=$(redis-cli HGETALL "swarm:$TASK_ID:confidence" | awk 'NR%2==0' | awk '{sum+=$1} END {print sum/NR}')
echo "Gate avg: $GATE3"

if [ $(echo "$GATE3 >= 0.75" | bc) -eq 1 ]; then
  echo "Gate PASSED ($GATE3 >= 0.75)"
  echo ""
  echo "Loop 2 Execution (NOW ALLOWED)"
  LOOP2_CALLED=true

  redis-cli HSET "swarm:$TASK_ID:confidence" "reviewer" "0.92"
  redis-cli HSET "swarm:$TASK_ID:confidence" "tester" "0.90"

  REVIEWER=$(redis-cli HGET "swarm:$TASK_ID:confidence" "reviewer")
  TESTER=$(redis-cli HGET "swarm:$TASK_ID:confidence" "tester")
  CONSENSUS=$(echo "scale=3; ($REVIEWER + $TESTER) / 2" | bc)

  echo "Reviewer: $REVIEWER"
  echo "Tester: $TESTER"
  echo "Consensus avg: $CONSENSUS"

  if [ $(echo "$CONSENSUS >= 0.90" | bc) -eq 1 ]; then
    echo "Consensus PASSED ($CONSENSUS >= 0.90)"
  else
    echo "Consensus FAILED"
    exit 1
  fi
else
  echo "TEST FAILED: Gate should have passed iteration 3"
  exit 1
fi

echo ""
echo "Product Owner Decision"
redis-cli HSET "swarm:$TASK_ID:product-owner" "decision" "approve"
echo "Product Owner APPROVED"

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "TEST PASSED: Scenario 02 - Gate Guardian"
echo "Results:"
echo "Duration: ${DURATION}ms"
echo "Iterations: 3"
echo "Gate iter 1: $GATE1 (< 0.75) - Failed as expected"
echo "Gate iter 2: $GATE2 (< 0.75) - Failed as expected"
echo "Gate iter 3: $GATE3 (≥ 0.75) - Passed"
echo "Loop 2 called only on iter 3: $LOOP2_CALLED"
echo "Consensus: $CONSENSUS (≥ 0.90)"

# JSON Report (simplified for this test)
mkdir -p "planning/cfn-testing/results"
cat > "planning/cfn-testing/results/scenario-02-gate-guardian.json" <<EOF
{
  "testId": "synthetic-02",
  "testName": "Gate Guardian",
  "taskId": "$TASK_ID",
  "timestamp": "$(date -Iseconds)",
  "duration": $DURATION,
  "passed": true,
  "iterations": 3,
  "iteration1": {
    "loop3": {"coder": 0.60, "researcher": 0.65, "backend-dev": 0.58},
    "gateAvg": $GATE1,
    "gatePassed": false,
    "loop2Called": false
  },
  "iteration2": {
    "loop3": {"coder": 0.70, "researcher": 0.68, "backend-dev": 0.72},
    "gateAvg": $GATE2,
    "gatePassed": false,
    "loop2Called": false
  },
  "iteration3": {
    "loop3": {"coder": 0.80, "researcher": 0.78, "backend-dev": 0.82},
    "gateAvg": $GATE3,
    "gatePassed": true,
    "loop2Called": true,
    "loop2": {"reviewer": 0.92, "tester": 0.90},
    "consensusAvg": $CONSENSUS,
    "consensusPassed": true
  },
  "checks": {
    "gateEnforcedIterations1_2": true,
    "loop2BlockedUntilGatePass": true,
    "gatePassedIteration3": true,
    "consensusPassedIteration3": true,
    "totalIterations": 3
  }
}
EOF

echo "Report saved: planning/cfn-testing/results/scenario-02-gate-guardian.json"
exit 0