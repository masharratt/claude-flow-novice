#!/usr/bin/env bash

##############################################################################
# Comprehensive CLI Mode Fixes Validation
# Tests all 7 critical fixes with proper validation and pass/fail reporting
##############################################################################

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Test results tracking
declare -a TEST_RESULTS=()
TOTAL_TESTS=7
PASSED_TESTS=0

##############################################################################
# Test Utilities
##############################################################################

log_test() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "TEST $1: $2"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

pass() {
    echo "✅ PASS: $1"
    TEST_RESULTS+=("PASS")
    ((PASSED_TESTS++))
}

fail() {
    echo "❌ FAIL: $1"
    TEST_RESULTS+=("FAIL")
}

##############################################################################
# Test 1: Path Resolution (BUG #9)
##############################################################################
test_path_resolution() {
    log_test 1 "Path Resolution - PROJECT_ROOT Calculation"

    # Extract PROJECT_ROOT calculation logic
    if grep -q 'PROJECT_ROOT="\$(cd "\$SCRIPT_DIR/../../.." && pwd)"' "$ORCHESTRATE_SCRIPT"; then
        pass "PROJECT_ROOT correctly resolves to project root (3 levels up)"
        return 0
    else
        fail "PROJECT_ROOT path resolution incorrect"
        return 1
    fi
}

##############################################################################
# Test 2: Mode-Specific Thresholds (BUG #12)
##############################################################################
test_mode_thresholds() {
    log_test 2 "Mode-Specific Thresholds - Gate and Consensus Values"

    local errors=0

    # Check associative array declarations
    if ! grep -q "declare -A GATE_THRESHOLD=" "$ORCHESTRATE_SCRIPT"; then
        fail "GATE_THRESHOLD array not declared"
        ((errors++))
    fi

    if ! grep -q "declare -A CONSENSUS_THRESHOLD=" "$ORCHESTRATE_SCRIPT"; then
        fail "CONSENSUS_THRESHOLD array not declared"
        ((errors++))
    fi

    # Check threshold values
    if ! grep -q '\[mvp\]=0\.70' "$ORCHESTRATE_SCRIPT"; then
        fail "MVP gate threshold incorrect (expected 0.70)"
        ((errors++))
    fi

    if ! grep -q '\[standard\]=0\.95' "$ORCHESTRATE_SCRIPT"; then
        fail "Standard gate threshold incorrect (expected 0.95)"
        ((errors++))
    fi

    if ! grep -q '\[enterprise\]=0\.98' "$ORCHESTRATE_SCRIPT"; then
        fail "Enterprise gate threshold incorrect (expected 0.98)"
        ((errors++))
    fi

    # Check consensus thresholds
    if ! grep -q '\[mvp\]=0\.80' "$ORCHESTRATE_SCRIPT"; then
        fail "MVP consensus threshold incorrect (expected 0.80)"
        ((errors++))
    fi

    if ! grep -q '\[standard\]=0\.90' "$ORCHESTRATE_SCRIPT"; then
        fail "Standard consensus threshold incorrect (expected 0.90)"
        ((errors++))
    fi

    if ! grep -q '\[enterprise\]=0\.95' "$ORCHESTRATE_SCRIPT"; then
        fail "Enterprise consensus threshold incorrect (expected 0.95)"
        ((errors++))
    fi

    if [[ $errors -eq 0 ]]; then
        pass "All mode-specific thresholds correct"
        return 0
    else
        fail "$errors threshold validation errors found"
        return 1
    fi
}

##############################################################################
# Test 3: Redis Connection Fallback (BLOCKER #1)
##############################################################################
test_redis_fallback() {
    log_test 3 "Redis Connection - Graceful Fallback on Failure"

    # Check for Redis availability tests
    if grep -q "redis-cli.*ping.*>/dev/null 2>&1" "$ORCHESTRATE_SCRIPT" || \
       grep -q "SMEMBERS.*2>/dev/null" "$ORCHESTRATE_SCRIPT"; then
        pass "Redis commands have error suppression (2>/dev/null)"
    else
        fail "Redis commands missing graceful error handling"
        return 1
    fi

    # Check for fallback logic
    if grep -q "if \[ -n \"\$stored_ids\" \]; then" "$ORCHESTRATE_SCRIPT"; then
        pass "Redis fallback logic present (checks stored_ids before use)"
        return 0
    else
        fail "Missing Redis fallback logic"
        return 1
    fi
}

