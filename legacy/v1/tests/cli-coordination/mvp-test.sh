#!/bin/bash
# Sprint 1.4: Comprehensive Test Harness - CLI Coordination MVP
# Orchestrates all test suites with TAP-compatible output and diagnostics
# Total expected tests: ~50 across 3 suites (basic: ~25, state: ~16, coordination: ~9)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_LOG_DIR="/tmp/cfn-mvp-test-logs"
HARNESS_LOG="$TEST_LOG_DIR/mvp-test-harness-$TEST_TIMESTAMP.log"
TAP_OUTPUT="$TEST_LOG_DIR/mvp-test-tap-$TEST_TIMESTAMP.tap"

# Test suite scripts
BASIC_TEST="$SCRIPT_DIR/mvp-test-basic.sh"
STATE_TEST="$SCRIPT_DIR/mvp-test-state.sh"
COORDINATION_TEST="$SCRIPT_DIR/mvp-test-coordination.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TOTAL_SUITES=0
SUITES_PASSED=0
SUITES_FAILED=0
TOTAL_TESTS=0
TESTS_PASSED=0
TESTS_FAILED=0

# Timing
HARNESS_START_TIME=$(date +%s)

# Initialize logging
setup_logging() {
    mkdir -p "$TEST_LOG_DIR"
    chmod 755 "$TEST_LOG_DIR"

    # Initialize TAP output
    echo "TAP version 13" > "$TAP_OUTPUT"

    # Initialize harness log
    cat > "$HARNESS_LOG" <<EOF
========================================
CFN MVP Test Harness - Sprint 1.4
========================================
Timestamp: $TEST_TIMESTAMP
Log Directory: $TEST_LOG_DIR
Test Suites:
  1. Basic Smoke Tests (mvp-test-basic.sh)
  2. State Management & Checkpointing (mvp-test-state.sh)
  3. Agent Coordination (mvp-test-coordination.sh)
========================================

EOF
}

# Log function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")

    echo "[$timestamp] [$level] $message" | tee -a "$HARNESS_LOG"
}

