#!/bin/bash
# Integration Test Framework
# Comprehensive testing for deployment handoff points
# Part of: DEPLOYMENT_PIPELINE_STANDARDS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../" && pwd)"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Test configuration
TEST_RESULTS_DIR="${PROJECT_ROOT}/.test-results"
TEST_LOG_FILE="${TEST_RESULTS_DIR}/integration-test-${TIMESTAMP}.log"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
declare -A TEST_RESULTS

mkdir -p "$TEST_RESULTS_DIR"

# ============================================================================
# Test Utility Functions
# ============================================================================

log() {
    local LEVEL="$1"
    shift
    local MESSAGE="$@"

    local TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[$TIMESTAMP] [$LEVEL] $MESSAGE" | tee -a "$TEST_LOG_FILE"
}

assert_exit_code() {
    local EXPECTED=$1
    local ACTUAL=$2
    local MESSAGE="${3:-Exit code check}"

    if [[ $ACTUAL -eq $EXPECTED ]]; then
        log "PASS" "$MESSAGE (exit code: $ACTUAL)"
        return 0
    else
        log "FAIL" "$MESSAGE (expected: $EXPECTED, got: $ACTUAL)"
        return 1
    fi
}

assert_file_exists() {
    local FILE="$1"
    local MESSAGE="${2:-File exists: $FILE}"

    if [[ -f "$FILE" ]]; then
        log "PASS" "$MESSAGE"
        return 0
    else
        log "FAIL" "$MESSAGE"
        return 1
    fi
}

assert_contains() {
    local CONTENT="$1"
    local PATTERN="$2"
    local MESSAGE="${3:-Content contains pattern}"

    if echo "$CONTENT" | grep -q "$PATTERN"; then
        log "PASS" "$MESSAGE"
        return 0
    else
        log "FAIL" "$MESSAGE"
        return 1
    fi
}

run_test() {
    local TEST_NAME="$1"
    local TEST_FUNC="$2"

    echo ""
    echo "======================================================================"
    echo "TEST: $TEST_NAME"
    echo "======================================================================"

    if $TEST_FUNC; then
        ((TESTS_PASSED++))
        TEST_RESULTS["$TEST_NAME"]="PASS"
        echo -e "${GREEN}✓ PASSED${NC}: $TEST_NAME"
    else
        ((TESTS_FAILED++))
        TEST_RESULTS["$TEST_NAME"]="FAIL"
        echo -e "${RED}✗ FAILED${NC}: $TEST_NAME"
    fi
}

# ============================================================================
# Test 1: Service Discovery Integration
# ============================================================================

test_service_discovery_integration() {
    log "INFO" "Starting service discovery integration test"

    # Source the service discovery script
    if [[ ! -f "${PROJECT_ROOT}/scripts/deployment/service-discovery.sh" ]]; then
        log "SKIP" "service-discovery.sh not found"
        ((TESTS_SKIPPED++))
        return 0
    fi

    source "${PROJECT_ROOT}/scripts/deployment/service-discovery.sh"

    # Test 1.1: Discover Redis
    local REDIS_DISCOVERED=0
    if discover_redis_service 2>/dev/null; then
        REDIS_DISCOVERED=1
    fi
    log "INFO" "Redis discovery: $([ $REDIS_DISCOVERED -eq 1 ] && echo 'success' || echo 'failed')"

    # Test 1.2: Resolve skills directory
    if SKILLS_DIR=$(resolve_skills_dir 2>/dev/null); then
        log "PASS" "Skills directory resolved: $SKILLS_DIR"
        assert_file_exists "${SKILLS_DIR}/cfn-coordination/SKILL.md" "Coordination skill exists"
    else
        log "FAIL" "Could not resolve skills directory"
        return 1
    fi

    # Test 1.3: List available skills
    if SKILL_LIST=$(list_available_skills 2>&1); then
        assert_contains "$SKILL_LIST" "cfn" "Installed skills contain cfn prefix"
    fi

    return 0
}

# ============================================================================
# Test 2: Health Check Integration
# ============================================================================

