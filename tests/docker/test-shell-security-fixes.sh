#!/usr/bin/env bash
# tests/docker/test-shell-security-fixes.sh
# Phase: Security Hardening :: Validates P2 shell scripting security fixes
# Related: Shell Security Issues #1 #2 #3

set -eu

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COORDINATOR_ENTRYPOINT="$PROJECT_ROOT/docker/coordinator-entrypoint.sh"
ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

pass_test() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
}

fail_test() {
    echo -e "${RED}✗${NC} $1: $2"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
}

echo "=========================================="
echo "Shell Security Fixes Validation Test"
echo "=========================================="
echo ""

# ==========================================
# ISSUE 1: Variable Quoting
# ==========================================
echo "Issue 1: Variable Quoting in coordinator-entrypoint.sh"
echo "--------------------------------------------------"

# Test 1.1: No unquoted variables in echo statements
UNQUOTED_ECHO=$(grep -n 'echo.*\$[A-Z_]\+' "$COORDINATOR_ENTRYPOINT" | grep -v '"\$' | grep -v '\${' | wc -l)
if [ "$UNQUOTED_ECHO" -eq 0 ]; then
    pass_test "All variables in echo statements are quoted"
else
    fail_test "Unquoted variables in echo" "Found $UNQUOTED_ECHO instances"
fi

# Test 1.2: EXIT_CODE is quoted in exit statement
EXIT_QUOTED=$(grep 'exit.*EXIT_CODE' "$COORDINATOR_ENTRYPOINT" | grep -c '".*EXIT_CODE')
if [ "$EXIT_QUOTED" -ge 1 ]; then
    pass_test "EXIT_CODE variable is quoted"
else
    fail_test "EXIT_CODE not quoted" "Word splitting risk"
fi

# Test 1.3: Critical variables use braces
BRACED=$(grep -c '\${AGENT_FILE}\|\${CFN_SUCCESS_CRITERIA}\|\${RESOLVED_PATH}\|\${ORCHESTRATE_SCRIPT}\|\${EXIT_CODE}\|\${CONTEXT_FILE}' "$COORDINATOR_ENTRYPOINT")
if [ "$BRACED" -ge 6 ]; then
    pass_test "Critical variables use braces ($BRACED instances)"
else
    fail_test "Insufficient brace usage" "Found $BRACED, expected ≥6"
fi

echo ""

# ==========================================
# ISSUE 2: Strict Mode
# ==========================================
echo "Issue 2: Strict Mode in orchestrate.sh"
echo "--------------------------------------------------"

# Test 2.1: Strict mode exists in first 5 lines
STRICT_MODE=$(head -5 "$ORCHESTRATE_SCRIPT" | grep -c 'set -euo pipefail')
if [ "$STRICT_MODE" -eq 1 ]; then
    pass_test "Strict mode (set -euo pipefail) found"
else
    fail_test "Strict mode missing" "Errors may be silently ignored"
fi

# Test 2.2: Strict mode is after shebang
SHEBANG=$(head -1 "$ORCHESTRATE_SCRIPT")
if echo "$SHEBANG" | grep -q '^#!/bin/bash'; then
    pass_test "Shebang present before strict mode"
else
    fail_test "Shebang incorrect" "Expected #!/bin/bash"
fi

# Test 2.3: No conflicting set commands
CONFLICTS=$(grep -n 'set +e\|set +u\|set +o pipefail' "$ORCHESTRATE_SCRIPT" | wc -l)
if [ "$CONFLICTS" -eq 0 ]; then
    pass_test "No conflicting set commands"
else
    fail_test "Conflicting set commands" "Found $CONFLICTS instances"
fi

echo ""

# ==========================================
# ISSUE 3: mktemp Usage
# ==========================================
echo "Issue 3: mktemp Usage in coordinator-entrypoint.sh"
echo "--------------------------------------------------"

