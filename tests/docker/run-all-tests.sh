#!/bin/bash
# tests/docker/run-all-tests.sh
# Docker Mode Comprehensive Test Runner
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
CORE_PASSED=0
CORE_FAILED=0

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
        echo -e "${RED}ERROR:${NC} redis-cli not found"
        all_good=false
    elif ! redis-cli ping >/dev/null 2>&1; then
        echo -e "${YELLOW}WARNING:${NC} Redis not running - starting Redis..."
        if command -v redis-server >/dev/null 2>&1; then
            redis-server --daemonize yes >/dev/null 2>&1
            sleep 2
            if redis-cli ping >/dev/null 2>&1; then
                echo -e "${GREEN}✓${NC} Redis started successfully"
            else
                echo -e "${RED}ERROR:${NC} Could not start Redis"
                all_good=false
            fi
        else
            echo -e "${RED}ERROR:${NC} Redis not running and redis-server not found"
            all_good=false
        fi
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

    # Check docker-compose
    if ! command -v docker-compose >/dev/null 2>&1; then
        echo -e "${YELLOW}WARNING:${NC} docker-compose not found - some tests may be skipped"
    else
        echo -e "${GREEN}✓${NC} docker-compose is available"
    fi

    # Check NPX
    if ! command -v npx >/dev/null 2>&1; then
        echo -e "${RED}ERROR:${NC} npx not found"
        all_good=false
    else
        echo -e "${GREEN}✓${NC} NPX is available"
    fi

    # Check project structure
    if [[ ! -d "$PROJECT_ROOT/docker" ]]; then
        echo -e "${RED}ERROR:${NC} Docker configuration not found"
        all_good=false
    else
        echo -e "${GREEN}✓${NC} Docker configuration present"
    fi

    # Check CFN agent image
    if ! docker images | grep -q "cfn-agent"; then
        echo -e "${YELLOW}WARNING:${NC} CFN agent image not found - building may be required"
    else
        echo -e "${GREEN}✓${NC} CFN agent image present"
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

    local unit_dir="$PROJECT_ROOT/tests/docker/unit"

    if [[ ! -d "$unit_dir" ]]; then
        echo -e "${YELLOW}No unit tests found${NC}"
        return
    fi

    local tests=($(find "$unit_dir" -name "test-*.sh" -type f | sort))

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

    local integration_dir="$PROJECT_ROOT/tests/docker/integration"

    if [[ ! -d "$integration_dir" ]]; then
        echo -e "${YELLOW}No integration tests found${NC}"
        return
    fi

    local tests=($(find "$integration_dir" -name "test-*.sh" -o -name "docker-*.sh" | grep -v "README" | sort))

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

run_core_tests() {
    print_section "Core Tests (Critical Functionality)"

    local core_dir="$PROJECT_ROOT/tests/docker/core"

    if [[ ! -d "$core_dir" ]]; then
        echo -e "${YELLOW}No core tests found${NC}"
        return
    fi

    # Core tests include various test types from core directory
    local tests=($(find "$core_dir" -name "*.sh" -type f | grep -v "README" | sort))

    if [[ ${#tests[@]} -eq 0 ]]; then
        echo -e "${YELLOW}No core tests found${NC}"
        return
    fi

    echo "Found ${#tests[@]} core test(s)"
    echo ""
    echo -e "${YELLOW}NOTE:${NC} Core tests may take several minutes to complete"
    echo ""

    for test in "${tests[@]}"; do
        # Skip non-test files
        if [[ ! "$test" =~ test.*\.sh$ ]] && [[ ! "$test" =~ .*-tests\.sh$ ]]; then
            continue
        fi

        if run_test "$test"; then
            CORE_PASSED=$((CORE_PASSED + 1))
        else
            CORE_FAILED=$((CORE_FAILED + 1))
        fi
    done
}

# ============================================================================
# CLEANUP
# ============================================================================

cleanup_docker() {
    print_section "Cleaning Up Docker Resources"

    # Stop any test containers
    local test_containers=$(docker ps -a | grep -E "cfn-test|test-cfn" | awk '{print $1}' || true)
    if [[ -n "$test_containers" ]]; then
        echo "Stopping test containers..."
        echo "$test_containers" | xargs docker rm -f >/dev/null 2>&1 || true
    fi

    # Remove test networks
    local test_networks=$(docker network ls | grep -E "cfn-test|test-cfn" | awk '{print $1}' || true)
    if [[ -n "$test_networks" ]]; then
        echo "Removing test networks..."
        echo "$test_networks" | xargs docker network rm >/dev/null 2>&1 || true
    fi

    echo -e "${GREEN}✓${NC} Docker resources cleaned up"
    echo ""
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

    # Core tests
    local core_total=$((CORE_PASSED + CORE_FAILED))
    if [[ $core_total -gt 0 ]]; then
        echo -e "Core Tests:        ${GREEN}$CORE_PASSED passed${NC}, ${RED}$CORE_FAILED failed${NC} (${core_total} total)"
    fi

    echo ""
    echo -e "${CYAN}────────────────────────────────────────────────────────────────────────────${NC}"

    # Overall status
    local total_passed=$((UNIT_PASSED + INTEGRATION_PASSED + CORE_PASSED))
    local total_failed=$((UNIT_FAILED + INTEGRATION_FAILED + CORE_FAILED))
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
Docker Mode Test Runner

Usage:
  $0 [MODE]

Modes:
  --quick         Run unit tests only (fast, ~2 minutes)
  --integration   Run unit + integration tests (~10 minutes)
  --full          Run all tests including core tests (~30 minutes) [default]
  --help          Show this help message

Examples:
  $0 --quick         # Quick validation
  $0 --integration   # Pre-commit testing
  $0 --full          # Full test suite (CI/CD)

Test Organization:
  Unit Tests:        tests/docker/unit/
  Integration Tests: tests/docker/integration/
  Core Tests:        tests/docker/core/
  Archive:           tests/docker/archive/

Prerequisites:
  - Docker daemon running
  - Redis running (or redis-server available)
  - NPX available
  - CFN agent image built (or will be built during tests)

EOF
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    # Trap cleanup on exit
    trap cleanup_docker EXIT

    case "$TEST_MODE" in
        --help|-h)
            show_usage
            exit 0
            ;;
        --quick)
            print_header "Docker Mode Test Suite (Quick Mode)"
            check_prerequisites
            run_unit_tests
            ;;
        --integration)
            print_header "Docker Mode Test Suite (Integration Mode)"
            check_prerequisites
            run_unit_tests
            run_integration_tests
            ;;
        --full)
            print_header "Docker Mode Test Suite (Full Mode)"
            check_prerequisites
            run_unit_tests
            run_integration_tests
            run_core_tests
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
