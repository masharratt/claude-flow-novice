#!/bin/bash
# tests/docker/test-architecture-helpers.sh
# Phase 4 :: Unit tests for architecture-test-helpers.sh
# Validates P1 helper functions work correctly

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Simple assertion helper
assert_test() {
    local test_name="$1"
    local expected_result="$2"  # "pass" or "fail"
    local actual_result="$3"    # Exit code from test

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$expected_result" = "pass" ] && [ "$actual_result" -eq 0 ]; then
        log_success "✓ $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    elif [ "$expected_result" = "fail" ] && [ "$actual_result" -ne 0 ]; then
        log_success "✓ $test_name (correctly failed)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "✗ $test_name (expected: $expected_result, got: exit $actual_result)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

cleanup() {
    echo ""
    echo "========================================"
    echo "Architecture Helpers Test Summary"
    echo "========================================"
    echo "Tests run:    $TESTS_RUN"
    echo "Tests passed: $TESTS_PASSED"
    echo "Tests failed: $TESTS_FAILED"
    echo "========================================"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo "✅ All tests passed"
        exit 0
    else
        echo "❌ Some tests failed"
        exit 1
    fi
}
trap cleanup EXIT

annotate "Architecture Test Helpers - Unit Tests"

# ============================================================================
# CFN LOOP VALIDATION TESTS
# ============================================================================

log_step "Testing CFN Loop validation helpers"

# Test 1: Gate threshold passes with high scores
set +e  # Temporarily allow failures
validate_gate_threshold 0.75 0.85 0.90 0.88 >/dev/null 2>&1
assert_test "Gate threshold PASS (avg 0.88 >= 0.75)" "pass" $?

# Test 2: Gate threshold fails with low scores
validate_gate_threshold 0.90 0.85 0.80 0.70 >/dev/null 2>&1
assert_test "Gate threshold FAIL (avg 0.78 < 0.90)" "fail" $?

# Test 3: Consensus passes with high validator scores
validate_consensus 0.90 0.92 0.91 0.93 0.89 >/dev/null 2>&1
assert_test "Consensus PASS (avg 0.91 >= 0.90)" "pass" $?

# Test 4: Consensus fails with low validator scores
validate_consensus 0.95 0.85 0.88 0.90 >/dev/null 2>&1
assert_test "Consensus FAIL (avg 0.88 < 0.95)" "fail" $?

# Test 5: Gate threshold with edge case (exact match)
validate_gate_threshold 0.80 0.80 0.80 0.80 >/dev/null 2>&1
assert_test "Gate threshold PASS (exact match)" "pass" $?

# Test 6: Empty score array handling
validate_gate_threshold 0.75 >/dev/null 2>&1
assert_test "Gate threshold FAIL (no scores)" "fail" $?

# ============================================================================
# ENVIRONMENT VARIABLE VALIDATION TESTS
# ============================================================================

log_step "Testing environment variable helpers"

# Test 7: Existing environment variable
export TEST_VAR_EXISTS="test-value"
env_var_exists "TEST_VAR_EXISTS" >/dev/null 2>&1
assert_test "env_var_exists PASS (variable exists)" "pass" $?

# Test 8: Missing environment variable
unset TEST_VAR_MISSING
env_var_exists "TEST_VAR_MISSING" >/dev/null 2>&1
assert_test "env_var_exists FAIL (variable missing)" "fail" $?

# Test 9: Empty environment variable
export TEST_VAR_EMPTY=""
env_var_exists "TEST_VAR_EMPTY" >/dev/null 2>&1
assert_test "env_var_exists FAIL (variable empty)" "fail" $?

# Test 10: .env file validation with valid file
cat > /tmp/test-valid.env <<EOF
# Valid .env file
CFN_REDIS_HOST=cfn-redis
CFN_REDIS_PORT=6379
TASK_ID=test-123
EOF

validate_env_file "/tmp/test-valid.env" >/dev/null 2>&1
assert_test "validate_env_file PASS (valid file)" "pass" $?

# Test 11: .env file with inline comments (warning)
cat > /tmp/test-inline-comments.env <<EOF
CFN_REDIS_HOST=cfn-redis # This is a comment
CFN_REDIS_PORT=6379
EOF

validate_env_file "/tmp/test-inline-comments.env" >/dev/null 2>&1
assert_test "validate_env_file FAIL (inline comments)" "fail" $?

# Test 12: .env file with duplicate keys
cat > /tmp/test-duplicates.env <<EOF
CFN_REDIS_HOST=cfn-redis
CFN_REDIS_PORT=6379
CFN_REDIS_HOST=different-host
EOF

validate_env_file "/tmp/test-duplicates.env" >/dev/null 2>&1
assert_test "validate_env_file FAIL (duplicate keys)" "fail" $?

# Test 13: Non-existent .env file
validate_env_file "/tmp/nonexistent.env" >/dev/null 2>&1
assert_test "validate_env_file FAIL (file not found)" "fail" $?

# Cleanup test files
rm -f /tmp/test-*.env

# ============================================================================
# TYPESCRIPT ERROR ANALYSIS TESTS
# ============================================================================

log_step "Testing TypeScript error analysis helpers"

# Test 14: Error delta validation (reduction)
validate_error_delta 10 5 >/dev/null 2>&1
assert_test "validate_error_delta PASS (errors reduced)" "pass" $?

# Test 15: Error delta validation (no change)
validate_error_delta 10 10 >/dev/null 2>&1
assert_test "validate_error_delta FAIL (no change)" "fail" $?

# Test 16: Error delta validation (increase)
validate_error_delta 5 10 >/dev/null 2>&1
assert_test "validate_error_delta FAIL (errors increased)" "fail" $?

# Test 17: Error delta validation (complete fix)
validate_error_delta 10 0 >/dev/null 2>&1
assert_test "validate_error_delta PASS (all errors fixed)" "pass" $?

# ============================================================================
# BUILD AND SYNC TESTS
# ============================================================================

log_step "Testing build and sync helpers"

# Test 18: Build context size validation (acceptable)
mkdir -p /tmp/test-build-context
dd if=/dev/zero of=/tmp/test-build-context/dummy bs=1M count=5 2>/dev/null
verify_build_context_size "/tmp/test-build-context" 100 >/dev/null 2>&1
assert_test "verify_build_context_size PASS (5MB < 100MB)" "pass" $?

# Test 19: Build context size validation (too large)
verify_build_context_size "/tmp/test-build-context" 1 >/dev/null 2>&1
assert_test "verify_build_context_size FAIL (5MB > 1MB)" "fail" $?

# Cleanup
rm -rf /tmp/test-build-context

# Test 20: rsync exclusions validation (missing .dockerignore)
mkdir -p /tmp/test-rsync-no-ignore
validate_rsync_exclusions "/tmp/test-rsync-no-ignore" >/dev/null 2>&1
assert_test "validate_rsync_exclusions PASS (no .dockerignore, non-fatal)" "pass" $?

# Test 21: rsync exclusions validation (with .dockerignore)
mkdir -p /tmp/test-rsync-with-ignore
cat > /tmp/test-rsync-with-ignore/.dockerignore <<EOF
node_modules
.git
*.log
EOF
validate_rsync_exclusions "/tmp/test-rsync-with-ignore" >/dev/null 2>&1
assert_test "validate_rsync_exclusions PASS (valid .dockerignore)" "pass" $?

# Cleanup
rm -rf /tmp/test-rsync-*

# ============================================================================
# INTEGRATION TESTS (require Docker)
# ============================================================================

log_step "Testing Docker integration (requires running Docker)"

# Check if Docker is available
if ! command -v docker &>/dev/null; then
    log_warn "Docker not available, skipping integration tests"
else
    # Test 22: Image freshness check (will fail for non-existent image)
    check_image_freshness "non-existent-image:latest" 3600 >/dev/null 2>&1
    assert_test "check_image_freshness FAIL (image not found)" "fail" $?

    # Note: Additional integration tests require running containers
    # These are tested in the actual P1 test suites
    log_info "Additional integration tests in P1 suite (require Redis, coordinator)"
fi

# Test summary will be printed by cleanup trap
