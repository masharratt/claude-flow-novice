#!/usr/bin/env bash
# Configuration System Tests - Sprint 1.3
# Tests coordination-config.sh validation and functionality

set -euo pipefail

# Source configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../../config/coordination-config.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $*"
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $*"
}

# Test framework
start_test() {
  local test_name="$1"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  log_info "Test #$TESTS_TOTAL: $test_name"
}

assert_success() {
  local message="$1"
  log_success "$message"
  TESTS_PASSED=$((TESTS_PASSED + 1))
  return 0
}

assert_failure() {
  local message="$1"
  log_error "$message"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  return 1
}

# Test 1: Configuration file exists and is executable
test_config_exists() {
  start_test "Configuration file exists and is executable"

  if [ ! -f "$CONFIG_FILE" ]; then
    assert_failure "Configuration file not found: $CONFIG_FILE"
    return
  fi

  if [ ! -x "$CONFIG_FILE" ]; then
    assert_failure "Configuration file not executable: $CONFIG_FILE"
    return
  fi

  assert_success "Configuration file exists and is executable"
}

# Test 2: Default configuration loads successfully
test_default_config() {
  start_test "Default configuration loads successfully"

  if bash "$CONFIG_FILE" > /dev/null 2>&1; then
    assert_success "Default configuration loaded successfully"
  else
    assert_failure "Default configuration failed to load"
  fi
}

# Test 3: Environment variable overrides work
test_env_overrides() {
  start_test "Environment variable overrides work"

  local output
  output=$(CFN_MAX_AGENTS=200 CFN_SHARD_COUNT=32 bash "$CONFIG_FILE" 2>&1)

  if echo "$output" | grep -q "Max Agents:.*200"; then
    if echo "$output" | grep -q "Shard Count:.*32"; then
      assert_success "Environment variable overrides applied correctly"
      return
    fi
  fi

  assert_failure "Environment variable overrides not applied"
}

# Test 4: Validation rejects invalid CFN_MAX_AGENTS
test_invalid_max_agents() {
  start_test "Validation rejects invalid CFN_MAX_AGENTS"

  # Test too high using bash -c to preserve environment
  local output
  output=$(bash -c "export CFN_MAX_AGENTS=2000 && bash \"$CONFIG_FILE\" 2>&1")

  if echo "$output" | grep -q "ERROR.*CFN_MAX_AGENTS"; then
    assert_success "Validation rejected CFN_MAX_AGENTS=2000 (too high)"
  else
    assert_failure "Validation failed to reject invalid CFN_MAX_AGENTS"
  fi
}

# Test 5: Validation rejects invalid CFN_SHARD_COUNT
test_invalid_shard_count() {
  start_test "Validation rejects invalid CFN_SHARD_COUNT"

  # Test too high using bash -c
  local output
  output=$(bash -c "export CFN_SHARD_COUNT=100 && bash \"$CONFIG_FILE\" 2>&1")

  if echo "$output" | grep -q "ERROR.*CFN_SHARD_COUNT"; then
    assert_success "Validation rejected CFN_SHARD_COUNT=100 (too high)"
  else
    assert_failure "Validation failed to reject invalid CFN_SHARD_COUNT"
  fi
}

# Test 6: Validation rejects invalid boolean values
test_invalid_boolean() {
  start_test "Validation rejects invalid boolean values"

  local output
  output=$(bash -c "export CFN_METRICS_ENABLED=yes && bash \"$CONFIG_FILE\" 2>&1")

  if echo "$output" | grep -q "ERROR.*CFN_METRICS_ENABLED"; then
    assert_success "Validation rejected invalid boolean value 'yes'"
  else
    assert_failure "Validation failed to reject invalid boolean"
  fi
}

# Test 7: All required directories are created
test_directory_creation() {
  start_test "Required directories are created"

  # Clean up test directories
  local test_base="/tmp/cfn-config-test-$$"
  rm -rf "$test_base"

  # Run with custom base directory
  if CFN_BASE_DIR="$test_base" bash "$CONFIG_FILE" > /dev/null 2>&1; then
    if [ -d "$test_base/metrics" ] && [ -d "$test_base/health" ] && [ -d "$test_base/alerts" ]; then
      rm -rf "$test_base"
      assert_success "All required directories created"
      return
    fi
  fi

  rm -rf "$test_base"
  assert_failure "Directory creation failed"
}

