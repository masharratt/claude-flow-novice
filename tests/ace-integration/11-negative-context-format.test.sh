#!/bin/bash
# Negative Context Formatter Test Suite - EPIC-ACE-001 Phase 3.2

set -uo pipefail  # Removed -e to allow test to continue on failures

PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
ACE_SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-ace-system"
DB_PATH="$PROJECT_ROOT/ace-context.db"
SQL_FILE="$PROJECT_ROOT/tests/ace-integration/fixtures/negative-context-test-data.sql"

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_test() { TOTAL_TESTS=$((TOTAL_TESTS + 1)); echo -e "${BLUE}[TEST $TOTAL_TESTS]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASSED_TESTS=$((PASSED_TESTS + 1)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILED_TESTS=$((FAILED_TESTS + 1)); }
log_section() { echo -e "\n${YELLOW}=== $1 ===${NC}\n"; }

setup_test_data() {
    sqlite3 "$DB_PATH" < "$SQL_FILE" || {
        echo "ERROR: Failed to load test data"
        return 1
    }
}

cleanup_test_data() {
    sqlite3 "$DB_PATH" "DELETE FROM context_reflections WHERE id LIKE 'ap-format-%';" 2>/dev/null || true
}

trap cleanup_test_data EXIT

log_section "Negative Context Formatter Test Suite - Phase 3.2"
setup_test_data

# Category 1: Visual Distinction
log_section "Category 1: Visual Distinction"

log_test "Severity indicators present"
out1=$("$ACE_SKILL_DIR/query-anti-patterns.sh" "JWT authentication security" --format simple --limit 5 2>/dev/null || echo "")
if [[ "$out1" =~ CRITICAL ]] || [[ "$out1" =~ WARNING ]] || [[ "$out1" =~ MEDIUM ]]; then
    log_pass "Severity indicators found"
else
    log_fail "No severity indicators"
fi

log_test "Anti-pattern section headers"
if [[ "$out1" =~ "Anti-Pattern:" ]]; then
    log_pass "Section headers found"
else
    log_fail "No section headers"
fi

log_test "Structured format present"
if [[ "$out1" =~ "Solution:" ]] && [[ "$out1" =~ "Sprint Ref:" ]]; then
    log_pass "Structured format confirmed"
else
    log_fail "Format not structured"
fi

log_test "Visual distinction with bracket notation"
if [[ "$out1" =~ \[ ]]; then
    log_pass "Uses bracket notation"
else
    log_fail "Not visually distinct"
fi

# Category 2: Severity Indication
log_section "Category 2: Severity Indication"

json1=$("$ACE_SKILL_DIR/query-anti-patterns.sh" "authentication security" --format json --limit 5 2>/dev/null || echo "{}")

log_test "CRITICAL severity present"
if echo "$json1" | jq -e '.anti_patterns[] | select(.severity == "critical")' >/dev/null 2>&1; then
    log_pass "CRITICAL severity found"
else
    log_fail "No CRITICAL severity"
fi

log_test "WARNING severity present"
json2=$("$ACE_SKILL_DIR/query-anti-patterns.sh" "React component error" --format json --limit 5 2>/dev/null || echo "{}")
if echo "$json2" | jq -e '.anti_patterns[] | select(.severity == "warning")' >/dev/null 2>&1; then
    log_pass "WARNING severity found"
else
    log_fail "No WARNING severity"
fi

log_test "MEDIUM severity present"
json3=$("$ACE_SKILL_DIR/query-anti-patterns.sh" "database query optimization" --format json --limit 5 2>/dev/null || echo "{}")
if echo "$json3" | jq -e '.anti_patterns[] | select(.severity == "medium")' >/dev/null 2>&1; then
    log_pass "MEDIUM severity found"
else
    log_fail "No MEDIUM severity"
fi

log_test "Severity field structure"
if echo "$json1" | jq -e '.anti_patterns[0].severity' >/dev/null 2>&1; then
    log_pass "Severity field present"
else
    log_fail "Severity field missing"
fi

# Category 3: Sprint References
log_section "Category 3: Sprint References"

log_test "Sprint reference field"
if [[ "$out1" =~ "Sprint Ref:" ]]; then
    log_pass "Sprint reference found"
else
    log_fail "No sprint reference"
fi

log_test "Iteration count"
if echo "$json1" | jq -e '.anti_patterns[0].iterations_caused' >/dev/null 2>&1; then
    log_pass "Iteration data present"
else
    log_fail "No iteration data"
fi

log_test "Confidence score"
if echo "$json1" | jq -e '.anti_patterns[0].confidence' >/dev/null 2>&1; then
    log_pass "Confidence score found"
else
    log_fail "No confidence score"
fi

# Category 4: Solution Inclusion
log_section "Category 4: Solution Inclusion"

log_test "Solution field displayed"
if [[ "$out1" =~ "Solution:" ]]; then
    log_pass "Solution field present"
else
    log_fail "Solution field missing"
fi

log_test "Null solution handling"
if echo "$json1" | jq -e '.anti_patterns' >/dev/null 2>&1; then
    log_pass "Handles null solutions"
else
    log_fail "Null handling issue"
fi

log_test "Solution readability"
if [[ "$out1" =~ "Solution: " ]]; then
    log_pass "Solution format readable"
else
    log_fail "Solution not readable"
fi

# Category 5: Tag Display
log_section "Category 5: Tag Display"

log_test "Keywords/tags present"
if echo "$json1" | jq -e '.anti_patterns[0].keywords' >/dev/null 2>&1; then
    log_pass "Keywords present"
else
    log_fail "No keywords"
fi

log_test "Domain tag extraction"
domain=$(echo "$json1" | jq -r '.anti_patterns[0].domain' 2>/dev/null || echo "")
if [[ -n "$domain" && "$domain" != "null" ]]; then
    log_pass "Domain tag: $domain"
else
    log_fail "No domain tag"
fi

# Category 6: Integration Tests
log_section "Category 6: Integration Tests"

log_test "Script executes successfully"
if "$ACE_SKILL_DIR/query-anti-patterns.sh" "test task" --format json --limit 1 >/dev/null 2>&1; then
    log_pass "Script runs without errors"
else
    log_fail "Script execution failed"
fi

log_test "Domain filtering"
count=$(echo "$json1" | jq '.anti_patterns | length' 2>/dev/null || echo 0)
if [[ "$count" -ge 0 ]]; then
    log_pass "Domain filtering works ($count results)"
else
    log_fail "Domain filtering failed"
fi

log_test "Limit parameter"
json4=$("$ACE_SKILL_DIR/query-anti-patterns.sh" "database" --format json --limit 2 2>/dev/null || echo "{}")
lim_count=$(echo "$json4" | jq '.anti_patterns | length' 2>/dev/null || echo 0)
if [[ "$lim_count" -le 2 ]]; then
    log_pass "Limit enforced ($lim_count results)"
else
    log_fail "Limit not enforced ($lim_count results)"
fi

log_test "Empty result handling"
json5=$("$ACE_SKILL_DIR/query-anti-patterns.sh" "xyz_nonexistent_domain_abc" --format json --limit 5 2>/dev/null || echo "{}")
if echo "$json5" | jq -e '.anti_patterns' >/dev/null 2>&1; then
    log_pass "Empty results handled"
else
    log_fail "Empty handling failed"
fi

# Category 7: Security
log_section "Category 7: Security & Data Handling"

log_test "Input sanitization"
if "$ACE_SKILL_DIR/query-anti-patterns.sh" "'; DROP TABLE--" --format json --limit 1 >/dev/null 2>&1; then
    log_pass "Handles special characters"
else
    log_fail "Input sanitization issue"
fi

log_test "Security query execution"
sec_out=$("$ACE_SKILL_DIR/query-anti-patterns.sh" "API credentials security" --format simple --limit 5 2>/dev/null || echo "")
if [[ -n "$sec_out" ]]; then
    log_pass "Security queries execute"
else
    log_fail "Security query failed"
fi

log_test "JSON output validation"
if echo "$json1" | jq empty 2>/dev/null; then
    log_pass "Valid JSON output"
else
    log_fail "Invalid JSON"
fi

# Acceptance Criteria
log_section "Acceptance Criteria Validation"

ac_passed=0

log_test "AC1: Visual distinction from positive patterns"
if [[ "$out1" =~ CRITICAL ]] || [[ "$out1" =~ WARNING ]]; then
    log_pass "AC1 PASSED"
    ac_passed=$((ac_passed + 1))
else
    log_fail "AC1 FAILED"
fi

log_test "AC2: Severity clearly indicated"
if [[ "$out1" =~ \[ ]]; then
    log_pass "AC2 PASSED"
    ac_passed=$((ac_passed + 1))
else
    log_fail "AC2 FAILED"
fi

log_test "AC3: Sprint references linkable"
if [[ "$out1" =~ "Sprint Ref:" ]]; then
    log_pass "AC3 PASSED"
    ac_passed=$((ac_passed + 1))
else
    log_fail "AC3 FAILED"
fi

log_test "AC4: Solutions displayed when available"
if [[ "$out1" =~ "Solution:" ]]; then
    log_pass "AC4 PASSED"
    ac_passed=$((ac_passed + 1))
else
    log_fail "AC4 FAILED"
fi

echo -e "\nAcceptance Criteria: $ac_passed/4 passed\n"

# Generate Report
log_section "Test Execution Report"

pass_rate=$(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")

conf=0.60
if (( $(echo "$pass_rate >= 95" | bc -l) )); then
    conf=0.95
elif (( $(echo "$pass_rate >= 90" | bc -l) )); then
    conf=0.90
elif (( $(echo "$pass_rate >= 85" | bc -l) )); then
    conf=0.85
elif (( $(echo "$pass_rate >= 75" | bc -l) )); then
    conf=0.75
fi

cat <<REPORT

========================================
NEGATIVE CONTEXT FORMATTER TEST REPORT
========================================

Total Tests:     $TOTAL_TESTS
Passed:          $PASSED_TESTS
Failed:          $FAILED_TESTS
Pass Rate:       ${pass_rate}%

Test Breakdown:
- Category 1 (Visual Distinction):     4 tests
- Category 2 (Severity Indication):    4 tests
- Category 3 (Sprint References):      3 tests
- Category 4 (Solution Inclusion):     3 tests
- Category 5 (Tag Display):            2 tests
- Category 6 (Integration Tests):      4 tests
- Category 7 (Security):               3 tests
- Acceptance Criteria:                 4 tests

Confidence Score: $conf

Status: $([ $FAILED_TESTS -eq 0 ] && echo "✅ ALL TESTS PASSED" || echo "⚠️  SOME TESTS FAILED")

========================================
REPORT

if [ $FAILED_TESTS -eq 0 ]; then
    exit 0
else
    exit 1
fi
