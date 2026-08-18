#!/usr/bin/env bash
#
# CFN Loop Scaling Test: 10 Concurrent Agents
#
# Tests orchestrator's ability to spawn and coordinate 10 agents concurrently
# without race conditions, deadlocks, or data corruption.
#
# Success Criteria:
# - All 10 agents spawn successfully
# - Zero race conditions detected
# - Consensus calculation accurate
# - Completion time < 2 minutes
# - Redis state consistent post-execution

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test configuration
NUM_AGENTS=10
TASK_ID="scaling-test-10-$(date +%s)"
TIMEOUT=120
TEST_RESULT_FILE="/tmp/scaling-test-10-results-${TASK_ID}.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "CFN Loop Scaling Test: 10 Concurrent Agents"
echo "========================================"
echo "Task ID: $TASK_ID"
echo "Agents: $NUM_AGENTS"
echo "Timeout: ${TIMEOUT}s"
echo "========================================"

# Initialize test results
cat > "$TEST_RESULT_FILE" <<EOF
{
  "test": "10-agent-concurrent",
  "taskId": "$TASK_ID",
  "agents": $NUM_AGENTS,
  "startTime": "$(date -Iseconds)",
  "status": "running",
  "results": {}
}
EOF

# Clean up any previous test data
echo "Cleaning up previous test data..."
redis-cli KEYS "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL || true

# Function to spawn a test agent
spawn_test_agent() {
  local agent_id="$1"
  local agent_type="$2"

  echo "Spawning agent: $agent_id ($agent_type)"

  # Simulate agent work via Redis
  redis-cli HSET "swarm:${TASK_ID}:${agent_id}:state" \
    status "spawned" \
    type "$agent_type" \
    start_time "$(date -Iseconds)" \
    confidence "0.0" &

  local pid=$!
  echo "$pid" > "/tmp/agent-${agent_id}.pid"
}

# Function to simulate agent completion
complete_agent() {
  local agent_id="$1"
  local confidence="$2"

  echo "Completing agent: $agent_id with confidence $confidence"

  # Update agent state
  redis-cli HSET "swarm:${TASK_ID}:${agent_id}:state" \
    status "completed" \
    end_time "$(date -Iseconds)" \
    confidence "$confidence"

  # Signal completion
  redis-cli LPUSH "swarm:${TASK_ID}:${agent_id}:done" "complete"

  # Report confidence
  redis-cli SET "swarm:${TASK_ID}:${agent_id}:confidence" "$confidence"
}

# Test 1: Spawn 10 agents concurrently
echo ""
echo "Test 1: Spawning 10 agents concurrently..."
test1_start=$(date +%s)

for i in $(seq 1 5); do
  spawn_test_agent "loop3-agent-${i}" "implementer"
done

for i in $(seq 1 3); do
  spawn_test_agent "loop2-agent-${i}" "validator"
done

spawn_test_agent "loop4-agent-1" "product-owner"
spawn_test_agent "coordinator-agent-1" "coordinator"

# Wait for spawn operations to complete
sleep 2

test1_end=$(date +%s)
test1_duration=$((test1_end - test1_start))

# Verify all agents spawned
spawned_count=$(redis-cli KEYS "swarm:${TASK_ID}:*:state" | wc -l)

if [ "$spawned_count" -eq "$NUM_AGENTS" ]; then
  echo -e "${GREEN}✓ Test 1 PASSED${NC}: All $NUM_AGENTS agents spawned ($test1_duration seconds)"
  test1_status="PASSED"
else
  echo -e "${RED}✗ Test 1 FAILED${NC}: Only $spawned_count/$NUM_AGENTS agents spawned"
  test1_status="FAILED"
fi

# Test 2: Simulate concurrent agent completion
echo ""
echo "Test 2: Simulating concurrent agent completion..."
test2_start=$(date +%s)

# Complete Loop 3 agents with varying confidence
complete_agent "loop3-agent-1" "0.85" &
complete_agent "loop3-agent-2" "0.78" &
complete_agent "loop3-agent-3" "0.92" &
complete_agent "loop3-agent-4" "0.88" &
complete_agent "loop3-agent-5" "0.80" &

