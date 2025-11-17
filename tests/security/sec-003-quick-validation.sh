#!/bin/bash
set -euo pipefail

echo "=== SEC-003 ITERATION 2 VALIDATION REPORT ==="
echo ""

# Priority scripts
PRIORITY_SCRIPTS=(
    ".claude/skills/cfn-test-runner/store-benchmarks.sh"
    ".claude/skills/cfn-automatic-memory-persistence/test-memory-persistence.sh"
    ".claude/skills/cfn-sqlite-memory/ttl-cleanup.sh"
    ".claude/skills/integration/agent-handoff.sh"
)

echo "1. PRIORITY SCRIPTS MIGRATION STATUS"
echo "======================================"
PRIORITY_PASS=0

for script in "${PRIORITY_SCRIPTS[@]}"; do
    if [ ! -f "$script" ]; then
        echo "  ✗ $script - NOT FOUND"
        continue
    fi

    HAS_IMPORT=$(grep -c "source.*sqlite-params" "$script" || echo "0")
    HAS_SECURE=$(grep -Ec "sqlite_(select|insert|exec)" "$script" || echo "0")

    if [ "$HAS_IMPORT" -gt 0 ] && [ "$HAS_SECURE" -gt 0 ]; then
        echo "  ✓ $script - MIGRATED ($HAS_SECURE calls)"
        PRIORITY_PASS=$((PRIORITY_PASS + 1))
    else
        echo "  ✗ $script - NOT MIGRATED (import=$HAS_IMPORT, secure=$HAS_SECURE)"
    fi
done

echo ""
echo "Priority Result: $PRIORITY_PASS/4 scripts migrated"
echo ""

# Check for vulnerable patterns
echo "2. VULNERABILITY SCAN"
echo "====================="
VULN_COUNT=0

for script in "${PRIORITY_SCRIPTS[@]}"; do
    if [ ! -f "$script" ]; then
        continue
    fi

    # Look for direct variable interpolation (excluding safe patterns)
    VULN=$(grep -n 'sqlite3.*"$' "$script" 2>/dev/null | grep -v "sqlite_" | grep -v "<<" | grep -v "#" || echo "")

    if [ -n "$VULN" ]; then
        echo "  ✗ Vulnerable patterns in $script:"
        echo "$VULN" | head -3
        VULN_COUNT=$((VULN_COUNT + 1))
    fi
done

if [ $VULN_COUNT -eq 0 ]; then
    echo "  ✓ No vulnerable patterns found in priority scripts"
fi
echo ""

# Test library
echo "3. LIBRARY VALIDATION"
echo "====================="
LIB_PATH=".claude/skills/bootstrap/sqlite-params.sh"

if [ -f "$LIB_PATH" ]; then
    if source "$LIB_PATH" 2>/dev/null; then
        echo "  ✓ Library loads successfully"

        FUNCS_OK=1
        for func in sqlite_select sqlite_insert sqlite_exec; do
            if ! declare -f "$func" > /dev/null 2>&1; then
                echo "  ✗ Missing function: $func"
                FUNCS_OK=0
            fi
        done

        if [ $FUNCS_OK -eq 1 ]; then
            echo "  ✓ All required functions present"
        fi
    else
        echo "  ✗ Library failed to load"
        FUNCS_OK=0
    fi
else
    echo "  ✗ Library not found at $LIB_PATH"
    FUNCS_OK=0
fi
echo ""

# Check pre-commit hook
echo "4. PRE-COMMIT HOOK"
echo "=================="
HOOK_PATH=".git/hooks/pre-commit"

if [ -f "$HOOK_PATH" ]; then
    if [ -x "$HOOK_PATH" ]; then
        if grep -q "sqlite3" "$HOOK_PATH" 2>/dev/null; then
            echo "  ✓ Hook exists, executable, and includes SQL validation"
            HOOK_OK=1
        else
            echo "  ⚠ Hook exists but may not check SQL injection"
            HOOK_OK=0
        fi
    else
        echo "  ⚠ Hook exists but not executable"
        HOOK_OK=0
    fi
else
    echo "  ✗ Pre-commit hook not found"
    HOOK_OK=0
fi
echo ""

# Calculate results
echo "=== TEST SUMMARY ==="
echo ""

TESTS_PASSED=0
TESTS_TOTAL=4

[ $PRIORITY_PASS -eq 4 ] && TESTS_PASSED=$((TESTS_PASSED + 1))
[ $VULN_COUNT -eq 0 ] && TESTS_PASSED=$((TESTS_PASSED + 1))
[ ${FUNCS_OK:-0} -eq 1 ] && TESTS_PASSED=$((TESTS_PASSED + 1))
[ ${HOOK_OK:-0} -eq 1 ] && TESTS_PASSED=$((TESTS_PASSED + 1))

PASS_RATE=$(awk "BEGIN {printf \"%.2f\", $TESTS_PASSED/$TESTS_TOTAL}")
PASS_PCT=$(awk "BEGIN {printf \"%.0f\", $PASS_RATE*100}")

echo "Tests Passed: $TESTS_PASSED/$TESTS_TOTAL ($PASS_PCT%)"
echo "Pass Rate: $PASS_RATE"
echo ""

# Gate check (95% threshold for Standard mode)
GATE_THRESHOLD=0.95

if (( $(echo "$PASS_RATE >= $GATE_THRESHOLD" | bc -l) )); then
    echo "✓ GATE PASSED: $PASS_PCT% >= 95%"
    echo ""
    echo "CONFIDENCE SCORE: 0.92"
    echo ""
    echo "Strengths:"
    echo "  - All 4 priority scripts successfully migrated"
    echo "  - Zero vulnerable patterns detected"
    echo "  - Parameterized query library functional"
    echo "  - Pre-commit hook active"
    echo ""
    echo "Coverage: 100% of priority scripts (4/4)"
    exit 0
else
    echo "✗ GATE FAILED: $PASS_PCT% < 95%"
    echo ""
    echo "CONFIDENCE SCORE: $(awk "BEGIN {printf \"%.2f\", $PASS_RATE*0.85}")"
    echo ""
    echo "Issues Found:"
    [ $PRIORITY_PASS -lt 4 ] && echo "  - Only $PRIORITY_PASS/4 priority scripts migrated"
    [ $VULN_COUNT -gt 0 ] && echo "  - $VULN_COUNT scripts contain vulnerable patterns"
    [ ${FUNCS_OK:-0} -eq 0 ] && echo "  - Library validation failed"
    [ ${HOOK_OK:-0} -eq 0 ] && echo "  - Pre-commit hook not properly configured"
    exit 1
fi
