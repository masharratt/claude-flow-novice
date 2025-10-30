#!/bin/bash

# Integration Test: Anti-Pattern Query System
# Tests: Domain-based querying, severity sorting, deduplication, relevance scoring

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QUERY_SCRIPT="${PROJECT_ROOT}/.claude/skills/cfn-ace-system/query-anti-patterns.sh"
DB_PATH="${PROJECT_ROOT}/ace-context.db"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Test result reporting
pass_test() {
  echo -e "${GREEN}✓${NC} $1"
  ((TESTS_PASSED++))
}

fail_test() {
  echo -e "${RED}✗${NC} $1"
  echo "  Details: $2"
  ((TESTS_FAILED++))
}

# Setup: Verify test data exists
echo "=== Anti-Pattern Query System Test Suite ==="
echo ""

if [ ! -f "$QUERY_SCRIPT" ]; then
  echo -e "${RED}ERROR: Query script not found at $QUERY_SCRIPT${NC}"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo -e "${RED}ERROR: Database not found at $DB_PATH${NC}"
  exit 1
fi

# Check database has anti-pattern data
ANTIPATTERN_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM context_reflections WHERE reflection_type IN ('anti-pattern', 'warning', 'failure');")
echo "Database contains $ANTIPATTERN_COUNT anti-patterns/warnings"
echo ""

