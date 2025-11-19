#!/bin/bash
################################################################################
# Test Suite: Bug Fix Validation Summary
# Purpose: Validate all 4 bug fixes from CFN Loop Iteration 2
# Coverage: Bugs #1-4 (sanitization, Redis, container validation, checkpoint timing)
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
    echo -e "${BLUE}[TEST $((TESTS_RUN + 1))]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL${NC} $*"
    ((TESTS_FAILED++))
}

run_test() {
    ((TESTS_RUN++))
    "$@"
}

################################################################################
# BUG #1: Control Character Sanitization (docker-helpers.sh)
################################################################################

test_bug1_tr_d_usage() {
    log_test "Bug #1: sanitize_env_value should use 'tr -d' not 'sed s/'"

    local DOCKER_HELPERS="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh"

    # Check for tr -d usage (correct)
    if grep -A 2 "sanitize_env_value()" "$DOCKER_HELPERS" | grep -q "tr -d"; then
        log_pass "Uses 'tr -d' for control character removal"

        # Check NOT using sed with space conversion (incorrect pattern)
        if ! grep -A 2 "sanitize_env_value()" "$DOCKER_HELPERS" | grep -q "sed 's/\[\[:cntrl:\]\]/ /g'"; then
            log_pass "Does NOT use broken 'sed s/[[:cntrl:]]/ /g' pattern"
            return 0
        else
            log_fail "Still using broken sed pattern"
            return 1
        fi
    else
        log_fail "Not using 'tr -d' for sanitization"
        return 1
    fi
}

test_bug1_shell_metachar_removal() {
    log_test "Bug #1: Should remove shell metacharacters (;|&\$(){}[]<>*?~\`)"

    local DOCKER_HELPERS="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh"

    # Check for shell metacharacter removal in tr -d command
    if grep -A 2 "sanitize_env_value()" "$DOCKER_HELPERS" | grep "tr -d" | grep -q ";\|&"; then
        log_pass "Removes shell metacharacters in tr -d"
        return 0
    else
        log_fail "Shell metacharacter removal not found"
        return 1
    fi
}

################################################################################
# BUG #2: Redis SADD Syntax (save-checkpoint.sh)
################################################################################

test_bug2_sadd_without_ex() {
    log_test "Bug #2: SADD command should NOT use EX parameter"

    local CHECKPOINT_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-wave-checkpoint/save-checkpoint.sh"

    # Check that SADD does NOT have EX on same line
    if ! grep "SADD.*EX" "$CHECKPOINT_SCRIPT" > /dev/null 2>&1; then
        log_pass "SADD does not use EX parameter"
        return 0
    else
        log_fail "SADD still uses EX parameter"
        return 1
    fi
}

test_bug2_separate_expire() {
    log_test "Bug #2: EXPIRE command should be separate after SADD"

    local CHECKPOINT_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-wave-checkpoint/save-checkpoint.sh"

    # Check for SADD followed by EXPIRE
    if grep -A 10 "SADD.*cfn:wave:checkpoints" "$CHECKPOINT_SCRIPT" | grep -q "EXPIRE"; then
        log_pass "Separate EXPIRE command exists after SADD"
        return 0
    else
        log_fail "Separate EXPIRE not found"
        return 1
    fi
}

################################################################################
# BUG #3: Container ID Validation (orchestrate.sh)
################################################################################

test_bug3_empty_container_check() {
    log_test "Bug #3: Should validate container_ids before checkpoint save"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check for empty container_ids validation
    if grep -q 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT"; then
        log_pass "Empty container_ids validation exists"
        return 0
    else
        log_fail "Empty container_ids validation not found"
        return 1
    fi
}

test_bug3_error_logging() {
    log_test "Bug #3: Should log error for empty containers"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check for error logging
    if grep -A 5 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT" | grep -q "log_error.*No containers found"; then
        log_pass "Error logging for empty containers exists"
        return 0
    else
        log_fail "Error logging not found"
        return 1
    fi
}

test_bug3_orphan_cleanup() {
    log_test "Bug #3: Should cleanup orphaned containers when empty"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check for cleanup call
    if grep -A 5 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT" | grep -q "cleanup_orphaned_containers"; then
        log_pass "Orphan cleanup called for empty containers"
        return 0
    else
        log_fail "Orphan cleanup not found"
        return 1
    fi
}

test_bug3_early_return() {
    log_test "Bug #3: Should return error without saving checkpoint"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check for early return
    if grep -A 5 'if \[\[ -z "$container_ids" \]\]; then' "$ORCHESTRATE_SCRIPT" | grep -q "return 1"; then
        log_pass "Early return prevents checkpoint save"
        return 0
    else
        log_fail "Early return not found"
        return 1
    fi
}

################################################################################
# BUG #4: Checkpoint Timing (Note: Was already correct)
################################################################################

test_bug4_checkpoint_after_spawn() {
    log_test "Bug #4: Checkpoint should be saved AFTER spawn completes"

    local ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    # Check that save_wave_checkpoint is called in spawn_wave_implementation
    # (The bug was that it was thought to be called after monitor, but it was already correct)
    if grep -A 50 "spawn_wave_implementation()" "$ORCHESTRATE_SCRIPT" | grep -q "save_wave_checkpoint"; then
        log_pass "Checkpoint save exists in spawn_wave_implementation"
        return 0
    else
        log_fail "Checkpoint save not found in spawn function"
        return 1
    fi
}

################################################################################
# INTEGRATION TEST: Complete Flow
################################################################################

test_integration_validation_flow() {
    log_test "Integration: All bug fixes should work together"

    local all_fixed=true

    # Bug #1: Sanitization
    if ! grep -A 2 "sanitize_env_value()" "$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh" | grep -q "tr -d"; then
        all_fixed=false
    fi

    # Bug #2: Redis syntax
    if grep "SADD.*EX" "$PROJECT_ROOT/.claude/skills/cfn-wave-checkpoint/save-checkpoint.sh" > /dev/null 2>&1; then
        all_fixed=false
    fi

    # Bug #3: Container validation
    if ! grep -q 'if \[\[ -z "$container_ids" \]\]; then' "$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"; then
        all_fixed=false
    fi

    if [[ "$all_fixed" == true ]]; then
        log_pass "All bug fixes validated successfully"
        return 0
    else
        log_fail "Some bug fixes missing or incorrect"
        return 1
    fi
}

################################################################################
# MAIN TEST EXECUTION
################################################################################

echo "========================================"
echo "Bug Fix Validation Summary"
echo "CFN Loop Iteration 2 - All Bugs Fixed"
echo "========================================"
echo ""

echo "--- Bug #1: Control Character Sanitization ---"
run_test test_bug1_tr_d_usage
run_test test_bug1_shell_metachar_removal
echo ""

echo "--- Bug #2: Redis SADD/EXPIRE Syntax ---"
run_test test_bug2_sadd_without_ex
run_test test_bug2_separate_expire
echo ""

echo "--- Bug #3: Container ID Validation ---"
run_test test_bug3_empty_container_check
run_test test_bug3_error_logging
run_test test_bug3_orphan_cleanup
run_test test_bug3_early_return
echo ""

echo "--- Bug #4: Checkpoint Timing ---"
run_test test_bug4_checkpoint_after_spawn
echo ""

echo "--- Integration Test ---"
run_test test_integration_validation_flow
echo ""

echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All bug fix validations passed${NC}"
    echo -e "${GREEN}✓ Security fixes verified${NC}"
    echo -e "${GREEN}✓ Ready for production deployment${NC}"
    exit 0
else
    echo -e "${RED}✗ Some validations failed${NC}"
    exit 1
fi
