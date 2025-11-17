#!/bin/bash
# Comprehensive Integration Test Runner
# Executes ALL integration tests and logs results

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Results directory
RESULTS_DIR="/home/user/claude-flow-novice/tests/integration/results"
mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE="$RESULTS_DIR/test-results-${TIMESTAMP}.log"

# Function to log test result
log_test_result() {
    local test_name="$1"
    local status="$2"
    local duration="$3"
    local error_msg="${4:-}"

    echo "[$status] $test_name (${duration}s)" >> "$RESULTS_FILE"
    if [ -n "$error_msg" ]; then
        echo "  Error: $error_msg" >> "$RESULTS_FILE"
    fi

    case "$status" in
        PASS)
            echo -e "${GREEN}✓${NC} $test_name (${duration}s)"
            ((PASSED_TESTS++))
            ;;
        FAIL)
            echo -e "${RED}✗${NC} $test_name (${duration}s)"
            echo -e "  ${RED}Error: $error_msg${NC}"
            ((FAILED_TESTS++))
            ;;
        SKIP)
            echo -e "${YELLOW}⊘${NC} $test_name (skipped)"
            ((SKIPPED_TESTS++))
            ;;
    esac
    ((TOTAL_TESTS++))
}

# Function to run shell test
run_shell_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file" .sh)

    echo -e "\n${BLUE}Running:${NC} $test_name"

    local start_time=$(date +%s)
    local output_file="$RESULTS_DIR/${test_name}-${TIMESTAMP}.log"

    if bash "$test_file" > "$output_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_test_result "$test_name" "PASS" "$duration"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        local error=$(tail -5 "$output_file" | tr '\n' ' ')
        log_test_result "$test_name" "FAIL" "$duration" "$error"
        return 1
    fi
}

# Function to run Jest test
run_jest_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file")

    echo -e "\n${BLUE}Running:${NC} $test_name"

    local start_time=$(date +%s)
    local output_file="$RESULTS_DIR/${test_name}-${TIMESTAMP}.log"

    if npx jest "$test_file" --config=/home/user/claude-flow-novice/tests/integration/jest.config.cjs > "$output_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_test_result "$test_name" "PASS" "$duration"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        local error=$(tail -5 "$output_file" | tr '\n' ' ')
        log_test_result "$test_name" "FAIL" "$duration" "$error"
        return 1
    fi
}

echo "=========================================="
echo "Integration Test Execution Suite"
echo "Started: $(date)"
echo "=========================================="
echo ""

# Initialize results file
cat > "$RESULTS_FILE" << EOF
Integration Test Results
Date: $(date)
Host: $(hostname)
========================================

EOF

# Run shell-based tests
echo -e "${BLUE}=== Shell-Based Tests ===${NC}\n"

SHELL_TESTS=(
    "/home/user/claude-flow-novice/tests/integration/test-connectivity.sh"
    "/home/user/claude-flow-novice/tests/integration/test-integration-simple.sh"
    "/home/user/claude-flow-novice/tests/integration/test-component.sh"
    "/home/user/claude-flow-novice/tests/integration/test-10-agent-concurrent.sh"
    "/home/user/claude-flow-novice/tests/integration/test-environment-sanitization.sh"
    "/home/user/claude-flow-novice/tests/integration/test-graceful-shutdown-comprehensive.sh"
    "/home/user/claude-flow-novice/tests/integration/test-memory-leak-prevention.sh"
    "/home/user/claude-flow-novice/tests/integration/test-orchestrator-load.sh"
    "/home/user/claude-flow-novice/tests/integration/test-parameter-standardization.sh"
    "/home/user/claude-flow-novice/tests/integration/test-priority-queue.sh"
    "/home/user/claude-flow-novice/tests/integration/test-priority-queue-unix.sh"
    "/home/user/claude-flow-novice/tests/integration/test-process-instrumentation.sh"
    "/home/user/claude-flow-novice/tests/integration/test-provider-routing.sh"
    "/home/user/claude-flow-novice/tests/integration/test-seo-pipeline-structure.sh"
    "/home/user/claude-flow-novice/tests/integration/test-standard-handoffs.sh"
    "/home/user/claude-flow-novice/tests/integration/test-zai-routing.sh"
)

for test in "${SHELL_TESTS[@]}"; do
    if [ -f "$test" ]; then
        run_shell_test "$test" || true
    else
        log_test_result "$(basename "$test")" "SKIP" "0" "File not found"
    fi
done

# Run TypeScript/Jest tests
echo -e "\n${BLUE}=== TypeScript/Jest Tests ===${NC}\n"

JEST_TESTS=(
    "/home/user/claude-flow-novice/tests/integration/backup-recovery.test.ts"
    "/home/user/claude-flow-novice/tests/integration/coordination-protocols.test.ts"
    "/home/user/claude-flow-novice/tests/integration/data-formats.test.ts"
    "/home/user/claude-flow-novice/tests/integration/database-handoffs.test.ts"
    "/home/user/claude-flow-novice/tests/integration/end-to-end-workflows.test.ts"
    "/home/user/claude-flow-novice/tests/integration/redis-failure.test.ts"
    "/home/user/claude-flow-novice/tests/integration/schema-validation-complete.test.ts"
    "/home/user/claude-flow-novice/tests/integration/skill-lifecycle.test.ts"
)

for test in "${JEST_TESTS[@]}"; do
    if [ -f "$test" ]; then
        run_jest_test "$test" || true
    else
        log_test_result "$(basename "$test")" "SKIP" "0" "File not found"
    fi
done

# Run phase-1 tests
echo -e "\n${BLUE}=== Phase 1 Tests ===${NC}\n"

PHASE1_TESTS=(
    "/home/user/claude-flow-novice/tests/integration/phase-1/agents.test.js"
    "/home/user/claude-flow-novice/tests/integration/phase-1/decisions.test.js"
    "/home/user/claude-flow-novice/tests/integration/phase-1/filters.test.js"
    "/home/user/claude-flow-novice/tests/integration/phase-1/messages.test.js"
    "/home/user/claude-flow-novice/tests/integration/phase-1/websocket.test.js"
)

for test in "${PHASE1_TESTS[@]}"; do
    if [ -f "$test" ]; then
        run_jest_test "$test" || true
    else
        log_test_result "$(basename "$test")" "SKIP" "0" "File not found"
    fi
done

# Generate summary
echo ""
echo "=========================================="
echo "Test Execution Summary"
echo "=========================================="
echo -e "Total Tests:   ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed:        ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:        ${RED}$FAILED_TESTS${NC}"
echo -e "Skipped:       ${YELLOW}$SKIPPED_TESTS${NC}"

if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")
    echo -e "Pass Rate:     ${BLUE}${PASS_RATE}%${NC}"
fi

echo ""
echo "Execution Rate: $(awk "BEGIN {printf \"%.1f\", (($PASSED_TESTS + $FAILED_TESTS)/$TOTAL_TESTS)*100}")%"
echo "Results saved: $RESULTS_FILE"
echo "Completed: $(date)"
echo "=========================================="

# Append summary to results file
cat >> "$RESULTS_FILE" << EOF

========================================
Summary
========================================
Total Tests:    $TOTAL_TESTS
Passed:         $PASSED_TESTS
Failed:         $FAILED_TESTS
Skipped:        $SKIPPED_TESTS
Pass Rate:      ${PASS_RATE:-0}%
Execution Rate: $(awk "BEGIN {printf \"%.1f\", (($PASSED_TESTS + $FAILED_TESTS)/$TOTAL_TESTS)*100}")%
========================================
EOF

# Exit with failure if any tests failed
if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
fi

exit 0