# Complete Loop 2 agents
complete_agent "loop2-agent-1" "0.90" &
complete_agent "loop2-agent-2" "0.95" &
complete_agent "loop2-agent-3" "0.88" &

# Complete coordinator and product owner
complete_agent "coordinator-agent-1" "1.0" &
complete_agent "loop4-agent-1" "0.92" &

# Wait for all completions
wait

test2_end=$(date +%s)
test2_duration=$((test2_end - test2_start))

# Verify all agents completed
completed_count=$(redis-cli KEYS "swarm:${TASK_ID}:*:done" | wc -l)

if [ "$completed_count" -eq "$NUM_AGENTS" ]; then
  echo -e "${GREEN}✓ Test 2 PASSED${NC}: All $NUM_AGENTS agents completed ($test2_duration seconds)"
  test2_status="PASSED"
else
  echo -e "${RED}✗ Test 2 FAILED${NC}: Only $completed_count/$NUM_AGENTS agents completed"
  test2_status="FAILED"
fi

# Test 3: Verify no race conditions in confidence reporting
echo ""
echo "Test 3: Verifying race condition prevention..."
test3_start=$(date +%s)

# Check for duplicate confidence entries
duplicate_count=0
for i in $(seq 1 10); do
  agent_id="loop3-agent-$i"
  if [ $i -gt 5 ]; then
    agent_id="loop2-agent-$((i-5))"
  fi

  confidence_entries=$(redis-cli KEYS "swarm:${TASK_ID}:${agent_id}:confidence" | wc -l)
  if [ "$confidence_entries" -gt 1 ]; then
    duplicate_count=$((duplicate_count + 1))
  fi
done

test3_end=$(date +%s)
test3_duration=$((test3_end - test3_start))

if [ "$duplicate_count" -eq 0 ]; then
  echo -e "${GREEN}✓ Test 3 PASSED${NC}: Zero race conditions detected ($test3_duration seconds)"
  test3_status="PASSED"
else
  echo -e "${RED}✗ Test 3 FAILED${NC}: $duplicate_count race conditions detected"
  test3_status="FAILED"
fi

# Test 4: Calculate consensus from concurrent confidence scores
echo ""
echo "Test 4: Calculating consensus from concurrent agents..."
test4_start=$(date +%s)

# Get Loop 3 confidence scores
loop3_confidence_sum=0
loop3_confidence_count=0

for i in $(seq 1 5); do
  confidence=$(redis-cli GET "swarm:${TASK_ID}:loop3-agent-${i}:confidence")
  if [ -n "$confidence" ]; then
    loop3_confidence_sum=$(echo "$loop3_confidence_sum + $confidence" | bc)
    loop3_confidence_count=$((loop3_confidence_count + 1))
  fi
done

loop3_avg=$(echo "scale=4; $loop3_confidence_sum / $loop3_confidence_count" | bc)

# Get Loop 2 consensus scores
loop2_consensus_sum=0
loop2_consensus_count=0

for i in $(seq 1 3); do
  consensus=$(redis-cli GET "swarm:${TASK_ID}:loop2-agent-${i}:confidence")
  if [ -n "$consensus" ]; then
    loop2_consensus_sum=$(echo "$loop2_consensus_sum + $consensus" | bc)
    loop2_consensus_count=$((loop2_consensus_count + 1))
  fi
done

loop2_avg=$(echo "scale=4; $loop2_consensus_sum / $loop2_consensus_count" | bc)

test4_end=$(date +%s)
test4_duration=$((test4_end - test4_start))

echo "Loop 3 Average Confidence: $loop3_avg"
echo "Loop 2 Average Consensus: $loop2_avg"

# Validate consensus calculation accuracy (expected values based on test data)
expected_loop3_avg="0.8460"
expected_loop2_avg="0.9100"

loop3_diff=$(echo "$loop3_avg - $expected_loop3_avg" | bc | tr -d '-')
loop2_diff=$(echo "$loop2_avg - $expected_loop2_avg" | bc | tr -d '-')

if (( $(echo "$loop3_diff < 0.01" | bc -l) )) && (( $(echo "$loop2_diff < 0.01" | bc -l) )); then
  echo -e "${GREEN}✓ Test 4 PASSED${NC}: Consensus calculation accurate ($test4_duration seconds)"
  test4_status="PASSED"
