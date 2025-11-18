#!/bin/bash
# Test Framework Helpers for Phase 4 Workflow Codification System
# Provides assertion functions, mock utilities, and test reporting

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters (global)
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test failures list (for summary)
declare -a TEST_FAILURES=()

# ============================================================================
# Logging Functions
# ============================================================================

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
    TEST_FAILURES+=("$1")
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# ============================================================================
# Assertion Functions
# ============================================================================

assert_equals() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ "$expected" == "$actual" ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - Expected: '$expected', Got: '$actual'"
        return 1
    fi
}

assert_not_equals() {
    local test_name="$1"
    local not_expected="$2"
    local actual="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ "$not_expected" != "$actual" ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - Should not equal: '$not_expected', but got: '$actual'"
        return 1
    fi
}

assert_exit_code() {
    local test_name="$1"
    local expected_code="$2"
    local command="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    set +e
    eval "$command" &>/dev/null
    local actual_code=$?
    set -e

    if [[ $actual_code -eq $expected_code ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - Expected exit code: $expected_code, Got: $actual_code"
        return 1
    fi
}

assert_contains() {
    local test_name="$1"
    local haystack="$2"
    local needle="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ "$haystack" == *"$needle"* ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - String '$haystack' does not contain '$needle'"
        return 1
    fi
}

assert_not_contains() {
    local test_name="$1"
    local haystack="$2"
    local needle="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ "$haystack" != *"$needle"* ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - String '$haystack' should not contain '$needle'"
        return 1
    fi
}

assert_file_exists() {
    local test_name="$1"
    local file_path="$2"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ -f "$file_path" ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - File does not exist: $file_path"
        return 1
    fi
}

assert_file_not_exists() {
    local test_name="$1"
    local file_path="$2"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ ! -f "$file_path" ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - File should not exist: $file_path"
        return 1
    fi
}

assert_dir_exists() {
    local test_name="$1"
    local dir_path="$2"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ -d "$dir_path" ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - Directory does not exist: $dir_path"
        return 1
    fi
}

assert_greater_than() {
    local test_name="$1"
    local value="$2"
    local threshold="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    if (( $(echo "$value > $threshold" | bc -l) )); then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - Value $value is not greater than $threshold"
        return 1
    fi
}

assert_less_than() {
    local test_name="$1"
    local value="$2"
    local threshold="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    if (( $(echo "$value < $threshold" | bc -l) )); then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - Value $value is not less than $threshold"
        return 1
    fi
}

assert_matches_pattern() {
    local test_name="$1"
    local string="$2"
    local pattern="$3"

    ((TESTS_RUN++))
    log_test "$test_name"

    if [[ "$string" =~ $pattern ]]; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - String '$string' does not match pattern '$pattern'"
        return 1
    fi
}

assert_json_valid() {
    local test_name="$1"
    local json_string="$2"

    ((TESTS_RUN++))
    log_test "$test_name"

    if echo "$json_string" | jq empty &>/dev/null; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name - Invalid JSON: $json_string"
        return 1
    fi
}

# ============================================================================
# Mock and Test Data Utilities
# ============================================================================

# Create temporary test directory
create_test_dir() {
    local test_name="${1:-test}"
    local temp_dir="/tmp/cfn-test-${test_name}-$$-$(date +%s)"
    mkdir -p "$temp_dir"
    echo "$temp_dir"
}

# Cleanup test directory
cleanup_test_dir() {
    local test_dir="$1"
    if [[ -d "$test_dir" && "$test_dir" == /tmp/cfn-test-* ]]; then
        rm -rf "$test_dir"
        log_info "Cleaned up test directory: $test_dir"
    fi
}

# Generate random string
random_string() {
    local length="${1:-16}"
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w "$length" | head -n 1
}

# Generate timestamp
timestamp() {
    date +%s
}

# Generate ISO8601 timestamp
iso_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# ============================================================================
# PostgreSQL Mock Utilities
# ============================================================================

# Check if PostgreSQL is available
postgres_available() {
    if command -v psql &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Create mock PostgreSQL database
create_mock_db() {
    local db_name="${1:-cfn_test_$(random_string 8)}"

    if postgres_available; then
        psql -U postgres -c "CREATE DATABASE $db_name;" &>/dev/null || true
        echo "$db_name"
    else
        log_warn "PostgreSQL not available, using file-based mock"
        echo "mock_${db_name}.json"
    fi
}

# Cleanup mock database
cleanup_mock_db() {
    local db_name="$1"

    if [[ "$db_name" == mock_*.json ]]; then
        rm -f "$db_name"
    elif postgres_available; then
        psql -U postgres -c "DROP DATABASE IF EXISTS $db_name;" &>/dev/null || true
    fi
}

# Execute SQL or mock SQL
execute_sql() {
    local db_name="$1"
    local sql="$2"

    if [[ "$db_name" == mock_*.json ]]; then
        # File-based mock - just log
        log_info "Mock SQL: $sql"
        echo '{"mock": true, "rows": []}'
    else
        psql -U postgres -d "$db_name" -t -A -c "$sql"
    fi
}

# ============================================================================
# Performance Measurement Utilities
# ============================================================================

# Start timer
start_timer() {
    local timer_name="${1:-default}"
    declare -g "TIMER_${timer_name}=$(date +%s%N)"
}

# End timer and return elapsed milliseconds
end_timer() {
    local timer_name="${1:-default}"
    local start_var="TIMER_${timer_name}"
    local start_time="${!start_var}"
    local end_time=$(date +%s%N)
    local elapsed=$(( (end_time - start_time) / 1000000 ))
    echo "$elapsed"
}

# Measure command execution time
measure_time() {
    local command="$1"
    local start_time=$(date +%s%N)
    eval "$command" &>/dev/null
    local end_time=$(date +%s%N)
    local elapsed=$(( (end_time - start_time) / 1000000 ))
    echo "$elapsed"
}

# ============================================================================
# Test Summary and Reporting
# ============================================================================

print_test_summary() {
    local test_suite_name="${1:-Test Suite}"

    echo ""
    log_section "Test Summary: $test_suite_name"
    echo ""
    echo "Total Tests Run:    $TESTS_RUN"
    echo -e "${GREEN}Tests Passed:       $TESTS_PASSED${NC}"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "${RED}Tests Failed:       $TESTS_FAILED${NC}"
        echo ""
        echo -e "${RED}Failed Tests:${NC}"
        for failure in "${TEST_FAILURES[@]}"; do
            echo -e "  ${RED}✗${NC} $failure"
        done
    else
        echo -e "${GREEN}Tests Failed:       $TESTS_FAILED${NC}"
    fi

    local pass_rate=0
    if [[ $TESTS_RUN -gt 0 ]]; then
        pass_rate=$(echo "scale=2; $TESTS_PASSED * 100 / $TESTS_RUN" | bc)
    fi

    echo ""
    echo "Pass Rate:          ${pass_rate}%"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        return 1
    fi
}

# Reset test counters (for running multiple test suites in one script)
reset_test_counters() {
    TESTS_RUN=0
    TESTS_PASSED=0
    TESTS_FAILED=0
    TEST_FAILURES=()
}

# ============================================================================
# Skill Validation Utilities
# ============================================================================

# Validate bash script syntax
validate_bash_syntax() {
    local script_path="$1"

    if ! bash -n "$script_path" 2>/dev/null; then
        return 1
    fi
    return 0
}

# Run shellcheck if available
run_shellcheck() {
    local script_path="$1"

    if command -v shellcheck &> /dev/null; then
        if shellcheck -x "$script_path" &>/dev/null; then
            return 0
        else
            return 1
        fi
    else
        log_warn "shellcheck not available, skipping"
        return 0
    fi
}

# Validate skill package structure
validate_skill_package() {
    local skill_dir="$1"
    local required_files=("SKILL.md" "skill.sh" "README.md" "CHANGELOG.md" "tests/" "examples/")

    for file in "${required_files[@]}"; do
        if [[ ! -e "$skill_dir/$file" ]]; then
            log_error "Missing required file/directory: $file"
            return 1
        fi
    done

    return 0
}

# ============================================================================
# Pattern Detection Mock Data
# ============================================================================

generate_mock_workflow_pattern() {
    local pattern_id="${1:-pattern-$(random_string 8)}"
    local occurrences="${2:-5}"
    local similarity="${3:-0.87}"

    cat <<EOF
{
  "pattern_id": "$pattern_id",
  "name": "Deploy Frontend Build",
  "occurrences": $occurrences,
  "similarity": $similarity,
  "steps": [
    {"action": "npm install", "frequency": 1.0},
    {"action": "npm run build", "frequency": 1.0},
    {"action": "docker build -t frontend .", "frequency": 0.95},
    {"action": "docker push frontend:latest", "frequency": 0.90}
  ],
  "deterministic": true,
  "confidence": 0.92,
  "priority": "high"
}
EOF
}

# ============================================================================
# Approval Workflow Mock Data
# ============================================================================

generate_mock_approval_request() {
    local request_id="${1:-approval-$(random_string 8)}"
    local state="${2:-pending_expert_review}"

    cat <<EOF
{
  "request_id": "$request_id",
  "skill_id": "skill-deploy-frontend",
  "state": "$state",
  "expert": "frontend-lead@example.com",
  "created_at": "$(iso_timestamp)",
  "sla_deadline": "$(date -u -d '+24 hours' +"%Y-%m-%dT%H:%M:%SZ")",
  "priority": "medium"
}
EOF
}

# ============================================================================
# Edge Case Mock Data
# ============================================================================

generate_mock_edge_case() {
    local case_id="${1:-edge-$(random_string 8)}"
    local severity="${2:-medium}"
    local occurrences="${3:-1}"

    cat <<EOF
{
  "case_id": "$case_id",
  "skill_id": "skill-deploy-frontend",
  "error_type": "timeout",
  "error_message": "Docker build timeout after 300s",
  "severity": "$severity",
  "occurrences": $occurrences,
  "first_seen": "$(iso_timestamp)",
  "last_seen": "$(iso_timestamp)",
  "resolved": false
}
EOF
}

# ============================================================================
# Cost Tracking Mock Data
# ============================================================================

generate_mock_cost_data() {
    local skill_id="${1:-skill-$(random_string 8)}"
    local executions="${2:-100}"
    local cost_avoided_per_exec="${3:-2.50}"

    local total_cost_avoided=$(echo "$executions * $cost_avoided_per_exec" | bc)

    cat <<EOF
{
  "skill_id": "$skill_id",
  "executions": $executions,
  "cost_avoided_per_execution": $cost_avoided_per_exec,
  "total_cost_avoided": $total_cost_avoided,
  "monthly_executions": $executions,
  "annual_roi": $(echo "$total_cost_avoided * 12" | bc)
}
EOF
}

# ============================================================================
# Export Functions
# ============================================================================

# Export all functions for sourcing in test scripts
export -f log_test log_pass log_fail log_info log_warn log_error log_section
export -f assert_equals assert_not_equals assert_exit_code assert_contains assert_not_contains
export -f assert_file_exists assert_file_not_exists assert_dir_exists
export -f assert_greater_than assert_less_than assert_matches_pattern assert_json_valid
export -f create_test_dir cleanup_test_dir random_string timestamp iso_timestamp
export -f postgres_available create_mock_db cleanup_mock_db execute_sql
export -f start_timer end_timer measure_time
export -f print_test_summary reset_test_counters
export -f validate_bash_syntax run_shellcheck validate_skill_package
export -f generate_mock_workflow_pattern generate_mock_approval_request
export -f generate_mock_edge_case generate_mock_cost_data

log_info "Test framework helpers loaded successfully"
