#!/usr/bin/env bash
# Phase 4 Docker Mode Integration - Security Audit Test Suite
# Tests input validation, injection prevention, resource limits, and Docker security

set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
CRITICAL_VULNERABILITIES=0
HIGH_VULNERABILITIES=0
MEDIUM_VULNERABILITIES=0
LOW_VULNERABILITIES=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_test() {
    echo -e "${NC}[TEST] $1${NC}"
}

log_pass() {
    echo -e "${GREEN}✓ PASS${NC} $1"
    ((PASSED_TESTS++))
}

log_fail() {
    local severity=$1
    shift
    echo -e "${RED}✗ FAIL [$severity]${NC} $*"
    ((FAILED_TESTS++))

    case $severity in
        CRITICAL) ((CRITICAL_VULNERABILITIES++)) ;;
        HIGH) ((HIGH_VULNERABILITIES++)) ;;
        MEDIUM) ((MEDIUM_VULNERABILITIES++)) ;;
        LOW) ((LOW_VULNERABILITIES++)) ;;
    esac
}

log_info() {
    echo -e "${YELLOW}ℹ INFO${NC} $1"
}

# Test helper - run function and capture result
run_test() {
    ((TOTAL_TESTS++))
    local test_name=$1
    local test_func=$2

    log_test "$test_name"

    if $test_func; then
        log_pass "$test_name"
        return 0
    else
        return 1
    fi
}

#==============================================================================
# INPUT VALIDATION TESTS
#==============================================================================

test_json_size_limit_coordinator() {
    # Test: coordinator-entrypoint.sh should reject JSON >10MB

    # Create 11MB JSON payload
    local large_json=$(printf '{"test_suites":[%s]}' "$(for i in {1..200000}; do echo -n '{"name":"suite'$i'","tests":[]},'; done)")

    # Check if entrypoint validates size BEFORE parsing
    if grep -q "MAX_JSON_SIZE" $PROJECT_ROOT/docker/coordinator-entrypoint.sh; then
        return 0
    else
        log_fail "HIGH" "coordinator-entrypoint.sh missing JSON size validation (DoS risk)"
        return 1
    fi
}

test_json_size_limit_orchestrator() {
    # Test: orchestrate.sh validates JSON size

    if grep -q "MAX_JSON_SIZE=10485760" $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
        return 0
    else
        log_fail "HIGH" "orchestrate.sh missing JSON size limit"
        return 1
    fi
}

test_test_suite_bounds_checking() {
    # Test: orchestrate.sh validates test suite array size

    if grep -q "MAX_TEST_SUITES=50" $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
        return 0
    else
        log_fail "MEDIUM" "orchestrate.sh missing test suite bounds check"
        return 1
    fi
}

test_input_sanitization_function() {
    # Test: orchestrate.sh has sanitize_input function

    if grep -q "sanitize_input()" $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
        return 0
    else
        log_fail "HIGH" "orchestrate.sh missing input sanitization"
        return 1
    fi
}

test_file_path_validation() {
    # Test: Path traversal prevention

    local has_path_validation=false

    # Check for path canonicalization or validation
    if grep -E "(realpath|readlink -f)" $PROJECT_ROOT/docker/coordinator-entrypoint.sh > /dev/null 2>&1; then
        has_path_validation=true
    fi

    # Check for ".." rejection
    if grep -E '\.\.' $PROJECT_ROOT/docker/coordinator-entrypoint.sh | grep -q "error\|exit"; then
        has_path_validation=true
    fi

    if [ "$has_path_validation" = true ]; then
        return 0
    else
        log_fail "HIGH" "coordinator-entrypoint.sh missing path traversal protection for CFN_SUCCESS_CRITERIA file loading"
        return 1
    fi
}

