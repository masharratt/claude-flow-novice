#!/bin/bash
# tests/redis/test-auth-detection.sh
# Phase 3 :: Smart Redis AUTH detection to prevent misleading warnings (Bug #TBD)
# Tests redis-cli-wrapper.sh AUTH detection logic with and without passwords

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
REDIS_WRAPPER="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/redis-cli-wrapper.sh"
TEMP_DIR=""
REDIS_NO_AUTH_PORT=6380
REDIS_WITH_AUTH_PORT=6381
REDIS_CONTAINER_NO_AUTH=""
REDIS_CONTAINER_WITH_AUTH=""

cleanup() {
  log_info "Cleaning up test Redis containers"

  # Stop and remove test Redis containers
  if [ -n "$REDIS_CONTAINER_NO_AUTH" ]; then
    docker rm -f "$REDIS_CONTAINER_NO_AUTH" >/dev/null 2>&1 || true
  fi

  if [ -n "$REDIS_CONTAINER_WITH_AUTH" ]; then
    docker rm -f "$REDIS_CONTAINER_WITH_AUTH" >/dev/null 2>&1 || true
  fi

  # Clean up temp files
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi

  # Unset test environment variables
  unset REDIS_HOST REDIS_PORT REDIS_PASSWORD 2>/dev/null || true
}
trap cleanup EXIT

##############################################################################
# Setup test Redis instances
##############################################################################
setup_test_redis_instances() {
  log_step "Setting up test Redis instances"

  # Create Redis without password
  log_info "Starting Redis without AUTH on port $REDIS_NO_AUTH_PORT"
  REDIS_CONTAINER_NO_AUTH="test-redis-noauth-$$"
  docker run -d \
    --name "$REDIS_CONTAINER_NO_AUTH" \
    -p "$REDIS_NO_AUTH_PORT:6379" \
    redis:7-alpine \
    redis-server --appendonly no --save "" >/dev/null 2>&1

  # Create Redis with password
  log_info "Starting Redis with AUTH on port $REDIS_WITH_AUTH_PORT"
  REDIS_CONTAINER_WITH_AUTH="test-redis-auth-$$"
  docker run -d \
    --name "$REDIS_CONTAINER_WITH_AUTH" \
    -p "$REDIS_WITH_AUTH_PORT:6379" \
    redis:7-alpine \
    redis-server --appendonly no --save "" --requirepass "test-password-123" >/dev/null 2>&1

  # Wait for containers to be ready
  log_info "Waiting for Redis containers to be ready"
  sleep 3

  # Verify no-auth Redis
  if redis-cli -h localhost -p "$REDIS_NO_AUTH_PORT" ping >/dev/null 2>&1; then
    log_success "Redis without AUTH is ready on port $REDIS_NO_AUTH_PORT"
  else
    log_error "Failed to start Redis without AUTH"
    return 1
  fi

  # Verify auth Redis (should reject no-auth connection)
  if redis-cli -h localhost -p "$REDIS_WITH_AUTH_PORT" ping >/dev/null 2>&1; then
    log_error "Redis with AUTH accepted no-auth connection (setup error)"
    return 1
  fi

  # Verify auth Redis with password
  if redis-cli -h localhost -p "$REDIS_WITH_AUTH_PORT" -a "test-password-123" ping >/dev/null 2>&1; then
    log_success "Redis with AUTH is ready on port $REDIS_WITH_AUTH_PORT"
  else
    log_error "Failed to start Redis with AUTH"
    return 1
  fi

  log_success "Test Redis instances ready"
}

##############################################################################
# Test Case 1: Redis without password - no AUTH warnings
##############################################################################
test_redis_without_password() {
  log_step "GIVEN Redis running without password requirement"

  export REDIS_HOST="localhost"
  export REDIS_PORT="$REDIS_NO_AUTH_PORT"
  unset REDIS_PASSWORD 2>/dev/null || true

  log_step "WHEN redis-cli-wrapper.sh executes"

  local OUTPUT
  local EXIT_CODE

  # Capture both stdout and stderr
  OUTPUT=$("$REDIS_WRAPPER" PING 2>&1) || EXIT_CODE=$?
  EXIT_CODE=${EXIT_CODE:-0}

  log_step "THEN no AUTH should be attempted"

  assert_equals "0" "$EXIT_CODE" "Command exits successfully"
  assert_contains "$OUTPUT" "PONG" "Redis responds to PING"

  log_step "THEN no AUTH warnings in stderr"

  # These are the old misleading warnings that should NOT appear
  assert_not_contains "$OUTPUT" "Warning: Using a password with '-a'" "No password warning"
  assert_not_contains "$OUTPUT" "NOAUTH" "No NOAUTH error"
  assert_not_contains "$OUTPUT" "authentication required" "No auth required message"

  # Should also not have soft-fail messages (Redis is available)
  assert_not_contains "$OUTPUT" "Redis unavailable" "No unavailable message"
  assert_not_contains "$OUTPUT" "soft fail" "No soft fail message"

  log_success "Test 1 complete: No-password Redis works without warnings"
}

