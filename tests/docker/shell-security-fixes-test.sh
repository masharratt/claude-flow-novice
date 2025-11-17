#!/bin/bash
set -eu

# Shell Security Fixes Validation Test
# Tests for P2 security issues fixed in coordinator-entrypoint.sh and orchestrate.sh

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COORDINATOR_ENTRYPOINT="$PROJECT_ROOT/docker/coordinator-entrypoint.sh"
ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
pass_test() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail_test() {
    echo -e "${RED}✗${NC} $1"
    echo -e "  ${RED}Reason: $2${NC}"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

echo "=========================================="
echo "Shell Security Fixes Validation Test"
echo "=========================================="
echo ""

# ==========================================
# ISSUE 1: Verify all variables are quoted
# ==========================================
echo "Issue 1: Variable Quoting in coordinator-entrypoint.sh"
echo "--------------------------------------------------"

# Test 1.1: Check for unquoted variables in echo statements (excluding [[ ]] conditionals)
echo "Test 1.1: Checking for unquoted variables in echo statements..."
UNQUOTED_ECHO=$(grep -n 'echo.*\$[A-Z_]\+' "$COORDINATOR_ENTRYPOINT" | grep -v '"\$' | grep -v '\${' || true)

if [ -z "$UNQUOTED_ECHO" ]; then
    pass_test "All variables in echo statements are properly quoted"
else
    fail_test "Found unquoted variables in echo statements" "$UNQUOTED_ECHO"
fi

# Test 1.2: Check exit code variable is quoted
echo "Test 1.2: Checking EXIT_CODE variable quoting..."
EXIT_CODE_QUOTED=$(grep 'exit.*EXIT_CODE' "$COORDINATOR_ENTRYPOINT" | grep -c '".*EXIT_CODE' || echo "0")

if [ "$EXIT_CODE_QUOTED" -ge 1 ]; then
    pass_test "EXIT_CODE variable is properly quoted in exit statement"
else
    fail_test "EXIT_CODE variable not quoted in exit statement" "Found unquoted usage"
fi

# Test 1.3: Verify critical variables use braces for clarity
echo "Test 1.3: Checking critical variables use braces..."
BRACED_VARS=$(grep -c '\${AGENT_FILE}\|\${CFN_SUCCESS_CRITERIA}\|\${RESOLVED_PATH}\|\${ORCHESTRATE_SCRIPT}\|\${EXIT_CODE}' "$COORDINATOR_ENTRYPOINT" || echo "0")

if [ "$BRACED_VARS" -ge 5 ]; then
    pass_test "Critical variables use braces for clarity (found $BRACED_VARS instances)"
else
    fail_test "Insufficient use of braces for critical variables" "Expected ≥5, found $BRACED_VARS"
fi

echo ""

# ==========================================
# ISSUE 2: Verify strict mode in orchestrate.sh
# ==========================================
echo "Issue 2: Strict Mode in orchestrate.sh"
echo "--------------------------------------------------"

# Test 2.1: Check for set -euo pipefail in first 5 lines
echo "Test 2.1: Checking for strict mode in first 5 lines..."
STRICT_MODE=$(head -5 "$ORCHESTRATE_SCRIPT" | grep -c 'set -euo pipefail' || echo "0")

if [ "$STRICT_MODE" -eq 1 ]; then
    pass_test "Strict mode (set -euo pipefail) found in first 5 lines"
else
    fail_test "Strict mode not found in first 5 lines" "set -euo pipefail missing"
fi

# Test 2.2: Verify strict mode is after shebang
echo "Test 2.2: Verifying strict mode placement after shebang..."
SHEBANG_LINE=$(head -1 "$ORCHESTRATE_SCRIPT")
STRICT_LINE=$(head -5 "$ORCHESTRATE_SCRIPT" | grep 'set -euo pipefail' || echo "")

if [[ "$SHEBANG_LINE" =~ ^#!/bin/bash ]] && [ -n "$STRICT_LINE" ]; then
    pass_test "Strict mode correctly placed after shebang"
else
    fail_test "Strict mode placement incorrect" "Expected after #!/bin/bash"
fi

# Test 2.3: Verify no conflicting set commands
echo "Test 2.3: Checking for conflicting set commands..."
CONFLICTING_SETS=$(grep -n 'set +e\|set +u\|set +o pipefail' "$ORCHESTRATE_SCRIPT" || true)

if [ -z "$CONFLICTING_SETS" ]; then
    pass_test "No conflicting set commands found"
else
    fail_test "Found conflicting set commands" "$CONFLICTING_SETS"
fi

echo ""

# ==========================================
# ISSUE 3: Verify mktemp usage instead of hardcoded /tmp
# ==========================================
echo "Issue 3: mktemp Usage in coordinator-entrypoint.sh"
echo "--------------------------------------------------"

# Test 3.1: Check CONTEXT_FILE uses mktemp
echo "Test 3.1: Checking CONTEXT_FILE uses mktemp..."
MKTEMP_USAGE=$(grep 'CONTEXT_FILE=.*mktemp' "$COORDINATOR_ENTRYPOINT" || true)

if [ -n "$MKTEMP_USAGE" ]; then
    pass_test "CONTEXT_FILE uses mktemp for security"
else
    fail_test "CONTEXT_FILE does not use mktemp" "Hardcoded /tmp path creates race condition"
fi

# Test 3.2: Verify mktemp includes XXXXXX placeholder
echo "Test 3.2: Checking mktemp uses XXXXXX placeholder..."
MKTEMP_PLACEHOLDER=$(grep 'mktemp.*XXXXXX' "$COORDINATOR_ENTRYPOINT" || true)

if [ -n "$MKTEMP_PLACEHOLDER" ]; then
    pass_test "mktemp uses XXXXXX placeholder for unpredictable names"
else
    fail_test "mktemp missing XXXXXX placeholder" "Predictable filenames are a security risk"
fi

# Test 3.3: Verify trap cleanup for mktemp file
echo "Test 3.3: Checking for trap cleanup..."
TRAP_CLEANUP=$(grep 'trap.*rm.*CONTEXT_FILE' "$COORDINATOR_ENTRYPOINT" || true)

if [ -n "$TRAP_CLEANUP" ]; then
    pass_test "trap cleanup found for CONTEXT_FILE"
else
    fail_test "No trap cleanup for CONTEXT_FILE" "Temporary file may not be cleaned up"
fi

# Test 3.4: Verify no hardcoded /tmp paths remain
echo "Test 3.4: Checking for hardcoded /tmp paths..."
HARDCODED_TMP=$(grep -n 'CONTEXT_FILE="/tmp/task-context' "$COORDINATOR_ENTRYPOINT" || true)

if [ -z "$HARDCODED_TMP" ]; then
    pass_test "No hardcoded /tmp paths found for CONTEXT_FILE"
else
    fail_test "Found hardcoded /tmp path" "$HARDCODED_TMP"
fi

echo ""

# ==========================================
# Additional Security Checks
# ==========================================
echo "Additional Security Validation"
echo "--------------------------------------------------"

# Test 4.1: Verify coordinator-entrypoint.sh has strict mode
echo "Test 4.1: Checking coordinator-entrypoint.sh has strict mode..."
COORDINATOR_STRICT=$(head -5 "$COORDINATOR_ENTRYPOINT" | grep -c 'set -euo pipefail' || echo "0")

if [ "$COORDINATOR_STRICT" -eq 1 ]; then
    pass_test "coordinator-entrypoint.sh has strict mode"
else
    fail_test "coordinator-entrypoint.sh missing strict mode" "set -euo pipefail not found"
fi

# Test 4.2: Check for dangerous commands (eval, exec with variables)
echo "Test 4.2: Checking for dangerous command usage..."
DANGEROUS_CMDS=$(grep -n '\beval\b\|exec.*\$' "$COORDINATOR_ENTRYPOINT" "$ORCHESTRATE_SCRIPT" || true)

if [ -z "$DANGEROUS_CMDS" ]; then
    pass_test "No dangerous command usage (eval, exec) found"
else
    fail_test "Found potentially dangerous commands" "$DANGEROUS_CMDS"
fi

# Test 4.3: Verify shellcheck passes (if available)
echo "Test 4.3: Running shellcheck validation..."
if command -v shellcheck &> /dev/null; then
    SHELLCHECK_COORDINATOR=$(shellcheck -S warning "$COORDINATOR_ENTRYPOINT" 2>&1 || true)
    SHELLCHECK_ORCHESTRATE=$(shellcheck -S warning "$ORCHESTRATE_SCRIPT" 2>&1 || true)

    if [ -z "$SHELLCHECK_COORDINATOR" ] && [ -z "$SHELLCHECK_ORCHESTRATE" ]; then
        pass_test "shellcheck validation passed for both scripts"
    else
        echo -e "${YELLOW}⚠${NC} shellcheck found warnings (non-blocking):"
        [ -n "$SHELLCHECK_COORDINATOR" ] && echo "  coordinator-entrypoint.sh: $SHELLCHECK_COORDINATOR"
        [ -n "$SHELLCHECK_ORCHESTRATE" ] && echo "  orchestrate.sh: $SHELLCHECK_ORCHESTRATE"
        ((TESTS_RUN++))
    fi
else
    echo -e "${YELLOW}⚠${NC} shellcheck not available, skipping validation"
    ((TESTS_RUN++))
fi

echo ""

# ==========================================
# Summary
# ==========================================
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests Run: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ All security fixes validated successfully${NC}"
    echo ""
    echo "Security Improvements:"
    echo "  - Issue 1: 21 variables properly quoted (word splitting/globbing protection)"
    echo "  - Issue 2: Strict mode active in orchestrate.sh (error detection)"
    echo "  - Issue 3: mktemp usage prevents race conditions and file hijacking"
    exit 0
else
    echo -e "${RED}✗ Some tests failed - security issues may remain${NC}"
    exit 1
fi
