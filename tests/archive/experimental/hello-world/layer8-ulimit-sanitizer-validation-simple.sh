#!/bin/bash

##############################################################################
# Layer 8: ulimit Sanitizer Validation (Simplified)
#
# Purpose: Validate sanitizer doesn't set ulimit -u which causes fork failures
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS_COUNT=0
FAIL_COUNT=0

echo "========================================="
echo "Layer 8: ulimit Sanitizer Validation"
echo "========================================="
echo ""

pass() {
    echo "✅ PASS: $1"
    ((PASS_COUNT++))
}

fail() {
    echo "❌ FAIL: $1"
    ((FAIL_COUNT++))
}

info() {
    echo "ℹ️  INFO: $1"
}

##############################################################################
# Test 1: Baseline ulimit check
##############################################################################

echo "Test 1: Baseline ulimit check"
echo "------------------------------"

BASELINE_ULIMIT=$(ulimit -u)
info "Baseline ulimit -u: $BASELINE_ULIMIT"

if [[ "$BASELINE_ULIMIT" -gt 1000 ]]; then
    pass "Baseline ulimit is reasonable: $BASELINE_ULIMIT"
else
    fail "Baseline ulimit too low: $BASELINE_ULIMIT"
fi

echo ""

##############################################################################
# Test 2: Verify sanitizer code doesn't set ulimit -u
##############################################################################

echo "Test 2: Sanitizer code validation"
echo "----------------------------------"

SANITIZER_FILE="$PROJECT_ROOT/.claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh"

if [[ ! -f "$SANITIZER_FILE" ]]; then
    fail "Sanitizer file not found: $SANITIZER_FILE"
else
    # Check for forbidden ulimit patterns
    FORBIDDEN_COUNT=0
    
    if grep -n "ulimit -u.*MAX_AGENT_PROCESSES" "$SANITIZER_FILE" 2>/dev/null; then
        ((FORBIDDEN_COUNT++))
        fail "Found forbidden pattern: ulimit -u.*MAX_AGENT_PROCESSES"
    fi
    
    if grep -n "ulimit -u \$MAX_AGENT_PROCESSES" "$SANITIZER_FILE" 2>/dev/null; then
        ((FORBIDDEN_COUNT++))
        fail "Found forbidden pattern: ulimit -u \$MAX_AGENT_PROCESSES"
    fi
    
    if grep -n "ulimit -u [0-9]" "$SANITIZER_FILE" 2>/dev/null; then
        ((FORBIDDEN_COUNT++))
        fail "Found forbidden pattern: ulimit -u with hardcoded number"
    fi
    
    if [[ "$FORBIDDEN_COUNT" -eq 0 ]]; then
        pass "No forbidden ulimit -u patterns found in sanitizer"
    fi
fi

echo ""

##############################################################################
# Test 3: Verify pgrep replaced with /proc reads
##############################################################################

echo "Test 3: Fork-free process detection"
echo "------------------------------------"

if grep -n "pgrep" "$SANITIZER_FILE" 2>/dev/null | grep -v "^#"; then
    fail "Found uncommented pgrep usage (causes fork)"
else
    pass "No pgrep usage found (fork-free)"
fi

if grep -n "/proc/\[0-9\]" "$SANITIZER_FILE" 2>/dev/null; then
    pass "Found /proc filesystem reads (fork-free pattern)"
else
    info "No /proc reads found (may be OK if no process detection needed)"
fi

echo ""

##############################################################################
# Test 4: Current ulimit preserved
##############################################################################

echo "Test 4: Current ulimit unchanged"
echo "---------------------------------"

CURRENT_ULIMIT=$(ulimit -u)

if [[ "$CURRENT_ULIMIT" -eq "$BASELINE_ULIMIT" ]]; then
    pass "ulimit unchanged after test: $CURRENT_ULIMIT"
else
    fail "ulimit changed from $BASELINE_ULIMIT to $CURRENT_ULIMIT"
fi

echo ""

##############################################################################
# Final Results
##############################################################################

echo "========================================="
echo "Test Results Summary"
echo "========================================="
echo "Total Passed: $PASS_COUNT"
echo "Total Failed: $FAIL_COUNT"
echo ""

if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "✅ ALL TESTS PASSED"
    exit 0
else
    echo "❌ SOME TESTS FAILED"
    exit 1
fi
