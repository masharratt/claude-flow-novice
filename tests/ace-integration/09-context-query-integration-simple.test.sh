#!/bin/bash
# ACE System Test: Context Query Integration (Simplified)
# Purpose: Validate domain-aware context retrieval
# Phase: 2.4 - Integration Testing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QUERY_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-ace-system/query-contexts.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0

echo "========================================"
echo "ACE System: Context Query Integration"
echo "========================================"
echo ""

# Test 1: Frontend task
echo "Test 1: Frontend task retrieval..."
RESULT=$(bash "$QUERY_SCRIPT" "Build React component library" --limit 3 --format json 2>&1)
DOMAIN=$(echo "$RESULT" | jq -r '.query.domains // "ERROR"')
COUNT=$(echo "$RESULT" | jq -r '.results.count // 0')

((TESTS_RUN++))
if [[ "$DOMAIN" == "frontend" ]]; then
  ((TESTS_PASSED++))
  echo "✓ Frontend domain detected"
else
  echo "✗ Expected frontend, got: $DOMAIN"
fi

((TESTS_RUN++))
if [[ "$COUNT" -gt 0 ]]; then
  ((TESTS_PASSED++))
  echo "✓ Frontend contexts returned ($COUNT)"
else
  echo "✗ No contexts returned"
fi

echo ""

# Test 2: Multi-domain task
echo "Test 2: Multi-domain task retrieval..."
RESULT2=$(bash "$QUERY_SCRIPT" "Implement JWT auth with React and PostgreSQL" --limit 5 --format json 2>&1)
DOMAINS=$(echo "$RESULT2" | jq -r '.query.domains // "ERROR"')
COUNT2=$(echo "$RESULT2" | jq -r '.results.count // 0')

((TESTS_RUN++))
if echo "$DOMAINS" | grep -qE "(backend|security|frontend)"; then
  ((TESTS_PASSED++))
  echo "✓ Multiple domains detected: $DOMAINS"
else
  echo "✗ Expected backend/security/frontend, got: $DOMAINS"
fi

((TESTS_RUN++))
if [[ "$COUNT2" -gt 1 ]]; then
  ((TESTS_PASSED++))
  echo "✓ Multiple contexts returned ($COUNT2)"
else
  echo "✗ Expected multiple results, got: $COUNT2"
fi

echo ""

# Test 3: Confidence filtering
echo "Test 3: Confidence filtering..."
RESULT_HIGH=$(bash "$QUERY_SCRIPT" "Build REST API" --limit 10 --min-confidence 0.95 --format json 2>&1)
RESULT_LOW=$(bash "$QUERY_SCRIPT" "Build REST API" --limit 10 --min-confidence 0.80 --format json 2>&1)
COUNT_HIGH=$(echo "$RESULT_HIGH" | jq -r '.results.count // 0')
COUNT_LOW=$(echo "$RESULT_LOW" | jq -r '.results.count // 0')

((TESTS_RUN++))
if [[ "$COUNT_LOW" -ge "$COUNT_HIGH" ]]; then
  ((TESTS_PASSED++))
  echo "✓ Lower threshold returns more results ($COUNT_LOW vs $COUNT_HIGH)"
else
  echo "✗ Expected low >= high, got: $COUNT_LOW vs $COUNT_HIGH"
fi

echo ""

# Test 4: Simple format
echo "Test 4: Simple format output..."
RESULT4=$(bash "$QUERY_SCRIPT" "Implement user auth" --limit 2 --format simple 2>&1)

((TESTS_RUN++))
if echo "$RESULT4" | grep -q "Query:"; then
  ((TESTS_PASSED++))
  echo "✓ Simple format includes query"
else
  echo "✗ Simple format missing query"
fi

((TESTS_RUN++))
if echo "$RESULT4" | grep -q "Domains:"; then
  ((TESTS_PASSED++))
  echo "✓ Simple format includes domains"
else
  echo "✗ Simple format missing domains"
fi

echo ""

# Performance test
echo "Performance Validation..."
START=$(date +%s%N)
bash "$QUERY_SCRIPT" "Build microservice" --limit 5 --format json > /dev/null 2>&1
END=$(date +%s%N)
DURATION_MS=$(( (END - START) / 1000000 ))

echo "Query time: ${DURATION_MS}ms"

((TESTS_RUN++))
if [[ "$DURATION_MS" -lt 5000 ]]; then
  ((TESTS_PASSED++))
  echo "✓ Performance acceptable (<5s)"
else
  echo "⚠ Slower than expected (${DURATION_MS}ms)"
fi

echo ""
echo "========================================"
echo "Summary: $TESTS_PASSED/$TESTS_RUN tests passed"
echo "========================================"

if [[ "$TESTS_PASSED" -eq "$TESTS_RUN" ]]; then
  echo "✓ All tests passed!"
  exit 0
else
  echo "✗ Some tests failed"
  exit 1
fi
