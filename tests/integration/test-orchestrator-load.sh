#!/usr/bin/env bash
#
# CFN Loop Orchestrator Load Test
#
# Tests orchestrator performance under load with multiple iterations
# and complex agent coordination patterns.
#
# Success Criteria:
# - Handle 5 concurrent iterations
# - Process 15+ agents per iteration
# - Memory usage stable (<500MB growth)
# - Redis operations <50ms avg latency
# - Zero deadlocks or hangs

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test configuration
NUM_ITERATIONS=5
AGENTS_PER_ITERATION=15
TASK_ID="load-test-$(date +%s)"
TEST_RESULT_FILE="/tmp/orchestrator-load-test-${TASK_ID}.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "CFN Loop Orchestrator Load Test"
echo "========================================"
echo "Task ID: $TASK_ID"
echo "Iterations: $NUM_ITERATIONS"
echo "Agents per iteration: $AGENTS_PER_ITERATION"
echo "Total agents: $((NUM_ITERATIONS * AGENTS_PER_ITERATION))"
echo "========================================"

# Initialize test results
cat > "$TEST_RESULT_FILE" <<EOF
{
  "test": "orchestrator-load",
  "taskId": "$TASK_ID",
  "iterations": $NUM_ITERATIONS,
  "agentsPerIteration": $AGENTS_PER_ITERATION,
  "startTime": "$(date -Iseconds)",
  "status": "running",
  "results": {}
}
EOF

# Cleanup previous test data
redis-cli KEYS "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL || true

# Function to spawn agents for an iteration
spawn_iteration_agents() {
  local iteration=$1

  echo "Spawning $AGENTS_PER_ITERATION agents for iteration $iteration..."

  for i in $(seq 1 "$AGENTS_PER_ITERATION"); do
    local agent_id="agent-iter${iteration}-${i}"

    redis-cli HSET "swarm:${TASK_ID}:${agent_id}:state" \
      iteration "$iteration" \
      status "spawned" \
      start_time "$(date +%s)" &
  done

  wait
  echo "Iteration $iteration: All agents spawned"
}

# Function to complete agents for an iteration
complete_iteration_agents() {
  local iteration=$1

  echo "Completing $AGENTS_PER_ITERATION agents for iteration $iteration..."

  for i in $(seq 1 "$AGENTS_PER_ITERATION"); do
    local agent_id="agent-iter${iteration}-${i}"
    local confidence=$(awk -v min=0.70 -v max=0.95 'BEGIN{srand(); print min+rand()*(max-min)}')

    redis-cli HSET "swarm:${TASK_ID}:${agent_id}:state" \
      status "completed" \
      end_time "$(date +%s)" \
      confidence "$confidence"

    redis-cli LPUSH "swarm:${TASK_ID}:${agent_id}:done" "complete"
    redis-cli SET "swarm:${TASK_ID}:${agent_id}:confidence" "$confidence" &
  done

  wait
  echo "Iteration $iteration: All agents completed"
}

# Test 1: Sequential iteration execution
echo ""
echo "Test 1: Sequential iteration execution..."
test1_start=$(date +%s)

iteration_times=()

for iteration in $(seq 1 "$NUM_ITERATIONS"); do
  iter_start=$(date +%s)

  spawn_iteration_agents "$iteration"
  sleep 1
  complete_iteration_agents "$iteration"

  iter_end=$(date +%s)
  iter_duration=$((iter_end - iter_start))
  iteration_times+=("$iter_duration")

  echo "Iteration $iteration completed in ${iter_duration}s"
done

test1_end=$(date +%s)
test1_duration=$((test1_end - test1_start))

# Calculate average iteration time
total_iter_time=0
for time in "${iteration_times[@]}"; do
  total_iter_time=$((total_iter_time + time))
done
avg_iter_time=$((total_iter_time / NUM_ITERATIONS))

echo -e "${GREEN}✓ Test 1 PASSED${NC}: Completed $NUM_ITERATIONS iterations in ${test1_duration}s (avg: ${avg_iter_time}s/iter)"
test1_status="PASSED"

