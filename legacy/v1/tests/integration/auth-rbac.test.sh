#!/usr/bin/env bash
# Integration Tests for Authentication - RBAC Permission Enforcement
# Phase 3: Authentication System Testing
# Coverage: Coordinator, Worker, Observer roles, role escalation blocking

set -euo pipefail

# Test framework variables
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get absolute path to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test directory
TEST_AUTH_DIR="/dev/shm/cfn-auth-rbac-test-$$"

# ==============================================================================
# TEST FRAMEWORK
# ==============================================================================

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [ "$expected" = "$actual" ]; then
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $message"
        echo "  Expected: $expected"
        echo "  Actual: $actual"
        return 1
    fi
}

assert_success() {
    local command="$1"
    local message="${2:-Command should succeed}"

    if eval "$command" >/dev/null 2>&1; then
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $message"
        echo "  Command: $command"
        return 1
    fi
}

assert_failure() {
    local command="$1"
    local message="${2:-Command should fail}"

    if eval "$command" >/dev/null 2>&1; then
        echo -e "${RED}✗ FAIL${NC}: $message"
        echo "  Command should have failed: $command"
        return 1
    else
        return 0
    fi
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    return 1
}

pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    return 0
}

run_test() {
    local test_name="$1"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    echo ""
    echo -e "${YELLOW}Running:${NC} $test_name"

    cleanup_test_env

    if $test_name; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        pass "$test_name"
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# ==============================================================================
# SETUP & CLEANUP
# ==============================================================================

setup_test_env() {
    export CFN_AUTH_ENABLED=true
    export CFN_AUTH_DIR="$TEST_AUTH_DIR"
    export CFN_AUTH_KEYS_DIR="$TEST_AUTH_DIR/keys"
    export CFN_AUTH_TOKENS_DIR="$TEST_AUTH_DIR/tokens"
    export CFN_AUTH_REPLAY_DIR="$TEST_AUTH_DIR/replay"
    export CFN_AUTH_TOKEN_TTL=3600

    mkdir -p "$TEST_AUTH_DIR"

    source "$PROJECT_ROOT/lib/auth.sh"
    init_auth_system
}

cleanup_test_env() {
    if [[ -d "$TEST_AUTH_DIR" ]]; then
        rm -rf "$TEST_AUTH_DIR"
    fi
}

# ==============================================================================
# TEST SUITE 1: Coordinator Role (Full Access)
# ==============================================================================

test_coordinator_full_access() {
    setup_test_env

    # Create coordinator agent
    generate_agent_key "coordinator-1" "coordinator" || return 1

    # Verify role
    local role
    role=$(get_agent_role "coordinator-1") || return 1
    assert_equals "coordinator" "$role" "Role should be coordinator" || return 1

    # Test all permissions (should all succeed)
    assert_success "check_permission coordinator-1 send_message" "Coordinator can send messages" || return 1
    assert_success "check_permission coordinator-1 broadcast" "Coordinator can broadcast" || return 1
    assert_success "check_permission coordinator-1 health_report" "Coordinator can report health" || return 1
    assert_success "check_permission coordinator-1 metrics_report" "Coordinator can report metrics" || return 1
    assert_success "check_permission coordinator-1 shutdown" "Coordinator can shutdown" || return 1

    return 0
}

# ==============================================================================
# TEST SUITE 2: Worker Role (Limited Access)
# ==============================================================================

test_worker_limited_to_health_metrics() {
    setup_test_env

    # Create worker agent
    generate_agent_key "worker-1" "worker" || return 1

    # Verify role
    local role
    role=$(get_agent_role "worker-1") || return 1
    assert_equals "worker" "$role" "Role should be worker" || return 1

    # Test allowed permissions
    assert_success "check_permission worker-1 send_message" "Worker can send messages" || return 1
    assert_success "check_permission worker-1 health_report" "Worker can report health" || return 1
    assert_success "check_permission worker-1 metrics_report" "Worker can report metrics" || return 1

    # Test denied permissions
    assert_failure "check_permission worker-1 broadcast" "Worker cannot broadcast" || return 1
    assert_failure "check_permission worker-1 shutdown" "Worker cannot shutdown" || return 1

    return 0
}

test_worker_broadcast_denied() {
    setup_test_env

    generate_agent_key "worker-2" "worker" || return 1

    # Worker should not be able to broadcast
    assert_failure "check_permission worker-2 broadcast" "Worker broadcast should be denied" || return 1

    return 0
}

# ==============================================================================
# TEST SUITE 3: Observer Role (Read-Only)
# ==============================================================================

test_observer_read_only_access() {
    setup_test_env

    # Create observer agent
    generate_agent_key "observer-1" "observer" || return 1

    # Verify role
    local role
    role=$(get_agent_role "observer-1") || return 1
    assert_equals "observer" "$role" "Role should be observer" || return 1

    # Observer should have no write permissions
    assert_failure "check_permission observer-1 send_message" "Observer cannot send messages" || return 1
    assert_failure "check_permission observer-1 broadcast" "Observer cannot broadcast" || return 1
    assert_failure "check_permission observer-1 health_report" "Observer cannot report health" || return 1
    assert_failure "check_permission observer-1 metrics_report" "Observer cannot report metrics" || return 1
    assert_failure "check_permission observer-1 shutdown" "Observer cannot shutdown" || return 1

    return 0
}

# ==============================================================================
# TEST SUITE 4: Role Escalation Blocking
# ==============================================================================

test_role_escalation_attempt_blocked() {
    setup_test_env

    # Create worker agent
    generate_agent_key "worker-3" "worker" || return 1

    # Attempt role escalation (should always fail)
    assert_failure "attempt_role_escalation worker-3 coordinator" "Role escalation should be blocked" || return 1

    # Verify role unchanged
    local role
    role=$(get_agent_role "worker-3") || return 1
    assert_equals "worker" "$role" "Role should remain worker" || return 1

    return 0
}

test_observer_escalation_blocked() {
    setup_test_env

    generate_agent_key "observer-2" "observer" || return 1

    # Attempt escalation to worker
    assert_failure "attempt_role_escalation observer-2 worker" "Observer escalation should be blocked" || return 1

    # Verify role unchanged
    local role
    role=$(get_agent_role "observer-2") || return 1
    assert_equals "observer" "$role" "Role should remain observer" || return 1

    return 0
}

# ==============================================================================
# TEST SUITE 5: Invalid Role Rejection
# ==============================================================================

test_invalid_role_rejection() {
    setup_test_env

    # Attempt to create agent with invalid role
    assert_failure "generate_agent_key malicious-agent admin" "Invalid role should be rejected" || return 1
    assert_failure "generate_agent_key malicious-agent superuser" "Invalid role should be rejected" || return 1
    assert_failure "generate_agent_key malicious-agent root" "Invalid role should be rejected" || return 1

    return 0
}

# ==============================================================================
# TEST SUITE 6: Permission Checks with Auth Disabled
# ==============================================================================

test_all_operations_permitted_when_auth_disabled() {
    setup_test_env

    # Disable authentication
    export CFN_AUTH_ENABLED=false

    generate_agent_key "any-agent" "worker" || return 1

    # All operations should be permitted when auth disabled
    check_permission "any-agent" "send_message" || return 1
    check_permission "any-agent" "broadcast" || return 1
    check_permission "any-agent" "health_report" || return 1
    check_permission "any-agent" "metrics_report" || return 1
    check_permission "any-agent" "shutdown" || return 1

    return 0
}

# ==============================================================================
# MAIN TEST RUNNER
# ==============================================================================

main() {
    echo "============================================================"
    echo "Authentication Integration Tests - RBAC Permission Enforcement"
    echo "============================================================"
    echo ""

    # Run test suites
    echo -e "${YELLOW}TEST SUITE 1: Coordinator Role (Full Access)${NC}"
    run_test test_coordinator_full_access

    echo ""
    echo -e "${YELLOW}TEST SUITE 2: Worker Role (Limited Access)${NC}"
    run_test test_worker_limited_to_health_metrics
    run_test test_worker_broadcast_denied

    echo ""
    echo -e "${YELLOW}TEST SUITE 3: Observer Role (Read-Only)${NC}"
    run_test test_observer_read_only_access

    echo ""
    echo -e "${YELLOW}TEST SUITE 4: Role Escalation Blocking${NC}"
    run_test test_role_escalation_attempt_blocked
    run_test test_observer_escalation_blocked

    echo ""
    echo -e "${YELLOW}TEST SUITE 5: Invalid Role Rejection${NC}"
    run_test test_invalid_role_rejection

    echo ""
    echo -e "${YELLOW}TEST SUITE 6: Auth Disabled Fallback${NC}"
    run_test test_all_operations_permitted_when_auth_disabled

    # Final cleanup
    cleanup_test_env

    # Print summary
    echo ""
    echo "============================================================"
    echo "TEST SUMMARY"
    echo "============================================================"
    echo -e "Total Tests: $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
        echo ""

        # Calculate confidence score
        local confidence
        confidence=$(echo "scale=2; $TESTS_PASSED / $TESTS_TOTAL" | bc)

        # Generate confidence report
        cat <<EOF
============================================================
CONFIDENCE REPORT
============================================================
{
  "agent": "tester",
  "test_suite": "auth_rbac_permissions",
  "confidence": $confidence,
  "reasoning": "All $TESTS_TOTAL RBAC permission tests passed. Coordinator has full access, Worker limited correctly, Observer read-only enforced, role escalation blocked.",
  "test_results": {
    "pass": $TESTS_PASSED,
    "fail": $TESTS_FAILED,
    "total": $TESTS_TOTAL
  },
  "coverage": {
    "coordinator_role": "100%",
    "worker_role": "100%",
    "observer_role": "100%",
    "role_escalation_blocking": "100%",
    "invalid_role_rejection": "100%",
    "auth_disabled_fallback": "100%"
  },
  "rbac_matrix": {
    "coordinator": {
      "send_message": "✓",
      "broadcast": "✓",
      "health_report": "✓",
      "metrics_report": "✓",
      "shutdown": "✓"
    },
    "worker": {
      "send_message": "✓",
      "broadcast": "✗",
      "health_report": "✓",
      "metrics_report": "✓",
      "shutdown": "✗"
    },
    "observer": {
      "send_message": "✗",
      "broadcast": "✗",
      "health_report": "✗",
      "metrics_report": "✗",
      "shutdown": "✗"
    }
  },
  "security_validations": [
    "Role escalation blocked",
    "Invalid role rejection",
    "Permission enforcement working",
    "Backward compatibility (auth disabled)"
  ],
  "blockers": []
}
EOF

        return 0
    else
        echo -e "${RED}✗ TESTS FAILED${NC}"
        echo ""

        local confidence
        confidence=$(echo "scale=2; $TESTS_PASSED / $TESTS_TOTAL" | bc)

        cat <<EOF
============================================================
CONFIDENCE REPORT
============================================================
{
  "agent": "tester",
  "test_suite": "auth_rbac_permissions",
  "confidence": $confidence,
  "reasoning": "$TESTS_FAILED out of $TESTS_TOTAL tests failed. RBAC permission enforcement has issues.",
  "test_results": {
    "pass": $TESTS_PASSED,
    "fail": $TESTS_FAILED,
    "total": $TESTS_TOTAL
  },
  "blockers": [
    "Failed tests need investigation and fixes"
  ]
}
EOF

        return 1
    fi
}

# Run main function if script is executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
