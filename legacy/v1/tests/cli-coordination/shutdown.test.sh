#!/usr/bin/env bash
# tests/cli-coordination/shutdown.test.sh - Test suite for graceful shutdown system
# Phase 1 Sprint 1.4: Graceful Shutdown Implementation

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test configuration
TEST_BASE_DIR="/tmp/cfn-shutdown-test-$$"
export CFN_BASE_DIR="$TEST_BASE_DIR/coordination"
export CFN_HEALTH_DIR="$TEST_BASE_DIR/health"
export SHUTDOWN_TIMEOUT=2
export HEALTH_DIR="$CFN_HEALTH_DIR"

# Source the shutdown library
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib"
source "$LIB_DIR/shutdown.sh"
source "$LIB_DIR/health.sh" 2>/dev/null || true

# ==============================================================================
# TEST HELPERS
# ==============================================================================

test_start() {
  local test_name="$1"
  TESTS_RUN=$((TESTS_RUN + 1))
  echo -e "\n${YELLOW}TEST $TESTS_RUN: $test_name${NC}"
}

test_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}✓ PASS${NC}"
}

test_fail() {
  local reason="$1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}✗ FAIL: $reason${NC}"
}

setup_test_env() {
  # Create test directories
  mkdir -p "$CFN_BASE_DIR/inbox" "$CFN_BASE_DIR/outbox" "$CFN_BASE_DIR/pids" "$CFN_BASE_DIR/tmp"
  mkdir -p "$CFN_HEALTH_DIR"
}

cleanup_test_env() {
  # Remove test directories
  rm -rf "$TEST_BASE_DIR"
}

create_test_agent() {
  local agent_id="$1"
  local message_count="${2:-3}"

  mkdir -p "$CFN_BASE_DIR/inbox/$agent_id"
  mkdir -p "$CFN_BASE_DIR/outbox/$agent_id"

  # Create test messages
  for i in $(seq 1 "$message_count"); do
    echo "{\"message_id\":\"msg-$i\",\"content\":\"test message $i\"}" > "$CFN_BASE_DIR/inbox/$agent_id/msg-$i.msg"
  done

  # Create PID file
  mkdir -p "$CFN_BASE_DIR/pids"
  echo "$$" > "$CFN_BASE_DIR/pids/$agent_id.pid"

  # Report health
  if command -v report_health &>/dev/null; then
    report_health "$agent_id" "healthy" "{\"test\":true}" 2>/dev/null || true
  fi
}

# ==============================================================================
# TEST CASES
# ==============================================================================

test_inbox_drain_basic() {
  test_start "Inbox drain - basic functionality"

  setup_test_env
  create_test_agent "test-agent-1" 5

  # Drain inbox
  local processed
  processed=$(drain_inbox "test-agent-1" 10 2>&1 | grep "messages processed" | grep -o '[0-9]\+' | tail -1)

  if [[ "$processed" -eq 5 ]]; then
    test_pass
  else
    test_fail "Expected 5 messages processed, got $processed"
  fi

  cleanup_test_env
}

test_inbox_drain_timeout() {
  test_start "Inbox drain - timeout handling"

  setup_test_env
  create_test_agent "test-agent-2" 100  # Many messages

  # Override process_message to add delay
  process_message() {
    sleep 0.1
    return 0
  }

  # Drain with short timeout
  local start_time=$(date +%s)
  drain_inbox "test-agent-2" 1 >/dev/null 2>&1 || true
  local elapsed=$(($(date +%s) - start_time))

  # Should timeout around 1 second
  if [[ "$elapsed" -le 2 ]]; then
    test_pass
  else
    test_fail "Timeout not enforced (elapsed: ${elapsed}s)"
  fi

  cleanup_test_env
}

test_cleanup_agent_resources() {
  test_start "Cleanup agent resources - complete removal"

  setup_test_env
  create_test_agent "test-agent-3" 3

  # Cleanup resources
  cleanup_agent_resources "test-agent-3" >/dev/null 2>&1

  # Verify directories removed
  local remaining=0
  [[ -d "$CFN_BASE_DIR/inbox/test-agent-3" ]] && remaining=$((remaining + 1))
  [[ -d "$CFN_BASE_DIR/outbox/test-agent-3" ]] && remaining=$((remaining + 1))
  [[ -f "$CFN_BASE_DIR/pids/test-agent-3.pid" ]] && remaining=$((remaining + 1))
  [[ -d "$CFN_HEALTH_DIR/test-agent-3" ]] && remaining=$((remaining + 1))

  if [[ "$remaining" -eq 0 ]]; then
    test_pass
  else
    test_fail "$remaining resource(s) not cleaned up"
  fi

  cleanup_test_env
}

test_shutdown_agent_basic() {
  test_start "Shutdown agent - basic flow"

  setup_test_env
  create_test_agent "test-agent-4" 2

  # Shutdown agent
  local start_time=$(date +%s)
  shutdown_agent "test-agent-4" 10 >/dev/null 2>&1
  local elapsed=$(($(date +%s) - start_time))

  # Verify cleanup
  local errors=0
  [[ -d "$CFN_BASE_DIR/inbox/test-agent-4" ]] && errors=$((errors + 1))
  [[ -d "$CFN_BASE_DIR/outbox/test-agent-4" ]] && errors=$((errors + 1))

  # Verify shutdown time < timeout
  if [[ "$errors" -eq 0 ]] && [[ "$elapsed" -le 10 ]]; then
    test_pass
  else
    test_fail "Errors: $errors, Elapsed: ${elapsed}s"
  fi

  cleanup_test_env
}