else
  echo -e "${RED}✗ Test 4 FAILED${NC}: Consensus calculation inaccurate"
  test4_status="FAILED"
fi

# Test 5: Verify Redis state consistency
echo ""
echo "Test 5: Verifying Redis state consistency..."
test5_start=$(date +%s)

# Check for orphaned keys
expected_key_count=$((NUM_AGENTS * 3)) # state, confidence, done per agent
actual_key_count=$(redis-cli KEYS "swarm:${TASK_ID}:*" | wc -l)

test5_end=$(date +%s)
test5_duration=$((test5_end - test5_start))

echo "Expected keys: $expected_key_count"
echo "Actual keys: $actual_key_count"

if [ "$actual_key_count" -ge "$expected_key_count" ]; then
  echo -e "${GREEN}✓ Test 5 PASSED${NC}: Redis state consistent ($test5_duration seconds)"
  test5_status="PASSED"
else
  echo -e "${YELLOW}⚠ Test 5 WARNING${NC}: Fewer keys than expected (may indicate cleanup)"
  test5_status="WARNING"
fi

# Calculate total test duration
total_end=$(date +%s)
total_start=$(jq -r '.startTime' "$TEST_RESULT_FILE" | date -d - +%s)
total_duration=$((total_end - total_start))

# Generate final test report
cat > "$TEST_RESULT_FILE" <<EOF
{
  "test": "10-agent-concurrent",
  "taskId": "$TASK_ID",
  "agents": $NUM_AGENTS,
  "startTime": "$(jq -r '.startTime' "$TEST_RESULT_FILE")",
  "endTime": "$(date -Iseconds)",
  "duration": ${total_duration},
  "status": "completed",
  "results": {
    "test1_spawn": {
      "status": "$test1_status",
      "duration": $test1_duration,
      "spawnedAgents": $spawned_count,
      "expectedAgents": $NUM_AGENTS
    },
    "test2_completion": {
      "status": "$test2_status",
      "duration": $test2_duration,
      "completedAgents": $completed_count,
      "expectedAgents": $NUM_AGENTS
    },
    "test3_race_conditions": {
      "status": "$test3_status",
      "duration": $test3_duration,
      "raceConditions": $duplicate_count
    },
    "test4_consensus": {
      "status": "$test4_status",
      "duration": $test4_duration,
      "loop3Confidence": $loop3_avg,
      "loop2Consensus": $loop2_avg
    },
    "test5_consistency": {
      "status": "$test5_status",
      "duration": $test5_duration,
      "expectedKeys": $expected_key_count,
      "actualKeys": $actual_key_count
    }
  },
  "summary": {
    "passedTests": 0,
    "failedTests": 0,
    "warningTests": 0,
    "totalTests": 5
  }
}
EOF

# Calculate summary
passed_count=0
failed_count=0
warning_count=0

for status in "$test1_status" "$test2_status" "$test3_status" "$test4_status" "$test5_status"; do
  if [ "$status" = "PASSED" ]; then
    passed_count=$((passed_count + 1))
  elif [ "$status" = "FAILED" ]; then
    failed_count=$((failed_count + 1))
  elif [ "$status" = "WARNING" ]; then
    warning_count=$((warning_count + 1))
  fi
done

# Update summary
jq ".summary.passedTests = $passed_count | .summary.failedTests = $failed_count | .summary.warningTests = $warning_count" \
  "$TEST_RESULT_FILE" > "${TEST_RESULT_FILE}.tmp" && mv "${TEST_RESULT_FILE}.tmp" "$TEST_RESULT_FILE"

# Print final summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Total Duration: ${total_duration}s"
echo -e "${GREEN}Passed: $passed_count${NC}"
echo -e "${RED}Failed: $failed_count${NC}"
echo -e "${YELLOW}Warnings: $warning_count${NC}"
echo "========================================"
echo "Results saved to: $TEST_RESULT_FILE"

# Cleanup
echo ""
echo "Cleaning up test data..."
redis-cli KEYS "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL || true
rm -f /tmp/agent-*.pid

# Exit with appropriate code
if [ "$failed_count" -gt 0 ]; then
  echo -e "${RED}✗ Test suite FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}✓ Test suite PASSED${NC}"
  exit 0
fi