# Test 3.1: CONTEXT_FILE uses mktemp
MKTEMP_USAGE=$(grep -c 'CONTEXT_FILE=.*mktemp' "$COORDINATOR_ENTRYPOINT")
if [ "$MKTEMP_USAGE" -ge 1 ]; then
    pass_test "CONTEXT_FILE uses mktemp"
else
    fail_test "mktemp not used" "Hardcoded /tmp creates race condition"
fi

# Test 3.2: mktemp uses XXXXXX placeholder
MKTEMP_PLACEHOLDER=$(grep -c 'mktemp.*XXXXXX' "$COORDINATOR_ENTRYPOINT")
if [ "$MKTEMP_PLACEHOLDER" -ge 1 ]; then
    pass_test "mktemp uses XXXXXX placeholder"
else
    fail_test "XXXXXX placeholder missing" "Predictable filenames are insecure"
fi

# Test 3.3: trap cleanup exists
TRAP_CLEANUP=$(grep -c 'trap.*rm.*CONTEXT_FILE' "$COORDINATOR_ENTRYPOINT")
if [ "$TRAP_CLEANUP" -ge 1 ]; then
    pass_test "trap cleanup for CONTEXT_FILE found"
else
    fail_test "trap cleanup missing" "Temp files may leak"
fi

# Test 3.4: No hardcoded /tmp paths
HARDCODED=$(grep -n 'CONTEXT_FILE="/tmp/task-context' "$COORDINATOR_ENTRYPOINT" | wc -l)
if [ "$HARDCODED" -eq 0 ]; then
    pass_test "No hardcoded /tmp paths"
else
    fail_test "Hardcoded /tmp found" "Security risk"
fi

echo ""

# ==========================================
# Regression Tests
# ==========================================
echo "Regression Tests: Existing Functionality"
echo "--------------------------------------------------"

# Test 4.1: coordinator-entrypoint.sh is syntactically valid
if bash -n "$COORDINATOR_ENTRYPOINT" 2>&1 | grep -q 'syntax error'; then
    fail_test "coordinator-entrypoint.sh syntax" "Syntax errors detected"
else
    pass_test "coordinator-entrypoint.sh syntax valid"
fi

# Test 4.2: orchestrate.sh is syntactically valid
if bash -n "$ORCHESTRATE_SCRIPT" 2>&1 | grep -q 'syntax error'; then
    fail_test "orchestrate.sh syntax" "Syntax errors detected"
else
    pass_test "orchestrate.sh syntax valid"
fi

# Test 4.3: coordinator-entrypoint.sh has required error checks
ERROR_CHECKS=$(grep -c 'echo "❌' "$COORDINATOR_ENTRYPOINT")
if [ "$ERROR_CHECKS" -ge 5 ]; then
    pass_test "Error handling preserved ($ERROR_CHECKS error messages)"
else
    fail_test "Error handling reduced" "Expected ≥5, found $ERROR_CHECKS"
fi

# Test 4.4: orchestrate.sh has required functions
FUNCTIONS=$(grep -c '^[a-z_]*() {' "$ORCHESTRATE_SCRIPT")
if [ "$FUNCTIONS" -ge 5 ]; then
    pass_test "Core functions preserved ($FUNCTIONS functions)"
else
    fail_test "Functions missing" "Expected ≥5, found $FUNCTIONS"
fi

echo ""

# ==========================================
# Summary
# ==========================================
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ All security fixes validated successfully${NC}"
    echo ""
    echo "Security Improvements:"
    echo "  Issue 1: All variables properly quoted (word splitting/globbing protected)"
    echo "  Issue 2: Strict mode active in orchestrate.sh (errors caught immediately)"
    echo "  Issue 3: mktemp prevents race conditions and file hijacking attacks"
    echo ""
    echo "No regressions detected - existing functionality preserved"
    exit 0
else
    echo -e "${RED}✗ $TESTS_FAILED test(s) failed${NC}"
    exit 1
fi
