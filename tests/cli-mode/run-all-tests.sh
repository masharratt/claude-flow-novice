#!/bin/bash
# tests/cli-mode/run-all-tests.sh
# CLI Mode Comprehensive Test Runner
# Runs: Unit tests + Integration tests + E2E tests

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test mode (default: full)
TEST_MODE="${1:---full}"

# Test results tracking
UNIT_PASSED=0
UNIT_FAILED=0
INTEGRATION_PASSED=0
INTEGRATION_FAILED=0
E2E_PASSED=0
E2E_FAILED=0

START_TIME=$(date +%s)

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_header() {
    local title="$1"
    echo ""
    echo -e "${CYAN}============================================================================${NC}"
    echo -e "${CYAN}${title}${NC}"
    echo -e "${CYAN}============================================================================${NC}"
    echo ""
}

print_section() {
    local title="$1"
    echo ""
    echo -e "${BLUE}────────────────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}${title}${NC}"
    echo -e "${BLUE}────────────────────────────────────────────────────────────────────────────${NC}"
}

run_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file")

    echo -e "${YELLOW}Running:${NC} $test_name"

    if bash "$test_file" > /tmp/test-output-$$.log 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC} - $test_name"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} - $test_name"
        echo "  Output saved to: /tmp/test-output-$$.log"
        cat /tmp/test-output-$$.log | sed 's/^/    /'
        return 1
    fi
}

check_prerequisites() {
    print_section "Checking Prerequisites"

    local all_good=true

    # Check Redis
    if ! command -v redis-cli >/dev/null 2>&1; then
        echo -e "${YELLOW}WARNING:${NC} redis-cli not found - some tests may be skipped"
    elif ! redis-cli ping >/dev/null 2>&1; then
        echo -e "${YELLOW}WARNING:${NC} Redis not running - coordination tests will be skipped"
    else
        echo -e "${GREEN}✓${NC} Redis is running"
    fi

    # Check Docker
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}ERROR:${NC} Docker not found"
        all_good=false
    elif ! docker ps >/dev/null 2>&1; then
        echo -e "${RED}ERROR:${NC} Docker daemon not running"
        all_good=false
    else
        echo -e "${GREEN}✓${NC} Docker is running"
    fi

    # Check NPX
    if ! command -v npx >/dev/null 2>&1; then
        echo -e "${YELLOW}WARNING:${NC} npx not found - E2E tests may fail"
    else
        echo -e "${GREEN}✓${NC} NPX is available"
    fi

    # Check project structure
    if [[ ! -f "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh" ]]; then
        echo -e "${RED}ERROR:${NC} CFN Loop orchestration scripts not found"
        all_good=false
    else
        echo -e "${GREEN}✓${NC} CFN Loop scripts present"
    fi

    if [[ "$all_good" == "false" ]]; then
        echo ""
        echo -e "${RED}ERROR: Prerequisites not met. Cannot run tests.${NC}"
        exit 1
    fi

    echo ""
}

# ============================================================================
# TEST RUNNERS
# ============================================================================