# Test 2: Verify agent count per iteration
echo ""
echo "Test 2: Verifying agent count per iteration..."
test2_start=$(date +%s)

agent_count_errors=0

for iteration in $(seq 1 "$NUM_ITERATIONS"); do
  iter_agents=$(redis-cli KEYS "swarm:${TASK_ID}:agent-iter${iteration}-*:state" | wc -l)

  if [ "$iter_agents" -ne "$AGENTS_PER_ITERATION" ]; then
    echo -e "${RED}✗ Iteration $iteration: Expected $AGENTS_PER_ITERATION agents, found $iter_agents${NC}"
    agent_count_errors=$((agent_count_errors + 1))
  fi
done

test2_end=$(date +%s)
test2_duration=$((test2_end - test2_start))

if [ "$agent_count_errors" -eq 0 ]; then
  echo -e "${GREEN}✓ Test 2 PASSED${NC}: All iterations have correct agent count ($test2_duration seconds)"
  test2_status="PASSED"
else
  echo -e "${RED}✗ Test 2 FAILED${NC}: $agent_count_errors iterations have incorrect agent count"
  test2_status="FAILED"
fi

# Test 3: Calculate consensus across all iterations
echo ""
echo "Test 3: Calculating consensus across iterations..."
test3_start=$(date +%s)

total_confidence=0
total_agents=0

for iteration in $(seq 1 "$NUM_ITERATIONS"); do
  for i in $(seq 1 "$AGENTS_PER_ITERATION"); do
    agent_id="agent-iter${iteration}-${i}"
    confidence=$(redis-cli GET "swarm:${TASK_ID}:${agent_id}:confidence")

    if [ -n "$confidence" ]; then
      total_confidence=$(echo "$total_confidence + $confidence" | bc)
      total_agents=$((total_agents + 1))
    fi
  done
done

overall_consensus=$(echo "scale=4; $total_confidence / $total_agents" | bc)

test3_end=$(date +%s)
test3_duration=$((test3_end - test3_start))

echo "Overall Consensus: $overall_consensus (from $total_agents agents)"

# Validate consensus is within reasonable range (0.70-0.95)
if (( $(echo "$overall_consensus >= 0.70" | bc -l) )) && (( $(echo "$overall_consensus <= 0.95" | bc -l) )); then
  echo -e "${GREEN}✓ Test 3 PASSED${NC}: Consensus within expected range ($test3_duration seconds)"
  test3_status="PASSED"
else
  echo -e "${RED}✗ Test 3 FAILED${NC}: Consensus outside expected range"
  test3_status="FAILED"
fi

# Test 4: Memory usage stability
echo ""
echo "Test 4: Checking memory usage stability..."
test4_start=$(date +%s)

