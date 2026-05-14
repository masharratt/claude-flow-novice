#!/bin/bash
# tests/integration/collision-mitigation/run-all-collision-tests.sh
# Master test runner for CLI/Trigger.dev collision mitigation validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_DIR="$PROJECT_ROOT/tests/integration/collision-mitigation"
RESULTS_FILE="/tmp/collision-mitigation-results-$$.txt"
START_TIME=$(date +%s)

cleanup() {
    log_info "Test suite cleanup"
    rm -f "$RESULTS_FILE" 2>/dev/null || true
}
trap cleanup EXIT

annotate "CLI/Trigger.dev Collision Mitigation - Full Validation Suite"
echo "Reference: planning/trigger/CLI_TRIGGER_COLLISION_ANALYSIS.md"
echo "Objective: Confirm zero collisions when both modes run simultaneously"
echo ""

# Initialize results tracking
PHASES_TOTAL=0
PHASES_PASSED=0
PHASES_FAILED=0

run_phase_test() {
    local phase_num=$1
    local test_script=$2
    local phase_name=$3

    PHASES_TOTAL=$((PHASES_TOTAL + 1))

    annotate "Phase $phase_num: $phase_name"
    echo "Script: $test_script"
    echo ""

    if [ ! -f "$test_script" ]; then
        log_error "Test script not found: $test_script"
        PHASES_FAILED=$((PHASES_FAILED + 1))
        echo "FAIL: Phase $phase_num - $phase_name (script not found)" >> "$RESULTS_FILE"
        return 1
    fi

    if ! [ -x "$test_script" ]; then
        chmod +x "$test_script"
    fi

    local phase_start=$(date +%s)
    if bash "$test_script"; then
        local phase_end=$(date +%s)
        local duration=$((phase_end - phase_start))
        log_success "Phase $phase_num PASSED (${duration}s)"
        PHASES_PASSED=$((PHASES_PASSED + 1))
        echo "PASS: Phase $phase_num - $phase_name (${duration}s)" >> "$RESULTS_FILE"
        return 0
    else
        local phase_end=$(date +%s)
        local duration=$((phase_end - phase_start))
        log_error "Phase $phase_num FAILED (${duration}s)"
        PHASES_FAILED=$((PHASES_FAILED + 1))
        echo "FAIL: Phase $phase_num - $phase_name (${duration}s)" >> "$RESULTS_FILE"
        return 1
    fi
}

# Phase 1: Redis Key Namespace Isolation
run_phase_test 1 \
    "$TEST_DIR/test-phase1-redis-key-isolation.sh" \
    "Redis Namespace Isolation"

# Phase 2: Service Name Aliases
run_phase_test 2 \
    "$TEST_DIR/test-phase2-service-discovery.sh" \
    "Service Discovery & Network Aliases"

# Phase 3: Environment Contract
run_phase_test 3 \
    "$TEST_DIR/test-phase3-environment-contract.sh" \
    "Environment Variable Contract"

# Phase 4: Socket Proxy Security
run_phase_test 4 \
    "$TEST_DIR/test-phase4-socket-proxy.sh" \
    "Socket Proxy Security Hardening"

# Integration Test: Simultaneous Execution
annotate "Integration Test: Simultaneous Execution"
PHASES_TOTAL=$((PHASES_TOTAL + 1))

if bash "$TEST_DIR/test-simultaneous-execution.sh"; then
    log_success "Simultaneous Execution Test PASSED"
    PHASES_PASSED=$((PHASES_PASSED + 1))
    echo "PASS: Integration - Simultaneous Execution" >> "$RESULTS_FILE"
else
    log_error "Simultaneous Execution Test FAILED"
    PHASES_FAILED=$((PHASES_FAILED + 1))
    echo "FAIL: Integration - Simultaneous Execution" >> "$RESULTS_FILE"
fi

# Calculate metrics
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
PASS_RATE=0
if [ "$PHASES_TOTAL" -gt 0 ]; then
    PASS_RATE=$(( (PHASES_PASSED * 100) / PHASES_TOTAL ))
fi

# Print summary
annotate "Collision Mitigation Test Summary"
echo ""
echo "==================================="
echo "Test Execution Summary"
echo "==================================="
echo "Total Phases: $PHASES_TOTAL"
echo "Passed: $PHASES_PASSED"
echo "Failed: $PHASES_FAILED"
echo "Pass Rate: ${PASS_RATE}%"
echo "Total Duration: ${TOTAL_DURATION}s"
echo ""

if [ -f "$RESULTS_FILE" ]; then
    echo "==================================="
    echo "Detailed Results"
    echo "==================================="
    cat "$RESULTS_FILE"
    echo ""
fi

# Generate validation report
echo "==================================="
echo "Validation Status"
echo "==================================="
echo ""

if [ "$PHASES_FAILED" -eq 0 ]; then
    echo "✅ VALIDATION COMPLETE: Zero collisions confirmed"
    echo ""
    echo "All 4 phases validated successfully:"
    echo "  ✅ Phase 1: Redis key isolation (no key collisions)"
    echo "  ✅ Phase 2: Service discovery (network-aware naming)"
    echo "  ✅ Phase 3: Environment contract (mode-specific vars)"
    echo "  ✅ Phase 4: Socket proxy (consistent security posture)"
    echo "  ✅ Integration: Simultaneous execution (zero interference)"
    echo ""
    echo "CLI and Trigger.dev modes can run simultaneously without conflicts."
    echo ""
    exit 0
else
    echo "❌ VALIDATION FAILED: Collisions detected"
    echo ""
    echo "Failed phases ($PHASES_FAILED):"
    grep "^FAIL:" "$RESULTS_FILE" | sed 's/^FAIL: /  ❌ /'
    echo ""
    echo "Collision risks remain. Review failed phase logs above."
    echo ""
    exit 1
fi