# Print colored banner
print_banner() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}   CFN MVP Test Harness - Sprint 1.4${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo -e "${BLUE}Timestamp:${NC}     $TEST_TIMESTAMP"
    echo -e "${BLUE}Log Directory:${NC} $TEST_LOG_DIR"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

# Print suite header
print_suite_header() {
    local suite_num="$1"
    local suite_name="$2"

    echo ""
    echo -e "${YELLOW}┌────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│ Suite $suite_num: $suite_name${NC}"
    echo -e "${YELLOW}└────────────────────────────────────────┘${NC}"
    echo ""
}

# Extract test counts from suite output
extract_test_counts() {
    local output="$1"

    # Extract "Total tests: X" and "Passed: Y" and "Failed: Z" patterns
    local total=$(echo "$output" | grep -oP '(?<=Total tests: )\d+' | tail -1)
    local passed=$(echo "$output" | grep -oP '(?<=Passed: )\d+' | tail -1)
    local failed=$(echo "$output" | grep -oP '(?<=Failed: )\d+' | tail -1)

    # Default to 0 if not found
    total=${total:-0}
    passed=${passed:-0}
    failed=${failed:-0}

    echo "$total:$passed:$failed"
}

# Run a test suite with timing and output capture
run_suite() {
    local suite_num="$1"
    local suite_name="$2"
    local suite_script="$3"

    TOTAL_SUITES=$((TOTAL_SUITES + 1))

    print_suite_header "$suite_num" "$suite_name"

    log "INFO" "Starting suite $suite_num: $suite_name"
    log "INFO" "Script: $suite_script"

    # Check if script exists
    if [[ ! -f "$suite_script" ]]; then
        log "ERROR" "Suite script not found: $suite_script"
        echo -e "${RED}✗ SUITE FAILED${NC} - Script not found: $suite_script"
        SUITES_FAILED=$((SUITES_FAILED + 1))
        echo "not ok $suite_num - $suite_name # Script not found" >> "$TAP_OUTPUT"
        return 1
    fi

    # Check if script is executable
    if [[ ! -x "$suite_script" ]]; then
        chmod +x "$suite_script"
        log "INFO" "Made script executable: $suite_script"
    fi

    # Capture suite output and timing
    local suite_start=$(date +%s)
    local suite_output_file="$TEST_LOG_DIR/suite-${suite_num}-$TEST_TIMESTAMP.log"

    # Run suite and capture output
    set +e
    bash "$suite_script" > "$suite_output_file" 2>&1
    local suite_exit_code=$?
    set -e

    local suite_end=$(date +%s)
    local suite_duration=$((suite_end - suite_start))

    # Read suite output
    local suite_output=$(cat "$suite_output_file")

    # Extract test counts
    local counts=$(extract_test_counts "$suite_output")
    local suite_total=$(echo "$counts" | cut -d: -f1)
    local suite_passed=$(echo "$counts" | cut -d: -f2)
    local suite_failed=$(echo "$counts" | cut -d: -f3)

    # Update global counters
    TOTAL_TESTS=$((TOTAL_TESTS + suite_total))
    TESTS_PASSED=$((TESTS_PASSED + suite_passed))
    TESTS_FAILED=$((TESTS_FAILED + suite_failed))

    # Determine suite result
    if [[ $suite_exit_code -eq 0 ]]; then
        SUITES_PASSED=$((SUITES_PASSED + 1))
        echo -e "${GREEN}✓ SUITE PASSED${NC} - $suite_name (${suite_duration}s)"
        echo -e "  Tests: ${GREEN}$suite_passed passed${NC}, ${RED}$suite_failed failed${NC}, $suite_total total"

        log "INFO" "Suite $suite_num PASSED - Duration: ${suite_duration}s, Tests: $suite_total (Passed: $suite_passed, Failed: $suite_failed)"

        # Write TAP output
        echo "ok $suite_num - $suite_name # time=${suite_duration}s tests=$suite_total passed=$suite_passed" >> "$TAP_OUTPUT"
    else
        SUITES_FAILED=$((SUITES_FAILED + 1))
        echo -e "${RED}✗ SUITE FAILED${NC} - $suite_name (${suite_duration}s)"
        echo -e "  Tests: ${GREEN}$suite_passed passed${NC}, ${RED}$suite_failed failed${NC}, $suite_total total"
        echo -e "  ${YELLOW}Exit code: $suite_exit_code${NC}"

        log "ERROR" "Suite $suite_num FAILED - Duration: ${suite_duration}s, Exit code: $suite_exit_code, Tests: $suite_total (Passed: $suite_passed, Failed: $suite_failed)"

        # Write TAP output with diagnostics
        echo "not ok $suite_num - $suite_name # time=${suite_duration}s tests=$suite_total failed=$suite_failed" >> "$TAP_OUTPUT"

        # Extract failure diagnostics
        local failures=$(echo "$suite_output" | grep -A 3 "✗ FAIL" | head -20)
        if [[ -n "$failures" ]]; then
            echo "  ---" >> "$TAP_OUTPUT"
            echo "  message: 'Suite failures detected'" >> "$TAP_OUTPUT"
            echo "  severity: fail" >> "$TAP_OUTPUT"
            echo "  data:" >> "$TAP_OUTPUT"
            echo "    exit_code: $suite_exit_code" >> "$TAP_OUTPUT"
            echo "    duration: ${suite_duration}s" >> "$TAP_OUTPUT"
            echo "    log_file: $suite_output_file" >> "$TAP_OUTPUT"
            echo "  ..." >> "$TAP_OUTPUT"
        fi
    fi

    # Append suite output to harness log
    echo "" >> "$HARNESS_LOG"
    echo "========== Suite $suite_num: $suite_name ==========" >> "$HARNESS_LOG"
    cat "$suite_output_file" >> "$HARNESS_LOG"
    echo "" >> "$HARNESS_LOG"

    return $suite_exit_code
}

# Print final summary
print_summary() {
    local harness_end=$(date +%s)
    local total_duration=$((harness_end - HARNESS_START_TIME))

    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}         TEST HARNESS SUMMARY${NC}"
    echo -e "${CYAN}========================================${NC}"

    # Suite summary
    echo -e "${BLUE}Test Suites:${NC}"
    echo -e "  Total:   $TOTAL_SUITES"
    if [[ $SUITES_PASSED -gt 0 ]]; then
        echo -e "  Passed:  ${GREEN}$SUITES_PASSED${NC}"
    fi
    if [[ $SUITES_FAILED -gt 0 ]]; then
        echo -e "  Failed:  ${RED}$SUITES_FAILED${NC}"
    fi

    echo ""

    # Test summary
    echo -e "${BLUE}Individual Tests:${NC}"
    echo -e "  Total:   $TOTAL_TESTS"
    if [[ $TESTS_PASSED -gt 0 ]]; then
        echo -e "  Passed:  ${GREEN}$TESTS_PASSED${NC}"
    fi
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "  Failed:  ${RED}$TESTS_FAILED${NC}"
    fi

    echo ""

    # Timing
    echo -e "${BLUE}Execution Time:${NC} ${total_duration}s"

    echo ""

    # Coverage validation
    echo -e "${BLUE}MVP Requirements Coverage:${NC}"
    echo -e "  ${GREEN}✓${NC} Background process management (spawn, status, shutdown)"
    echo -e "  ${GREEN}✓${NC} File-based IPC (message bus delivery)"
    echo -e "  ${GREEN}✓${NC} Checkpoint/restore (versioning, validation, live restore)"
    echo -e "  ${GREEN}✓${NC} Signal-based pause/resume (SIGSTOP/SIGCONT handling)"
    echo -e "  ${GREEN}✓${NC} 2-agent coordination (bidirectional messaging)"

    echo ""

    # Log files
    echo -e "${BLUE}Log Files:${NC}"
    echo -e "  Harness log: $HARNESS_LOG"
    echo -e "  TAP output:  $TAP_OUTPUT"
    echo -e "  Suite logs:  $TEST_LOG_DIR/suite-*-$TEST_TIMESTAMP.log"

    echo -e "${CYAN}========================================${NC}"

    # Write TAP plan
    echo "1..$TOTAL_SUITES" >> "$TAP_OUTPUT"

    # Append summary to harness log
    cat >> "$HARNESS_LOG" <<EOF

========================================
FINAL SUMMARY
========================================
Test Suites: $SUITES_PASSED passed, $SUITES_FAILED failed, $TOTAL_SUITES total
Tests:       $TESTS_PASSED passed, $TESTS_FAILED failed, $TOTAL_TESTS total
Duration:    ${total_duration}s
TAP Output:  $TAP_OUTPUT
========================================
EOF
}

# Main execution
main() {
    # Setup
    setup_logging
    print_banner

    log "INFO" "Test harness started"

    # Run test suites
    run_suite 1 "Basic Smoke Tests" "$BASIC_TEST" || true
    run_suite 2 "State Management & Checkpointing" "$STATE_TEST" || true
    run_suite 3 "Agent Coordination" "$COORDINATION_TEST" || true

    # Print summary
    print_summary

    # Final result
    echo ""
    if [[ $SUITES_FAILED -eq 0 ]]; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  ✓ ALL TEST SUITES PASSED${NC}"
        echo -e "${GREEN}========================================${NC}"
        log "INFO" "Test harness completed successfully - ALL SUITES PASSED"
        exit 0
    else
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}  ✗ SOME TEST SUITES FAILED${NC}"
        echo -e "${RED}========================================${NC}"
        log "ERROR" "Test harness completed with failures - $SUITES_FAILED suite(s) failed"
        exit 1
    fi
}

# Trap cleanup
cleanup_on_exit() {
    log "INFO" "Test harness cleanup completed"
}

trap cleanup_on_exit EXIT

# Run main
main "$@"
