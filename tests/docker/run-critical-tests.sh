#!/bin/bash
# tests/docker/run-critical-tests.sh
# Phase 4 :: Automated Test Runner for Critical Docker Tests
# Runs all critical test suites and provides consolidated reporting

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test suite configuration
TEST_SUITES=(
    "test-docker-fixes.sh:Docker Socket & Redis Auth"
    "test-success-criteria-loading.sh:Success Criteria Loading"
)

# Results tracking
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0
SUITE_RESULTS=()

# Cleanup function
cleanup() {
    # No cleanup needed - individual tests handle their own cleanup
    :
}
trap cleanup EXIT

##############################################################################
# Test Execution Functions
##############################################################################

run_test_suite() {
    local test_script="$1"
    local test_name="$2"
    local test_path="$PROJECT_ROOT/tests/docker/$test_script"

    ((TOTAL_SUITES++)) || true

    log_step "Running Test Suite $TOTAL_SUITES: $test_name"
    log_info "Script: $test_script"
    log_info ""

    # Check if test exists
    if [[ ! -f "$test_path" ]]; then
        log_info "❌ SKIP: Test script not found: $test_path"
        SUITE_RESULTS+=("❌ SKIP: $test_name (script not found)")
        ((FAILED_SUITES++)) || true
        return 1
    fi

    # Check if test is executable
    if [[ ! -x "$test_path" ]]; then
        log_info "⚠️  Making script executable: $test_script"
        chmod +x "$test_path"
    fi

    # Run test and capture result
    local start_time=$(date +%s)
    if bash "$test_path"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_info ""
        log_info "✅ PASS: $test_name (${duration}s)"
        SUITE_RESULTS+=("✅ PASS: $test_name (${duration}s)")
        ((PASSED_SUITES++)) || true
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_info ""
        log_info "❌ FAIL: $test_name (${duration}s)"
        SUITE_RESULTS+=("❌ FAIL: $test_name (${duration}s)")
        ((FAILED_SUITES++)) || true
        return 1
    fi
}

##############################################################################
# Report Generation
##############################################################################

generate_summary() {
    log_step "=== Critical Docker Tests Summary ==="
    log_info "Execution Time: $(date '+%Y-%m-%d %H:%M:%S')"
    log_info ""
    log_info "Test Suites:"
    log_info "  Total:  $TOTAL_SUITES"
    log_info "  Passed: $PASSED_SUITES"
    log_info "  Failed: $FAILED_SUITES"
    log_info ""

    if [[ "$FAILED_SUITES" -eq 0 ]]; then
        log_info "Overall Status: ✅ ALL TESTS PASSED"
    else
        log_info "Overall Status: ❌ SOME TESTS FAILED"
    fi

    log_info ""
    log_step "=== Detailed Results ==="
    for result in "${SUITE_RESULTS[@]}"; do
        log_info "$result"
    done
}

##############################################################################
# Main Execution
##############################################################################

main() {
    log_step "=== Critical Docker Tests Runner ==="
    log_info "Project: claude-flow-novice"
    log_info "Test Directory: tests/docker/"
    log_info "Total Suites: ${#TEST_SUITES[@]}"
    log_info ""

    # Verify prerequisites
    log_step "Checking Prerequisites"

    # Check if Redis is running (required for some tests)
    if docker ps | grep -q "cfn-redis"; then
        log_info "✅ Redis container is running"
    else
        log_info "⚠️  WARNING: Redis container not found"
        log_info "   Some tests may fail if they require Redis"
        log_info "   Start Redis with: docker run -d --name cfn-redis --network cfn-network redis:7-alpine"
    fi

    # Check if coordinator image exists (required for some tests)
    if docker images | grep -q "cfn-coordinator.*latest"; then
        log_info "✅ Coordinator image exists"
    else
        log_info "⚠️  WARNING: Coordinator image not found"
        log_info "   Some tests may fail if they require the coordinator image"
        log_info "   Build with: ./.claude/skills/docker-build/build.sh"
    fi

    log_info ""

    # Execute all test suites
    for suite in "${TEST_SUITES[@]}"; do
        IFS=':' read -r script name <<< "$suite"
        run_test_suite "$script" "$name" || true
        log_info ""
        log_info "---"
        log_info ""
    done

    # Generate summary
    generate_summary

    # Exit with appropriate code
    if [[ "$FAILED_SUITES" -eq 0 ]]; then
        log_info ""
        log_info "🎉 All critical tests passed successfully!"
        exit 0
    else
        log_info ""
        log_info "⚠️  $FAILED_SUITES test suite(s) failed"
        exit 1
    fi
}

main "$@"
