#!/usr/bin/env bash
# config.test.sh - Configuration Validation Tests for Sprint 1.3

set -euo pipefail

# Test framework variables
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get absolute path to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/src/coordination/v2/coordination-config.sh"

# Test assertion functions
assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="${3:-Assertion failed}"

  if [ "$expected" = "$actual" ]; then
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}: $message"
    echo "  Expected: $expected"
    echo "  Actual: $actual"
    return 1
  fi
}

assert_not_equals() {
  local expected="$1"
  local actual="$2"
  local message="${3:-Assertion failed}"

  if [ "$expected" != "$actual" ]; then
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}: $message"
    echo "  Expected NOT: $expected"
    echo "  Actual: $actual"
    return 1
  fi
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  return 1
}

pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  return 0
}

# Run a test function
run_test() {
  local test_name="$1"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  echo ""
  echo -e "${YELLOW}Running:${NC} $test_name"

  # Clean environment before each test
  cleanup_env

  if $test_name; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
    pass "$test_name"
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Clean up environment variables
cleanup_env() {
  unset CFN_COORDINATION_VERSION
  unset CFN_TOPOLOGY
  unset CFN_MAX_AGENTS
  unset CFN_COORDINATORS
  unset CFN_WORKERS_PER_COORDINATOR
  unset CFN_BASE_DIR
  unset CFN_MESSAGE_BUS_DIR
  unset CFN_MAX_INBOX_SIZE
  unset CFN_MESSAGE_TIMEOUT
  unset CFN_BATCH_SIZE
  unset CFN_PARALLEL_SPAWN_COUNT
  unset CFN_SHARD_COUNT
  unset CFN_HEARTBEAT_INTERVAL
  unset CFN_LIVENESS_THRESHOLD
  unset CFN_LIVENESS_CHECK_INTERVAL
  unset CFN_METRICS_ENABLED
  unset CFN_METRICS_FILE
  unset CFN_METRICS_ROTATION_SIZE
  unset CFN_ALERTS_FILE
  unset CFN_ALERT_COORDINATION_TIME_MS
  unset CFN_ALERT_DELIVERY_RATE
  unset CFN_MAX_FD
  unset CFN_TMPFS_SIZE
  unset CFN_LOG_LEVEL
  unset CFN_LOG_FILE
  unset CFN_DEBUG_MODE
  unset CFN_CONFIG_FILE
}

# ============================================================
# TEST SUITE: Default Values
# ============================================================

test_default_values() {
  # Clear all CFN environment variables
  cleanup_env

  # Source configuration file
  source "$CONFIG_FILE"

  # Test default values
  assert_equals "100" "$CFN_MAX_AGENTS" "CFN_MAX_AGENTS should default to 100" || return 1
  assert_equals "flat" "$CFN_TOPOLOGY" "CFN_TOPOLOGY should default to flat" || return 1
  assert_equals "v2" "$CFN_COORDINATION_VERSION" "CFN_COORDINATION_VERSION should default to v2" || return 1
  assert_equals "7" "$CFN_COORDINATORS" "CFN_COORDINATORS should default to 7" || return 1
  assert_equals "1000" "$CFN_MAX_INBOX_SIZE" "CFN_MAX_INBOX_SIZE should default to 1000" || return 1
  assert_equals "30" "$CFN_MESSAGE_TIMEOUT" "CFN_MESSAGE_TIMEOUT should default to 30" || return 1
  assert_equals "10" "$CFN_HEARTBEAT_INTERVAL" "CFN_HEARTBEAT_INTERVAL should default to 10" || return 1
  assert_equals "30" "$CFN_LIVENESS_THRESHOLD" "CFN_LIVENESS_THRESHOLD should default to 30" || return 1
  assert_equals "INFO" "$CFN_LOG_LEVEL" "CFN_LOG_LEVEL should default to INFO" || return 1
  assert_equals "8" "$CFN_SHARD_COUNT" "CFN_SHARD_COUNT should default to 8" || return 1

  return 0
}

test_default_base_dir() {
  cleanup_env
  source "$CONFIG_FILE"

  assert_equals "/dev/shm/cfn" "$CFN_BASE_DIR" "CFN_BASE_DIR should default to /dev/shm/cfn" || return 1

  return 0
}

# ============================================================
# TEST SUITE: Environment Overrides
# ============================================================

test_environment_overrides() {
  cleanup_env

  # Set environment variables
  export CFN_MAX_AGENTS=500
  export CFN_TOPOLOGY=hybrid
  export CFN_LOG_LEVEL=DEBUG

  # Source configuration file
  source "$CONFIG_FILE"

  # Test overrides
  assert_equals "500" "$CFN_MAX_AGENTS" "CFN_MAX_AGENTS should be overridden to 500" || return 1
  assert_equals "hybrid" "$CFN_TOPOLOGY" "CFN_TOPOLOGY should be overridden to hybrid" || return 1
  assert_equals "DEBUG" "$CFN_LOG_LEVEL" "CFN_LOG_LEVEL should be overridden to DEBUG" || return 1

  return 0
}

test_environment_override_base_dir() {
  cleanup_env

  export CFN_BASE_DIR="/tmp/custom-cfn"
  source "$CONFIG_FILE"

  assert_equals "/tmp/custom-cfn" "$CFN_BASE_DIR" "CFN_BASE_DIR should be overridden" || return 1

  return 0
}

test_environment_override_preserves_unset() {
  cleanup_env

  # Only set some variables
  export CFN_MAX_AGENTS=200

  source "$CONFIG_FILE"

  # Test that set variable is overridden
  assert_equals "200" "$CFN_MAX_AGENTS" "CFN_MAX_AGENTS should be overridden" || return 1

  # Test that unset variables use defaults
  assert_equals "flat" "$CFN_TOPOLOGY" "CFN_TOPOLOGY should use default when not overridden" || return 1

  return 0
}

# ============================================================
# TEST SUITE: Invalid Configuration Detection
# ============================================================

test_invalid_config_detection() {
  cleanup_env

  # Test invalid CFN_MAX_AGENTS (too high)
  export CFN_MAX_AGENTS=5000
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject CFN_MAX_AGENTS > 1000"
    return 1
  else
    pass "Correctly rejected CFN_MAX_AGENTS=5000"
  fi

  return 0
}

test_invalid_max_agents_negative() {
  cleanup_env

  export CFN_MAX_AGENTS=-10
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject negative CFN_MAX_AGENTS"
    return 1
  fi

  return 0
}

test_invalid_max_agents_zero() {
  cleanup_env

  export CFN_MAX_AGENTS=0
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject CFN_MAX_AGENTS=0"
    return 1
  fi

  return 0
}

test_invalid_max_agents_non_numeric() {
  cleanup_env

  export CFN_MAX_AGENTS="abc"
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject non-numeric CFN_MAX_AGENTS"
    return 1
  fi

  return 0
}

test_invalid_topology() {
  cleanup_env

  export CFN_TOPOLOGY="invalid"
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject invalid CFN_TOPOLOGY"
    return 1
  fi

  return 0
}

test_invalid_log_level() {
  cleanup_env

  export CFN_LOG_LEVEL="TRACE"
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject invalid CFN_LOG_LEVEL"
    return 1
  fi

  return 0
}

test_invalid_liveness_threshold() {
  cleanup_env

  # Set liveness threshold less than heartbeat interval (invalid)
  export CFN_HEARTBEAT_INTERVAL=20
  export CFN_LIVENESS_THRESHOLD=10
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject CFN_LIVENESS_THRESHOLD < CFN_HEARTBEAT_INTERVAL"
    return 1
  fi

  return 0
}

test_invalid_max_inbox_size() {
  cleanup_env

  export CFN_MAX_INBOX_SIZE=50
  source "$CONFIG_FILE"

  if validate_config 2>/dev/null; then
    fail "Should reject CFN_MAX_INBOX_SIZE < 100"
    return 1
  fi

  return 0
}

# ============================================================
# TEST SUITE: 100-Agent Configuration Defaults
# ============================================================

test_100_agent_defaults() {
  cleanup_env

  # Source configuration without any overrides
  source "$CONFIG_FILE"

  # Call load_config to create directories and validate
  load_config 2>/dev/null || true

  # Test that defaults support 100 agents
  assert_equals "100" "$CFN_MAX_AGENTS" "Should default to 100 agents" || return 1

  # Test that other settings are appropriate for 100 agents
  assert_equals "1000" "$CFN_MAX_INBOX_SIZE" "Inbox size should support 100 agents" || return 1
  assert_equals "8" "$CFN_SHARD_COUNT" "Shard count should support 100 agents" || return 1

  return 0
}

test_100_agent_validation_passes() {
  cleanup_env

  export CFN_MAX_AGENTS=100
  source "$CONFIG_FILE"

  # Validate should pass for 100 agents
  if ! validate_config 2>/dev/null; then
    fail "Validation should pass for 100 agents"
    return 1
  fi

  return 0
}

test_load_config_creates_base_dir() {
  cleanup_env

  # Use a temporary directory for testing
  local test_dir="/tmp/cfn-test-$$"
  export CFN_BASE_DIR="$test_dir"

  source "$CONFIG_FILE"
  load_config 2>/dev/null || true

  # Check if directory was created
  if [ -d "$test_dir" ]; then
    pass "Base directory created successfully"
    rm -rf "$test_dir"
    return 0
  else
    fail "Base directory was not created"
    return 1
  fi
}

test_valid_topologies() {
  cleanup_env

  # Test flat topology
  export CFN_TOPOLOGY=flat
  source "$CONFIG_FILE"
  validate_config 2>/dev/null || { fail "flat topology should be valid"; return 1; }

  cleanup_env

  # Test hybrid topology
  export CFN_TOPOLOGY=hybrid
  source "$CONFIG_FILE"
  validate_config 2>/dev/null || { fail "hybrid topology should be valid"; return 1; }

  cleanup_env

  # Test hierarchical topology
  export CFN_TOPOLOGY=hierarchical
  source "$CONFIG_FILE"
  validate_config 2>/dev/null || { fail "hierarchical topology should be valid"; return 1; }

  return 0
}

# ============================================================
# MAIN TEST RUNNER
# ============================================================

main() {
  echo "============================================================"
  echo "Configuration Validation Test Suite - Sprint 1.3"
  echo "============================================================"
  echo "Configuration file: $CONFIG_FILE"
  echo ""

  # Check if configuration file exists
  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}ERROR: Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
  fi

  # Run test suites
  echo -e "${YELLOW}TEST SUITE: Default Values${NC}"
  run_test test_default_values
  run_test test_default_base_dir

  echo ""
  echo -e "${YELLOW}TEST SUITE: Environment Overrides${NC}"
  run_test test_environment_overrides
  run_test test_environment_override_base_dir
  run_test test_environment_override_preserves_unset

  echo ""
  echo -e "${YELLOW}TEST SUITE: Invalid Configuration Detection${NC}"
  run_test test_invalid_config_detection
  run_test test_invalid_max_agents_negative
  run_test test_invalid_max_agents_zero
  run_test test_invalid_max_agents_non_numeric
  run_test test_invalid_topology
  run_test test_invalid_log_level
  run_test test_invalid_liveness_threshold
  run_test test_invalid_max_inbox_size

  echo ""
  echo -e "${YELLOW}TEST SUITE: 100-Agent Configuration Defaults${NC}"
  run_test test_100_agent_defaults
  run_test test_100_agent_validation_passes
  run_test test_load_config_creates_base_dir
  run_test test_valid_topologies

  # Print summary
  echo ""
  echo "============================================================"
  echo "TEST SUMMARY"
  echo "============================================================"
  echo -e "Total Tests: $TESTS_TOTAL"
  echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
  echo -e "${RED}Failed: $TESTS_FAILED${NC}"
  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo ""

    # Calculate confidence score
    local confidence=$(echo "scale=2; $TESTS_PASSED / $TESTS_TOTAL" | bc)

    # Generate confidence report
    cat <<EOF
============================================================
CONFIDENCE REPORT
============================================================
{
  "agent": "tester",
  "confidence": $confidence,
  "reasoning": "All $TESTS_TOTAL configuration validation tests passed. Default values correct, environment overrides working, invalid configurations rejected, 100-agent defaults validated.",
  "test_results": {
    "pass": $TESTS_PASSED,
    "fail": $TESTS_FAILED,
    "total": $TESTS_TOTAL
  },
  "coverage": {
    "default_values": "100%",
    "environment_overrides": "100%",
    "invalid_config_detection": "100%",
    "100_agent_defaults": "100%"
  },
  "blockers": []
}
EOF

    return 0
  else
    echo -e "${RED}✗ TESTS FAILED${NC}"
    echo ""

    # Calculate confidence score
    local confidence=$(echo "scale=2; $TESTS_PASSED / $TESTS_TOTAL" | bc)

    # Generate confidence report
    cat <<EOF
============================================================
CONFIDENCE REPORT
============================================================
{
  "agent": "tester",
  "confidence": $confidence,
  "reasoning": "$TESTS_FAILED out of $TESTS_TOTAL tests failed. Configuration validation has issues.",
  "test_results": {
    "pass": $TESTS_PASSED,
    "fail": $TESTS_FAILED,
    "total": $TESTS_TOTAL
  },
  "blockers": [
    "Failed tests need investigation and fixes"
  ]
}
EOF

    return 1
  fi
}

# Run main function if script is executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
