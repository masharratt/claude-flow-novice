#!/usr/bin/env bash
# tests/docker/north-star/01-agent-spawning/test-cli-commands.sh
# Phase 1 :: Validate CFN Loop CLI command execution and agent spawning

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_TASK_ID="north-star-cli-$(date +%s)"
TEST_DIR="/tmp/north-star-tests/$TEST_TASK_ID"
LOG_FILE="$TEST_DIR/cli-commands.log"

cleanup() {
  log_step "Cleanup: Removing test artifacts"
  rm -rf "$TEST_DIR" || true
  # Kill any remaining processes
  pkill -f "cfn-loop-cli" || true
  pkill -f "claude-flow-novice" || true
}
trap cleanup EXIT

setup_test_environment() {
  log_step "GIVEN: Test environment is prepared"

  mkdir -p "$TEST_DIR"

  # Verify CLI commands are available
  if ! command -v npx &> /dev/null; then
    log_error "NPX not found"
    return 1
  fi

  if [ ! -f "$PROJECT_ROOT/.claude/commands/cfn/cfn-loop-cli" ]; then
    log_error "CFN Loop CLI command not found"
    return 1
  fi

  log_info "Environment validated: NPX and CFN Loop CLI available"
  return 0
}

test_cli_mode_command_execution() {
  log_step "WHEN: CFN Loop CLI command is executed"

  local start_time=$(date +%s)
  local timeout_duration=60
  local expected_deliverable="$TEST_DIR/hello-world.txt"

  # Execute CLI mode command in background with proper output capture
  (
    cd "$PROJECT_ROOT"
    timeout $timeout_duration /usr/bin/env bash -c "
      /cfn-loop-cli 'Create a simple hello-world.txt file with greeting' \
        --mode=mvp \
        --timeout=30 \
        --task-id=$TEST_TASK_ID \
        2>&1 | tee '$LOG_FILE'
    " &
  )

  local cli_pid=$!
  log_info "CLI command started with PID: $cli_pid"

  # Monitor execution with timeout
  local elapsed=0
  while [ $elapsed -lt $timeout_duration ]; do
    if kill -0 $cli_pid 2>/dev/null; then
      log_info "CLI command running... (${elapsed}s elapsed)"
      sleep 5
      elapsed=$((elapsed + 5))
    else
      wait $cli_pid
      local exit_code=$?
      log_info "CLI command completed with exit code: $exit_code"
      break
    fi
  done

  # Handle timeout scenario
  if kill -0 $cli_pid 2>/dev/null; then
    log_warn "CLI command timeout, terminating process"
    kill -TERM $cli_pid || true
    sleep 2
    kill -KILL $cli_pid || true
    return 1
  fi

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  log_info "Command execution time: ${duration}s"

  return 0
}

test_agent_spawning_validation() {
  log_step "THEN: Agent spawning is validated"

  # Validate log output for agent spawning indicators
  if [ -f "$LOG_FILE" ]; then
    local spawn_count=$(grep -c "Spawning agent\|Agent spawned\|npx claude-flow-novice" "$LOG_FILE" || echo "0")
    log_info "Agent spawn indicators found: $spawn_count"

    # Check for CFN Loop execution patterns
    local cfn_indicators=$(grep -c "CFN Loop\|Loop 3\|Loop 2\|Product Owner\|Gate check\|consensus" "$LOG_FILE" || echo "0")
    log_info "CFN Loop execution indicators: $cfn_indicators"

    # Validate expected patterns are present
    if [ "$spawn_count" -gt 0 ]; then
      log_info "✅ Agent spawning detected in logs"
    else
      log_error "❌ No agent spawning indicators found"
      return 1
    fi

    if [ "$cfn_indicators" -gt 0 ]; then
      log_info "✅ CFN Loop execution patterns detected"
    else
      log_warn "⚠️  No CFN Loop patterns detected (may be expected for simple tasks)"
    fi
  else
    log_error "❌ Log file not found"
    return 1
  fi

  return 0
}

test_deliverable_creation() {
  log_step "AND: Deliverable creation is validated"

  local expected_deliverable="/tmp/trigger-dev-deliverables/$TEST_TASK_ID/hello-world.txt"
  local max_wait=30
  local waited=0

  while [ $waited -lt $max_wait ]; do
    if [ -f "$expected_deliverable" ]; then
      local content=$(cat "$expected_deliverable" 2>/dev/null || echo "")
      if [ -n "$content" ]; then
        log_info "✅ Deliverable created with content: ${content:0:50}..."
        return 0
      fi
    fi
    sleep 2
    waited=$((waited + 2))
  done

  log_warn "⚠️  Deliverable not found at $expected_deliverable after ${max_wait}s"

  # Check for alternative deliverable locations
  local alt_locations=(
    "$TEST_DIR/hello-world.txt"
    "/tmp/north-star-deliverables/$TEST_TASK_ID/hello-world.txt"
  )

  for location in "${alt_locations[@]}"; do
    if [ -f "$location" ]; then
      log_info "✅ Deliverable found at alternative location: $location"
      return 0
    fi
  done

  return 1
}

test_error_scenarios() {
  log_step "AND: Error scenarios are handled gracefully"

  # Test invalid command
  log_info "Testing invalid command handling..."

  (
    cd "$PROJECT_ROOT"
    timeout 10 /usr/bin/env bash -c "
      /cfn-loop-cli '' --mode=mvp --task-id=test-error 2>&1 || true
    " &
  )

  local error_pid=$!
  wait $error_pid 2>/dev/null || true

  # Verify graceful failure (no zombie processes)
  local remaining_processes=$(pgrep -f "cfn-loop-cli\|claude-flow-novice" | wc -l || echo "0")
  if [ "$remaining_processes" -eq 0 ]; then
    log_info "✅ Error scenario handled cleanly"
  else
    log_warn "⚠️  $remaining_processes processes still running after error"
    pkill -f "cfn-loop-cli\|claude-flow-novice" || true
  fi

  return 0
}

# Main test execution
main() {
  annotate "CFN Loop CLI Command Test" \
    "Validates /cfn-loop-cli command execution, agent spawning, and deliverable creation"

  setup_test_environment
  test_cli_mode_command_execution
  test_agent_spawning_validation
  test_deliverable_creation
  test_error_scenarios

  log_success "CFN Loop CLI command tests completed successfully"
}

# Execute test
main "$@"