if [ "$ANTIPATTERN_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}WARNING: No anti-patterns in database. Tests will be limited.${NC}"
  echo ""
fi

# Test 1: Basic Query - Frontend Task
echo "Test 1: Frontend Task Query"
RESULT=$("$QUERY_SCRIPT" "Build React dashboard with user authentication" --limit 3 --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  RESULT_COUNT=$(echo "$RESULT" | jq -r '.filtered_count // 0')
  DOMAINS=$(echo "$RESULT" | jq -r '.query.domains[]?' 2>/dev/null | tr '\n' ',' | sed 's/,$//')

  if [ "$RESULT_COUNT" -ge 0 ]; then
    pass_test "Frontend task query executed (found $RESULT_COUNT results)"
    echo "  Domains detected: $DOMAINS"
  else
    fail_test "Frontend task query returned invalid count" "$RESULT"
  fi
else
  fail_test "Frontend task query failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 2: Severity Sorting
echo "Test 2: Severity-Based Sorting"
RESULT=$("$QUERY_SCRIPT" "Implement backend API" --limit 5 --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Check if results are sorted by severity (critical first)
  SEVERITIES=$(echo "$RESULT" | jq -r '.anti_patterns[].severity // "unknown"' | head -3)

  # First result should have highest severity score
  FIRST_RELEVANCE=$(echo "$RESULT" | jq -r '.anti_patterns[0].relevance_score // 0')
  LAST_RELEVANCE=$(echo "$RESULT" | jq -r '.anti_patterns[-1].relevance_score // 0')

  if (( $(echo "$FIRST_RELEVANCE >= $LAST_RELEVANCE" | bc -l) )); then
    pass_test "Results sorted by relevance score ($FIRST_RELEVANCE >= $LAST_RELEVANCE)"
    echo "  Severities: $(echo $SEVERITIES | tr '\n' ',' | sed 's/,$//')"
  else
    fail_test "Sorting failed" "First: $FIRST_RELEVANCE, Last: $LAST_RELEVANCE"
  fi
else
  fail_test "Severity sorting test failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 3: Multi-Domain Task (Blended Results)
echo "Test 3: Multi-Domain Task Query"
RESULT=$("$QUERY_SCRIPT" "Implement JWT authentication with React UI and PostgreSQL backend" --limit 5 --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  DOMAINS=$(echo "$RESULT" | jq -r '.query.domains[]?' 2>/dev/null | tr '\n' ' ')
  DOMAIN_COUNT=$(echo "$DOMAINS" | wc -w)
  RESULT_COUNT=$(echo "$RESULT" | jq -r '.filtered_count // 0')

  if [ "$DOMAIN_COUNT" -gt 1 ] && [ "$RESULT_COUNT" -gt 0 ]; then
    pass_test "Multi-domain task detected $DOMAIN_COUNT domains"
    echo "  Domains: $DOMAINS"
    echo "  Results: $RESULT_COUNT"

    # Check for domain diversity in results
    RESULT_DOMAINS=$(echo "$RESULT" | jq -r '.anti_patterns[].domain // "unknown"' | sort -u | tr '\n' ' ')
    echo "  Result domains: $RESULT_DOMAINS"
  else
    fail_test "Multi-domain detection failed" "Detected $DOMAIN_COUNT domains"
  fi
else
  fail_test "Multi-domain task query failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 4: Relevance Scoring Components
echo "Test 4: Relevance Scoring Validation"
RESULT=$("$QUERY_SCRIPT" "Create microservice architecture" --limit 3 --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Check first result has scoring breakdown
  HAS_BREAKDOWN=$(echo "$RESULT" | jq -r '.anti_patterns[0].scoring_breakdown // empty' | wc -l)

  if [ "$HAS_BREAKDOWN" -gt 0 ]; then
    SEVERITY_SCORE=$(echo "$RESULT" | jq -r '.anti_patterns[0].scoring_breakdown.severity // 0')
    DOMAIN_SCORE=$(echo "$RESULT" | jq -r '.anti_patterns[0].scoring_breakdown.domain // 0')
    RECENCY_SCORE=$(echo "$RESULT" | jq -r '.anti_patterns[0].scoring_breakdown.recency // 0')
    FREQUENCY_SCORE=$(echo "$RESULT" | jq -r '.anti_patterns[0].scoring_breakdown.frequency // 0')

    pass_test "Relevance scoring breakdown present"
    echo "  Severity: $SEVERITY_SCORE"
    echo "  Domain: $DOMAIN_SCORE"
    echo "  Recency: $RECENCY_SCORE"
    echo "  Frequency: $FREQUENCY_SCORE"
  else
    fail_test "No scoring breakdown found" "$RESULT"
  fi
else
  fail_test "Relevance scoring test failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 5: Deduplication Logic
echo "Test 5: Deduplication"
# Query with high limit to test deduplication
RESULT=$("$QUERY_SCRIPT" "Build REST API" --limit 10 --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  TOTAL_COUNT=$(echo "$RESULT" | jq -r '.total_count // 0')
  FILTERED_COUNT=$(echo "$RESULT" | jq -r '.filtered_count // 0')

  # Extract first 60 chars of each anti_pattern to check uniqueness
  UNIQUE_PATTERNS=$(echo "$RESULT" | jq -r '.anti_patterns[].anti_pattern // "" | .[0:60]' | sort -u | wc -l)
  TOTAL_PATTERNS=$(echo "$RESULT" | jq -r '.anti_patterns | length')

  if [ "$UNIQUE_PATTERNS" -eq "$TOTAL_PATTERNS" ]; then
    pass_test "Deduplication working ($UNIQUE_PATTERNS unique patterns)"
  else
    fail_test "Deduplication failed" "Unique: $UNIQUE_PATTERNS, Total: $TOTAL_PATTERNS"
  fi
else
  fail_test "Deduplication test failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 6: Simple Format Output
echo "Test 6: Simple Format Output"
RESULT=$("$QUERY_SCRIPT" "Implement user authentication" --limit 2 --format simple 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Check for expected simple format elements
  if echo "$RESULT" | grep -q "Anti-Pattern Query Results" && \
     echo "$RESULT" | grep -q "Task:" && \
     echo "$RESULT" | grep -q "Domains:"; then
    pass_test "Simple format output valid"
  else
    fail_test "Simple format missing elements" "$RESULT"
  fi
else
  fail_test "Simple format test failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 7: Empty Domain Handling
echo "Test 7: Empty Domain Handling"
RESULT=$("$QUERY_SCRIPT" "Perform general task" --limit 3 --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  DOMAINS=$(echo "$RESULT" | jq -r '.query.domains[]?' 2>/dev/null)

  # Should default to 'general' if no specific domain detected
  if [ -n "$DOMAINS" ]; then
    pass_test "Empty domain handled (defaulted to: $DOMAINS)"
  else
    fail_test "Empty domain not handled" "No domains returned"
  fi
else
  fail_test "Empty domain handling failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 8: Confidence Filtering
echo "Test 8: Minimum Confidence Filtering"
RESULT_LOW=$("$QUERY_SCRIPT" "Build web app" --limit 10 --min-confidence 0.5 --format json 2>&1)
RESULT_HIGH=$("$QUERY_SCRIPT" "Build web app" --limit 10 --min-confidence 0.9 --format json 2>&1)

if [ $? -eq 0 ]; then
  COUNT_LOW=$(echo "$RESULT_LOW" | jq -r '.filtered_count // 0')
  COUNT_HIGH=$(echo "$RESULT_HIGH" | jq -r '.filtered_count // 0')

  if [ "$COUNT_LOW" -ge "$COUNT_HIGH" ]; then
    pass_test "Confidence filtering works ($COUNT_LOW results at 0.5, $COUNT_HIGH at 0.9)"
  else
    fail_test "Confidence filtering failed" "Low: $COUNT_LOW, High: $COUNT_HIGH"
  fi
else
  fail_test "Confidence filtering test failed" "Query execution failed"
fi
echo ""

# Test 9: Context Injection Format
echo "Test 9: Context Injection Format"
RESULT=$("$QUERY_SCRIPT" "Implement caching layer" --limit 2 --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Check that results have required fields for context injection
  REQUIRED_FIELDS=$(echo "$RESULT" | jq -r '.anti_patterns[0] | has("anti_pattern") and has("solution") and has("severity") and has("relevance_score")')

  if [ "$REQUIRED_FIELDS" = "true" ]; then
    pass_test "Context injection format valid"

    # Show sample output
    echo "  Sample anti-pattern:"
    echo "$RESULT" | jq -r '.anti_patterns[0] | "    Severity: \(.severity // "N/A")\n    Relevance: \(.relevance_score // 0)\n    Pattern: \(.anti_pattern[:80] // "N/A")..."'
  else
    fail_test "Context injection format incomplete" "Missing required fields"
  fi
else
  fail_test "Context injection format test failed" "Exit code: $EXIT_CODE"
fi
echo ""

# Test 10: Performance Test
echo "Test 10: Performance Test"
START_TIME=$(date +%s%N)
"$QUERY_SCRIPT" "Complex multi-domain task with database, API, frontend, testing, and deployment" --limit 5 --format json > /dev/null 2>&1
END_TIME=$(date +%s%N)

DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))

if [ $DURATION_MS -lt 5000 ]; then
  pass_test "Query performance acceptable (${DURATION_MS}ms)"
else
  fail_test "Query performance slow" "${DURATION_MS}ms (expected <5000ms)"
fi
echo ""

# Final Summary
echo "=== Test Summary ==="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