run_unit_tests() {
    print_section "Unit Tests (Component Validation)"

    local unit_dir="$PROJECT_ROOT/tests/cli-mode/core/unit"

    if [[ ! -d "$unit_dir" ]]; then
        echo -e "${YELLOW}No unit tests found${NC}"
        return
    fi

    local tests=($(find "$unit_dir" -name "test-*.sh" | sort))

    if [[ ${#tests[@]} -eq 0 ]]; then
        echo -e "${YELLOW}No unit tests found${NC}"
        return
    fi

    echo "Found ${#tests[@]} unit test(s)"
    echo ""

    for test in "${tests[@]}"; do
        if run_test "$test"; then
            UNIT_PASSED=$((UNIT_PASSED + 1))
        else
            UNIT_FAILED=$((UNIT_FAILED + 1))
        fi
    done
}

run_integration_tests() {
    print_section "Integration Tests (Component Interaction)"

    local integration_dir="$PROJECT_ROOT/tests/cli-mode/core/integration"

    if [[ ! -d "$integration_dir" ]]; then
        echo -e "${YELLOW}No integration tests found${NC}"
        return
    fi

    local tests=($(find "$integration_dir" -name "test-*.sh" | sort))

    if [[ ${#tests[@]} -eq 0 ]]; then
        echo -e "${YELLOW}No integration tests found${NC}"
        return
    fi

    echo "Found ${#tests[@]} integration test(s)"
    echo ""

    for test in "${tests[@]}"; do
        if run_test "$test"; then
            INTEGRATION_PASSED=$((INTEGRATION_PASSED + 1))
        else
            INTEGRATION_FAILED=$((INTEGRATION_FAILED + 1))
        fi
    done
}

run_e2e_tests() {
    print_section "E2E Tests (End-to-End Validation)"

    local e2e_dir="$PROJECT_ROOT/tests/cli-mode/core/e2e"

    if [[ ! -d "$e2e_dir" ]]; then
        echo -e "${YELLOW}No E2E tests found${NC}"
        return
    fi

    local tests=($(find "$e2e_dir" -name "test-*.sh" | sort))

    if [[ ${#tests[@]} -eq 0 ]]; then
        echo -e "${YELLOW}No E2E tests found${NC}"
        return
    fi

    echo "Found ${#tests[@]} E2E test(s)"
    echo ""
    echo -e "${YELLOW}NOTE:${NC} E2E tests may take several minutes to complete"
    echo ""

    for test in "${tests[@]}"; do
        if run_test "$test"; then
            E2E_PASSED=$((E2E_PASSED + 1))
        else
            E2E_FAILED=$((E2E_FAILED + 1))
        fi
    done
}

# ============================================================================
# REPORTING
# ============================================================================

print_summary() {
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))

    print_header "Test Summary"

    echo "Execution Time: ${duration}s"
    echo ""

    # Unit tests
    local unit_total=$((UNIT_PASSED + UNIT_FAILED))
    if [[ $unit_total -gt 0 ]]; then
        echo -e "Unit Tests:        ${GREEN}$UNIT_PASSED passed${NC}, ${RED}$UNIT_FAILED failed${NC} (${unit_total} total)"
    fi

    # Integration tests
    local integration_total=$((INTEGRATION_PASSED + INTEGRATION_FAILED))
    if [[ $integration_total -gt 0 ]]; then
        echo -e "Integration Tests: ${GREEN}$INTEGRATION_PASSED passed${NC}, ${RED}$INTEGRATION_FAILED failed${NC} (${integration_total} total)"
    fi

    # E2E tests
    local e2e_total=$((E2E_PASSED + E2E_FAILED))
    if [[ $e2e_total -gt 0 ]]; then
        echo -e "E2E Tests:         ${GREEN}$E2E_PASSED passed${NC}, ${RED}$E2E_FAILED failed${NC} (${e2e_total} total)"
    fi

    echo ""
    echo -e "${CYAN}────────────────────────────────────────────────────────────────────────────${NC}"

    # Overall status
    local total_passed=$((UNIT_PASSED + INTEGRATION_PASSED + E2E_PASSED))
    local total_failed=$((UNIT_FAILED + INTEGRATION_FAILED + E2E_FAILED))
    local total=$((total_passed + total_failed))

    echo -e "TOTAL:             ${GREEN}$total_passed passed${NC}, ${RED}$total_failed failed${NC} (${total} total)"

    if [[ $total_failed -eq 0 ]]; then
        echo ""
        echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
        echo ""
        return 0
    else
        echo ""
        echo -e "${RED}✗ SOME TESTS FAILED${NC}"
        echo ""
        return 1
    fi
}

# ============================================================================
# USAGE
# ============================================================================

show_usage() {
    cat <<EOF
CLI Mode Test Runner

Usage:
  $0 [MODE]

Modes:
  --quick         Run unit tests only (fast, ~1 minute)
  --integration   Run unit + integration tests (~5 minutes)
  --full          Run all tests including E2E (~15 minutes) [default]
  --help          Show this help message

Examples:
  $0 --quick         # Quick validation
  $0 --integration   # Pre-commit testing
  $0 --full          # Full test suite (CI/CD)

Test Organization:
  Unit Tests:        tests/cli-mode/core/unit/
  Integration Tests: tests/cli-mode/core/integration/
  E2E Tests:         tests/cli-mode/core/e2e/
  Archive:           tests/cli-mode/archive/

EOF
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    case "$TEST_MODE" in
        --help|-h)
            show_usage
            exit 0
            ;;
        --quick)
            print_header "CLI Mode Test Suite (Quick Mode)"
            check_prerequisites
            run_unit_tests
            ;;
        --integration)
            print_header "CLI Mode Test Suite (Integration Mode)"
            check_prerequisites
            run_unit_tests
            run_integration_tests
            ;;
        --full)
            print_header "CLI Mode Test Suite (Full Mode)"
            check_prerequisites
            run_unit_tests
            run_integration_tests
            run_e2e_tests
            ;;
        *)
            echo -e "${RED}ERROR: Unknown mode '$TEST_MODE'${NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac

    print_summary
}

main
