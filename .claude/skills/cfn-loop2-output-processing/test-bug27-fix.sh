#!/bin/bash
set -e

# BUG #27 FIX TEST: Validate enhanced validator output processing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSE_SCRIPT="$SCRIPT_DIR/parse-feedback.sh"

echo "=========================================="
echo "BUG #27 FIX: Validator Output Processing Tests"
echo "=========================================="
echo ""

PASSED=0
FAILED=0

# Test Case 1: Structured output with explicit confidence
echo "[TEST 1] Structured output with explicit confidence"
MOCK_OUTPUT='## Validation Confidence: 0.87

### CRITICAL Issues
- Missing error handling in invoke-gate-ack.sh:88
- Security vulnerability in auth module

### WARNING Issues
- Inconsistent naming convention in test file
- Missing JSDoc comments

### SUGGESTION Items
- Consider adding retry backoff strategy
- Could use Promise.all for parallel operations'

CONFIDENCE=$("$PARSE_SCRIPT" --extract-confidence "$MOCK_OUTPUT")
FEEDBACK=$("$PARSE_SCRIPT" --extract-feedback "$MOCK_OUTPUT")

if [ "$CONFIDENCE" = "0.87" ]; then
  echo "✅ PASS: Confidence correctly parsed as 0.87"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected 0.87, got $CONFIDENCE"
  FAILED=$((FAILED + 1))
fi

CRITICAL_COUNT=$(echo "$FEEDBACK" | jq '.critical | length')
WARNING_COUNT=$(echo "$FEEDBACK" | jq '.warnings | length')
SUGGESTION_COUNT=$(echo "$FEEDBACK" | jq '.suggestions | length')

if [ "$CRITICAL_COUNT" -eq 2 ] && [ "$WARNING_COUNT" -eq 2 ] && [ "$SUGGESTION_COUNT" -eq 2 ]; then
  echo "✅ PASS: Feedback counts correct (2C/2W/2S)"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected 2C/2W/2S, got ${CRITICAL_COUNT}C/${WARNING_COUNT}W/${SUGGESTION_COUNT}S"
  FAILED=$((FAILED + 1))
fi

echo ""

# Test Case 2: Default output pattern (0.70 confidence, zero feedback)
echo "[TEST 2] Default output pattern detection"
MOCK_OUTPUT_DEFAULT='The code looks good. Confidence: 0.70'

CONFIDENCE=$("$PARSE_SCRIPT" --extract-confidence "$MOCK_OUTPUT_DEFAULT")
FEEDBACK=$("$PARSE_SCRIPT" --extract-feedback "$MOCK_OUTPUT_DEFAULT")

TOTAL_FEEDBACK=$(echo "$FEEDBACK" | jq '.critical + .warnings + .suggestions | length')

if [ "$CONFIDENCE" = "0.70" ] && [ "$TOTAL_FEEDBACK" -eq 0 ]; then
  echo "✅ PASS: Default pattern detected (0.70 + 0 feedback)"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Pattern detection failed ($CONFIDENCE confidence, $TOTAL_FEEDBACK feedback)"
  FAILED=$((FAILED + 1))
fi

echo ""

# Test Case 3: Percentage-based confidence
echo "[TEST 3] Percentage confidence parsing"
MOCK_OUTPUT_PERCENT='Overall validation: 92%

### CRITICAL Issues
- Missing input validation

### WARNING Issues
- No issues found

### SUGGESTION Items
- Improve documentation'

CONFIDENCE=$("$PARSE_SCRIPT" --extract-confidence "$MOCK_OUTPUT_PERCENT")

if [ "$CONFIDENCE" = ".92" ]; then
  echo "✅ PASS: Percentage converted to decimal (0.92)"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected .92, got $CONFIDENCE"
  FAILED=$((FAILED + 1))
fi

FEEDBACK=$("$PARSE_SCRIPT" --extract-feedback "$MOCK_OUTPUT_PERCENT")
CRITICAL_COUNT=$(echo "$FEEDBACK" | jq '.critical | length')

if [ "$CRITICAL_COUNT" -eq 1 ]; then
  echo "✅ PASS: Critical issue extracted from percentage output"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected 1 critical, got $CRITICAL_COUNT"
  FAILED=$((FAILED + 1))
fi

echo ""

# Test Case 4: Qualitative confidence
echo "[TEST 4] Qualitative confidence mapping"
MOCK_OUTPUT_QUAL='Validation complete with high confidence.

### CRITICAL Issues
- No issues found

### WARNING Issues
- Minor style inconsistencies

### SUGGESTION Items
- Add unit tests'

CONFIDENCE=$("$PARSE_SCRIPT" --extract-confidence "$MOCK_OUTPUT_QUAL")

if [ "$CONFIDENCE" = "0.90" ]; then
  echo "✅ PASS: 'high confidence' mapped to 0.90"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected 0.90, got $CONFIDENCE"
  FAILED=$((FAILED + 1))
fi

echo ""

# Test Case 5: No confidence found (should default to 0.0 for detection)
echo "[TEST 5] Missing confidence detection"
MOCK_OUTPUT_NONE='Review complete.

Some issues found:
- Missing tests
- No documentation'

CONFIDENCE=$("$PARSE_SCRIPT" --extract-confidence "$MOCK_OUTPUT_NONE")

if [ "$CONFIDENCE" = "0.0" ]; then
  echo "✅ PASS: Missing confidence returns 0.0 for detection"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected 0.0, got $CONFIDENCE"
  FAILED=$((FAILED + 1))
fi

echo ""

# Test Case 6: Unstructured feedback extraction
echo "[TEST 6] Unstructured feedback extraction"
MOCK_OUTPUT_UNSTRUCTURED='Validation Confidence: 0.82

Critical: Missing error handling in line 88
Warning: Inconsistent variable naming
Suggestion: Add more comments'

CONFIDENCE=$("$PARSE_SCRIPT" --extract-confidence "$MOCK_OUTPUT_UNSTRUCTURED")
FEEDBACK=$("$PARSE_SCRIPT" --extract-feedback "$MOCK_OUTPUT_UNSTRUCTURED")

CRITICAL_COUNT=$(echo "$FEEDBACK" | jq '.critical | length')
WARNING_COUNT=$(echo "$FEEDBACK" | jq '.warnings | length')
SUGGESTION_COUNT=$(echo "$FEEDBACK" | jq '.suggestions | length')

if [ "$CONFIDENCE" = "0.82" ]; then
  echo "✅ PASS: Confidence parsed from unstructured format"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected 0.82, got $CONFIDENCE"
  FAILED=$((FAILED + 1))
fi

if [ "$CRITICAL_COUNT" -ge 1 ] && [ "$WARNING_COUNT" -ge 1 ] && [ "$SUGGESTION_COUNT" -ge 1 ]; then
  echo "✅ PASS: Feedback extracted from unstructured format (${CRITICAL_COUNT}C/${WARNING_COUNT}W/${SUGGESTION_COUNT}S)"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected at least 1C/1W/1S, got ${CRITICAL_COUNT}C/${WARNING_COUNT}W/${SUGGESTION_COUNT}S"
  FAILED=$((FAILED + 1))
fi

echo ""
echo "=========================================="
echo "Test Results: $PASSED passed, $FAILED failed"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