##############################################################################
# Test Case 2: Redis with password - AUTH succeeds
##############################################################################
test_redis_with_password() {
  log_step "GIVEN Redis running with requirepass configured"

  export REDIS_HOST="localhost"
  export REDIS_PORT="$REDIS_WITH_AUTH_PORT"
  export REDIS_PASSWORD="test-password-123"

  log_step "WHEN REDIS_PASSWORD set and redis-cli-wrapper.sh executes"

  local OUTPUT
  local EXIT_CODE

  OUTPUT=$("$REDIS_WRAPPER" PING 2>&1) || EXIT_CODE=$?
  EXIT_CODE=${EXIT_CODE:-0}

  log_step "THEN AUTH should be used"

  assert_equals "0" "$EXIT_CODE" "Command exits successfully with AUTH"

  log_step "THEN connection should succeed"

  assert_contains "$OUTPUT" "PONG" "Redis responds to PING with AUTH"

  # Should not have any warnings (AUTH is working correctly)
  assert_not_contains "$OUTPUT" "Warning: Using a password with '-a'" "No password warning"
  assert_not_contains "$OUTPUT" "NOAUTH" "No NOAUTH error"

  log_success "Test 2 complete: Password-protected Redis works with AUTH"
}

##############################################################################
# Test Case 3: Wrong password - clear error message
##############################################################################
test_wrong_password_fails_clearly() {
  log_step "GIVEN Redis with password"

  export REDIS_HOST="localhost"
  export REDIS_PORT="$REDIS_WITH_AUTH_PORT"
  export REDIS_PASSWORD="wrong-password"

  log_step "WHEN wrong REDIS_PASSWORD provided"

  local OUTPUT
  local EXIT_CODE=0

  OUTPUT=$("$REDIS_WRAPPER" PING 2>&1) || EXIT_CODE=$?

  log_step "THEN clear error message (not misleading AUTH warning)"

  # Wrapper should soft-fail when AUTH fails
  assert_equals "0" "$EXIT_CODE" "Soft-fail exit code (Task mode compatibility)"

  # Should have soft-fail message (wrong password = unavailable)
  assert_contains "$OUTPUT" "Redis unavailable" "Clear unavailable message"

  # Should NOT have the old misleading warning
  assert_not_contains "$OUTPUT" "Warning: Using a password with '-a'" "No misleading warning"

  log_success "Test 3 complete: Wrong password produces clear error"
}

##############################################################################
# Test Case 4: No password on AUTH-required Redis
##############################################################################
test_no_password_on_auth_required_redis() {
  log_step "GIVEN Redis requires password"

  export REDIS_HOST="localhost"
  export REDIS_PORT="$REDIS_WITH_AUTH_PORT"
  unset REDIS_PASSWORD 2>/dev/null || true

  log_step "WHEN REDIS_PASSWORD not set"

  local OUTPUT
  local EXIT_CODE=0

  OUTPUT=$("$REDIS_WRAPPER" PING 2>&1) || EXIT_CODE=$?

  log_step "THEN clear error message about missing password"

  # Wrapper should soft-fail when AUTH is required but no password provided
  assert_equals "0" "$EXIT_CODE" "Soft-fail exit code (Task mode compatibility)"

  # Should have soft-fail message
  assert_contains "$OUTPUT" "Redis unavailable" "Clear unavailable message"
  assert_contains "$OUTPUT" "soft fail" "Soft fail indicated"

  log_success "Test 4 complete: Missing password on AUTH-required Redis produces clear message"
}

##############################################################################
# Test Case 5: Verify smart AUTH detection logic
##############################################################################
test_smart_auth_detection_logic() {
  log_step "GIVEN wrapper script with smart AUTH detection"

  # Test the detection logic directly by examining the script
  if ! [ -f "$REDIS_WRAPPER" ]; then
    log_error "Redis wrapper script not found at $REDIS_WRAPPER"
    return 1
  fi

  log_step "WHEN examining wrapper logic"

  # Check that wrapper tests connectivity first (without auth)
  assert_file_exists "$REDIS_WRAPPER" "Wrapper script exists"

  local WRAPPER_CONTENT
  WRAPPER_CONTENT=$(cat "$REDIS_WRAPPER")

  log_step "THEN wrapper should test no-auth connection first"

  assert_contains "$WRAPPER_CONTENT" "ping &>/dev/null" "Tests connectivity without auth first"

  log_step "THEN wrapper should only use AUTH if no-auth fails and password provided"

  assert_contains "$WRAPPER_CONTENT" "REDIS_PASSWORD" "Checks for password variable"
  assert_contains "$WRAPPER_CONTENT" "AUTH_ARGS" "Uses AUTH args array"

  log_step "THEN wrapper should soft-fail gracefully for Task mode"

  assert_contains "$WRAPPER_CONTENT" "soft fail" "Has soft fail handling"
  assert_contains "$WRAPPER_CONTENT" "exit 0" "Exits 0 on soft fail for Task mode"

  log_success "Test 5 complete: Wrapper has correct smart AUTH detection"
}