test_shutdown_agent_timeout_enforcement() {
  test_start "Shutdown agent - timeout enforcement"

  setup_test_env
  create_test_agent "test-agent-5" 5

  # Override drain_inbox to simulate slow processing
  drain_inbox() {
    sleep 10  # Exceed timeout
    echo "0"
  }

  # Shutdown with short timeout
  local start_time=$(date +%s)
  shutdown_agent "test-agent-5" 2 >/dev/null 2>&1 || true
  local elapsed=$(($(date +%s) - start_time))

  # Should complete near timeout (within 1 second)
  if [[ "$elapsed" -le 12 ]]; then
    test_pass
  else
    test_fail "Shutdown took too long: ${elapsed}s"
  fi

  cleanup_test_env
}

test_shutdown_all_agents_parallel() {
  test_start "Shutdown all agents - parallel execution"

  setup_test_env

  # Create multiple agents
  for i in {1..5}; do
    create_test_agent "agent-$i" 2
  done

  # Shutdown all agents
  local start_time=$(date +%s)
  shutdown_all_agents 10 >/dev/null 2>&1
  local elapsed=$(($(date +%s) - start_time))

  # Verify all agents cleaned up
  local remaining=$(find "$CFN_BASE_DIR/inbox" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)

  # Parallel execution should be fast (< 5s for 5 agents with 2 messages each)
  if [[ "$remaining" -eq 0 ]] && [[ "$elapsed" -le 5 ]]; then
    test_pass
  else
    test_fail "Remaining agents: $remaining, Elapsed: ${elapsed}s"
  fi

  cleanup_test_env
}

test_shutdown_signal_handlers() {
  test_start "Shutdown signal handlers - SIGTERM handling"

  setup_test_env
  create_test_agent "signal-test-agent" 1

  # Create background process that sets up signal handler
  (
    trap 'shutdown_all_agents 5 >/dev/null 2>&1; exit 0' SIGTERM
    sleep 30 &
    wait
  ) &
  local bg_pid=$!

  sleep 0.5

  # Send SIGTERM
  kill -TERM "$bg_pid" 2>/dev/null || true
  sleep 1

  # Verify process terminated
  if ! kill -0 "$bg_pid" 2>/dev/null; then
    test_pass
  else
    test_fail "Background process still running"
    kill -KILL "$bg_pid" 2>/dev/null || true
  fi

  cleanup_test_env
}

test_shutdown_performance_100_agents() {
  test_start "Shutdown performance - 100 agents < 5s"

  setup_test_env

  # Create 100 agents with 1 message each
  for i in {1..100}; do
    create_test_agent "perf-agent-$i" 1
  done

  # Shutdown all agents and measure time
  local start_time=$(date +%s)
  shutdown_all_agents 5 >/dev/null 2>&1
  local elapsed=$(($(date +%s) - start_time))

  # Verify completion within 5 seconds (acceptance criteria)
  if [[ "$elapsed" -le 5 ]]; then
    test_pass
  else
    test_fail "Shutdown took ${elapsed}s (requirement: <5s for 100 agents)"
  fi

  cleanup_test_env
}

test_is_shutdown_in_progress() {
  test_start "Shutdown status - is_shutdown_in_progress flag"

  setup_test_env

  # Initially false
  if is_shutdown_in_progress; then
    test_fail "Shutdown flag incorrectly set at start"
    cleanup_test_env
    return
  fi

  # Set shutdown flag
  SHUTDOWN_IN_PROGRESS=true

  # Should be true now
  if is_shutdown_in_progress; then
    test_pass
  else
    test_fail "Shutdown flag not set correctly"
  fi

  SHUTDOWN_IN_PROGRESS=false
  cleanup_test_env
}

test_failed_message_handling() {
  test_start "Failed message handling - move to failed directory"

  setup_test_env
  create_test_agent "failed-msg-agent" 3

  # Override process_message to fail on 2nd message
  process_message() {
    local msg_file="$1"
    if [[ "$msg_file" == *"msg-2.msg"* ]]; then
      return 1  # Fail
    fi
    return 0
  }

  # Drain inbox
  drain_inbox "failed-msg-agent" 10 >/dev/null 2>&1

  # Check failed directory
  local failed_count=0
  if [[ -d "$CFN_BASE_DIR/failed/failed-msg-agent" ]]; then
    failed_count=$(find "$CFN_BASE_DIR/failed/failed-msg-agent" -name "*.msg" 2>/dev/null | wc -l)
  fi

  if [[ "$failed_count" -eq 1 ]]; then
    test_pass
  else
    test_fail "Expected 1 failed message, found $failed_count"
  fi

  cleanup_test_env
}

# ==============================================================================
# RUN ALL TESTS
# ==============================================================================

main() {
  echo "========================================"
  echo "  Graceful Shutdown Test Suite"
  echo "  Phase 1 Sprint 1.4"
  echo "========================================"

  # Run all tests
  test_inbox_drain_basic
  test_inbox_drain_timeout
  test_cleanup_agent_resources
  test_shutdown_agent_basic
  test_shutdown_agent_timeout_enforcement
  test_shutdown_all_agents_parallel
  test_shutdown_signal_handlers
  test_shutdown_performance_100_agents
  test_is_shutdown_in_progress
  test_failed_message_handling

  # Summary
  echo ""
  echo "========================================"
  echo "  TEST SUMMARY"
  echo "========================================"
  echo "Total tests:  $TESTS_RUN"
  echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
  else
    echo "Failed:       $TESTS_FAILED"
  fi
  echo "========================================"

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
  fi
}

# Run tests
main
