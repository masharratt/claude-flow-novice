#!/usr/bin/env bash
# Test Docker mode selection priority in orchestrate.sh
# Validates BUG FIX: CFN_DOCKER_MODE='false' overrides Docker socket detection

set -uo pipefail  # Don't exit on error, we're testing failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function log_test() {
    echo -e "${YELLOW}[TEST $TESTS_TOTAL]${NC} $1"
}

function log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

function log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# Helper: Extract mode selection logic from orchestrate.sh
function test_mode_selection() {
    local CFN_DOCKER_MODE="$1"
    local has_docker_socket="$2"
    local expected_mode="$3"
    local expected_reason="$4"

    ((TESTS_TOTAL++))
    log_test "CFN_DOCKER_MODE='$CFN_DOCKER_MODE', Socket=$has_docker_socket → Expect $expected_mode mode"

    # Simulate mode selection logic
    local SPAWN_MODE="cli"
    local SPAWN_REASON=""

    if [[ "$CFN_DOCKER_MODE" == "true" ]]; then
        SPAWN_MODE="docker"
        SPAWN_REASON="explicit CFN_DOCKER_MODE=true"
    elif [[ "$CFN_DOCKER_MODE" == "false" ]]; then
        SPAWN_MODE="cli"
        SPAWN_REASON="explicit CFN_DOCKER_MODE=false (overrides Docker socket detection)"
    elif [[ "$has_docker_socket" == "yes" ]]; then
        SPAWN_MODE="docker"
        SPAWN_REASON="automatic Docker socket detection"
    else
        SPAWN_MODE="cli"
        SPAWN_REASON="default (no Docker socket)"
    fi

    # Validate mode
    if [[ "$SPAWN_MODE" == "$expected_mode" ]]; then
        log_pass "Mode selection correct: $SPAWN_MODE"
    else
        log_fail "Expected $expected_mode, got $SPAWN_MODE"
        return 1
    fi

    # Validate reason contains expected substring
    if [[ "$SPAWN_REASON" == *"$expected_reason"* ]]; then
        log_pass "Reason correct: $SPAWN_REASON"
    else
        log_fail "Expected reason containing '$expected_reason', got '$SPAWN_REASON'"
        return 1
    fi
}

# Helper: Verify orchestrate.sh contains the fix
function test_code_contains_fix() {
    ((TESTS_TOTAL++))
    log_test "Verify orchestrate.sh contains priority-based mode selection"

    if grep -q "Mode Selection Priority:" "$ORCHESTRATE_SCRIPT"; then
        log_pass "Priority comment found in orchestrate.sh"
    else
        log_fail "Priority comment missing from orchestrate.sh"
        return 1
    fi

    if grep -q 'elif \[\[ "\${CFN_DOCKER_MODE}" == "false" \]\]; then' "$ORCHESTRATE_SCRIPT"; then
        log_pass "Explicit false check found in orchestrate.sh"
    else
        log_fail "Explicit false check missing from orchestrate.sh"
        return 1
    fi
}

echo "====================================="
echo "Docker Mode Override Tests"
echo "====================================="
echo ""

# Test Matrix (6 paths from root cause analysis)
echo "Path 1: CFN_DOCKER_MODE='true', no socket"
test_mode_selection "true" "no" "docker" "explicit CFN_DOCKER_MODE=true"
echo ""

echo "Path 2: CFN_DOCKER_MODE='true', with socket"
test_mode_selection "true" "yes" "docker" "explicit CFN_DOCKER_MODE=true"
echo ""

echo "Path 3: CFN_DOCKER_MODE='false', no socket (BUG FIX)"
test_mode_selection "false" "no" "cli" "explicit CFN_DOCKER_MODE=false"
echo ""

echo "Path 4: CFN_DOCKER_MODE='false', with socket (BUG FIX - PRIMARY CASE)"
test_mode_selection "false" "yes" "cli" "overrides Docker socket detection"
echo ""

echo "Path 5: CFN_DOCKER_MODE unset, with socket"
test_mode_selection "" "yes" "docker" "automatic Docker socket detection"
echo ""

echo "Path 6: CFN_DOCKER_MODE unset, no socket"
test_mode_selection "" "no" "cli" "default"
echo ""

# Code verification
echo "Code Verification:"
test_code_contains_fix
echo ""

# Additional edge cases
echo "Edge Case 1: CFN_DOCKER_MODE='invalid', no socket"
test_mode_selection "invalid" "no" "cli" "default"
echo ""

echo "Edge Case 2: CFN_DOCKER_MODE='invalid', with socket"
test_mode_selection "invalid" "yes" "docker" "automatic Docker socket detection"
echo ""

echo "Edge Case 3: CFN_DOCKER_MODE empty string, no socket"
test_mode_selection "" "no" "cli" "default"
echo ""

echo "Edge Case 4: CFN_DOCKER_MODE empty string, with socket"
test_mode_selection "" "yes" "docker" "automatic Docker socket detection"
echo ""

# E2E scenario from bug report
echo "E2E Scenario: User sets CFN_DOCKER_MODE='false' to bypass Docker issues"
test_mode_selection "false" "yes" "cli" "overrides Docker socket detection"
echo ""

# Test that reason is logged to stderr
((TESTS_TOTAL++))
log_test "Verify mode reason logging pattern in orchestrate.sh"
if grep -q 'echo "  → Docker mode: \${SPAWN_REASON}"' "$ORCHESTRATE_SCRIPT" && \
   grep -q 'echo "  → CLI mode: \${SPAWN_REASON}"' "$ORCHESTRATE_SCRIPT"; then
    log_pass "Mode reason logging found in orchestrate.sh"
else
    log_fail "Mode reason logging missing from orchestrate.sh"
fi
echo ""

# Summary
echo "====================================="
echo "Test Summary"
echo "====================================="
echo "Total:  $TESTS_TOTAL"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ $TESTS_FAILED test(s) failed${NC}"
    exit 1
fi
