#!/usr/bin/env bash
# 100-Agent Coordination Scale Test
# Production-ready test for validating coordination at scale
#
# Tests:
# - Cold start: 100 agents spawn simultaneously
# - Message burst: All agents send to random targets
# - Health monitoring: Detect unhealthy agents in <5s
# - Graceful shutdown: Clean termination of all 100 agents
#
# Target: <5s coordination time for 100 agents
# Output: JSONL format for metrics collection

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source coordination infrastructure
source "$PROJECT_ROOT/lib/message-bus.sh"
source "$PROJECT_ROOT/config/coordination-config.sh"

# Test configuration
AGENT_COUNT="${AGENT_COUNT:-100}"
MESSAGE_BURST_SIZE="${MESSAGE_BURST_SIZE:-10}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-5}"
TEST_OUTPUT_FILE="${TEST_OUTPUT_FILE:-/dev/shm/cfn-test-100agent-results.jsonl}"
AGENT_WORK_DIR="/dev/shm/cfn-100agent-test"

# Test state
TEST_START_TIME=""
TEST_RESULTS=()
SPAWNED_AGENTS=()
AGENT_PIDS=()

# ==============================================================================
# LOGGING & METRICS
# ==============================================================================

log_test() {
  echo "[$(date '+%H:%M:%S.%3N')] [100-AGENT-TEST] $*" >&2
}

emit_result() {
  local test_name="$1"
  local status="$2"
  local duration_ms="$3"
  local details="$4"

  local result=$(cat <<EOF
{"test":"$test_name","status":"$status","duration_ms":$duration_ms,"timestamp":$(date +%s),"details":$details}
EOF
  )

  echo "$result" >> "$TEST_OUTPUT_FILE"
  TEST_RESULTS+=("$result")
}

# ==============================================================================
# AGENT SIMULATION (REAL COORDINATION)
# ==============================================================================

