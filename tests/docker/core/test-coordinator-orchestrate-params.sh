#!/usr/bin/env bash
# Test: Coordinator → Orchestrate.sh Parameter Handoff Validation
# Purpose: Ensure coordinator-entrypoint.sh passes TASK_ID as positional arg (not --task-id flag)
# Bug: #5 - Parameter format mismatch caused "Unknown option: --task-id" errors

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Test result tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
    echo " [TEST] $1"
}

log_pass() {
    echo "   ✅ PASS: $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo "   ❌ FAIL: $1"
    ((TESTS_FAILED++))
}

# Test 1: Verify entrypoint script exists
test_entrypoint_exists() {
    ((TESTS_RUN++))
    log_test "Entrypoint script exists"

    if [[ -f "$PROJECT_ROOT/docker/coordinator-entrypoint.sh" ]]; then
        log_pass "Entrypoint script found"
        return 0
    else
        log_fail "Entrypoint script not found at docker/coordinator-entrypoint.sh"
        return 1
    fi
}

# Test 2: Verify orchestrate.sh call uses positional TASK_ID
test_positional_task_id() {
    ((TESTS_RUN++))
    log_test "TASK_ID passed as positional argument (not --task-id flag)"

    # Extract the orchestrate.sh call
    CALL=$(grep -A 10 'ORCHESTRATE_SCRIPT.*execute' "$PROJECT_ROOT/docker/coordinator-entrypoint.sh" | head -15)

    # Check for correct positional format
    if echo " $CALL" | grep -q 'execute "\$TASK_ID"'; then
        log_pass "TASK_ID in positional format: execute \"\$TASK_ID\""
        return 0
    fi

    # Check for incorrect flag format
    if echo " $CALL" | grep -q -- '--task-id "\$TASK_ID"'; then
        log_fail "TASK_ID in flag format: --task-id \"\$TASK_ID\" (causes error)"
        echo "   Found: $(echo "$CALL" | grep -E "(execute|task-id)")"
        return 1
    fi

    # Neither format found
    log_fail "Could not determine TASK_ID parameter format"
    echo "   Found: $CALL"
    return 1
}

# Test 3: Verify orchestrate.sh accepts positional arguments
test_orchestrate_accepts_positional() {
    ((TESTS_RUN++))
    log_test "orchestrate.sh accepts OPERATION and TASK_ID as positional args"

    ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    if [[ ! -f "$ORCHESTRATE_SCRIPT" ]]; then
        log_fail "orchestrate.sh not found at $ORCHESTRATE_SCRIPT"
        return 1
    fi

    # Check usage documentation
    USAGE=$(grep -A 5 "^Usage:" "$ORCHESTRATE_SCRIPT" | head -7)

    if echo " $USAGE" | grep -q "\[OPERATION\] \[TASK_ID\]"; then
        log_pass "Usage documents positional arguments: [OPERATION] [TASK_ID]"
        return 0
    else
        log_fail "Usage doesn't show positional argument pattern"
        echo "   Found: $USAGE"
        return 1
    fi
}

# Test 4: Verify no --task-id flag handling in orchestrate.sh
test_no_task_id_flag() {
    ((TESTS_RUN++))
    log_test "orchestrate.sh doesn't accept --task-id flag"

    ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check parameter parsing section
    if grep -q -- '--task-id)' "$ORCHESTRATE_SCRIPT"; then
        log_fail "Found --task-id flag handler (inconsistent with positional pattern)"
        return 1
    else
        log_pass "No --task-id flag handler found (correct)"
        return 0
    fi
}

# Test 5: Verify entrypoint PROJECT_ROOT matches mount point
test_project_root_path() {
    ((TESTS_RUN++))
    log_test "PROJECT_ROOT set to /workspace (matches Docker mount)"

    # Extract PROJECT_ROOT value
    PROJECT_ROOT_VAL=$(grep 'PROJECT_ROOT=' "$PROJECT_ROOT/docker/coordinator-entrypoint.sh" | head -1 | sed 's/.*PROJECT_ROOT=//' | tr -d '"')

    if [[ "$PROJECT_ROOT_VAL" == "/workspace" ]]; then
        log_pass "PROJECT_ROOT=/workspace (correct mount point)"
        return 0
    else
        log_fail "PROJECT_ROOT=$PROJECT_ROOT_VAL (expected /workspace)"
        return 1
    fi
}

# Run all tests
echo " ========================================"
echo " Coordinator Parameter Handoff Tests"
echo " ========================================"
echo " "

test_entrypoint_exists
test_positional_task_id
test_orchestrate_accepts_positional
test_no_task_id_flag
test_project_root_path

echo " "
echo " ========================================"
echo " Test Results"
echo " ========================================"
echo " Tests run:    $TESTS_RUN"
echo " Tests passed: $TESTS_PASSED"
echo " Tests failed: $TESTS_FAILED"
echo " "

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo " ✅ ALL TESTS PASSED"
    exit 0
else
    echo " ❌ SOME TESTS FAILED"
    exit 1
fi
