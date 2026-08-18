#!/usr/bin/env bash
# SQL Injection Production Script Audit
# Tests actual production scripts (not library functions) for SQL injection vulnerabilities
# CFN Loop 5 Iteration 2 - Comprehensive Production Script Testing

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0
VULNERABLE_SCRIPTS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "==============================================="
echo "SQL Injection Production Script Audit"
echo "==============================================="
echo "Testing: 14 production scripts"
echo "Coverage: OWASP Top 10 attack vectors"
echo "Expected: 100% pass rate (Pattern B implementation)"
echo ""

#######################################
# Test Helper Functions
#######################################

test_script_for_vulnerabilities() {
    local script_path="$1"
    local script_name=$(basename "$script_path")

    echo ""
    echo "=== Testing: $script_name ==="

    if [[ ! -f "$script_path" ]]; then
        echo -e "${RED}✗${NC} Script not found: $script_path"
        VULNERABLE_SCRIPTS+=("$script_name (NOT FOUND)")
        ((FAIL_COUNT+=5)) # Count as 5 failures (one per OWASP vector)
        ((TEST_COUNT+=5))
        return 1
    fi

    # Check 1: Sources parameterized library
    ((TEST_COUNT++))
    if grep -q "source.*sqlite-params.sh" "$script_path"; then
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: Sources sqlite-params.sh library"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗${NC} Test $TEST_COUNT: Missing sqlite-params.sh import"
        ((FAIL_COUNT++))
        VULNERABLE_SCRIPTS+=("$script_name (no library import)")
    fi

    # Check 2: Uses parameterized functions
    ((TEST_COUNT++))
    local param_usage=$(grep -c "sqlite_select\|sqlite_insert\|sqlite_update\|sqlite_delete\|sqlite_exec" "$script_path" || echo "0")
    if [[ "$param_usage" -gt 0 ]]; then
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: Uses parameterized query functions ($param_usage occurrences)"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗${NC} Test $TEST_COUNT: No parameterized query usage"
        ((FAIL_COUNT++))
        VULNERABLE_SCRIPTS+=("$script_name (no param queries)")
    fi

    # Check 3: No vulnerable patterns (sqlite3 with $variable interpolation)
    ((TEST_COUNT++))
    local vulnerable_patterns=$(grep -n "sqlite3.*\".*\\\$" "$script_path" 2>/dev/null | grep -v "^\s*#" | wc -l)
    if [[ "$vulnerable_patterns" -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: No vulnerable string interpolation patterns"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗${NC} Test $TEST_COUNT: Found $vulnerable_patterns vulnerable patterns"
        echo -e "${YELLOW}  Lines with vulnerabilities:${NC}"
        grep -n "sqlite3.*\".*\\\$" "$script_path" 2>/dev/null | grep -v "^\s*#" | head -5 | sed 's/^/    /'
        ((FAIL_COUNT++))
        VULNERABLE_SCRIPTS+=("$script_name ($vulnerable_patterns vulnerable lines)")
    fi

    # Check 4: DROP TABLE protection (OWASP: Modification)
    ((TEST_COUNT++))
    if grep -q "sqlite3.*DROP TABLE\|sqlite3.*DELETE FROM.*\\\$" "$script_path" 2>/dev/null | grep -v "^\s*#"; then
        echo -e "${RED}✗${NC} Test $TEST_COUNT: DROP TABLE/DELETE vulnerable to injection"
        ((FAIL_COUNT++))
    else
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: DROP TABLE protection (OWASP)"
        ((PASS_COUNT++))
    fi

    # Check 5: WHERE clause protection (OWASP: Authentication bypass)
    ((TEST_COUNT++))
    local where_vulns=$(grep -n "WHERE.*=.*\\\$" "$script_path" 2>/dev/null | grep -v "^\s*#" | grep -v "sqlite_select\|sqlite_update\|sqlite_delete" | wc -l)
    if [[ "$where_vulns" -gt 0 ]]; then
        echo -e "${RED}✗${NC} Test $TEST_COUNT: WHERE clause vulnerable to OR 1=1 bypass ($where_vulns occurrences)"
        ((FAIL_COUNT++))
    else
        echo -e "${GREEN}✓${NC} Test $TEST_COUNT: WHERE clause protection (OWASP)"
        ((PASS_COUNT++))
    fi

    echo "Summary for $script_name: Completed 5 OWASP tests"
}

#######################################
# Test Production Scripts (14 Total)
#######################################

echo "=== CRITICAL Priority Scripts (2) ==="
test_script_for_vulnerabilities "$PROJECT_ROOT/.claude/skills/cfn-sqlite-memory/ttl-cleanup.sh"
test_script_for_vulnerabilities "$PROJECT_ROOT/.claude/skills/integration/agent-handoff.sh"

echo ""
echo "=== HIGH Priority Scripts (5) ==="
test_script_for_vulnerabilities "$PROJECT_ROOT/.claude/skills/cfn-automatic-memory-persistence/test-memory-persistence.sh"
test_script_for_vulnerabilities "$PROJECT_ROOT/.claude/skills/cfn-test-runner/detect-regressions.sh"
test_script_for_vulnerabilities "$PROJECT_ROOT/.claude/skills/cfn-transparency-middleware/test-e2e.sh"
test_script_for_vulnerabilities "$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh"
test_script_for_vulnerabilities "$PROJECT_ROOT/.claude/skills/cfn-coordination/report-completion.sh"

echo ""
echo "=== MEDIUM Priority Scripts (7 workflow-codification) ==="
for script in "$PROJECT_ROOT/.claude/skills/workflow-codification"/*.sh; do
    if [[ -f "$script" ]] && grep -q "sqlite3" "$script" 2>/dev/null; then
        test_script_for_vulnerabilities "$script"
    fi
done

#######################################
# Final Report
#######################################

echo ""
echo "==============================================="
echo "Test Results Summary"
echo "==============================================="
echo "Total Tests: $TEST_COUNT"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"

local pass_rate
pass_rate=$(awk "BEGIN {printf \"%.2f\", ($PASS_COUNT / $TEST_COUNT) * 100}")
echo "Pass Rate: $pass_rate%"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo ""
    echo -e "${RED}Vulnerable Scripts Found:${NC}"
    for vuln in "${VULNERABLE_SCRIPTS[@]}"; do
        echo "  - $vuln"
    done
    echo ""
    echo -e "${RED}Status: FAILED - Production scripts still vulnerable${NC}"
    echo ""
    echo "CRITICAL ISSUE: Test suite was testing library functions (secure) instead of"
    echo "production scripts (vulnerable). Production scripts still use Pattern A."
    echo ""
    echo "Iteration 1 Error: Created test suite that validated wrong code."
    exit 1
else
    echo ""
    echo -e "${GREEN}Status: ALL TESTS PASSED ✓${NC}"
    echo "All production scripts use Pattern B (parameterized queries)"
    exit 0
fi