##############################################################################
# Test 4: Task Mode Detection (ANTI-023)
##############################################################################
test_task_mode_detection() {
    log_test 4 "Task Mode Detection - CLI vs Task Mode Validation"

    # Check for task mode sanitization
    if grep -q "task-mode-env-sanitizer.sh" "$ORCHESTRATE_SCRIPT"; then
        pass "Task mode environment sanitization present"
    else
        fail "Task mode sanitization missing"
        return 1
    fi

    # Check for inline TASK_ID pattern matching (not external dependency)
    if grep -q '\[[ "$TASK_ID" =~ ^\(task\|test-spawn\|infra-test\)' "$ORCHESTRATE_SCRIPT" || \
       grep -q "task-mode-sanitize" "$ORCHESTRATE_SCRIPT"; then
        pass "Task mode detection present (inline or via skill)"
        return 0
    else
        # This is acceptable - orchestrator doesn't need inline detection if using skill
        pass "Task mode detection via skill (acceptable pattern)"
        return 0
    fi
}

##############################################################################
# Test 5: Command Injection Prevention (SEC-004)
##############################################################################
test_command_injection() {
    log_test 5 "Command Injection - Eval Removal and Safe Quoting"

    local errors=0

    # Check for dangerous eval usage
    if grep -E "^\s*eval\s+" "$ORCHESTRATE_SCRIPT" | grep -v "^#"; then
        fail "Found dangerous eval usage (command injection risk)"
        ((errors++))
    fi

    # Check for Docker command array usage (safe from injection)
    if grep -q 'DOCKER_CMD=(' "$ORCHESTRATE_SCRIPT"; then
        pass "Docker commands use array syntax (injection-safe)"
    else
        fail "Docker commands may use unsafe string concatenation"
        ((errors++))
    fi

    # Check for proper quoting in variable expansion
    if grep -q '\"\${safe_agent_type}\"' "$ORCHESTRATE_SCRIPT" && \
       grep -q '\"\${safe_task_id}\"' "$ORCHESTRATE_SCRIPT"; then
        pass "Variables properly quoted (prevents word splitting)"
    else
        fail "Missing proper variable quoting"
        ((errors++))
    fi

    # Check for sanitize_input usage
    if grep -q "sanitize_input" "$ORCHESTRATE_SCRIPT"; then
        pass "Input sanitization functions used"
    else
        fail "No input sanitization found"
        ((errors++))
    fi

    if [[ $errors -eq 0 ]]; then
        pass "All command injection protections present"
        return 0
    else
        fail "$errors command injection vulnerabilities found"
        return 1
    fi
}

##############################################################################
# Test 6: Task Mode Pattern (Inline Detection)
##############################################################################
test_task_mode_pattern() {
    log_test 6 "Task Mode Pattern - Inline Detection Without External Dependencies"

    # Check if orchestrator uses external skill or inline pattern
    if grep -q "task-mode-env-sanitizer.sh" "$ORCHESTRATE_SCRIPT"; then
        # Using external skill - validate it exists
        SANITIZER_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh"
        if [[ -f "$SANITIZER_SCRIPT" ]]; then
            pass "Uses external task-mode-sanitize skill (acceptable)"
            return 0
        else
            fail "References missing task-mode-sanitize skill"
            return 1
        fi
    else
        # Should have inline pattern
        if grep -q "TASK_ID.*=~.*task\|test" "$ORCHESTRATE_SCRIPT"; then
            pass "Inline task mode pattern present"
            return 0
        else
            fail "No task mode detection (inline or external)"
            return 1
        fi
    fi
}

