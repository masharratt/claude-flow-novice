#!/usr/bin/env bash

##############################################################################
# CFN Integration Validation Test
##############################################################################

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="/tmp/cfn-integration-test"
TEST_ID="integration-test-$(date +%s)"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging functions
log_info() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# Test setup
setup_test_env() {
    log_info "Setting up test environment..."
    mkdir -p "$TEST_RESULTS_DIR"
    export CFN_MODE="cli"
    export TASK_ID="$TEST_ID"
    export AGENT_ID="test-agent-$$"
    export LOOP3_AGENTS="backend-developer"
    export LOOP2_AGENTS="reviewer,tester"
    export PRODUCT_OWNER="product-owner"
    export CFN_TELEMETRY_DIR="$TEST_RESULTS_DIR/telemetry"
}

# Test environment sanitization
test_environment_sanitization() {
    log_info "Testing environment sanitization..."
    ((TESTS_TOTAL++))

    export TEST_PASSWORD="secret123"
    export TEST_TOKEN="abc123xyz"

    if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh" ]]; then
        (
            source "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"
            if [[ -z "${TEST_PASSWORD:-}" && -z "${TEST_TOKEN:-}" ]]; then
                echo "PASS" > "$TEST_RESULTS_DIR/test_sanitization"
            else
                echo "FAIL" > "$TEST_RESULTS_DIR/test_sanitization"
            fi
        )

        if grep -q "PASS" "$TEST_RESULTS_DIR/test_sanitization"; then
            log_success "Environment sanitization working correctly"
        else
            log_error "Environment sanitization failed"
            return 1
        fi
    else
        log_error "Environment sanitization script not found"
        return 1
    fi
}

# Test orchestration integration
test_orchestration_integration() {
    log_info "Testing orchestration script integration..."
    ((TESTS_TOTAL++))

    local orchestration_script="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

    if [[ -f "$orchestration_script" ]]; then
        if grep -q "cfn-environment-sanitization" "$orchestration_script" && \
           grep -q "cfn-process-instrumentation" "$orchestration_script" && \
           grep -q "ANTI-023" "$orchestration_script"; then
            log_success "Orchestration script integration complete"
        else
            log_error "Orchestration script integration incomplete"
            return 1
        fi
    else
        log_error "Orchestration script not found"
        return 1
    fi
}

# Test agent spawning integration
test_agent_spawning_integration() {
    log_info "Testing agent spawning integration..."
    ((TESTS_TOTAL++))

    local agent_spawning_script="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

    if [[ -f "$agent_spawning_script" ]]; then
        if grep -q "cfn-environment-sanitization" "$agent_spawning_script" && \
           grep -q "ANTI-023" "$agent_spawning_script"; then
            log_success "Agent spawning integration complete"
        else
            log_error "Agent spawning integration incomplete"
            return 1
        fi
    else
        log_error "Agent spawning script not found"
        return 1
    fi
}

# Test mode detection
test_mode_detection() {
    log_info "Testing mode detection..."
    ((TESTS_TOTAL++))

    (
        export TASK_ID="test-task"
        export AGENT_ID="test-agent"

        if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh" ]]; then
            local detected_mode
            detected_mode=$("$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh")
            if [[ "$detected_mode" == "cli" ]]; then
                echo "PASS" > "$TEST_RESULTS_DIR/test_mode_detection"
            else
                echo "FAIL" > "$TEST_RESULTS_DIR/test_mode_detection"
            fi
        else
            echo "MISSING" > "$TEST_RESULTS_DIR/test_mode_detection"
        fi
    )

    if grep -q "PASS" "$TEST_RESULTS_DIR/test_mode_detection"; then
        log_success "Mode detection working correctly"
    else
        log_error "Mode detection failed"
        return 1
    fi
}

# Test end-to-end integration
test_end_to_end() {
    log_info "Testing end-to-end integration..."
    ((TESTS_TOTAL++))

    (
        export CFN_MODE="cli"
        export TASK_ID="e2e-test"
        export AGENT_ID="e2e-agent"
        export CFN_TELEMETRY_DIR="$TEST_RESULTS_DIR/e2e-telemetry"

        if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh" ]]; then
            source "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh" --strict
            echo "ENV_SANITIZED" > "$TEST_RESULTS_DIR/test_e2e"
        fi

        if [[ -n "${CFN_MAX_AGENTS:-}" && -n "${CFN_TIMEOUT:-}" && -n "${CFN_MEMORY_LIMIT:-}" ]]; then
            echo "LIMITS_ENFORCED" >> "$TEST_RESULTS_DIR/test_e2e"
        fi
    )

    if [[ -f "$TEST_RESULTS_DIR/test_e2e" ]] && \
       grep -q "ENV_SANITIZED" "$TEST_RESULTS_DIR/test_e2e" && \
       grep -q "LIMITS_ENFORCED" "$TEST_RESULTS_DIR/test_e2e"; then
        log_success "End-to-end integration test passed"
    else
        log_error "End-to-end integration test failed"
        return 1
    fi
}

# Generate test report
generate_report() {
    log_info "Generating integration test report..."

    local report_file="$TEST_RESULTS_DIR/integration-report.md"

    cat > "$report_file" << EOF
# CFN Integration Test Report

**Test ID:** $TEST_ID
**Date:** $(date)

## Test Summary

- **Total Tests:** $TESTS_TOTAL
- **Passed:** $TESTS_PASSED
- **Failed:** $TESTS_FAILED
- **Success Rate:** $(( TESTS_TOTAL > 0 ? (TESTS_PASSED * 100) / TESTS_TOTAL : 0 ))%

## Integration Status

EOF

    log_success "Report generated: $report_file"
}

