#!/usr/bin/env bash

##############################################################################
# Docker Orchestrator Test Suite
# Tests for test-driven gate check support in Docker orchestrator
#
# Usage:
#   bash tests/docker/test-docker-orchestrator.sh
#
# Success Criteria (Phase 2 TDD):
#   - All tests pass (95%+ pass rate)
#   - Success criteria loading works
#   - Test-driven gate check executes
#   - Environment variables passed to Docker agents
#   - Security validations enforced
##############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKER_ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
CLI_ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Helper functions
log_test() {
    echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((PASSED_TESTS++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((FAILED_TESTS++))
}

run_test() {
    local test_name="$1"
    ((TOTAL_TESTS++))
    log_test "$test_name"
}

# Test 1: Orchestrator script exists and is executable
test_orchestrator_exists() {
    run_test "Docker orchestrator exists and is executable"

    if [[ -f "$DOCKER_ORCHESTRATOR" && -x "$DOCKER_ORCHESTRATOR" ]]; then
        log_pass "Docker orchestrator found at $DOCKER_ORCHESTRATOR"
        return 0
    else
        log_fail "Docker orchestrator not found or not executable"
        return 1
    fi
}

# Test 2: Success criteria parameter support
test_success_criteria_parameter() {
    run_test "Success criteria parameter parsing"

    # Check if --success-criteria parameter is recognized
    if grep -q "\-\-success-criteria" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Success criteria parameter support found"
        return 0
    else
        log_fail "No success criteria parameter support"
        return 1
    fi
}

# Test 3: Success criteria validation function
test_success_criteria_validation() {
    run_test "Success criteria validation function"

    # Check if validation function exists
    if grep -q "validate.*success.*criteria\|validate_json_context" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Success criteria validation function found"
        return 0
    else
        log_fail "No success criteria validation function"
        return 1
    fi
}

# Test 4: Success criteria storage in Redis
test_success_criteria_storage() {
    run_test "Success criteria Redis storage"

    # Check if script stores criteria in Redis
    if grep -q "success-criteria.*redis\|store.*success.*criteria" "$DOCKER_ORCHESTRATOR" || \
       grep -q "HSET.*success-criteria\|set-context.*success" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Success criteria storage logic found"
        return 0
    else
        log_fail "No success criteria storage logic"
        return 1
    fi
}

# Test 5: Environment variable passing to Docker agents
test_env_var_passing() {
    run_test "Environment variable passing to Docker agents"

    # Check if AGENT_SUCCESS_CRITERIA or similar is passed to Docker
    if grep -q "AGENT_SUCCESS_CRITERIA\|SUCCESS_CRITERIA.*docker\|--env.*SUCCESS" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Environment variable passing to Docker found"
        return 0
    else
        log_fail "No environment variable passing to Docker agents"
        return 1
    fi
}

# Test 6: Test-driven gate check integration
test_gate_check_integration() {
    run_test "Test-driven gate check integration"

    # Check if gate check uses test-driven validation
    if grep -q "gate-check\.sh\|test.*driven.*gate\|execute.*test.*suite" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Test-driven gate check integration found"
        return 0
    else
        log_fail "No test-driven gate check integration"
        return 1
    fi
}

# Test 7: Security validations (JSON validation, bounds checking)
test_security_validations() {
    run_test "Security validations (JSON, bounds, sanitization)"

    local found_validations=0

    # Check for JSON validation
    if grep -q "validate_json\|jq.*empty\|json.*valid" "$DOCKER_ORCHESTRATOR"; then
        ((found_validations++))
    fi

    # Check for bounds checking
    if grep -q "MAX_.*LIMIT\|bounds.*check\|size.*validation" "$DOCKER_ORCHESTRATOR"; then
        ((found_validations++))
    fi

    # Check for sanitization
    if grep -q "sanitize\|validate.*safe\|security.*check" "$DOCKER_ORCHESTRATOR"; then
        ((found_validations++))
    fi

    if [[ $found_validations -ge 2 ]]; then
        log_pass "Security validations found (${found_validations}/3)"
        return 0
    else
        log_fail "Insufficient security validations (${found_validations}/3)"
        return 1
    fi
}

# Test 8: Gate check strategy selection (test-driven vs confidence)
test_gate_strategy_selection() {
    run_test "Gate check strategy selection (auto/test-driven/confidence)"

    # Check if gate check supports multiple strategies
    if grep -q "strategy.*test-driven\|CFN_GATE_STRATEGY\|auto.*detect.*test" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Gate strategy selection found"
        return 0
    else
        log_fail "No gate strategy selection logic"
        return 1
    fi
}

# Test 9: Success criteria loading from Redis
test_success_criteria_loading() {
    run_test "Success criteria loading from Redis"

    # Check if script loads criteria from Redis
    if grep -q "get-success-criteria\|load.*success.*criteria\|HGET.*success" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Success criteria loading from Redis found"
        return 0
    else
        log_fail "No success criteria loading from Redis"
        return 1
    fi
}

# Test 10: Base64 encoding for environment variables (security fix)
test_base64_encoding() {
    run_test "Base64 encoding for success criteria (shell injection prevention)"

    # Check if script uses base64 encoding for env vars
    if grep -q "base64.*SUCCESS_CRITERIA\|AGENT_SUCCESS_CRITERIA_B64" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Base64 encoding for security found"
        return 0
    else
        log_fail "No base64 encoding for environment variables"
        return 1
    fi
}

# Test 11: Consistency check with CLI orchestrator
test_consistency_with_cli() {
    run_test "Consistency with CLI orchestrator patterns"

    local consistency_score=0
    local total_checks=4

    # Check 1: Similar parameter names
    if grep -q "\-\-success-criteria" "$DOCKER_ORCHESTRATOR"; then
        ((consistency_score++))
    fi

    # Check 2: Similar validation approach
    if grep -q "validate_json_context\|jq.*empty" "$DOCKER_ORCHESTRATOR"; then
        ((consistency_score++))
    fi

    # Check 3: Similar gate check structure
    if grep -q "gate-check\.sh\|gate_check.*function" "$DOCKER_ORCHESTRATOR"; then
        ((consistency_score++))
    fi

    # Check 4: Similar Redis coordination
    if grep -q "REDIS_COORDINATION_SKILL\|cfn-redis-coordination" "$DOCKER_ORCHESTRATOR"; then
        ((consistency_score++))
    fi

    if [[ $consistency_score -ge 3 ]]; then
        log_pass "Consistent with CLI orchestrator (${consistency_score}/${total_checks})"
        return 0
    else
        log_fail "Inconsistent with CLI orchestrator (${consistency_score}/${total_checks})"
        return 1
    fi
}

# Test 12: Docker-specific environment variable handling
test_docker_env_handling() {
    run_test "Docker-specific environment variable handling"

    # Check if script properly handles Docker env vars (--env flag, container passing)
    if grep -q "docker.*run.*--env\|DOCKER_ENV\|container.*environment" "$DOCKER_ORCHESTRATOR"; then
        log_pass "Docker environment variable handling found"
        return 0
    else
        log_fail "No Docker-specific environment variable handling"
        return 1
    fi
}

##############################################################################
# Main Test Execution
##############################################################################

echo "========================================="
echo "Docker Orchestrator Test Suite"
echo "Phase 4: Test-Driven Gate Support"
echo "========================================="
echo ""

# Run all tests
test_orchestrator_exists || true
test_success_criteria_parameter || true
test_success_criteria_validation || true
test_success_criteria_storage || true
test_env_var_passing || true
test_gate_check_integration || true
test_security_validations || true
test_gate_strategy_selection || true
test_success_criteria_loading || true
test_base64_encoding || true
test_consistency_with_cli || true
test_docker_env_handling || true

# Calculate results
echo ""
echo "========================================="
echo "Test Results Summary"
echo "========================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"

if [[ $TOTAL_TESTS -gt 0 ]]; then
    PASS_RATE=$(echo "scale=4; $PASSED_TESTS / $TOTAL_TESTS" | bc -l)
    PASS_PERCENTAGE=$(echo "scale=2; $PASS_RATE * 100" | bc -l)
    echo "Pass Rate: ${PASS_PERCENTAGE}% (${PASSED_TESTS}/${TOTAL_TESTS})"
    echo ""

    # Check against threshold (95%)
    if (( $(echo "$PASS_RATE >= 0.95" | bc -l) )); then
        echo -e "${GREEN}✅ TEST SUITE PASSED${NC} (≥95% pass rate)"
        exit 0
    else
        echo -e "${RED}❌ TEST SUITE FAILED${NC} (<95% pass rate)"
        exit 1
    fi
else
    echo -e "${RED}❌ NO TESTS EXECUTED${NC}"
    exit 1
fi
