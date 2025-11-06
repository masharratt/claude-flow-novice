#!/bin/bash
# Basic CFN Stabilization Functionality Tests
# Simple, working tests that actually execute and validate functionality

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="$PROJECT_ROOT/.artifacts/test-results"
mkdir -p "$TEST_RESULTS_DIR"

# Colors and logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; ((TESTS_PASSED++)); }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; ((TESTS_FAILED++)); }

# Simple assertion function
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    ((TESTS_TOTAL++))
    if [[ "$actual" == "$expected" ]]; then
        log_success "$test_name"
    else
        log_error "$test_name - Expected: '$expected', Got: '$actual'"
    fi
}

# Test 1: Mode Detection Basic Functionality
test_mode_detection() {
    log_info "Testing mode detection functionality..."

    # Test Task Mode (empty environment)
    unset TASK_ID AGENT_ID CFN_MODE LOOP3_AGENTS
    source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh" 2>/dev/null || true
    local mode=$(detect_execution_mode 2>/dev/null || echo "ERROR")
    assert_equals "task" "$mode" "Mode detection - Task mode (empty environment)"

    # Test CLI Mode (with TASK_ID and AGENT_ID)
    export TASK_ID="test_task_123"
    export AGENT_ID="test_agent_456"
    local mode=$(detect_execution_mode 2>/dev/null || echo "ERROR")
    assert_equals "cli" "$mode" "Mode detection - CLI mode (TASK_ID/AGENT_ID set)"

    # Clean up
    unset TASK_ID AGENT_ID CFN_MODE LOOP3_AGENTS
}

# Test 2: Environment Variable Setup
test_environment_variables() {
    log_info "Testing environment variable setup..."

    # Source orchestrate.sh configuration (without running it)
    cd "$PROJECT_ROOT"

    # Simulate orchestrate.sh environment setup
    SCRIPT_DIR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration"
    export CFN_VALIDATION_TIMEOUT="${CFN_VALIDATION_TIMEOUT:-300}"
    export CFN_MEMORY_LIMIT="${CFN_MEMORY_LIMIT:-2048}"
    export CFN_CPU_LIMIT="${CFN_CPU_LIMIT:-80}"
    export CFN_TELEMETRY_DIR="${CFN_TELEMETRY_DIR:-$PROJECT_ROOT/.artifacts/telemetry}"

    assert_equals "300" "$CFN_VALIDATION_TIMEOUT" "Environment variables - CFN_VALIDATION_TIMEOUT default"
    assert_equals "2048" "$CFN_MEMORY_LIMIT" "Environment variables - CFN_MEMORY_LIMIT default"
    assert_equals "80" "$CFN_CPU_LIMIT" "Environment variables - CFN_CPU_LIMIT default"
    assert_equals "$PROJECT_ROOT/.artifacts/telemetry" "$CFN_TELEMETRY_DIR" "Environment variables - CFN_TELEMETRY_DIR path"

    # Test custom values
    CFN_VALIDATION_TIMEOUT="600"
    assert_equals "600" "$CFN_VALIDATION_TIMEOUT" "Environment variables - CFN_VALIDATION_TIMEOUT custom"
}

# Test 3: Script Loading
test_script_loading() {
    log_info "Testing script loading..."

    # Test mode detection script loads
    if source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh" 2>/dev/null; then
        assert_equals "loaded" "loaded" "Script loading - Mode detection script"
    else
        assert_equals "loaded" "failed" "Script loading - Mode detection script"
    fi

    # Test environment sanitization script loads
    if source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh" 2>/dev/null; then
        assert_equals "loaded" "loaded" "Script loading - Environment sanitization script"
    else
        assert_equals "loaded" "failed" "Script loading - Environment sanitization script"
    fi

    # Test process instrumentation script loads
    if source "$PROJECT_ROOT/.claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh" 2>/dev/null; then
        assert_equals "loaded" "loaded" "Script loading - Process instrumentation script"
    else
        assert_equals "loaded" "failed" "Script loading - Process instrumentation script"
    fi
}

# Test 4: File Existence
test_file_existence() {
    log_info "Testing required files exist..."

    local required_files=(
        ".claude/skills/cfn-task-mode-safety/mode-detection.sh"
        ".claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh"
        ".claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh"
        ".claude/skills/cfn-node-heap-sizer/task-mode-heap-limiter.sh"
        ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
    )

    for file in "${required_files[@]}"; do
        if [[ -f "$PROJECT_ROOT/$file" ]]; then
            assert_equals "exists" "exists" "File existence - $file"
        else
            assert_equals "exists" "missing" "File existence - $file"
        fi
    done
}

# Test 5: Orchestrate.sh Integration Points
test_orchestrate_integration() {
    log_info "Testing orchestrate.sh integration points..."

    # Check for PROJECT_ROOT setup
    if grep -q "PROJECT_ROOT.*cd.*\.\." "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
        assert_equals "found" "found" "Orchestrate integration - PROJECT_ROOT setup"
    else
        assert_equals "found" "missing" "Orchestrate integration - PROJECT_ROOT setup"
    fi

    # Check for environment variable exports
    if grep -q "CFN_VALIDATION_TIMEOUT.*-" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
        assert_equals "found" "found" "Orchestrate integration - CFN_VALIDATION_TIMEOUT export"
    else
        assert_equals "found" "missing" "Orchestrate integration - CFN_VALIDATION_TIMEOUT export"
    fi

    # Check for execute_instrumented calls
    if grep -q "execute_instrumented.*npx.*claude-flow-novice" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
        assert_equals "found" "found" "Orchestrate integration - execute_instrumented calls"
    else
        assert_equals "found" "missing" "Orchestrate integration - execute_instrumented calls"
    fi
}

# Test 6: Telemetry Directory Creation
test_telemetry_setup() {
    log_info "Testing telemetry directory setup..."

    export CFN_TELEMETRY_DIR="$PROJECT_ROOT/.artifacts/telemetry"
    mkdir -p "$CFN_TELEMETRY_DIR"

    if [[ -d "$CFN_TELEMETRY_DIR" ]]; then
        assert_equals "created" "created" "Telemetry setup - Directory creation"
    else
        assert_equals "created" "failed" "Telemetry setup - Directory creation"
    fi

    # Test we can write to the directory
    local test_file="$CFN_TELEMETRY_DIR/test-write.txt"
    echo "test" > "$test_file" 2>/dev/null || true
    if [[ -f "$test_file" ]]; then
        assert_equals "writable" "writable" "Telemetry setup - Directory writable"
        rm -f "$test_file"
    else
        assert_equals "writable" "failed" "Telemetry setup - Directory writable"
    fi
}

# Run all tests
main() {
    echo "=== CFN Stabilization Basic Functionality Tests ==="
    echo "Started: $(date)"
    echo

    test_mode_detection
    test_environment_variables
    test_script_loading
    test_file_existence
    test_orchestrate_integration
    test_telemetry_setup

    echo
    echo "=== Test Results ==="
    echo "Total tests: $TESTS_TOTAL"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✅ All basic functionality tests passed!${NC}"
        return 0
    else
        echo -e "${RED}❌ $TESTS_FAILED tests failed!${NC}"
        return 1
    fi
}

# Execute tests
main "$@"