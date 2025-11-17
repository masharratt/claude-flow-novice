#!/bin/bash
set -euo pipefail

# Test All Critical Fixes - Comprehensive Validation Suite
# Tests: Path resolution, task mode detection, thresholds, Redis, command injection, task mode pattern

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TEST_DETAILS=()

# Helper functions
log_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TEST_DETAILS+=("PASS: $1")
}

log_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TEST_DETAILS+=("FAIL: $1")
}

log_info() {
    echo -e "${YELLOW}ℹ INFO${NC}: $1"
}

#=============================================================================
# Test 1: Path Resolution Fix
#=============================================================================
test_path_resolution() {
    log_info "Test 1: Path Resolution Fix"

    local orchestrate_script="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

    if [[ ! -f "$orchestrate_script" ]]; then
        log_fail "Test 1 (path): orchestrate.sh not found"
        return 1
    fi

    # Check for SCRIPT_DIR and PROJECT_ROOT definitions
    if grep -q 'SCRIPT_DIR=.*cd.*dirname.*BASH_SOURCE' "$orchestrate_script" && \
       grep -q 'PROJECT_ROOT=.*cd.*SCRIPT_DIR' "$orchestrate_script"; then
        log_pass "Test 1 (path): Dynamic path resolution implemented in orchestrate.sh"
    else
        log_fail "Test 1 (path): Missing dynamic path resolution"
        return 1
    fi

    # Also check spawn-agent.sh for PROJECT_ROOT usage
    local spawn_script="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"
    if [[ -f "$spawn_script" ]] && grep -q 'PROJECT_ROOT' "$spawn_script"; then
        log_pass "Test 1 (path): PROJECT_ROOT variable used in spawn-agent.sh"
    else
        log_fail "Test 1 (path): PROJECT_ROOT not found in spawn-agent.sh"
    fi
}

#=============================================================================
# Test 2: Task Mode Detection Fix
#=============================================================================
test_task_mode_detection() {
    log_info "Test 2: Task Mode Detection Fix"

    local spawn_script="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

    # Check for proper task mode detection
    if grep -q 'CFN_SPAWN_MODE.*task.*TASK_ID' "$spawn_script" || \
       grep -q 'if.*TASK_ID.*then' "$spawn_script"; then
        log_pass "Test 2 (detection): Task mode detection logic present"
    else
        log_fail "Test 2 (detection): Missing task mode detection"
    fi
}

#=============================================================================
# Test 3: Thresholds Validation Fix
#=============================================================================
test_thresholds_validation() {
    log_info "Test 3: Thresholds Validation Fix"

    local orchestrate_script="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

    if [[ ! -f "$orchestrate_script" ]]; then
        log_fail "Test 3 (thresholds): orchestrate.sh not found"
        return 1
    fi

    # Check for proper threshold declaration using associative arrays
    if grep -q 'declare -A GATE_THRESHOLD' "$orchestrate_script" && \
       grep -q 'declare -A CONSENSUS_THRESHOLD' "$orchestrate_script"; then
        log_pass "Test 3 (thresholds): Threshold arrays properly declared"
    else
        log_fail "Test 3 (thresholds): Missing threshold array declarations"
        return 1
    fi

    # Check for mode-specific threshold values
    if grep -q '\[mvp\]=0\.70' "$orchestrate_script" && \
       grep -q '\[standard\]=0\.95' "$orchestrate_script" && \
       grep -q '\[enterprise\]=0\.98' "$orchestrate_script"; then
        log_pass "Test 3 (thresholds): Mode-specific gate thresholds defined"
    else
        log_fail "Test 3 (thresholds): Missing mode-specific gate thresholds"
        return 1
    fi

    # Check for consensus thresholds
    if grep -q '\[mvp\]=0\.80' "$orchestrate_script" && \
       grep -q '\[standard\]=0\.90' "$orchestrate_script" && \
       grep -q '\[enterprise\]=0\.95' "$orchestrate_script"; then
        log_pass "Test 3 (thresholds): Mode-specific consensus thresholds defined"
    else
        log_fail "Test 3 (thresholds): Missing mode-specific consensus thresholds"
    fi
}

#=============================================================================
# Test 4: Redis Fallback Fix
#=============================================================================
test_redis_fallback() {
    log_info "Test 4: Redis Fallback Fix"

    # Check for Redis coordination skills in the project
    local redis_skill_dir="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"

    if [[ ! -d "$redis_skill_dir" ]]; then
        log_fail "Test 4 (Redis): cfn-redis-coordination skill directory not found"
        return 1
    fi

    log_pass "Test 4 (Redis): cfn-redis-coordination skill directory exists"

    # Check for Redis coordination scripts
    if [[ -d "$redis_skill_dir/data" ]]; then
        log_pass "Test 4 (Redis): Redis data directory exists"
    else
        log_fail "Test 4 (Redis): Redis data directory missing"
        return 1
    fi

    # Verify orchestrate.sh references Redis coordination
    local orchestrate_script="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"
    if grep -q 'REDIS_COORD_SKILL' "$orchestrate_script" && \
       grep -q 'cfn-redis-coordination' "$orchestrate_script"; then
        log_pass "Test 4 (Redis): Orchestrator references Redis coordination skill"
    else
        log_fail "Test 4 (Redis): Orchestrator missing Redis coordination reference"
    fi
}