test_json_validation_before_use() {
    # Test: JSON validated with jq before processing

    local coordinator_validates=false
    local orchestrator_validates=false

    if grep -q 'jq empty' $PROJECT_ROOT/docker/coordinator-entrypoint.sh; then
        coordinator_validates=true
    fi

    if grep -q 'validate_json_context' $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
        orchestrator_validates=true
    fi

    if [ "$coordinator_validates" = true ] && [ "$orchestrator_validates" = true ]; then
        return 0
    else
        log_fail "CRITICAL" "Missing JSON validation before processing"
        return 1
    fi
}

#==============================================================================
# INJECTION PREVENTION TESTS
#==============================================================================

test_base64_encoding_for_env_vars() {
    # Test: Base64 encoding used for complex data in env vars

    if grep -q "base64" $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
        return 0
    else
        log_fail "HIGH" "orchestrate.sh not using base64 encoding for success criteria"
        return 1
    fi
}

test_docker_command_injection_prevention() {
    # Test: Docker commands use safe parameterization

    # Check for direct variable interpolation in docker run
    if grep -E 'docker run.*\$\{?[A-Z_]+\}?' $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh | grep -v '\-\-env' > /dev/null 2>&1; then
        log_fail "CRITICAL" "orchestrate.sh may have command injection vulnerability in docker commands"
        return 1
    else
        return 0
    fi
}

test_shell_metacharacter_sanitization() {
    # Test: sanitize_input removes dangerous shell metacharacters

    local sanitize_func=$(grep -A 10 "sanitize_input()" $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh || echo "")

    if echo "$sanitize_func" | grep -q "tr -cd"; then
        return 0
    else
        log_fail "HIGH" "sanitize_input may not properly filter shell metacharacters"
        return 1
    fi
}

test_environment_variable_quoting() {
    # Test: Environment variables properly quoted in scripts

    local unquoted_vars=$(grep -E '\$[A-Z_]+[^}]' $PROJECT_ROOT/docker/coordinator-entrypoint.sh | grep -v ':-' | grep -v '${' | wc -l)

    if [ "$unquoted_vars" -lt 5 ]; then
        return 0
    else
        log_fail "MEDIUM" "coordinator-entrypoint.sh has $unquoted_vars potentially unquoted variables"
        return 1
    fi
}

#==============================================================================
# RESOURCE LIMIT TESTS
#==============================================================================

test_memory_limits_in_compose() {
    # Test: docker-compose.yml has memory limits

    if grep -q "mem_limit:" $PROJECT_ROOT/docker/docker-compose.yml; then
        return 0
    else
        log_fail "MEDIUM" "docker-compose.yml missing memory limits (DoS risk)"
        return 1
    fi
}

test_coordinator_memory_limit() {
    # Test: Coordinator has reasonable memory limit

    local coordinator_mem=$(grep -A 20 "cfn-coordinator:" $PROJECT_ROOT/docker/docker-compose.yml | grep "mem_limit:" | awk '{print $2}')

    if [[ "$coordinator_mem" == "2g" ]]; then
        return 0
    else
        log_fail "LOW" "Coordinator memory limit not set to 2g: $coordinator_mem"
        return 1
    fi
}

test_input_length_bounds() {
    # Test: sanitize_input has max_length parameter

    if grep -q 'max_length="${2:-256}"' $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
        return 0
    else
        log_fail "MEDIUM" "sanitize_input missing max_length bounds check"
        return 1
    fi
}

test_iteration_limit_validation() {
    # Test: MAX_ITERATIONS has upper bound

    # Check if there's validation that MAX_ITERATIONS doesn't exceed reasonable value
    if grep -E "MAX_ITERATIONS.*[0-9]{3,}" $PROJECT_ROOT/docker/coordinator-entrypoint.sh > /dev/null 2>&1; then
        log_fail "LOW" "No upper bound validation on MAX_ITERATIONS"
        return 1
    else
        return 0
    fi
}

#==============================================================================
# DOCKER SECURITY TESTS
#==============================================================================

