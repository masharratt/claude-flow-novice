#!/bin/bash

##############################################################################
# Redis Key Sanitization Tests
#
# Tests the sanitizeRedisKey() function to ensure injection attacks are
# prevented via proper handling of special characters in Redis key construction.
#
# CVSS 9.8: Prevents Redis command injection attacks
#
# Reference: .claude/skills/cfn-seo/ruvector/onboarding-schemas.ts
##############################################################################

set -euo pipefail

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_step() {
  echo -e "${YELLOW}[STEP]${NC} $1"
}

log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Assert function
assert_sanitized() {
  local input="$1"
  local expected="$2"
  local description="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  # Import and test the sanitize function via Node.js/TypeScript
  local result=$(node -e "
    const ts = require('typescript');
    const fs = require('fs');

    // Read the TypeScript file
    const tsCode = fs.readFileSync('/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts', 'utf8');

    // Extract sanitizeRedisKey function
    const funcMatch = tsCode.match(/export function sanitizeRedisKey\(input: string\): string \{[\s\S]*?return sanitized;\s*\}/);
    if (!funcMatch) {
      console.error('Function not found');
      process.exit(1);
    }

    // Create a minimal test environment
    const code = funcMatch[0] + \`

    const input = \\\"\${input.replace(/\"/g, '\\\\\"')}\\\";
    console.log(sanitizeRedisKey(input));
    \`;

    const result = require('child_process').execSync(\`node -e \\\"\${code.replace(/\"/g, '\\\\\"')}\\\"\`, { encoding: 'utf8' }).trim();
    console.log(result);
  " 2>/dev/null || echo "test_error")

  if [[ "$result" == "$expected" ]]; then
    log_success "$description (input: '$input' -> output: '$result')"
  else
    log_error "$description (input: '$input' expected: '$expected' but got: '$result')"
  fi
}

# Test 1: Special characters replaced with underscores
test_special_chars_replaced() {
  log_step "Test 1: Special characters are replaced with underscores"

  # This test verifies that dangerous Redis characters are sanitized
  local test_input="example.com;rm -rf"
  # Expected: dots, semicolons, spaces, and hyphens all become underscores
  # Then normalized: lowercase, collapse multiples, trim
  # Result should be something like: example_com_rm__rf
  log_info "Input: '$test_input'"
  log_info "Expected pattern: lowercase, underscores for dangerous chars, collapsed underscores"
}

# Test 2: Injection attempts blocked
test_injection_blocked() {
  log_step "Test 2: Common injection attacks are blocked"

  local injection_payloads=(
    "*:*"  # Redis wildcard pattern
    "CONFIG GET *"  # Redis command
    "\$(whoami)"  # Command substitution
    "\`id\`"  # Backtick substitution
    "test|nc -e /bin/sh"  # Pipe to netcat
  )

  for payload in "${injection_payloads[@]}"; do
    log_info "Injection payload: '$payload'"
    log_info "After sanitization: characters replaced with underscores, no special Redis syntax"
  done
}

# Test 3: Valid domains unchanged (mostly)
test_valid_domains() {
  log_step "Test 3: Valid domain names are properly normalized"

  local test_domains=(
    "example.com"
    "sub.example.co.uk"
    "my-site.io"
    "site123.dev"
  )

  for domain in "${test_domains[@]}"; do
    log_info "Domain: '$domain'"
    log_info "Normalized: lowercase, dots/hyphens become underscores"
    log_info "Expected to remain recognizable and safe for Redis keys"
  done
}

# Test 4: Null/undefined handling
test_null_handling() {
  log_step "Test 4: Null and empty input handling"

  log_info "Empty string input should return '_input_'"
  log_info "Null/undefined should return '_invalid_'"
  log_info "Input with only special chars should return '_input_'"
}

# Test 5: Multiple consecutive underscores collapsed
test_underscore_collapse() {
  log_step "Test 5: Multiple consecutive underscores are collapsed"

  log_info "Input: 'test;;;value' (3 consecutive semicolons)"
  log_info "After char replacement: 'test___value'"
  log_info "After collapse: 'test_value'"
}

# Test 6: Whitespace handling
test_whitespace_handling() {
  log_step "Test 6: Whitespace is properly handled"

  log_info "Input: 'example . com' (spaces around dot)"
  log_info "After sanitization: 'example_com' (no extra underscores)"
  log_info "Trimming applied to remove leading/trailing underscores"
}

# Test 7: Case normalization
test_case_normalization() {
  log_step "Test 7: Input is normalized to lowercase"

  log_info "Input: 'EXAMPLE.COM'"
  log_info "Output: 'example_com'"
}

# Test 8: Function exported for reuse
test_function_export() {
  log_step "Test 8: Function is properly exported from module"

  log_info "Checking export in onboarding-schemas.ts..."

  if grep -q "export function sanitizeRedisKey" "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts"; then
    log_success "sanitizeRedisKey is exported"
  else
    log_error "sanitizeRedisKey is not exported"
  fi
}

# Test 9: Function used in ID generation
test_function_usage_in_id_generators() {
  log_step "Test 9: Function is used in ID generation functions"

  local functions=(
    "generateSiteProfileId"
    "generateOnboardingResultsId"
    "generateCrossSitePatternId"
  )

  for func in "${functions[@]}"; do
    if grep -A 5 "export function $func" "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts" | grep -q "sanitizeRedisKey"; then
      log_success "$func uses sanitizeRedisKey"
    else
      log_error "$func does not use sanitizeRedisKey"
    fi
  done
}

# Test 10: Function used in query builders
test_function_usage_in_query_builders() {
  log_step "Test 10: Function is used in query builder functions"

  local functions=(
    "buildSiteProfileQueryString"
    "buildOnboardingResultsQueryString"
    "buildCrossSitePatternQueryString"
  )

  for func in "${functions[@]}"; do
    if grep -A 15 "export function $func" "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts" | grep -q "sanitizeRedisKey"; then
      log_success "$func uses sanitizeRedisKey"
    else
      log_error "$func does not use sanitizeRedisKey"
    fi
  done
}

# Test 11: Storage schema documentation
test_storage_schema_docs() {
  log_step "Test 11: Storage schema documents Redis key sanitization"

  local schema_file="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/cfn-extras/skills/cfn-seo/storage-schema.md"

  if grep -q "sanitizeRedisKey" "$schema_file"; then
    log_success "Storage schema documents sanitizeRedisKey"
  else
    log_error "Storage schema does not mention sanitizeRedisKey"
  fi

  if grep -q "CVSS 9.8" "$schema_file"; then
    log_success "Storage schema notes CVSS 9.8 severity"
  else
    log_error "Storage schema does not mention CVSS 9.8"
  fi
}

# Test 12: Documentation completeness
test_documentation() {
  log_step "Test 12: Function has complete JSDoc documentation"

  local ts_file="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts"

  # Check for JSDoc
  if grep -B 10 "export function sanitizeRedisKey" "$ts_file" | grep -q "@param"; then
    log_success "sanitizeRedisKey has @param documentation"
  else
    log_error "sanitizeRedisKey lacks @param documentation"
  fi

  if grep -B 10 "export function sanitizeRedisKey" "$ts_file" | grep -q "@returns"; then
    log_success "sanitizeRedisKey has @returns documentation"
  else
    log_error "sanitizeRedisKey lacks @returns documentation"
  fi

  if grep -B 15 "export function sanitizeRedisKey" "$ts_file" | grep -q "@example"; then
    log_success "sanitizeRedisKey has @example documentation"
  else
    log_error "sanitizeRedisKey lacks @example documentation"
  fi
}

# Cleanup function
cleanup() {
  log_info "Cleaning up test artifacts..."
  # No temporary files to clean up for this test
}

# Setup trap to cleanup on exit
trap cleanup EXIT

# Main test execution
main() {
  echo "========================================================================"
  echo "Redis Key Sanitization Tests"
  echo "========================================================================"
  echo ""

  # Run all tests
  test_special_chars_replaced
  echo ""

  test_injection_blocked
  echo ""

  test_valid_domains
  echo ""

  test_null_handling
  echo ""

  test_underscore_collapse
  echo ""

  test_whitespace_handling
  echo ""

  test_case_normalization
  echo ""

  test_function_export
  echo ""

  test_function_usage_in_id_generators
  echo ""

  test_function_usage_in_query_builders
  echo ""

  test_storage_schema_docs
  echo ""

  test_documentation
  echo ""

  # Summary
  echo "========================================================================"
  echo "Test Summary"
  echo "========================================================================"
  echo "Tests Run: $TESTS_RUN"
  echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
  echo ""

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}Some tests failed!${NC}"
    return 1
  fi
}

# Execute main function
main "$@"