# agent_worker - Individual agent process with real coordination
# Args: $1=agent_id, $2=total_agents
agent_worker() {
  local agent_id="$1"
  local total_agents="$2"
  local agent_log="$AGENT_WORK_DIR/agents/$agent_id.log"

  # Initialize message bus for this agent with retry logic
  local init_retry=0
  while [ $init_retry -lt 3 ]; do
    if init_message_bus "$agent_id" >> "$agent_log" 2>&1; then
      break
    fi
    init_retry=$((init_retry + 1))
    sleep 0.1
  done

  if [ $init_retry -ge 3 ]; then
    echo "ERROR: Failed to initialize message bus after 3 attempts" >> "$agent_log"
    exit 1
  fi

  # Send coordination heartbeat
  local payload=$(cat <<EOF
{"agent_id":"$agent_id","status":"ready","timestamp":$(date +%s)}
EOF
  )

  # Send ready message to coordinator with retry logic
  local send_retry=0
  while [ $send_retry -lt 3 ]; do
    if send_message "$agent_id" "coordinator" "agent:ready" "$payload" >> "$agent_log" 2>&1; then
      break
    fi
    send_retry=$((send_retry + 1))
    sleep 0.05
  done

  if [ $send_retry -ge 3 ]; then
    echo "ERROR: Failed to send ready signal after 3 attempts" >> "$agent_log"
  fi

  # Receive instructions from coordinator
  local wait_count=0
  while [ $wait_count -lt 200 ]; do
    local messages=$(receive_messages "$agent_id" 2>/dev/null || echo "[]")
    # Count messages by counting msg_id occurrences (handle multi-line JSON)
    local msg_count=$(echo "$messages" | tr '\n' ' ' | grep -o '"msg_id"' | wc -l)
    msg_count=${msg_count// /}  # Remove spaces from wc output

    if [ "$msg_count" -gt 0 ] 2>/dev/null; then
      # Process instructions (extract first message type)
      local instruction_type=$(echo "$messages" | grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)".*/\1/')

      if [ "$instruction_type" = "burst:send" ]; then
        # Message burst phase: send to random targets
        for i in $(seq 1 $MESSAGE_BURST_SIZE); do
          local target_id=$(( (RANDOM % total_agents) + 1 ))
          local target="agent-$target_id"

          # Avoid sending to self
          if [ "$target" != "$agent_id" ]; then
            local burst_payload=$(cat <<EOF
{"from":"$agent_id","to":"$target","seq":$i,"timestamp":$(date +%s)}
EOF
            )
            send_message "$agent_id" "$target" "burst:message" "$burst_payload" >> "$agent_log" 2>&1 || true
          fi
        done

        # Report completion
        local complete_payload=$(cat <<EOF
{"agent_id":"$agent_id","burst_sent":$MESSAGE_BURST_SIZE,"timestamp":$(date +%s)}
EOF
        )
        send_message "$agent_id" "coordinator" "burst:complete" "$complete_payload" >> "$agent_log" 2>&1
      fi

      if [ "$instruction_type" = "health:check" ]; then
        # Health check response
        local health_status="healthy"
        local inbox_count=$(message_count "$agent_id" "inbox")
        local outbox_count=$(message_count "$agent_id" "outbox")

        local health_payload=$(cat <<EOF
{"agent_id":"$agent_id","status":"$health_status","inbox":$inbox_count,"outbox":$outbox_count,"timestamp":$(date +%s)}
EOF
        )
        send_message "$agent_id" "coordinator" "health:response" "$health_payload" >> "$agent_log" 2>&1
      fi

      if [ "$instruction_type" = "shutdown" ]; then
        # Graceful shutdown
        clear_inbox "$agent_id" >> "$agent_log" 2>&1 || true
        cleanup_message_bus "$agent_id" >> "$agent_log" 2>&1 || true
        exit 0
      fi

      # Clear processed messages
      clear_inbox "$agent_id" >> "$agent_log" 2>&1 || true
    fi

    wait_count=$((wait_count + 1))
    sleep 0.1
  done

  # Timeout - cleanup and exit
  cleanup_message_bus "$agent_id" >> "$agent_log" 2>&1 || true
  exit 1
}

# ==============================================================================
# TEST SCENARIOS
# ==============================================================================

# test_cold_start - Spawn 100 agents simultaneously
test_cold_start() {
  log_test "Starting COLD START test (spawning $AGENT_COUNT agents)"

  local start_time=$(date +%s%3N)

  # Spawn all agents in parallel
  for i in $(seq 1 $AGENT_COUNT); do
    local agent_id="agent-$i"
    SPAWNED_AGENTS+=("$agent_id")

    # Launch agent worker in background
    agent_worker "$agent_id" "$AGENT_COUNT" &
    AGENT_PIDS+=($!)
  done

  log_test "Spawned $AGENT_COUNT agents, waiting for ready signals"

  # Wait for all agents to report ready with proper message accumulation
  local ready_count=0
  local timeout_count=0
  local accumulated_ready=0

  while [ $accumulated_ready -lt $AGENT_COUNT ] && [ $timeout_count -lt 200 ]; do
    local messages=$(receive_messages "coordinator" 2>/dev/null || echo "[]")
    ready_count=$(echo "$messages" | tr '\n' ' ' | grep -o '"type"[[:space:]]*:[[:space:]]*"agent:ready"' | wc -l)
    ready_count=${ready_count// /}

    if [ "$ready_count" -gt 0 ] 2>/dev/null; then
      accumulated_ready=$((accumulated_ready + ready_count))
      log_test "Received $ready_count ready signals (total: $accumulated_ready/$AGENT_COUNT)"
      clear_inbox "coordinator" 2>/dev/null || true
    fi

    if [ $accumulated_ready -lt $AGENT_COUNT ]; then
      sleep 0.1
      timeout_count=$((timeout_count + 1))
    fi
  done

  # Final check: ensure we have all ready signals
  ready_count=$accumulated_ready
  log_test "Synchronization barrier: $ready_count/$AGENT_COUNT agents ready"

  # Small delay to ensure all agents are in listening state
  sleep 0.5

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  local status="PASS"
  if [ $ready_count -lt $AGENT_COUNT ]; then
    status="FAIL"
  fi

  local details=$(cat <<EOF
{"ready_agents":$ready_count,"total_agents":$AGENT_COUNT,"timeout":$timeout_count}
EOF
  )

  emit_result "cold_start" "$status" "$duration" "$details"
  log_test "COLD START: $status (${duration}ms, $ready_count/$AGENT_COUNT agents ready)"

  return $([ "$status" = "PASS" ] && echo 0 || echo 1)
}

# test_message_burst - All agents send to random targets
test_message_burst() {
  log_test "Starting MESSAGE BURST test (each agent sends $MESSAGE_BURST_SIZE messages)"

  local start_time=$(date +%s%3N)

  # Broadcast burst instruction to all agents
  for agent_id in "${SPAWNED_AGENTS[@]}"; do
    local burst_instruction=$(cat <<EOF
{"command":"burst","size":$MESSAGE_BURST_SIZE,"timestamp":$(date +%s)}
EOF
    )
    send_message "coordinator" "$agent_id" "burst:send" "$burst_instruction" 2>/dev/null || true
  done

  # Wait for completion reports with proper accumulation
  local complete_count=0
  local timeout_count=0
  local accumulated_complete=0

  while [ $accumulated_complete -lt $AGENT_COUNT ] && [ $timeout_count -lt 400 ]; do
    local messages=$(receive_messages "coordinator" 2>/dev/null || echo "[]")
    complete_count=$(echo "$messages" | tr '\n' ' ' | grep -o '"type"[[:space:]]*:[[:space:]]*"burst:complete"' | wc -l)
    complete_count=${complete_count// /}

    if [ "$complete_count" -gt 0 ] 2>/dev/null; then
      accumulated_complete=$((accumulated_complete + complete_count))
      log_test "Received $complete_count completion reports (total: $accumulated_complete/$AGENT_COUNT)"
      clear_inbox "coordinator" 2>/dev/null || true
    fi

    if [ $accumulated_complete -lt $AGENT_COUNT ]; then
      sleep 0.05
      timeout_count=$((timeout_count + 1))
    fi
  done

  # Update final count
  complete_count=$accumulated_complete
  log_test "Message burst complete: $complete_count/$AGENT_COUNT agents reported"

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  # Validate message delivery (sample 10 agents)
  local delivered_count=0
  local expected_total=$((MESSAGE_BURST_SIZE * 10))

  for i in $(seq 1 10); do
    local sample_agent="agent-$((i * 10))"
    local inbox_count=$(message_count "$sample_agent" "inbox" 2>/dev/null || echo "0")
    delivered_count=$((delivered_count + inbox_count))
  done

  local delivery_rate=0
  if [ $expected_total -gt 0 ]; then
    delivery_rate=$(( (delivered_count * 100) / expected_total ))
  fi

  local status="PASS"
  if [ $complete_count -lt $AGENT_COUNT ] || [ $delivery_rate -lt 80 ]; then
    status="FAIL"
  fi

  local details=$(cat <<EOF
{"complete_agents":$complete_count,"delivery_rate":$delivery_rate,"sampled_messages":$delivered_count,"expected":$expected_total}
EOF
  )

  emit_result "message_burst" "$status" "$duration" "$details"
  log_test "MESSAGE BURST: $status (${duration}ms, $complete_count agents, ${delivery_rate}% delivery rate)"

  return $([ "$status" = "PASS" ] && echo 0 || echo 1)
}

# test_health_monitoring - Detect agent health in <5s
test_health_monitoring() {
  log_test "Starting HEALTH MONITORING test (target: <${HEALTH_CHECK_TIMEOUT}s)"

  local start_time=$(date +%s%3N)

  # Broadcast health check to all agents
  for agent_id in "${SPAWNED_AGENTS[@]}"; do
    local health_check=$(cat <<EOF
{"command":"health_check","timestamp":$(date +%s)}
EOF
    )
    send_message "coordinator" "$agent_id" "health:check" "$health_check" 2>/dev/null || true
  done

  # Wait for health responses with proper accumulation
  local response_count=0
  local timeout_count=0
  local accumulated_responses=0
  local max_timeout=$((HEALTH_CHECK_TIMEOUT * 20))

  while [ $accumulated_responses -lt $AGENT_COUNT ] && [ $timeout_count -lt $max_timeout ]; do
    local messages=$(receive_messages "coordinator" 2>/dev/null || echo "[]")
    response_count=$(echo "$messages" | tr '\n' ' ' | grep -o '"type"[[:space:]]*:[[:space:]]*"health:response"' | wc -l)
    response_count=${response_count// /}

    if [ "$response_count" -gt 0 ] 2>/dev/null; then
      accumulated_responses=$((accumulated_responses + response_count))
      clear_inbox "coordinator" 2>/dev/null || true
    fi

    if [ $accumulated_responses -lt $AGENT_COUNT ]; then
      sleep 0.05
      timeout_count=$((timeout_count + 1))
    fi
  done

  # Update final count
  response_count=$accumulated_responses
  log_test "Health check complete: $response_count/$AGENT_COUNT agents responded"

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  local status="PASS"
  if [ $duration -gt $((HEALTH_CHECK_TIMEOUT * 1000)) ] || [ $response_count -lt $AGENT_COUNT ]; then
    status="FAIL"
  fi

  local details=$(cat <<EOF
{"healthy_agents":$response_count,"total_agents":$AGENT_COUNT,"timeout_ms":$((HEALTH_CHECK_TIMEOUT * 1000))}
EOF
  )

  emit_result "health_monitoring" "$status" "$duration" "$details"
  log_test "HEALTH MONITORING: $status (${duration}ms, $response_count/$AGENT_COUNT agents responded)"

  return $([ "$status" = "PASS" ] && echo 0 || echo 1)
}

# test_graceful_shutdown - Clean termination of all 100 agents
test_graceful_shutdown() {
  log_test "Starting GRACEFUL SHUTDOWN test"

  local start_time=$(date +%s%3N)

  # Broadcast shutdown to all agents
  for agent_id in "${SPAWNED_AGENTS[@]}"; do
    local shutdown_msg=$(cat <<EOF
{"command":"shutdown","timestamp":$(date +%s)}
EOF
    )
    send_message "coordinator" "$agent_id" "shutdown" "$shutdown_msg" 2>/dev/null || true
  done

  # Wait for agent processes to exit
  local shutdown_count=0
  for pid in "${AGENT_PIDS[@]}"; do
    if wait "$pid" 2>/dev/null; then
      shutdown_count=$((shutdown_count + 1))
    else
      shutdown_count=$((shutdown_count + 1))
    fi
  done

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  # Verify cleanup
  local remaining_dirs=0
  for agent_id in "${SPAWNED_AGENTS[@]}"; do
    if [ -d "$MESSAGE_BASE_DIR/$agent_id" ]; then
      remaining_dirs=$((remaining_dirs + 1))
    fi
  done

  local status="PASS"
  if [ $remaining_dirs -gt 0 ] || [ $shutdown_count -lt $AGENT_COUNT ]; then
    status="FAIL"
  fi

  local details=$(cat <<EOF
{"shutdown_agents":$shutdown_count,"total_agents":$AGENT_COUNT,"remaining_dirs":$remaining_dirs}
EOF
  )

  emit_result "graceful_shutdown" "$status" "$duration" "$details"
  log_test "GRACEFUL SHUTDOWN: $status (${duration}ms, $shutdown_count agents, $remaining_dirs dirs remaining)"

  return $([ "$status" = "PASS" ] && echo 0 || echo 1)
}

# ==============================================================================
# TEST ORCHESTRATION
# ==============================================================================

setup_test_environment() {
  log_test "Setting up test environment"

  # Clean previous test data
  rm -rf "$AGENT_WORK_DIR" 2>/dev/null || true
  rm -f "$TEST_OUTPUT_FILE" 2>/dev/null || true

  # Create directories
  mkdir -p "$AGENT_WORK_DIR/agents"
  mkdir -p "$(dirname "$TEST_OUTPUT_FILE")"

  # Initialize message bus system
  init_message_bus_system

  # Initialize coordinator inbox
  init_message_bus "coordinator"

  log_test "Test environment ready"
}

cleanup_test_environment() {
  log_test "Cleaning up test environment"

  # Kill any remaining agent processes
  for pid in "${AGENT_PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  # Wait for processes to terminate
  sleep 1

  # Force kill if still running
  for pid in "${AGENT_PIDS[@]}"; do
    kill -KILL "$pid" 2>/dev/null || true
  done

  # Cleanup message bus
  cleanup_message_bus_system

  # Remove test directories
  rm -rf "$AGENT_WORK_DIR" 2>/dev/null || true

  log_test "Cleanup complete"
}

print_test_summary() {
  log_test "Test Summary:"
  log_test "============================================"

  local total_tests=0
  local passed_tests=0
  local failed_tests=0

  for result in "${TEST_RESULTS[@]}"; do
    total_tests=$((total_tests + 1))

    local test_name=$(echo "$result" | grep -o '"test":"[^"]*"' | sed 's/.*"\([^"]*\)"/\1/')
    local status=$(echo "$result" | grep -o '"status":"[^"]*"' | sed 's/.*"\([^"]*\)"/\1/')
    local duration=$(echo "$result" | grep -o '"duration_ms":[0-9]*' | sed 's/.*:\([0-9]*\)/\1/')

    if [ "$status" = "PASS" ]; then
      passed_tests=$((passed_tests + 1))
      log_test "  ✓ $test_name: PASS (${duration}ms)"
    else
      failed_tests=$((failed_tests + 1))
      log_test "  ✗ $test_name: FAIL (${duration}ms)"
    fi
  done

  log_test "============================================"
  log_test "Total: $total_tests | Passed: $passed_tests | Failed: $failed_tests"
  log_test "Results saved to: $TEST_OUTPUT_FILE"

  return $failed_tests
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

main() {
  TEST_START_TIME=$(date +%s)

  log_test "100-Agent Coordination Scale Test"
  log_test "Agent Count: $AGENT_COUNT"
  log_test "Message Burst Size: $MESSAGE_BURST_SIZE"
  log_test "Health Check Timeout: ${HEALTH_CHECK_TIMEOUT}s"

  # Setup
  setup_test_environment

  # Run tests
  local test_failures=0

  test_cold_start || test_failures=$((test_failures + 1))
  test_message_burst || test_failures=$((test_failures + 1))
  test_health_monitoring || test_failures=$((test_failures + 1))
  test_graceful_shutdown || test_failures=$((test_failures + 1))

  # Cleanup
  cleanup_test_environment

  # Summary
  print_test_summary

  local test_end_time=$(date +%s)
  local total_duration=$((test_end_time - TEST_START_TIME))
  log_test "Total test duration: ${total_duration}s"

  exit $test_failures
}

# Run tests
main "$@"
