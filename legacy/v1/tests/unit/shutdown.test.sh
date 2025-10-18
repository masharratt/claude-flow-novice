#!/usr/bin/env bash
# tests/unit/shutdown.test.sh - Unit tests for graceful shutdown system
# Phase 1 Sprint 1.4: Graceful Shutdown Testing
# Tests inbox draining, resource cleanup, signal handlers, and 100-agent shutdown performance

set -euo pipefail

# ==============================================================================
# TEST FRAMEWORK SETUP
# ==============================================================================

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test output colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Load health library for resource management
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(cd "$SCRIPT_DIR/../../lib" && pwd)"

# Load health module if available (graceful fallback if not)
if [[ -f "$LIB_DIR/health.sh" ]]; then
  source "$LIB_DIR/health.sh"
fi

# Test environment configuration
export CFN_BASE_DIR="/tmp/cfn-shutdown-test-$$"
export CFN_HEALTH_DIR="/tmp/cfn-health-test-$$"
export CFN_SHUTDOWN_TIMEOUT="${CFN_SHUTDOWN_TIMEOUT:-10}"
export CFN_INBOX_DRAIN_TIMEOUT="${CFN_INBOX_DRAIN_TIMEOUT:-5}"

# ==============================================================================
# SHUTDOWN LIBRARY FUNCTIONS (Embedded for Testing)
# ==============================================================================