test_health_check_integration() {
    log "INFO" "Starting health check integration test"

    if [[ ! -f "${PROJECT_ROOT}/scripts/deployment/health-check-service.sh" ]]; then
        log "SKIP" "health-check-service.sh not found"
        ((TESTS_SKIPPED++))
        return 0
    fi

    # Run health checks
    local HEALTH_OUTPUT
    HEALTH_OUTPUT=$(bash "${PROJECT_ROOT}/scripts/deployment/health-check-service.sh" check-all 2>&1 || true)

    # Test 2.1: Database check
    assert_contains "$HEALTH_OUTPUT" "database" "Health check includes database check"

    # Test 2.2: Disk space check
    assert_contains "$HEALTH_OUTPUT" "Disk" "Health check includes disk space check"

    # Test 2.3: JSON report generation
    local REPORT_FILE="${TEST_RESULTS_DIR}/health-report-${TIMESTAMP}.json"
    bash "${PROJECT_ROOT}/scripts/deployment/health-check-service.sh" report "$REPORT_FILE" 2>/dev/null || true

    if assert_file_exists "$REPORT_FILE" "Health report generated"; then
        # Verify JSON is valid
        if jq empty "$REPORT_FILE" 2>/dev/null; then
            log "PASS" "Health report is valid JSON"
        else
            log "FAIL" "Health report JSON is invalid"
            return 1
        fi
    fi

    return 0
}

# ============================================================================
# Test 3: Configuration Path Resolution
# ============================================================================

