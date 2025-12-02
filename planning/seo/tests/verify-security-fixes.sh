#!/bin/bash
# verification script for P4-S2 deferred security fixes

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
PATTERN_SYNC_FILE="$PROJECT_ROOT/planning/seo/lib/pattern-sync.ts"

echo "=========================================="
echo "P4-S2 Security Fixes Verification"
echo "=========================================="
echo ""

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Fix #1: Safe JSON parsing
echo "[Test 1] Verifying safe JSON parsing helper exists..."
if grep -q "function safeJSONParse" "$PATTERN_SYNC_FILE"; then
    echo "✓ safeJSONParse helper function found"
    ((TESTS_PASSED++))
else
    echo "✗ safeJSONParse helper function NOT found"
    ((TESTS_FAILED++))
fi

if grep -q "safeJSONParse<any\[\]>(data.evidence" "$PATTERN_SYNC_FILE"; then
    echo "✓ evidence parsing uses safeJSONParse"
    ((TESTS_PASSED++))
else
    echo "✗ evidence parsing does NOT use safeJSONParse"
    ((TESTS_FAILED++))
fi

if grep -q "safeJSONParse<any>(data.metadata" "$PATTERN_SYNC_FILE"; then
    echo "✓ metadata parsing uses safeJSONParse"
    ((TESTS_PASSED++))
else
    echo "✗ metadata parsing does NOT use safeJSONParse"
    ((TESTS_FAILED++))
fi

# Fix #2: Redis SCAN migration
echo ""
echo "[Test 2] Verifying Redis SCAN implementation..."
if grep -q "async function\* scanPatterns" "$PATTERN_SYNC_FILE"; then
    echo "✓ scanPatterns generator function found"
    ((TESTS_PASSED++))
else
    echo "✗ scanPatterns generator function NOT found"
    ((TESTS_FAILED++))
fi

if grep -q "for await (const key of scanPatterns(redis" "$PATTERN_SYNC_FILE"; then
    echo "✓ SCAN used in pullPatternsFromGlobal"
    ((TESTS_PASSED++))
else
    echo "✗ SCAN NOT used in pullPatternsFromGlobal"
    ((TESTS_FAILED++))
fi

if grep -q "for await (const key of scanPatterns(redis" "$PATTERN_SYNC_FILE" | grep -c "for await" | grep -q "2"; then
    echo "✓ SCAN used in pushPatternsToGlobal"
    ((TESTS_PASSED++))
else
    # Check separately for push
    if grep -A 20 "pushPatternsToGlobal" "$PATTERN_SYNC_FILE" | grep -q "for await (const key of scanPatterns"; then
        echo "✓ SCAN used in pushPatternsToGlobal"
        ((TESTS_PASSED++))
    else
        echo "✗ SCAN NOT used in pushPatternsToGlobal"
        ((TESTS_FAILED++))
    fi
fi

# Verify no blocking KEYS command in critical paths
if grep -n "redis.keys(" "$PATTERN_SYNC_FILE" | grep -v "Fix #2"; then
    echo "✗ Blocking redis.keys() still found in code"
    ((TESTS_FAILED++))
else
    echo "✓ No blocking redis.keys() in pull/push functions"
    ((TESTS_PASSED++))
fi

# Fix #3: Pattern type whitelist
echo ""
echo "[Test 3] Verifying pattern type whitelist..."
if grep -q "const VALID_PATTERN_TYPES = new Set" "$PATTERN_SYNC_FILE"; then
    echo "✓ VALID_PATTERN_TYPES whitelist defined"
    ((TESTS_PASSED++))
else
    echo "✗ VALID_PATTERN_TYPES whitelist NOT defined"
    ((TESTS_FAILED++))
fi

if grep -q "function validatePatternTypes" "$PATTERN_SYNC_FILE"; then
    echo "✓ validatePatternTypes function found"
    ((TESTS_PASSED++))
else
    echo "✗ validatePatternTypes function NOT found"
    ((TESTS_FAILED++))
fi

if grep -q "options.patternTypes = validatePatternTypes(options.patternTypes)" "$PATTERN_SYNC_FILE"; then
    echo "✓ Pattern type validation applied in pull"
    ((TESTS_PASSED++))
else
    echo "✗ Pattern type validation NOT applied in pull"
    ((TESTS_FAILED++))
fi

if grep -A 50 "pushPatternsToGlobal" "$PATTERN_SYNC_FILE" | grep -q "validatePatternTypes"; then
    echo "✓ Pattern type validation applied in push"
    ((TESTS_PASSED++))
else
    echo "✗ Pattern type validation NOT applied in push"
    ((TESTS_FAILED++))
fi

# TypeScript compilation check
echo ""
echo "[Test 4] TypeScript compilation..."
if npx tsc "$PATTERN_SYNC_FILE" --noEmit --skipLibCheck 2>&1; then
    echo "✓ TypeScript compilation successful"
    ((TESTS_PASSED++))
else
    echo "✗ TypeScript compilation failed"
    ((TESTS_FAILED++))
fi

# Summary
echo ""
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "✓ All security fixes verified successfully!"
    exit 0
else
    echo "✗ Some verification tests failed"
    exit 1
fi