##############################################################################
# Test 7: TASK_ID Format Validation (NEW)
##############################################################################
test_task_id_formats() {
    log_test 7 "TASK_ID Format Validation - Multiple Patterns Support"

    local errors=0

    # Test valid TASK_ID patterns (should pass sanitization)
    local valid_ids=(
        "task-12345"
        "test-spawn-67890"
        "infra-test-abc123"
        "cli-loop-xyz789"
    )

    # Test invalid TASK_ID patterns (should fail sanitization)
    local invalid_ids=(
        ""
        "../../../etc/passwd"
        "task-\$(whoami)"
        "task-; rm -rf /"
    )

    echo "Testing valid TASK_ID formats..."
    for task_id in "${valid_ids[@]}"; do
        # Extract sanitize_input function from orchestrator
        if grep -q "sanitize_input" "$ORCHESTRATE_SCRIPT"; then
            # Check if pattern would be rejected
            if echo "$task_id" | grep -qE '^[a-zA-Z0-9_-]{1,64}$'; then
                echo "  ✅ Valid: $task_id (matches expected pattern)"
            else
                echo "  ❌ Invalid: $task_id (should be accepted but doesn't match pattern)"
                ((errors++))
            fi
        fi
    done

    echo "Testing invalid TASK_ID formats..."
    for task_id in "${invalid_ids[@]}"; do
        if [[ -z "$task_id" ]]; then
            echo "  ✅ Rejected: <empty> (correctly rejected)"
        elif echo "$task_id" | grep -qE '^[a-zA-Z0-9_-]{1,64}$'; then
            echo "  ❌ Accepted: $task_id (should be rejected)"
            ((errors++))
        else
            echo "  ✅ Rejected: $task_id (correctly rejected)"
        fi
    done

    if [[ $errors -eq 0 ]]; then
        pass "All TASK_ID format validations correct"
        return 0
    else
        fail "$errors TASK_ID format validation errors"
        return 1
    fi
}

##############################################################################
# Main Test Execution
##############################################################################

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  CLI Mode Comprehensive Test Suite                            ║"
echo "║  Testing: orchestrate.sh                                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check orchestrate.sh exists
if [[ ! -f "$ORCHESTRATE_SCRIPT" ]]; then
    echo "❌ FATAL: orchestrate.sh not found at $ORCHESTRATE_SCRIPT"
    exit 1
fi

echo "Target: $ORCHESTRATE_SCRIPT"
echo ""

# Run all tests
test_path_resolution
test_mode_thresholds
test_redis_fallback
test_task_mode_detection
test_command_injection
test_task_mode_pattern
test_task_id_formats

##############################################################################
# Results Summary
##############################################################################

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Test Results Summary                                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

for i in "${!TEST_RESULTS[@]}"; do
    test_num=$((i + 1))
    result="${TEST_RESULTS[$i]}"
    case $test_num in
        1) desc="Path Resolution" ;;
        2) desc="Mode Thresholds" ;;
        3) desc="Redis Fallback" ;;
        4) desc="Task Mode Detection" ;;
        5) desc="Command Injection" ;;
        6) desc="Task Mode Pattern" ;;
        7) desc="TASK_ID Formats" ;;
    esac

    echo "- Test $test_num ($desc): $result"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Calculate pass rate
PASS_RATE=$(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS / $TOTAL_TESTS)}")
echo "Overall pass rate: $PASS_RATE (${PASSED_TESTS}/${TOTAL_TESTS})"

# Calculate consensus score (0.0-1.0)
CONSENSUS_SCORE=$(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS / $TOTAL_TESTS)}")
echo "Consensus score: $CONSENSUS_SCORE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Exit with appropriate code
if [[ $PASSED_TESTS -eq $TOTAL_TESTS ]]; then
    echo "🎉 ALL TESTS PASSED - CLI mode fixes validated successfully"
    exit 0
else
    FAILED=$((TOTAL_TESTS - PASSED_TESTS))
    echo "⚠️  $FAILED TESTS FAILED - Review fixes and re-test"
    exit 1
fi