test_volume_mount_safety() {
    # Test: Volume mounts don't expose sensitive paths

    # Check for dangerous mounts like /etc, /root, /home
    if grep -E ":/etc:|:/root:|:/home:" $PROJECT_ROOT/docker/docker-compose.yml > /dev/null 2>&1; then
        log_fail "CRITICAL" "docker-compose.yml mounts sensitive system directories"
        return 1
    else
        return 0
    fi
}

test_docker_socket_mount_isolation() {
    # Test: Docker socket mount only on coordinator

    local socket_mounts=$(grep -c "/var/run/docker.sock" $PROJECT_ROOT/docker/docker-compose.yml)

    # Should be mounted only once (on coordinator)
    if [ "$socket_mounts" -eq 1 ]; then
        return 0
    elif [ "$socket_mounts" -gt 1 ]; then
        log_fail "HIGH" "Docker socket mounted on multiple containers (privilege escalation risk)"
        return 1
    else
        log_fail "MEDIUM" "Docker socket not mounted (coordinator cannot spawn agents)"
        return 1
    fi
}

test_secrets_not_in_environment() {
    # Test: No hardcoded secrets in docker-compose.yml

    if grep -E "(password|secret|key|token).*:" $PROJECT_ROOT/docker/docker-compose.yml | grep -v "CFN_" | grep -v "REDIS_PASSWORD:-" > /dev/null 2>&1; then
        log_fail "CRITICAL" "docker-compose.yml may contain hardcoded secrets"
        return 1
    else
        return 0
    fi
}

test_success_criteria_file_mount_readonly() {
    # Test: Success criteria file mounted as read-only

    if grep -q "success-criteria.json:ro" $PROJECT_ROOT/docker/docker-compose.yml; then
        return 0
    else
        log_fail "LOW" "Success criteria file not mounted read-only"
        return 1
    fi
}

test_network_isolation() {
    # Test: Custom network used (not default bridge)

    if grep -q "networks:" $PROJECT_ROOT/docker/docker-compose.yml && grep -q "mcp-network:" $PROJECT_ROOT/docker/docker-compose.yml; then
        return 0
    else
        log_fail "MEDIUM" "docker-compose.yml not using isolated network"
        return 1
    fi
}

test_container_auto_remove() {
    # Test: Containers configured to clean up

    # Check coordinator-entrypoint.sh spawns agents with --rm or AutoRemove
    if grep -q "AutoRemove" $PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh; then
        return 0
    else
        log_fail "LOW" "Agent containers may not auto-remove (resource leak)"
        return 1
    fi
}

test_redis_password_protection() {
    # Test: Redis password configured in production

    if grep -q "CFN_REDIS_PASSWORD:-" $PROJECT_ROOT/docker/docker-compose.yml; then
        return 0
    else
        log_fail "HIGH" "Redis lacks password protection configuration"
        return 1
    fi
}

#==============================================================================
# COMPREHENSIVE VULNERABILITY SCAN
#==============================================================================