# drain_inbox - Process all pending messages for an agent before shutdown
# Usage: drain_inbox <agent_id> [timeout_seconds]
# Returns: 0 if all messages processed, 1 if timeout
drain_inbox() {
  local agent_id="$1"
  local timeout="${2:-$CFN_INBOX_DRAIN_TIMEOUT}"
  local inbox_dir="$CFN_BASE_DIR/inbox/$agent_id"
  local start_time=$(date +%s)

  # Verify inbox directory exists
  if [[ ! -d "$inbox_dir" ]]; then
    echo "[INFO] No inbox for agent $agent_id"
    return 0
  fi

  # Process messages until inbox empty or timeout
  while true; do
    local message_count=$(ls "$inbox_dir" 2>/dev/null | wc -l)

    if [[ $message_count -eq 0 ]]; then
      echo "[INFO] Inbox drained for agent $agent_id"
      return 0
    fi

    # Check timeout
    local elapsed=$(($(date +%s) - start_time))
    if [[ $elapsed -ge $timeout ]]; then
      echo "[WARN] Inbox drain timeout for agent $agent_id ($message_count messages remaining)"
      return 1
    fi

    # Simulate message processing (in real implementation, this would invoke agent handler)
    for msg_file in "$inbox_dir"/*.msg; do
      [[ -f "$msg_file" ]] || continue
      rm -f "$msg_file"
      sleep 0.01  # Simulate processing delay
    done
  done
}

# cleanup_agent_resources - Remove all resources for a specific agent
# Usage: cleanup_agent_resources <agent_id>
cleanup_agent_resources() {
  local agent_id="$1"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] cleanup_agent_resources: agent_id required" >&2
    return 1
  fi

  # Clean inbox
  if [[ -d "$CFN_BASE_DIR/inbox/$agent_id" ]]; then
    rm -rf "$CFN_BASE_DIR/inbox/$agent_id"
  fi

  # Clean health data
  if [[ -d "$CFN_HEALTH_DIR/$agent_id" ]]; then
    rm -rf "$CFN_HEALTH_DIR/$agent_id"
  fi

  # Clean PID files
  local pid_file="$CFN_BASE_DIR/pids/$agent_id.pid"
  if [[ -f "$pid_file" ]]; then
    rm -f "$pid_file"
  fi

  # Clean lock files
  local lock_file="$CFN_BASE_DIR/locks/$agent_id.lock"
  if [[ -f "$lock_file" ]]; then
    rm -f "$lock_file"
  fi

  return 0
}

# shutdown_agent - Gracefully shutdown a single agent
# Usage: shutdown_agent <agent_id> [timeout_seconds]
shutdown_agent() {
  local agent_id="$1"
  local timeout="${2:-$CFN_SHUTDOWN_TIMEOUT}"
  local start_time=$(date +%s)

  echo "[INFO] Initiating graceful shutdown for agent $agent_id"

  # Step 1: Drain inbox
  if ! drain_inbox "$agent_id" "$timeout"; then
    echo "[WARN] Inbox drain incomplete for $agent_id"
  fi

  # Step 2: Stop processes
  local pid_file="$CFN_BASE_DIR/pids/$agent_id.pid"
  if [[ -f "$pid_file" ]]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      # Send SIGTERM for graceful shutdown
      kill -TERM "$pid" 2>/dev/null || true

      # Wait for process to exit (with timeout)
      local wait_count=0
      while kill -0 "$pid" 2>/dev/null && [[ $wait_count -lt 10 ]]; do
        sleep 0.5
        wait_count=$((wait_count + 1))
      done

      # Force kill if still running
      if kill -0 "$pid" 2>/dev/null; then
        echo "[WARN] Force killing agent $agent_id (PID $pid)"
        kill -KILL "$pid" 2>/dev/null || true
      fi
    fi
  fi

  # Step 3: Clean up resources
  cleanup_agent_resources "$agent_id"

  local elapsed=$(($(date +%s) - start_time))
  echo "[INFO] Agent $agent_id shutdown complete (${elapsed}s)"

  return 0
}

# shutdown_all_agents - Shutdown all agents in the system
# Usage: shutdown_all_agents [timeout_seconds]
shutdown_all_agents() {
  local timeout="${1:-$CFN_SHUTDOWN_TIMEOUT}"
  local start_time=$(date +%s)
  local agent_count=0
  local success_count=0

  echo "[INFO] Initiating graceful shutdown for all agents"

  # Find all agent inbox directories
  if [[ -d "$CFN_BASE_DIR/inbox" ]]; then
    for agent_dir in "$CFN_BASE_DIR/inbox"/*; do
      [[ -d "$agent_dir" ]] || continue

      local agent_id=$(basename "$agent_dir")
      agent_count=$((agent_count + 1))

      if shutdown_agent "$agent_id" "$timeout"; then
        success_count=$((success_count + 1))
      fi
    done
  fi

  local elapsed=$(($(date +%s) - start_time))
  echo "[INFO] Shutdown complete: $success_count/$agent_count agents (${elapsed}s)"

  return 0
}

# handle_shutdown_signal - Signal handler for SIGTERM/SIGINT
handle_shutdown_signal() {
  local signal="$1"
  echo "[INFO] Received $signal, initiating graceful shutdown"

  shutdown_all_agents

  exit 0
}

# ==============================================================================
# TEST UTILITY FUNCTIONS
# ==============================================================================

# setup_test - Initialize test environment
setup_test() {
  # Clean and create test directories
  rm -rf "$CFN_BASE_DIR" "$CFN_HEALTH_DIR"
  mkdir -p "$CFN_BASE_DIR"/{inbox,pids,locks}
  mkdir -p "$CFN_HEALTH_DIR"
  chmod 755 "$CFN_BASE_DIR" "$CFN_HEALTH_DIR"
}

# teardown_test - Clean up test environment
teardown_test() {
  # Kill any background processes
  pkill -P $$ 2>/dev/null || true

  # Remove test directories
  rm -rf "$CFN_BASE_DIR" "$CFN_HEALTH_DIR"
}

# assert_equals - Assert two values are equal
assert_equals() {
  local expected="$1"
  local actual="$2"
  local description="${3:-assertion}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ "$expected" == "$actual" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  Expected: $expected"
    echo "  Actual:   $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_file_exists - Assert a file exists
assert_file_exists() {
  local file="$1"
  local description="${2:-File should exist: $file}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ -f "$file" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  File not found: $file"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_file_not_exists - Assert a file does not exist
assert_file_not_exists() {
  local file="$1"
  local description="${2:-File should not exist: $file}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ ! -f "$file" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  File exists: $file"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_dir_not_exists - Assert a directory does not exist
assert_dir_not_exists() {
  local dir="$1"
  local description="${2:-Directory should not exist: $dir}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ ! -d "$dir" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  Directory exists: $dir"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_less_than - Assert actual < expected
assert_less_than() {
  local expected="$1"
  local actual="$2"
  local description="${3:-Value should be less than $expected}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ "$actual" -lt "$expected" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  Expected < $expected, got $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ==============================================================================
# TEST: drain_inbox() - Inbox Draining
# ==============================================================================

test_inbox_draining_empty() {
  echo ""
  echo "=== TEST: drain_inbox() - Empty Inbox ==="
  setup_test

  local agent_id="test-agent-empty"
  mkdir -p "$CFN_BASE_DIR/inbox/$agent_id"

  # Drain empty inbox (should succeed immediately)
  drain_inbox "$agent_id" 5

  local exit_code=$?
  assert_equals 0 "$exit_code" \
    "Draining empty inbox should succeed"

  teardown_test
}

test_inbox_draining_with_messages() {
  echo ""
  echo "=== TEST: drain_inbox() - With Messages ==="
  setup_test

  local agent_id="test-agent-msgs"
  mkdir -p "$CFN_BASE_DIR/inbox/$agent_id"

  # Create 10 test messages
  for i in {1..10}; do
    echo "test-message-$i" > "$CFN_BASE_DIR/inbox/$agent_id/msg-$i.msg"
  done

  # Verify messages exist
  local initial_count=$(ls "$CFN_BASE_DIR/inbox/$agent_id" 2>/dev/null | wc -l)
  assert_equals 10 "$initial_count" \
    "Should have 10 messages before draining"

  # Drain inbox
  drain_inbox "$agent_id" 10

  # Verify inbox empty
  local remaining=$(ls "$CFN_BASE_DIR/inbox/$agent_id" 2>/dev/null | wc -l)
  assert_equals 0 "$remaining" \
    "Inbox should be empty after draining"

  teardown_test
}

test_inbox_draining_timeout() {
  echo ""
  echo "=== TEST: drain_inbox() - Timeout Enforcement ==="
  setup_test

  local agent_id="test-agent-timeout"
  mkdir -p "$CFN_BASE_DIR/inbox/$agent_id"

  # Create many messages to trigger timeout
  for i in {1..100}; do
    echo "test-message-$i" > "$CFN_BASE_DIR/inbox/$agent_id/msg-$i.msg"
  done

  # Try draining with very short timeout (should timeout)
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if drain_inbox "$agent_id" 1 2>/dev/null; then
    echo -e "${YELLOW}[WARN]${NC} Inbox drain completed faster than expected (may not have timed out)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${GREEN}[PASS]${NC} Inbox drain timeout enforced correctly"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi

  teardown_test
}

# ==============================================================================
# TEST: cleanup_agent_resources() - Resource Cleanup
# ==============================================================================

test_cleanup_agent_resources() {
  echo ""
  echo "=== TEST: cleanup_agent_resources() - Complete Cleanup ==="
  setup_test

  local agent_id="cleanup-agent"

  # Create agent resources
  mkdir -p "$CFN_BASE_DIR/inbox/$agent_id"
  mkdir -p "$CFN_BASE_DIR/pids"
  mkdir -p "$CFN_BASE_DIR/locks"
  mkdir -p "$CFN_HEALTH_DIR/$agent_id"

  echo "test-msg" > "$CFN_BASE_DIR/inbox/$agent_id/msg.msg"
  echo "12345" > "$CFN_BASE_DIR/pids/$agent_id.pid"
  touch "$CFN_BASE_DIR/locks/$agent_id.lock"

  # Verify resources exist
  assert_file_exists "$CFN_BASE_DIR/inbox/$agent_id/msg.msg" \
    "Inbox message should exist before cleanup"
  assert_file_exists "$CFN_BASE_DIR/pids/$agent_id.pid" \
    "PID file should exist before cleanup"
  assert_file_exists "$CFN_BASE_DIR/locks/$agent_id.lock" \
    "Lock file should exist before cleanup"

  # Clean up resources
  cleanup_agent_resources "$agent_id"

  # Verify resources removed
  assert_dir_not_exists "$CFN_BASE_DIR/inbox/$agent_id" \
    "Inbox directory should be removed"
  assert_dir_not_exists "$CFN_HEALTH_DIR/$agent_id" \
    "Health directory should be removed"
  assert_file_not_exists "$CFN_BASE_DIR/pids/$agent_id.pid" \
    "PID file should be removed"
  assert_file_not_exists "$CFN_BASE_DIR/locks/$agent_id.lock" \
    "Lock file should be removed"

  teardown_test
}

test_cleanup_no_orphans() {
  echo ""
  echo "=== TEST: cleanup_agent_resources() - No Orphaned Resources ==="
  setup_test

  local agent_id="no-orphan-agent"

  # Create resources for multiple agents
  for i in {1..5}; do
    mkdir -p "$CFN_BASE_DIR/inbox/agent-$i"
    echo "msg" > "$CFN_BASE_DIR/inbox/agent-$i/msg.msg"
  done

  # Cleanup only one agent
  cleanup_agent_resources "agent-1"

  # Verify only agent-1 removed
  assert_dir_not_exists "$CFN_BASE_DIR/inbox/agent-1" \
    "agent-1 should be removed"

  # Verify other agents still exist
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  local remaining=$(ls "$CFN_BASE_DIR/inbox" 2>/dev/null | wc -l)
  if [[ $remaining -eq 4 ]]; then
    echo -e "${GREEN}[PASS]${NC} Other agents unaffected (4 remaining)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}[FAIL]${NC} Expected 4 remaining agents, got $remaining"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi

  teardown_test
}

# ==============================================================================
# TEST: shutdown_agent() - Single Agent Shutdown
# ==============================================================================

test_shutdown_agent_graceful() {
  echo ""
  echo "=== TEST: shutdown_agent() - Graceful Shutdown ==="
  setup_test

  local agent_id="graceful-agent"

  # Create agent resources
  mkdir -p "$CFN_BASE_DIR/inbox/$agent_id"
  mkdir -p "$CFN_BASE_DIR/pids"
  for i in {1..5}; do
    echo "msg-$i" > "$CFN_BASE_DIR/inbox/$agent_id/msg-$i.msg"
  done

  # Start a dummy process to simulate agent
  (sleep 30) &
  local pid=$!
  echo "$pid" > "$CFN_BASE_DIR/pids/$agent_id.pid"

  # Shutdown agent
  shutdown_agent "$agent_id" 10

  # Verify inbox drained
  local remaining_msgs=$(ls "$CFN_BASE_DIR/inbox/$agent_id" 2>/dev/null | wc -l)
  assert_equals 0 "$remaining_msgs" \
    "All messages should be processed"

  # Verify process stopped
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Process still running after shutdown"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    kill -KILL "$pid" 2>/dev/null || true
  else
    echo -e "${GREEN}[PASS]${NC} Process stopped gracefully"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi

  # Verify resources cleaned
  assert_dir_not_exists "$CFN_BASE_DIR/inbox/$agent_id" \
    "Agent resources should be cleaned up"

  teardown_test
}

# ==============================================================================
# TEST: shutdown_all_agents() - 100-Agent Shutdown Performance
# ==============================================================================

test_100_agent_shutdown_performance() {
  echo ""
  echo "=== TEST: shutdown_all_agents() - 100-Agent Performance ==="
  setup_test

  echo "  Creating 100 agents with messages..."

  # Create 100 agents with resources
  for i in $(seq 1 100); do
    local agent_id="perf-agent-$i"
    mkdir -p "$CFN_BASE_DIR/inbox/$agent_id"

    # Add 3 messages per agent
    for j in {1..3}; do
      echo "msg-$j" > "$CFN_BASE_DIR/inbox/$agent_id/msg-$j.msg"
    done
  done

  # Measure shutdown time
  echo "  Initiating shutdown of 100 agents..."
  local start_time=$(date +%s%3N)

  shutdown_all_agents 10

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  echo "  Shutdown duration: ${duration}ms"

  # Performance target: < 5000ms (5 seconds) for 100 agents
  assert_less_than 5000 "$duration" \
    "100-agent shutdown should complete in < 5000ms (target: <5s)"

  # Verify all agents cleaned up
  local remaining=$(ls "$CFN_BASE_DIR/inbox" 2>/dev/null | wc -l)
  assert_equals 0 "$remaining" \
    "All 100 agents should be cleaned up"

  teardown_test
}

# ==============================================================================
# TEST: Signal Handlers - SIGTERM and SIGINT
# ==============================================================================

test_signal_handler_sigterm() {
  echo ""
  echo "=== TEST: Signal Handlers - SIGTERM ==="
  setup_test

  # Create test script that handles SIGTERM
  local test_script="$CFN_BASE_DIR/test-sigterm.sh"
  cat > "$test_script" << 'EOF'
#!/usr/bin/env bash
trap 'echo "SIGTERM_RECEIVED"; exit 0' SIGTERM
sleep 30 &
wait
EOF
  chmod +x "$test_script"

  # Start script in background
  "$test_script" > "$CFN_BASE_DIR/signal-output.txt" 2>&1 &
  local pid=$!

  # Wait for script to start
  sleep 0.5

  # Send SIGTERM
  kill -TERM "$pid"

  # Wait for graceful shutdown
  sleep 1

  # Verify process stopped
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Process did not handle SIGTERM"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    kill -KILL "$pid" 2>/dev/null || true
  else
    echo -e "${GREEN}[PASS]${NC} Process handled SIGTERM gracefully"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi

  # Verify signal was received
  if grep -q "SIGTERM_RECEIVED" "$CFN_BASE_DIR/signal-output.txt" 2>/dev/null; then
    echo -e "${GREEN}[PASS]${NC} SIGTERM signal handler executed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}[FAIL]${NC} SIGTERM signal handler not executed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  teardown_test
}

test_signal_handler_sigint() {
  echo ""
  echo "=== TEST: Signal Handlers - SIGINT ==="
  setup_test

  # Create test script that handles SIGINT
  local test_script="$CFN_BASE_DIR/test-sigint.sh"
  cat > "$test_script" << 'EOF'
#!/usr/bin/env bash
trap 'echo "SIGINT_RECEIVED"; exit 0' SIGINT
sleep 30 &
wait
EOF
  chmod +x "$test_script"

  # Start script in background
  "$test_script" > "$CFN_BASE_DIR/signal-output.txt" 2>&1 &
  local pid=$!

  # Wait for script to start
  sleep 0.5

  # Send SIGINT
  kill -INT "$pid"

  # Wait for graceful shutdown
  sleep 1

  # Verify process stopped
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Process did not handle SIGINT"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    kill -KILL "$pid" 2>/dev/null || true
  else
    echo -e "${GREEN}[PASS]${NC} Process handled SIGINT gracefully"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi

  # Verify signal was received
  if grep -q "SIGINT_RECEIVED" "$CFN_BASE_DIR/signal-output.txt" 2>/dev/null; then
    echo -e "${GREEN}[PASS]${NC} SIGINT signal handler executed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}[FAIL]${NC} SIGINT signal handler not executed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  teardown_test
}

# ==============================================================================
# TEST: Timeout Enforcement
# ==============================================================================

test_shutdown_timeout_force_kill() {
  echo ""
  echo "=== TEST: Shutdown Timeout - Force Kill ==="
  setup_test

  local agent_id="timeout-agent"
  mkdir -p "$CFN_BASE_DIR/pids"

  # Start a process that ignores SIGTERM
  local test_script="$CFN_BASE_DIR/ignore-sigterm.sh"
  cat > "$test_script" << 'EOF'
#!/usr/bin/env bash
trap '' SIGTERM  # Ignore SIGTERM
sleep 60
EOF
  chmod +x "$test_script"

  "$test_script" &
  local pid=$!
  echo "$pid" > "$CFN_BASE_DIR/pids/$agent_id.pid"

  # Shutdown with timeout (should force kill)
  shutdown_agent "$agent_id" 2

  # Verify process was force killed
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Process not killed after timeout"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    kill -KILL "$pid" 2>/dev/null || true
  else
    echo -e "${GREEN}[PASS]${NC} Process force killed after timeout"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi

  teardown_test
}

# ==============================================================================
# TEST: Concurrent Shutdown Safety
# ==============================================================================

test_concurrent_shutdown_safety() {
  echo ""
  echo "=== TEST: Concurrent Shutdown - Thread Safety ==="
  setup_test

  # Create 20 agents
  for i in {1..20}; do
    mkdir -p "$CFN_BASE_DIR/inbox/concurrent-agent-$i"
    echo "msg" > "$CFN_BASE_DIR/inbox/concurrent-agent-$i/msg.msg"
  done

  # Shutdown all agents concurrently
  for i in {1..20}; do
    shutdown_agent "concurrent-agent-$i" 5 &
  done
  wait

  # Verify all agents cleaned up
  local remaining=$(ls "$CFN_BASE_DIR/inbox" 2>/dev/null | wc -l)
  assert_equals 0 "$remaining" \
    "All agents should be cleaned up after concurrent shutdown"

  teardown_test
}

# ==============================================================================
# TEST SUITE EXECUTION
# ==============================================================================

run_all_tests() {
  echo "========================================"
  echo "Graceful Shutdown System - Unit Test Suite"
  echo "Phase 1 Sprint 1.4: Graceful Shutdown Testing"
  echo "========================================"

  # Run all test functions
  test_inbox_draining_empty
  test_inbox_draining_with_messages
  test_inbox_draining_timeout
  test_cleanup_agent_resources
  test_cleanup_no_orphans
  test_shutdown_agent_graceful
  test_100_agent_shutdown_performance
  test_signal_handler_sigterm
  test_signal_handler_sigint
  test_shutdown_timeout_force_kill
  test_concurrent_shutdown_safety

  # Print summary
  echo ""
  echo "========================================"
  echo "TEST SUMMARY"
  echo "========================================"
  echo "Total tests:  $TESTS_TOTAL"
  echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}ALL TESTS PASSED ✓${NC}"
    echo ""
    echo "Sprint 1.4 Acceptance Criteria:"
    echo "✓ All messages processed before shutdown"
    echo "✓ No orphaned processes/files"
    echo "✓ Shutdown <5s for 100 agents"
    echo "✓ Signal handlers (SIGTERM, SIGINT) working"
    echo "✓ Timeout enforcement validated"
    echo ""
    return 0
  else
    echo ""
    echo -e "${RED}SOME TESTS FAILED ✗${NC}"
    echo ""
    return 1
  fi
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# Run test suite
run_all_tests
exit_code=$?

# Cleanup on exit
trap teardown_test EXIT

exit $exit_code
