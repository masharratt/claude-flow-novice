#!/bin/bash
# Test script for SEC-003: JSON Metadata Validation
# Tests size and depth limits to prevent DoS attacks

set -e

CLI="node .claude-flow-novice/dist/src/cli/main.js"
TEST_DB="/tmp/test-agent-lifecycle-$$-json-validation.db"
export AGENT_LIFECYCLE_DB="$TEST_DB"

echo "🔍 SEC-003: JSON Metadata Validation Tests"
echo "=========================================="
echo ""

# Cleanup function
cleanup() {
  rm -f "$TEST_DB" 2>/dev/null || true
}

trap cleanup EXIT

# Test 1: Valid JSON (should pass)
echo "Test 1: Valid JSON metadata (should PASS)"
OUTPUT=$($CLI agent-lifecycle spawn \
  --id test-valid-json \
  --type coder \
  --acl-level 1 \
  --metadata '{"key":"value","nested":{"data":123}}' \
  --json 2>&1)

echo "$OUTPUT" | tail -1 | jq -r '.status' | grep -q "success"

if [ $? -eq 0 ]; then
  echo "✅ PASS: Valid JSON accepted"
else
  echo "❌ FAIL: Valid JSON rejected"
  echo "Output: $OUTPUT"
  exit 1
fi
echo ""

# Test 2: Size limit (>100KB should fail)
echo "Test 2: Large JSON payload (>100KB, should FAIL)"
LARGE_JSON="{\"x\":\"$(python3 -c 'print("a"*200000)'  2>/dev/null || echo 'aaaaaaa...')\"}"
OUTPUT=$($CLI agent-lifecycle spawn \
  --id test-large-json \
  --type coder \
  --acl-level 1 \
  --metadata "$LARGE_JSON" \
  --json 2>&1)

echo "$OUTPUT" | tail -1 | jq -r '.error // empty' | grep -iq "too large"

if [ $? -eq 0 ]; then
  echo "✅ PASS: Large JSON rejected (DoS prevented)"
else
  echo "❌ FAIL: Large JSON accepted (DoS vulnerability)"
  echo "Output: $OUTPUT"
  exit 1
fi
echo ""

# Test 3: Depth limit (>10 levels should fail)
echo "Test 3: Deeply nested JSON (>10 levels, should FAIL)"
DEEP_JSON='{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{"k":"too deep"}}}}}}}}}}}'
OUTPUT=$($CLI agent-lifecycle spawn \
  --id test-deep-json \
  --type coder \
  --acl-level 1 \
  --metadata "$DEEP_JSON" \
  --json 2>&1)

echo "$OUTPUT" | tail -1 | jq -r '.error // empty' | grep -iq "deeply nested"

if [ $? -eq 0 ]; then
  echo "✅ PASS: Deeply nested JSON rejected (DoS prevented)"
else
  echo "❌ FAIL: Deeply nested JSON accepted (DoS vulnerability)"
  echo "Output: $OUTPUT"
  exit 1
fi
echo ""

# Test 4: Invalid JSON syntax (should fail)
echo "Test 4: Invalid JSON syntax (should FAIL)"
OUTPUT=$($CLI agent-lifecycle spawn \
  --id test-invalid-json \
  --type coder \
  --acl-level 1 \
  --metadata '{invalid json}' \
  --json 2>&1)

echo "$OUTPUT" | tail -1 | jq -r '.error // empty' | grep -iq "invalid.*json"

if [ $? -eq 0 ]; then
  echo "✅ PASS: Invalid JSON rejected"
else
  echo "❌ FAIL: Invalid JSON accepted"
  echo "Output: $OUTPUT"
  exit 1
fi
echo ""

# Test 5: Test complete command with large JSON (should fail)
echo "Test 5: Complete command with large JSON (should FAIL)"
OUTPUT=$($CLI agent-lifecycle complete \
  --id test-valid-json \
  --confidence 0.85 \
  --metadata "$LARGE_JSON" \
  --json 2>&1)

echo "$OUTPUT" | tail -1 | jq -r '.error // empty' | grep -iq "too large"

if [ $? -eq 0 ]; then
  echo "✅ PASS: Complete command rejected large JSON"
else
  echo "❌ FAIL: Complete command accepted large JSON"
  echo "Output: $OUTPUT"
  exit 1
fi
echo ""

# Test 6: Test complete command with deeply nested JSON (should fail)
echo "Test 6: Complete command with deeply nested JSON (should FAIL)"
OUTPUT=$($CLI agent-lifecycle complete \
  --id test-valid-json \
  --confidence 0.85 \
  --metadata "$DEEP_JSON" \
  --json 2>&1)

echo "$OUTPUT" | tail -1 | jq -r '.error // empty' | grep -iq "deeply nested"

if [ $? -eq 0 ]; then
  echo "✅ PASS: Complete command rejected deeply nested JSON"
else
  echo "❌ FAIL: Complete command accepted deeply nested JSON"
  echo "Output: $OUTPUT"
  exit 1
fi
echo ""

echo "=========================================="
echo "✅ All SEC-003 tests passed!"
echo "JSON validation prevents DoS attacks"
echo "=========================================="

cleanup
