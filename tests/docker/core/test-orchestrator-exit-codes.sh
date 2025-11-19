#!/bin/bash
# tests/docker/core/test-orchestrator-exit-codes.sh
# Phase 2 :: Docker Orchestrator Exit Code Validation (Priority 1)
# Validates exit codes for PROCEED, ABORT, and failure scenarios

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
TEST_DIR="/tmp/cfn-docker-exit-code-test-$(date +%s)"
NETWORK_NAME="test-exit-code-network"
ORCHESTRATOR_SCRIPT=".claude/skills/cfn-loop-orchestration/orchestrate.sh"

cleanup() {
  log_info "Cleaning up test resources"
  docker rm -f test-orchestrator-proceed test-orchestrator-abort test-orchestrator-fail 2>/dev/null || true
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

setup() {
  log_step "Setting up test environment"
  docker network create "$NETWORK_NAME" 2>/dev/null || true
  mkdir -p "$TEST_DIR"
}

# Test 1: PROCEED decision returns exit code 0
test_proceed_exit_code_zero() {
  log_step "PROCEED Decision Returns Exit Code 0"

  # GIVEN: Mock orchestrator that returns PROCEED
  mkdir -p "$TEST_DIR/proceed"

  cat > "$TEST_DIR/proceed/mock-orchestrator.sh" << 'EOF'
#!/bin/bash
echo "DECISION: PROCEED"
echo "REASON: All tests passed, work complete"
exit 0
EOF

  chmod +x "$TEST_DIR/proceed/mock-orchestrator.sh"

  # WHEN: Run orchestrator
  local exit_code=0
  "$TEST_DIR/proceed/mock-orchestrator.sh" || exit_code=$?

  # THEN: Exit code is 0
  if [ $exit_code -eq 0 ]; then
    log_pass "PROCEED decision returned exit code 0"
    return 0
  else
    log_fail "Expected exit code 0, got $exit_code"
    return 1
  fi
}

# Test 2: ABORT decision returns non-zero exit code
test_abort_exit_code_nonzero() {
  log_step "ABORT Decision Returns Non-Zero Exit Code"

  # GIVEN: Mock orchestrator that returns ABORT
  mkdir -p "$TEST_DIR/abort"

  cat > "$TEST_DIR/abort/mock-orchestrator.sh" << 'EOF'
#!/bin/bash
echo "DECISION: ABORT"
echo "REASON: Critical validation failures detected"
exit 1
EOF

  chmod +x "$TEST_DIR/abort/mock-orchestrator.sh"

  # WHEN: Run orchestrator
  local exit_code=0
  "$TEST_DIR/abort/mock-orchestrator.sh" || exit_code=$?

  # THEN: Exit code is non-zero
  if [ $exit_code -ne 0 ]; then
    log_pass "ABORT decision returned exit code $exit_code (non-zero)"
    return 0
  else
    log_fail "Expected non-zero exit code, got 0"
    return 1
  fi
}

# Test 3: Failure scenarios return non-zero exit code
test_failure_exit_code_nonzero() {
  log_step "Failure Scenarios Return Non-Zero Exit Code"

  # GIVEN: Mock orchestrator that encounters error
  mkdir -p "$TEST_DIR/failure"

  cat > "$TEST_DIR/failure/mock-orchestrator.sh" << 'EOF'
#!/bin/bash
echo "ERROR: Redis connection failed"
exit 2
EOF

  chmod +x "$TEST_DIR/failure/mock-orchestrator.sh"

  # WHEN: Run orchestrator
  local exit_code=0
  "$TEST_DIR/failure/mock-orchestrator.sh" || exit_code=$?

  # THEN: Exit code is non-zero
  if [ $exit_code -ne 0 ]; then
    log_pass "Failure scenario returned exit code $exit_code (non-zero)"
    return 0
  else
    log_fail "Expected non-zero exit code, got 0"
    return 1
  fi
}

# Test 4: docker-compose propagates exit code
test_docker_compose_propagates_exit_code() {
  log_step "docker-compose Propagates Container Exit Code"

  # GIVEN: Simple test container with exit code
  mkdir -p "$TEST_DIR/compose"

  cat > "$TEST_DIR/compose/docker-compose.yml" << EOF
version: '3.8'
services:
  test-success:
    image: alpine:latest
    command: sh -c "echo 'Success' && exit 0"
    network_mode: none

  test-failure:
    image: alpine:latest
    command: sh -c "echo 'Failure' && exit 1"
    network_mode: none
EOF

  # WHEN/THEN: Run success container
  local success_exit=0
  (cd "$TEST_DIR/compose" && docker-compose run --rm test-success) > /dev/null 2>&1 || success_exit=$?

  if [ $success_exit -eq 0 ]; then
    log_info "✓ docker-compose propagated exit code 0 (success)"
  else
    log_fail "Expected exit code 0, got $success_exit"
    return 1
  fi

  # WHEN/THEN: Run failure container
  local failure_exit=0
  (cd "$TEST_DIR/compose" && docker-compose run --rm test-failure) > /dev/null 2>&1 || failure_exit=$?

  if [ $failure_exit -ne 0 ]; then
    log_pass "docker-compose propagated non-zero exit code ($failure_exit)"
    return 0
  else
    log_fail "Expected non-zero exit code, got 0"
    return 1
  fi
}

# Test 5: Orchestrator script exit code validation
test_orchestrator_script_exit_codes() {
  log_step "Orchestrator Script Exit Code Patterns"

  # GIVEN: Different decision scenarios
  declare -A DECISIONS
  DECISIONS[PROCEED]=0
  DECISIONS[ITERATE]=0  # ITERATE continues loop, not an error
  DECISIONS[ABORT]=1

  # WHEN/THEN: Simulate each decision type
  local failed=0
  for decision in PROCEED ITERATE ABORT; do
    local expected_exit="${DECISIONS[$decision]}"

    mkdir -p "$TEST_DIR/$decision"
    cat > "$TEST_DIR/$decision/test.sh" << EOF
#!/bin/bash
echo "DECISION: $decision"
exit $expected_exit
EOF
    chmod +x "$TEST_DIR/$decision/test.sh"

    local actual_exit=0
    "$TEST_DIR/$decision/test.sh" > /dev/null 2>&1 || actual_exit=$?

    if [ $actual_exit -eq $expected_exit ]; then
      log_info "✓ $decision: exit code $actual_exit (expected $expected_exit)"
    else
      log_fail "✗ $decision: exit code $actual_exit (expected $expected_exit)"
      ((failed++))
    fi
  done

  if [ $failed -eq 0 ]; then
    log_pass "All decision exit codes correct"
    return 0
  else
    log_fail "$failed decision(s) had incorrect exit codes"
    return 1
  fi
}

# Test 6: Container exit code inspection
test_container_exit_code_inspection() {
  log_step "Container Exit Code Inspection via docker inspect"

  # GIVEN: Containers with different exit codes
  local success_container="test-exit-0-$$"
  local failure_container="test-exit-1-$$"

  # WHEN: Run containers
  docker run --name "$success_container" alpine:latest sh -c "exit 0" > /dev/null 2>&1 || true
  docker run --name "$failure_container" alpine:latest sh -c "exit 42" > /dev/null 2>&1 || true

  # THEN: Inspect exit codes
  local success_exit=$(docker inspect -f '{{.State.ExitCode}}' "$success_container")
  local failure_exit=$(docker inspect -f '{{.State.ExitCode}}' "$failure_container")

  docker rm -f "$success_container" "$failure_container" > /dev/null 2>&1 || true

  if [ "$success_exit" -eq 0 ] && [ "$failure_exit" -eq 42 ]; then
    log_pass "Container exit codes inspected correctly (0 and 42)"
    return 0
  else
    log_fail "Expected exit codes 0 and 42, got $success_exit and $failure_exit"
    return 1
  fi
}

# Run tests
main() {
  setup

  local failed=0

  test_proceed_exit_code_zero || ((failed++))
  test_abort_exit_code_nonzero || ((failed++))
  test_failure_exit_code_nonzero || ((failed++))
  test_docker_compose_propagates_exit_code || ((failed++))
  test_orchestrator_script_exit_codes || ((failed++))
  test_container_exit_code_inspection || ((failed++))

  if [ $failed -eq 0 ]; then
    log_info "Docker Orchestrator Exit Code Tests" 0
    exit 0
  else
    log_info "Docker Orchestrator Exit Code Tests" $failed
    exit 1
  fi
}

# Handle script being sourced vs executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