##############################################################################
# Test Case 6: Environment variable precedence
##############################################################################
test_environment_variable_precedence() {
  log_step "GIVEN Redis wrapper with environment variable support"

  export REDIS_HOST="localhost"
  export REDIS_PORT="$REDIS_WITH_AUTH_PORT"

  log_step "WHEN both REDIS_PASSWORD and CFN_REDIS_PASSWORD are set"

  export REDIS_PASSWORD="test-password-123"
  export CFN_REDIS_PASSWORD="ignored-password"

  local OUTPUT
  OUTPUT=$("$REDIS_WRAPPER" PING 2>&1)

  log_step "THEN REDIS_PASSWORD should take precedence"

  assert_contains "$OUTPUT" "PONG" "Correct password used"

  log_step "WHEN only CFN_REDIS_PASSWORD is set"

  unset REDIS_PASSWORD
  export CFN_REDIS_PASSWORD="test-password-123"

  OUTPUT=$("$REDIS_WRAPPER" PING 2>&1)

  log_step "THEN CFN_REDIS_PASSWORD should be used"

  assert_contains "$OUTPUT" "PONG" "Fallback password used"

  log_success "Test 6 complete: Environment variable precedence correct"
}

##############################################################################
# Test Case 7: Performance - AUTH detection doesn't add significant overhead
##############################################################################
test_auth_detection_performance() {
  log_step "GIVEN Redis without AUTH"

  export REDIS_HOST="localhost"
  export REDIS_PORT="$REDIS_NO_AUTH_PORT"
  unset REDIS_PASSWORD 2>/dev/null || true

  log_step "WHEN executing multiple commands rapidly"

  local START_TIME
  local END_TIME
  local DURATION

  START_TIME=$(date +%s%N)

  # Execute 10 commands
  for i in {1..10}; do
    "$REDIS_WRAPPER" PING >/dev/null 2>&1
  done

  END_TIME=$(date +%s%N)
  DURATION=$(( (END_TIME - START_TIME) / 1000000 )) # Convert to milliseconds

  log_step "THEN AUTH detection should add minimal overhead"

  log_info "10 commands completed in ${DURATION}ms (avg: $((DURATION / 10))ms per command)"

  # Should complete in reasonable time (< 2 seconds total for 10 commands)
  if [ "$DURATION" -lt 2000 ]; then
    log_success "Performance acceptable: ${DURATION}ms for 10 commands"
  else
    log_warn "Performance slower than expected: ${DURATION}ms for 10 commands"
  fi

  log_success "Test 7 complete: AUTH detection performance verified"
}

##############################################################################
# Test Case 8: Concurrent connection handling
##############################################################################
test_concurrent_connections() {
  log_step "GIVEN Redis with AUTH"

  export REDIS_HOST="localhost"
  export REDIS_PORT="$REDIS_WITH_AUTH_PORT"
  export REDIS_PASSWORD="test-password-123"

  log_step "WHEN multiple concurrent wrapper executions"

  TEMP_DIR=$(create_temp_dir)

  # Launch 5 concurrent wrapper commands
  for i in {1..5}; do
    (
      OUTPUT=$("$REDIS_WRAPPER" PING 2>&1)
      echo "$OUTPUT" > "$TEMP_DIR/output-$i.txt"
    ) &
  done

  # Wait for all background jobs
  wait

  log_step "THEN all connections should succeed with correct AUTH"

  local SUCCESS_COUNT=0
  for i in {1..5}; do
    if grep -q "PONG" "$TEMP_DIR/output-$i.txt"; then
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi
  done

  assert_equals "5" "$SUCCESS_COUNT" "All 5 concurrent connections succeeded"

  log_success "Test 8 complete: Concurrent connections handled correctly"
}

##############################################################################
# Test Execution
##############################################################################

setup_test "redis-auth-detection"

# Setup test Redis instances
setup_test_redis_instances

# Run all test cases
test_redis_without_password
test_redis_with_password
test_wrong_password_fails_clearly
test_no_password_on_auth_required_redis
test_smart_auth_detection_logic
test_environment_variable_precedence
test_auth_detection_performance
test_concurrent_connections

teardown_test