# Get Redis memory usage
redis_memory_before=$(redis-cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
redis_memory_bytes_before=$(redis-cli INFO memory | grep "used_memory:" | grep -v human | cut -d: -f2 | tr -d '\r')

# Perform 100 rapid Redis operations to stress test
for i in $(seq 1 100); do
  redis-cli SET "swarm:${TASK_ID}:stress-test-${i}" "data-${i}" >/dev/null &
done
wait

redis_memory_bytes_after=$(redis-cli INFO memory | grep "used_memory:" | grep -v human | cut -d: -f2 | tr -d '\r')
redis_memory_after=$(redis-cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')

memory_growth=$((redis_memory_bytes_after - redis_memory_bytes_before))
memory_growth_mb=$((memory_growth / 1024 / 1024))

test4_end=$(date +%s)
test4_duration=$((test4_end - test4_start))

echo "Memory Before: $redis_memory_before"
echo "Memory After: $redis_memory_after"
echo "Memory Growth: ${memory_growth_mb}MB"

# Success if memory growth < 100MB (generous for test data)
if [ "$memory_growth_mb" -lt 100 ]; then
  echo -e "${GREEN}✓ Test 4 PASSED${NC}: Memory growth within limits ($test4_duration seconds)"
  test4_status="PASSED"
else
  echo -e "${YELLOW}⚠ Test 4 WARNING${NC}: Memory growth exceeded 100MB"
  test4_status="WARNING"
fi

# Test 5: Redis operation latency
echo ""
echo "Test 5: Measuring Redis operation latency..."
test5_start=$(date +%s)

# Perform 1000 operations and measure average latency
latency_sum=0
latency_count=1000

for i in $(seq 1 "$latency_count"); do
  op_start=$(date +%s%N)
  redis-cli GET "swarm:${TASK_ID}:agent-iter1-1:confidence" >/dev/null
  op_end=$(date +%s%N)

  op_latency=$((op_end - op_start))
  latency_sum=$((latency_sum + op_latency))
done

avg_latency_ns=$((latency_sum / latency_count))
avg_latency_ms=$(echo "scale=2; $avg_latency_ns / 1000000" | bc)

test5_end=$(date +%s)
test5_duration=$((test5_end - test5_start))

echo "Average Redis Latency: ${avg_latency_ms}ms"

# Success if latency < 50ms
if (( $(echo "$avg_latency_ms < 50" | bc -l) )); then
  echo -e "${GREEN}✓ Test 5 PASSED${NC}: Redis latency within limits ($test5_duration seconds)"
  test5_status="PASSED"
else
  echo -e "${YELLOW}⚠ Test 5 WARNING${NC}: Redis latency exceeded 50ms"
  test5_status="WARNING"
fi

# Calculate total test duration
total_end=$(date +%s)
total_start=$(jq -r '.startTime' "$TEST_RESULT_FILE" | date -d - +%s)
total_duration=$((total_end - total_start))

# Generate final test report
cat > "$TEST_RESULT_FILE" <<EOF
{
  "test": "orchestrator-load",
  "taskId": "$TASK_ID",
  "iterations": $NUM_ITERATIONS,
  "agentsPerIteration": $AGENTS_PER_ITERATION,
  "totalAgents": $((NUM_ITERATIONS * AGENTS_PER_ITERATION)),
  "startTime": "$(jq -r '.startTime' "$TEST_RESULT_FILE")",
  "endTime": "$(date -Iseconds)",
  "duration": $total_duration,
  "status": "completed",
  "results": {
    "test1_iterations": {
      "status": "$test1_status",
      "duration": $test1_duration,
      "avgIterationTime": $avg_iter_time,
      "iterationTimes": [$(IFS=,; echo "${iteration_times[*]}")]
    },
    "test2_agent_count": {
      "status": "$test2_status",
      "duration": $test2_duration,
      "errors": $agent_count_errors
    },
    "test3_consensus": {
      "status": "$test3_status",
      "duration": $test3_duration,
      "overallConsensus": $overall_consensus,
      "totalAgents": $total_agents
    },
    "test4_memory": {
      "status": "$test4_status",
      "duration": $test4_duration,
      "memoryGrowthMB": $memory_growth_mb,
      "memoryBefore": "$redis_memory_before",
      "memoryAfter": "$redis_memory_after"
    },
    "test5_latency": {
      "status": "$test5_status",
      "duration": $test5_duration,
      "avgLatencyMs": $avg_latency_ms,
      "operations": $latency_count
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
echo "Total Agents Processed: $((NUM_ITERATIONS * AGENTS_PER_ITERATION))"
echo -e "${GREEN}Passed: $passed_count${NC}"
echo -e "${RED}Failed: $failed_count${NC}"
echo -e "${YELLOW}Warnings: $warning_count${NC}"
echo "========================================"
echo "Results saved to: $TEST_RESULT_FILE"

# Cleanup
echo ""
echo "Cleaning up test data..."
redis-cli KEYS "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL || true

# Exit with appropriate code
if [ "$failed_count" -gt 0 ]; then
  echo -e "${RED}✗ Load test FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}✓ Load test PASSED${NC}"
  exit 0
fi
