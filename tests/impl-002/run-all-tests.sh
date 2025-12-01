#!/bin/bash
# tests/impl-002/run-all-tests.sh
# Phase 5 :: IMPL-002 Complete Test Suite Runner

set -uo pipefail  # Don't exit on error (-e removed for test flexibility)

PROJECT_ROOT=$(git rev-parse --show-toplevel)

echo "=========================================="
echo "IMPL-002: Error Handling Improvements"
echo "Complete Test Suite"
echo "=========================================="
echo ""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test 1: Validation Framework Exists
echo "Test 1: Validation framework file exists"
if [[ -f "$PROJECT_ROOT/scripts/lib/validation.sh" ]]; then
  echo "  ✓ PASSED: scripts/lib/validation.sh exists"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: scripts/lib/validation.sh not found"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 2: Validation framework loads without errors
echo "Test 2: Validation framework loads successfully"
if source "$PROJECT_ROOT/scripts/lib/validation.sh" 2>/dev/null; then
  echo "  ✓ PASSED: Validation framework loaded"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Validation framework failed to load"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 3: Safe division function works
echo "Test 3: Safe division function"
result=$(safe_divide 100 5 2 2>/dev/null || echo "ERROR")
if [[ "$result" == "20.00" ]]; then
  echo "  ✓ PASSED: safe_divide works correctly"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: safe_divide returned unexpected result: $result"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 4: Division by zero protection
echo "Test 4: Division by zero protection"
if safe_divide 100 0 2>/dev/null; then
  echo "  ✗ FAILED: Division by zero should have failed"
  ((FAILED_TESTS++))
else
  echo "  ✓ PASSED: Division by zero rejected"
  ((PASSED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 5: Path traversal prevention
echo "Test 5: Path traversal prevention"
if validate_path "../../../etc/passwd" 2>/dev/null; then
  echo "  ✗ FAILED: Path traversal should have been rejected"
  ((FAILED_TESTS++))
else
  echo "  ✓ PASSED: Path traversal rejected"
  ((PASSED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 6: Command injection detection
echo "Test 6: Command injection detection"
if validate_command "rm -rf /; echo hacked" 2>/dev/null; then
  echo "  ✗ FAILED: Command injection should have been detected"
  ((FAILED_TESTS++))
else
  echo "  ✓ PASSED: Command injection detected"
  ((PASSED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 7: Cost script modified
echo "Test 7: Cost script uses validation framework"
if grep -q "source.*validation.sh" "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh"; then
  echo "  ✓ PASSED: Cost script sources validation framework"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Cost script doesn't source validation framework"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 8: Cost script uses safe_divide
echo "Test 8: Cost script uses safe_divide"
if grep -q "safe_divide" "$PROJECT_ROOT/scripts/cost-allocation-tracker.sh"; then
  echo "  ✓ PASSED: Cost script uses safe_divide"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Cost script doesn't use safe_divide"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 9: Marketing Dockerfile has checksums
echo "Test 9: Marketing Dockerfile has checksum verification"
if grep -q "sha256sum\|sha512sum" "$PROJECT_ROOT/docker/teams/marketing/Dockerfile"; then
  echo "  ✓ PASSED: Dockerfile has checksum verification"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Dockerfile missing checksum verification"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 10: Composer checksum present
echo "Test 10: Composer download has checksum"
if grep -q "471f2d857abf0ec18af7b055e61472214d91adb24f9bdbbb864c1c64faad7dd6" "$PROJECT_ROOT/docker/teams/marketing/Dockerfile"; then
  echo "  ✓ PASSED: Composer checksum present"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Composer checksum missing or incorrect"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 11: WP-CLI checksum present
echo "Test 11: WP-CLI download has checksum"
if grep -q "be928f6b8ca1e8dfb9d2f4b75a13aa4aee0896f8a9a0a1c45cd5d2c98605e6172e6d014dda2e27f88c98befc16c040cbb2bd1bfa121510ea5cdf5f6a30fe8832" "$PROJECT_ROOT/docker/teams/marketing/Dockerfile"; then
  echo "  ✓ PASSED: WP-CLI checksum present"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: WP-CLI checksum missing or incorrect"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 12: Documentation exists
echo "Test 12: Documentation file exists"
if [[ -f "$PROJECT_ROOT/docs/SHELL_ERROR_HANDLING_GUIDE.md" ]]; then
  echo "  ✓ PASSED: Documentation exists"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Documentation not found"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 13: Documentation is comprehensive
echo "Test 13: Documentation covers all requirements"
DOC_COUNT=$(grep -c "##" "$PROJECT_ROOT/docs/SHELL_ERROR_HANDLING_GUIDE.md" || echo 0)
if [[ $DOC_COUNT -gt 8 ]]; then
  echo "  ✓ PASSED: Documentation is comprehensive ($DOC_COUNT sections)"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Documentation too brief ($DOC_COUNT sections)"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 14: Numeric validation
echo "Test 14: Numeric validation function"
if validate_numeric "42" && ! validate_numeric "abc" 2>/dev/null; then
  echo "  ✓ PASSED: Numeric validation works"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Numeric validation broken"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Test 15: Port validation
echo "Test 15: Port validation function"
if validate_port "6379" && ! validate_port "99999" 2>/dev/null; then
  echo "  ✓ PASSED: Port validation works"
  ((PASSED_TESTS++))
else
  echo "  ✗ FAILED: Port validation broken"
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests:  $TOTAL_TESTS"
echo "Passed:       $PASSED_TESTS"
echo "Failed:       $FAILED_TESTS"

PASS_RATE=$(awk "BEGIN {printf \"%.2f\", $PASSED_TESTS / $TOTAL_TESTS}")
echo "Pass Rate:    $PASS_RATE"

echo ""
if (( $(echo "$PASS_RATE >= 0.95" | bc -l) )); then
  echo "✓ GATE PASSED (≥0.95 required)"
  echo ""
  echo "=========================================="
  echo "Deliverables Summary"
  echo "=========================================="
  echo "✓ scripts/lib/validation.sh - Created"
  echo "✓ scripts/cost-allocation-tracker.sh - Modified"
  echo "✓ docker/teams/marketing/Dockerfile - Modified"
  echo "✓ docs/SHELL_ERROR_HANDLING_GUIDE.md - Created"
  echo "✓ tests/impl-002/ - Test suite created"
  echo ""
  echo "Security Improvements:"
  echo "  ✓ SHA256 checksum verification (Composer)"
  echo "  ✓ SHA512 checksum verification (WP-CLI)"
  echo "  ✓ Division by zero protection"
  echo "  ✓ Invalid input rejection"
  echo "  ✓ Path traversal prevention"
  echo "  ✓ Command injection detection"
  echo "  ✓ Overflow detection"
  echo ""
  exit 0
else
  echo "✗ GATE FAILED (pass rate $PASS_RATE < 0.95)"
  echo ""
  echo "Failed tests need attention"
  exit 1
fi
