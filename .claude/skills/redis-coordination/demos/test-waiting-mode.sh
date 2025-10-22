#!/usr/bin/env bash
set -euo pipefail

# Test script for Redis Coordination Waiting Mode (v1.3.0)

# Utility functions
log_success() {
  echo -e "\033[32m[PASS]\033[0m $1"
}

log_failure() {
  echo -e "\033[31m[FAIL]\033[0m $1"
  exit 1
}

# Setup test variables
TASK_ID="test-task-$(date +%s)"
AGENT_IDS=("agent1" "agent2" "agent3")

# Ensure clean test environment
./invoke-redis-pattern.sh

# Test 1: Enter Waiting Mode
echo "### Test 1: Enter Waiting Mode ###"
wait_result=$(./invoke-redis-pattern.sh wait --task-id "$TASK_ID" --agent-id "${AGENT_IDS[0]}" --context "test-context")
echo "$wait_result" | jq -e '.status == "timeout"' > /dev/null || log_failure "Failed to enter waiting mode"
log_success "Entered waiting mode successfully"

# Test 2: Wake Agent
echo -e "\n### Test 2: Wake Agent ###"
payload='{"iteration": 2, "feedback": "Add error handling"}'
wake_result=$(./invoke-redis-pattern.sh wake --task-id "$TASK_ID" --agent-id "${AGENT_IDS[0]}" --payload "$payload")
echo "$wake_result" | jq -e '.status == "success"' > /dev/null || log_failure "Failed to wake agent"
log_success "Woke agent successfully"

# Test 3: Report Result
echo -e "\n### Test 3: Report Result ###"
report_result=$(./invoke-redis-pattern.sh report --task-id "$TASK_ID" --agent-id "${AGENT_IDS[0]}" --confidence 0.92 --result '{"key": "value"}')
echo "$report_result" | jq -e '.status == "success" and .confidence == 0.92' > /dev/null || log_failure "Failed to report result"
log_success "Reported result successfully"

# Test 4: Collect Consensus
echo -e "\n### Test 4: Collect Consensus ###"
for agent in "${AGENT_IDS[@]}"; do
  ./invoke-redis-pattern.sh report --task-id "$TASK_ID" --agent-id "$agent" --confidence 0.95 --result "{\"result\": \"test-$agent\"}"
done

collect_result=$(./invoke-redis-pattern.sh collect --task-id "$TASK_ID" --agent-ids "$(IFS=,; echo "${AGENT_IDS[*]}")")
echo "$collect_result" | jq -e '.status == "consensus" and .avgConfidence >= 0.90' > /dev/null || log_failure "Failed to collect consensus"
log_success "Collected consensus successfully"

# Test 5: Timeout Handling
echo -e "\n### Test 5: Timeout Handling ###"
timeout_task_id="timeout-test-$(date +%s)"
timeout_result=$(./invoke-redis-pattern.sh wait --task-id "$timeout_task_id" --agent-id "${AGENT_IDS[0]}" --context "timeout-test")
echo "$timeout_result" | jq -e '.status == "timeout"' > /dev/null || log_failure "Failed to handle timeout"
log_success "Timeout handled successfully"

echo -e "\n\033[32m✅ ALL REDIS COORDINATION TESTS PASSED!\033[0m"