# Test 8: Configuration can be sourced
test_config_sourcing() {
  start_test "Configuration can be sourced in scripts"

  local test_script="/tmp/test-source-$$.sh"
  cat > "$test_script" <<'EOF'
#!/bin/bash
source config/coordination-config.sh
if [ "$CFN_MAX_AGENTS" = "100" ]; then
  echo "SOURCED_OK"
fi
EOF

  chmod +x "$test_script"
  cd "$SCRIPT_DIR/../.." || exit 1

  if bash "$test_script" 2>&1 | grep -q "SOURCED_OK"; then
    rm -f "$test_script"
    assert_success "Configuration sourced successfully in script"
  else
    rm -f "$test_script"
    assert_failure "Configuration sourcing failed"
  fi
}

# Test 9: Print configuration output
test_print_config() {
  start_test "Configuration prints formatted output"

  local output
  output=$(bash "$CONFIG_FILE" 2>&1)

  local required_sections=(
    "CLI Coordination Configuration:"
    "STORAGE:"
    "PERFORMANCE:"
    "TIMEOUTS"
    "MONITORING:"
    "THRESHOLDS:"
    "RETENTION"
  )

  local missing_sections=()
  for section in "${required_sections[@]}"; do
    if ! echo "$output" | grep -q "$section"; then
      missing_sections+=("$section")
    fi
  done

  if [ ${#missing_sections[@]} -eq 0 ]; then
    assert_success "All configuration sections present in output"
  else
    assert_failure "Missing sections: ${missing_sections[*]}"
  fi
}

# Test 10: Numeric range validation
test_numeric_ranges() {
  start_test "Numeric range validation enforces limits"

  local tests_passed=0
  local tests_total=0

  # Test minimum values
  tests_total=$((tests_total + 1))
  if bash -c "export CFN_MAX_AGENTS=0 && bash \"$CONFIG_FILE\" 2>&1" | grep -q "ERROR"; then
    tests_passed=$((tests_passed + 1))
  fi

  tests_total=$((tests_total + 1))
  if bash -c "export CFN_COORDINATION_TIMEOUT=50 && bash \"$CONFIG_FILE\" 2>&1" | grep -q "ERROR"; then
    tests_passed=$((tests_passed + 1))
  fi

  tests_total=$((tests_total + 1))
  if bash -c "export CFN_ALERT_INTERVAL=0 && bash \"$CONFIG_FILE\" 2>&1" | grep -q "ERROR"; then
    tests_passed=$((tests_passed + 1))
  fi

  if [ $tests_passed -eq $tests_total ]; then
    assert_success "Numeric range validation enforces minimum values ($tests_passed/$tests_total)"
  else
    assert_failure "Numeric range validation failed ($tests_passed/$tests_total)"
  fi
}

# Print test summary
print_test_summary() {
  echo ""
  echo "========================================"
  echo "         TEST SUMMARY"
  echo "========================================"
  echo "Total Tests:    $TESTS_TOTAL"
  echo -e "Tests Passed:   ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Tests Failed:   ${RED}$TESTS_FAILED${NC}"

  if [ $TESTS_TOTAL -gt 0 ]; then
    local success_rate=$(echo "scale=2; ($TESTS_PASSED / $TESTS_TOTAL) * 100" | bc)
    echo "Success Rate:   ${success_rate}%"
  fi

  echo "========================================"
  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    log_success "All configuration tests passed!"
    return 0
  else
    log_error "$TESTS_FAILED test(s) failed"
    return 1
  fi
}

# Main test execution
main() {
  echo "========================================"
  echo "   Configuration System Tests"
  echo "   Sprint 1.3 - Phase 1"
  echo "========================================"
  echo ""

  # Run tests
  test_config_exists
  echo ""

  test_default_config
  echo ""

  test_env_overrides
  echo ""

  test_invalid_max_agents
  echo ""

  test_invalid_shard_count
  echo ""

  test_invalid_boolean
  echo ""

  test_directory_creation
  echo ""

  test_config_sourcing
  echo ""

  test_print_config
  echo ""

  test_numeric_ranges
  echo ""

  # Summary
  print_test_summary
  local exit_code=$?

  exit $exit_code
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