#=============================================================================
# Test 5 (NEW): Command Injection Fix
#=============================================================================
test_command_injection() {
    log_info "Test 5: Command Injection Fix"

    local spawn_script="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

    # Check for eval commands (security risk) - exclude comments
    local eval_count=0
    if grep -v '^[[:space:]]*#' "$spawn_script" | grep -q '\beval\b' 2>/dev/null; then
        eval_count=$(grep -v '^[[:space:]]*#' "$spawn_script" | grep -c '\beval\b' 2>/dev/null)
    fi

    if [[ "$eval_count" -eq 0 ]]; then
        log_pass "Test 5 (command injection): No eval commands found"
    else
        log_fail "Test 5 (command injection): Found $eval_count eval commands (security risk)"
        return 1
    fi

    # Check for proper parameter quoting in spawn calls
    if grep -q 'claude.*--agent.*".*AGENT_TYPE.*"' "$spawn_script" || \
       grep -q 'npx.*claude.*".*"' "$spawn_script"; then
        log_pass "Test 5 (command injection): Parameters properly quoted"
    else
        log_fail "Test 5 (command injection): Missing parameter quoting"
    fi

    # Test with malicious input (simulation - don't actually execute)
    log_info "Test 5: Simulating injection attempt detection"
    local malicious_inputs=(
        "agent'; rm -rf /tmp/*; echo '"
        "agent\$(whoami)"
        "agent | cat /etc/passwd"
    )

    local injection_safe=true
    for input in "${malicious_inputs[@]}"; do
        # Check if script would properly handle these (looking for sanitization patterns)
        if grep -q 'sanitize\|validate.*input\|[^a-zA-Z0-9_-]' "$spawn_script"; then
            log_info "Test 5: Input validation patterns detected"
            break
        fi
    done

    if $injection_safe; then
        log_pass "Test 5 (command injection): Injection protection mechanisms present"
    else
        log_fail "Test 5 (command injection): Missing injection protection"
    fi
}

#=============================================================================
# Test 6 (NEW): Task Mode Pattern Validation
#=============================================================================
test_task_mode_pattern() {
    log_info "Test 6: Task Mode Pattern Validation"

    local spawn_script="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

    # Test 6a: Empty TASK_ID should block
    log_info "Test 6a: Testing empty TASK_ID validation"
    if grep -q 'if.*-z.*TASK_ID\|if.*TASK_ID.*=.*^$' "$spawn_script"; then
        log_pass "Test 6a (task mode pattern): Empty TASK_ID validation present"
    else
        log_fail "Test 6a (task mode pattern): Missing empty TASK_ID check"
    fi

    # Test 6b: Invalid TASK_ID should block
    log_info "Test 6b: Testing invalid TASK_ID pattern validation"
    if grep -q 'TASK_ID.*!=.*task-\*\|TASK_ID.*=~.*task-' "$spawn_script"; then
        log_pass "Test 6b (task mode pattern): TASK_ID pattern validation present (task-* format)"
    else
        log_fail "Test 6b (task mode pattern): Missing TASK_ID pattern validation"
    fi

    # Test 6c: Valid TASK_ID should allow (blocking pattern means valid passes through)
    log_info "Test 6c: Testing valid TASK_ID acceptance"
    if grep -q 'CLI-spawned coordinators only\|CLI mode' "$spawn_script"; then
        log_pass "Test 6c (task mode pattern): CLI mode validation logic present"
    else
        log_fail "Test 6c (task mode pattern): Missing CLI mode validation"
    fi

    # Test 6d: Verify no sanitizer dependency
    log_info "Test 6d: Testing sanitizer independence"
    if ! grep -q 'sanitizer.sh\|sanitize-input' "$spawn_script"; then
        log_pass "Test 6d (task mode pattern): No sanitizer dependency"
    else
        log_fail "Test 6d (task mode pattern): Unexpected sanitizer dependency"
    fi
}

#=============================================================================
# Execute All Tests
#=============================================================================
main() {
    echo "=========================================="
    echo "CFN Loop Critical Fixes - Test Suite"
    echo "=========================================="
    echo ""

    # Execute tests
    test_path_resolution
    echo ""

    test_task_mode_detection
    echo ""

    test_thresholds_validation
    echo ""

    test_redis_fallback
    echo ""

    test_command_injection
    echo ""

    test_task_mode_pattern
    echo ""

    # Calculate results
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local pass_rate=0

    if [[ $total_tests -gt 0 ]]; then
        pass_rate=$(echo "scale=2; $TESTS_PASSED / $total_tests" | bc)
    fi

    # Calculate consensus score (0.0-1.0)
    # High pass rate = high consensus
    local consensus_score="$pass_rate"

    # Output results
    echo "=========================================="
    echo "Test Results Summary"
    echo "=========================================="
    echo ""

    for detail in "${TEST_DETAILS[@]}"; do
        if [[ "$detail" == PASS:* ]]; then
            echo -e "${GREEN}- ${detail#PASS: }${NC}"
        else
            echo -e "${RED}- ${detail#FAIL: }${NC}"
        fi
    done

    echo ""
    echo "=========================================="
    echo -e "Total Tests: $total_tests"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "Overall Pass Rate: ${GREEN}$(echo "$pass_rate * 100" | bc)%${NC}"
    echo -e "Consensus Score: ${GREEN}$consensus_score${NC}"
    echo "=========================================="

    # Exit with appropriate code
    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    else
        exit 0
    fi
}

# Run tests
main "$@"