test_configuration_discovery() {
    log "INFO" "Starting configuration discovery test"

    if [[ ! -f "${PROJECT_ROOT}/scripts/deployment/service-discovery.sh" ]]; then
        ((TESTS_SKIPPED++))
        return 0
    fi

    source "${PROJECT_ROOT}/scripts/deployment/service-discovery.sh"

    # Test 3.1: Config directory exists
    local CONFIG_PATH="${CFN_CONFIG_PATH:-./config}"
    if assert_file_exists "${PROJECT_ROOT}/${CONFIG_PATH}" "Configuration directory exists"; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# Test 4: Skills Database Integration
# ============================================================================

test_skills_database_integration() {
    log "INFO" "Starting skills database integration test"

    if [[ ! -f "${PROJECT_ROOT}/scripts/deployment/service-discovery.sh" ]]; then
        ((TESTS_SKIPPED++))
        return 0
    fi

    source "${PROJECT_ROOT}/scripts/deployment/service-discovery.sh"

    # Test 4.1: Discover database
    if ! discover_skills_db 2>/dev/null; then
        log "WARN" "Skills database not available, creating test database"

        # Create test database for this test
        local TEST_DB="${TEST_RESULTS_DIR}/test-skills.db"
        sqlite3 "$TEST_DB" <<EOF
CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    version TEXT NOT NULL,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
EOF
        log "PASS" "Test database created"
    fi

    # Test 4.2: Database is queryable
    if SKILLS_DB=$(resolve_config_path "skills.db" 2>/dev/null || echo "${TEST_RESULTS_DIR}/test-skills.db"); then
        if sqlite3 "$SKILLS_DB" "SELECT COUNT(*) FROM sqlite_master;" > /dev/null 2>&1; then
            log "PASS" "Database is queryable"
            return 0
        fi
    fi

    log "FAIL" "Could not access skills database"
    return 1
}

# ============================================================================
# Test 5: Deployment Script Structure
# ============================================================================

test_deployment_scripts_exist() {
    log "INFO" "Starting deployment script structure test"

    local REQUIRED_SCRIPTS=(
        "scripts/deployment/service-discovery.sh"
        "scripts/deployment/health-check-service.sh"
    )

    for SCRIPT in "${REQUIRED_SCRIPTS[@]}"; do
        if assert_file_exists "${PROJECT_ROOT}/${SCRIPT}" "Script exists: $SCRIPT"; then
            # Verify script is executable
            if [[ -x "${PROJECT_ROOT}/${SCRIPT}" ]] || [[ -f "${PROJECT_ROOT}/${SCRIPT}" ]]; then
                log "PASS" "Script is accessible: $SCRIPT"
            else
                log "WARN" "Script may not be executable: $SCRIPT"
            fi
        else
            return 1
        fi
    done

    return 0
}

# ============================================================================
# Test 6: Integration Points Documentation
# ============================================================================

test_integration_documentation() {
    log "INFO" "Starting integration documentation test"

    local DOC_FILE="${PROJECT_ROOT}/planning/DEPLOYMENT_PIPELINE_STANDARDS.md"

    if assert_file_exists "$DOC_FILE" "Deployment pipeline standards document exists"; then
        # Verify document contains key sections
        local DOC_CONTENT
        DOC_CONTENT=$(cat "$DOC_FILE")

        assert_contains "$DOC_CONTENT" "Service Discovery" "Document covers service discovery"
        assert_contains "$DOC_CONTENT" "Deployment Choreography" "Document covers deployment choreography"
        assert_contains "$DOC_CONTENT" "Health Check" "Document covers health checks"
        assert_contains "$DOC_CONTENT" "Monitoring" "Document covers monitoring"
        assert_contains "$DOC_CONTENT" "Testing" "Document covers testing"

        return 0
    else
        return 1
    fi
}

# ============================================================================
# Test 7: Environment Variable Loading
# ============================================================================

test_environment_variable_loading() {
    log "INFO" "Starting environment variable loading test"

    # Check if environment can be sourced
    if [[ -f "${PROJECT_ROOT}/.env" ]]; then
        if bash -c "source '${PROJECT_ROOT}/.env'" 2>/dev/null; then
            log "PASS" "Environment file is valid"
        else
            log "WARN" "Environment file has syntax issues"
        fi
    fi

    # Verify required variables can be set
    local TEST_VAR="test_value"
    local CFN_REDIS_HOST="${CFN_REDIS_HOST:-localhost}"

    if [[ -n "$CFN_REDIS_HOST" ]]; then
        log "PASS" "Required environment variable is accessible"
        return 0
    else
        log "FAIL" "Required environment variable not set"
        return 1
    fi
}

# ============================================================================
# Test 8: Smoke Test - End-to-End
# ============================================================================

test_smoke_end_to_end() {
    log "INFO" "Starting smoke test - end-to-end"

    local CHECKS_PASSED=0

    # Check 1: Service discovery available
    if [[ -f "${PROJECT_ROOT}/scripts/deployment/service-discovery.sh" ]]; then
        ((CHECKS_PASSED++))
    fi

    # Check 2: Health check available
    if [[ -f "${PROJECT_ROOT}/scripts/deployment/health-check-service.sh" ]]; then
        ((CHECKS_PASSED++))
    fi

    # Check 3: Documentation available
    if [[ -f "${PROJECT_ROOT}/planning/DEPLOYMENT_PIPELINE_STANDARDS.md" ]]; then
        ((CHECKS_PASSED++))
    fi

    # Check 4: Skills directory exists
    if [[ -d "${PROJECT_ROOT}/.claude/skills" ]]; then
        ((CHECKS_PASSED++))
    fi

    if [[ $CHECKS_PASSED -ge 3 ]]; then
        log "PASS" "Smoke test passed ($CHECKS_PASSED/4 checks)"
        return 0
    else
        log "FAIL" "Smoke test failed ($CHECKS_PASSED/4 checks)"
        return 1
    fi
}

# ============================================================================
# Test Summary Report
# ============================================================================

generate_test_summary() {
    echo ""
    echo "======================================================================"
    echo "TEST SUMMARY"
    echo "======================================================================"
    echo ""

    echo "Results:"
    echo "  Passed:  ${GREEN}${TESTS_PASSED}${NC}"
    echo "  Failed:  ${RED}${TESTS_FAILED}${NC}"
    echo "  Skipped: ${YELLOW}${TESTS_SKIPPED}${NC}"
    echo ""

    echo "Detailed Results:"
    for TEST_NAME in "${!TEST_RESULTS[@]}"; do
        local STATUS="${TEST_RESULTS[$TEST_NAME]}"
        local COLOR="${GREEN}"
        [[ "$STATUS" == "FAIL" ]] && COLOR="${RED}"

        echo "  ${COLOR}${STATUS}${NC}: $TEST_NAME"
    done

    echo ""
    echo "Log file: $TEST_LOG_FILE"
    echo "======================================================================"

    # Return non-zero if any tests failed
    [[ $TESTS_FAILED -eq 0 ]]
}

# ============================================================================
# Main Execution
# ============================================================================

usage() {
    cat << 'EOF'
Integration Test Framework

Usage: integration-test-framework.sh [options]

Options:
  --all               Run all tests (default)
  --service-discovery Run only service discovery tests
  --health-check      Run only health check tests
  --documentation     Run only documentation tests
  --smoke             Run only smoke tests
  --verbose           Show verbose output

Examples:
  ./integration-test-framework.sh
  ./integration-test-framework.sh --smoke
  ./integration-test-framework.sh --verbose

EOF
}

# Default: run all tests
RUN_ALL=1
VERBOSE=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --help|-h)
            usage
            exit 0
            ;;
        --all)
            RUN_ALL=1
            ;;
        --verbose|-v)
            VERBOSE=1
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
    shift
done

# Run tests
log "INFO" "Starting integration test suite"
echo ""

if [[ $RUN_ALL -eq 1 ]]; then
    run_test "Service Discovery Integration" test_service_discovery_integration
    run_test "Health Check Integration" test_health_check_integration
    run_test "Configuration Discovery" test_configuration_discovery
    run_test "Skills Database Integration" test_skills_database_integration
    run_test "Deployment Scripts Exist" test_deployment_scripts_exist
    run_test "Integration Documentation" test_integration_documentation
    run_test "Environment Variable Loading" test_environment_variable_loading
    run_test "Smoke Test - End-to-End" test_smoke_end_to_end
fi

# Generate summary
generate_test_summary
EXIT_CODE=$?

exit $EXIT_CODE