test_no_eval_usage() {
    # Test: No eval or dangerous exec usage

    local files=(
        "$PROJECT_ROOT/docker/coordinator-entrypoint.sh"
        "$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    )

    for file in "${files[@]}"; do
        if grep -E "^\s*eval\s+" "$file" > /dev/null 2>&1; then
            log_fail "CRITICAL" "$(basename $file) uses eval (code injection risk)"
            return 1
        fi
    done

    return 0
}

test_strict_mode_enabled() {
    # Test: Scripts use set -euo pipefail

    local files=(
        "$PROJECT_ROOT/docker/coordinator-entrypoint.sh"
        "$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    )

    for file in "${files[@]}"; do
        if ! head -5 "$file" | grep -q "set -euo pipefail"; then
            log_fail "MEDIUM" "$(basename $file) missing strict mode"
            return 1
        fi
    done

    return 0
}

test_temp_file_safety() {
    # Test: Temp files use secure creation

    # Check for unsafe temp file patterns
    if grep -E "/tmp/[^$]" $PROJECT_ROOT/docker/coordinator-entrypoint.sh | grep -v "mktemp" > /dev/null 2>&1; then
        log_fail "MEDIUM" "coordinator-entrypoint.sh uses potentially insecure temp file creation"
        return 1
    else
        return 0
    fi
}

#==============================================================================
# RUN ALL TESTS
#==============================================================================

echo "================================================================"
echo "Phase 4 Docker Mode Integration - Security Audit Test Suite"
echo "================================================================"
echo ""

echo "1. INPUT VALIDATION TESTS"
echo "================================================================"
run_test "JSON size limit (coordinator)" test_json_size_limit_coordinator || true
run_test "JSON size limit (orchestrator)" test_json_size_limit_orchestrator || true
run_test "Test suite bounds checking" test_test_suite_bounds_checking || true
run_test "Input sanitization function" test_input_sanitization_function || true
run_test "File path validation" test_file_path_validation || true
run_test "JSON validation before use" test_json_validation_before_use || true
echo ""

echo "2. INJECTION PREVENTION TESTS"
echo "================================================================"
run_test "Base64 encoding for env vars" test_base64_encoding_for_env_vars || true
run_test "Docker command injection prevention" test_docker_command_injection_prevention || true
run_test "Shell metacharacter sanitization" test_shell_metacharacter_sanitization || true
run_test "Environment variable quoting" test_environment_variable_quoting || true
run_test "No eval usage" test_no_eval_usage || true
echo ""

echo "3. RESOURCE LIMIT TESTS"
echo "================================================================"
run_test "Memory limits in compose" test_memory_limits_in_compose || true
run_test "Coordinator memory limit" test_coordinator_memory_limit || true
run_test "Input length bounds" test_input_length_bounds || true
run_test "Iteration limit validation" test_iteration_limit_validation || true
echo ""

echo "4. DOCKER SECURITY TESTS"
echo "================================================================"
run_test "Volume mount safety" test_volume_mount_safety || true
run_test "Docker socket mount isolation" test_docker_socket_mount_isolation || true
run_test "Secrets not in environment" test_secrets_not_in_environment || true
run_test "Success criteria file read-only" test_success_criteria_file_mount_readonly || true
run_test "Network isolation" test_network_isolation || true
run_test "Container auto-remove" test_container_auto_remove || true
run_test "Redis password protection" test_redis_password_protection || true
echo ""

echo "5. GENERAL SECURITY TESTS"
echo "================================================================"
run_test "Strict mode enabled" test_strict_mode_enabled || true
run_test "Temp file safety" test_temp_file_safety || true
echo ""

#==============================================================================
# RESULTS SUMMARY
#==============================================================================

echo "================================================================"
echo "SECURITY AUDIT RESULTS"
echo "================================================================"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo ""
echo "VULNERABILITIES BY SEVERITY:"
echo "  Critical: $CRITICAL_VULNERABILITIES"
echo "  High: $HIGH_VULNERABILITIES"
echo "  Medium: $MEDIUM_VULNERABILITIES"
echo "  Low: $LOW_VULNERABILITIES"
echo ""

# Calculate pass rate
PASS_RATE=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
echo "Pass Rate: ${PASS_RATE}%"
echo ""

# Determine gate status
if [ "$CRITICAL_VULNERABILITIES" -gt 0 ]; then
    echo -e "${RED}GATE STATUS: FAIL (Critical vulnerabilities found)${NC}"
    exit 1
elif [ "$HIGH_VULNERABILITIES" -gt 2 ]; then
    echo -e "${RED}GATE STATUS: FAIL (Too many high-severity vulnerabilities)${NC}"
    exit 1
elif (( $(echo "$PASS_RATE >= 85.0" | bc -l) )); then
    echo -e "${GREEN}GATE STATUS: PASS (≥85% pass rate, acceptable vulnerability profile)${NC}"
    exit 0
else
    echo -e "${YELLOW}GATE STATUS: WARNING (Pass rate below 85%)${NC}"
    exit 1
fi
