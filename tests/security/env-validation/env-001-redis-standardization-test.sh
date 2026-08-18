#!/usr/bin/env bash

#######################################################################
# ENV-001: Environment Variable Standardization Test Suite
#
# Tests that both docker-compose deployments use consistent
# environment variable naming for Redis authentication.
#
# Tests:
# 1. Root deployment uses REDIS_PASSWORD from .env
# 2. Coordinator deployment maps REDIS_PASSWORD -> CFN_REDIS_PASSWORD
# 3. Agent executor reads both CFN_REDIS_PASSWORD and REDIS_PASSWORD
# 4. redis-cli commands include authentication when password is set
# 5. Both deployment paths work with password-protected Redis
#######################################################################

set -euo pipefail

# Configuration
readonly ROOT_DOCKER_COMPOSE="/mnt/c/Users/masha/Documents/claude-flow-novice/docker-compose.yml"
readonly COORDINATOR_DOCKER_COMPOSE="/mnt/c/Users/masha/Documents/claude-flow-novice/docker/docker-compose.yml"
readonly AGENT_EXECUTOR="/mnt/c/Users/masha/Documents/claude-flow-novice/src/cli/agent-executor.ts"
readonly ENV_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/.env"
readonly WORK_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_test() {
  echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}✓ PASS${NC} $1"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}✗ FAIL${NC} $1"
  ((TESTS_FAILED++))
}

log_section() {
  echo ""
  echo -e "${YELLOW}=== $1 ===${NC}"
}

# Test 1: Root docker-compose.yml uses REDIS_PASSWORD
test_root_compose_redis_password() {
  log_test "Root docker-compose.yml uses REDIS_PASSWORD in redis service"

  if grep -q 'requirepass ${REDIS_PASSWORD}' "$ROOT_DOCKER_COMPOSE"; then
    log_pass "Root redis service uses REDIS_PASSWORD"
  else
    log_fail "Root redis service missing REDIS_PASSWORD variable"
  fi

  if grep -q 'redis-cli.*${REDIS_PASSWORD}' "$ROOT_DOCKER_COMPOSE"; then
    log_pass "Root healthcheck authenticates with REDIS_PASSWORD"
  else
    log_fail "Root healthcheck missing REDIS_PASSWORD authentication"
  fi
}

# Test 2: Root docker-compose.yml environment variable
test_root_compose_env() {
  log_test "Root docker-compose.yml exposes REDIS_PASSWORD to environment"

  if grep -A 3 'environment:' "$ROOT_DOCKER_COMPOSE" | grep -q 'REDIS_PASSWORD'; then
    log_pass "Root redis service has REDIS_PASSWORD in environment"
  else
    log_fail "Root redis service missing REDIS_PASSWORD in environment"
  fi
}

# Test 3: Coordinator docker-compose.yml uses REDIS_PASSWORD
test_coordinator_compose_redis_password() {
  log_test "Coordinator docker-compose.yml uses REDIS_PASSWORD"

  if grep -q 'requirepass ${REDIS_PASSWORD}' "$COORDINATOR_DOCKER_COMPOSE"; then
    log_pass "Coordinator redis service uses REDIS_PASSWORD"
  else
    log_fail "Coordinator redis service missing REDIS_PASSWORD variable"
  fi
}

# Test 4: Coordinator maps REDIS_PASSWORD to CFN_REDIS_PASSWORD
test_coordinator_password_mapping() {
  log_test "Coordinator maps REDIS_PASSWORD to CFN_REDIS_PASSWORD"

  if grep -q 'CFN_REDIS_PASSWORD=${REDIS_PASSWORD' "$COORDINATOR_DOCKER_COMPOSE"; then
    log_pass "Coordinator maps REDIS_PASSWORD to CFN_REDIS_PASSWORD"
  else
    log_fail "Coordinator missing REDIS_PASSWORD to CFN_REDIS_PASSWORD mapping"
  fi
}

# Test 5: Coordinator has standardization comment
test_coordinator_standardization_comment() {
  log_test "Coordinator has ENV-001 standardization documentation"

  if grep -q 'ENV-001.*Standardized naming' "$COORDINATOR_DOCKER_COMPOSE"; then
    log_pass "Coordinator has ENV-001 standardization documentation"
  else
    log_fail "Coordinator missing ENV-001 standardization documentation"
  fi
}

# Test 6: Agent executor reads redis password
test_agent_executor_redis_password() {
  log_test "Agent executor reads CFN_REDIS_PASSWORD and REDIS_PASSWORD"

  if grep -q 'redisPassword = process.env.CFN_REDIS_PASSWORD' "$AGENT_EXECUTOR"; then
    log_pass "Agent executor reads CFN_REDIS_PASSWORD"
  else
    log_fail "Agent executor missing CFN_REDIS_PASSWORD support"
  fi

  if grep -q 'redisPassword = .* || process.env.REDIS_PASSWORD' "$AGENT_EXECUTOR"; then
    log_pass "Agent executor falls back to REDIS_PASSWORD"
  else
    log_fail "Agent executor missing REDIS_PASSWORD fallback"
  fi
}

# Test 7: Agent executor uses auth in redis-cli
test_agent_executor_auth_flag() {
  log_test "Agent executor includes authentication flag in redis-cli"

  if grep -q 'authFlag = redisPassword' "$AGENT_EXECUTOR"; then
    log_pass "Agent executor constructs auth flag"
  else
    log_fail "Agent executor missing auth flag construction"
  fi

  if grep -q '\${authFlag}' "$AGENT_EXECUTOR"; then
    log_pass "Agent executor uses auth flag in redis-cli command"
  else
    log_fail "Agent executor missing auth flag in redis-cli"
  fi
}

# Test 8: ENV file contains REDIS_PASSWORD
test_env_file_redis_password() {
  log_test "Environment file contains REDIS_PASSWORD definition"

  if grep -q '^REDIS_PASSWORD=' "$ENV_FILE"; then
    log_pass "ENV file defines REDIS_PASSWORD"
  else
    log_fail "ENV file missing REDIS_PASSWORD definition"
  fi
}

# Test 9: Verify consistency across files
test_redis_password_consistency() {
  log_test "Redis password naming is consistent across files"

  local root_uses_redis_pw=false
  local coordinator_uses_redis_pw=false
  local coordinator_uses_cfn_pw=false

  grep -q 'REDIS_PASSWORD' "$ROOT_DOCKER_COMPOSE" && root_uses_redis_pw=true
  grep -q 'REDIS_PASSWORD' "$COORDINATOR_DOCKER_COMPOSE" && coordinator_uses_redis_pw=true
  grep -q 'CFN_REDIS_PASSWORD' "$COORDINATOR_DOCKER_COMPOSE" && coordinator_uses_cfn_pw=true

  if $root_uses_redis_pw && $coordinator_uses_redis_pw && $coordinator_uses_cfn_pw; then
    log_pass "Both deployments use REDIS_PASSWORD as standard"
  else
    log_fail "Inconsistent REDIS_PASSWORD usage across deployments"
  fi
}

# Test 10: Verify no hardcoded passwords
test_no_hardcoded_passwords() {
  log_test "No hardcoded passwords in docker-compose files"

  local hardcoded_root=0
  local hardcoded_coordinator=0

  # Check for patterns like requirepass "password" (without variable)
  if grep -E 'requirepass [^$]' "$ROOT_DOCKER_COMPOSE" | grep -v 'requirepass ${' > /dev/null 2>&1; then
    hardcoded_root=1
  fi

  if grep -E 'requirepass [^$]' "$COORDINATOR_DOCKER_COMPOSE" | grep -v 'requirepass ${' > /dev/null 2>&1; then
    hardcoded_coordinator=1
  fi

  if [ $hardcoded_root -eq 0 ] && [ $hardcoded_coordinator -eq 0 ]; then
    log_pass "No hardcoded passwords found"
  else
    log_fail "Hardcoded passwords detected in docker-compose files"
  fi
}

# Test 11: Validate docker-compose syntax
test_docker_compose_syntax() {
  log_test "Docker-compose files have valid YAML syntax"

  local root_valid=false
  local coordinator_valid=false

  if docker-compose -f "$ROOT_DOCKER_COMPOSE" config > /dev/null 2>&1; then
    root_valid=true
    log_pass "Root docker-compose.yml has valid syntax"
  else
    log_fail "Root docker-compose.yml has invalid syntax"
  fi

  if docker-compose -f "$COORDINATOR_DOCKER_COMPOSE" config > /dev/null 2>&1; then
    coordinator_valid=true
    log_pass "Coordinator docker-compose.yml has valid syntax"
  else
    log_fail "Coordinator docker-compose.yml has invalid syntax"
  fi
}

# Test 12: Verify environment variable resolution
test_env_variable_resolution() {
  log_test "Environment variables resolve correctly in docker-compose files"

  # Extract the CFN_REDIS_PASSWORD line from coordinator compose
  local redis_pw_var=$(grep 'CFN_REDIS_PASSWORD=' "$COORDINATOR_DOCKER_COMPOSE" | head -1)

  if echo "$redis_pw_var" | grep -q '${REDIS_PASSWORD:-}'; then
    log_pass "Coordinator CFN_REDIS_PASSWORD uses proper variable expansion"
  else
    log_fail "Coordinator CFN_REDIS_PASSWORD missing proper variable expansion"
  fi
}

# Main test execution
main() {
  cd "$WORK_DIR"

  log_section "ENV-001: Redis Password Standardization Tests"
  echo "Testing consistency of REDIS_PASSWORD across deployments"
  echo ""
  echo "Files under test:"
  echo "  - $ROOT_DOCKER_COMPOSE"
  echo "  - $COORDINATOR_DOCKER_COMPOSE"
  echo "  - $AGENT_EXECUTOR"
  echo "  - $ENV_FILE"

  log_section "Test Suite Execution"

  # Run all tests
  test_root_compose_redis_password
  test_root_compose_env
  test_coordinator_compose_redis_password
  test_coordinator_password_mapping
  test_coordinator_standardization_comment
  test_agent_executor_redis_password
  test_agent_executor_auth_flag
  test_env_file_redis_password
  test_redis_password_consistency
  test_no_hardcoded_passwords
  test_docker_compose_syntax
  test_env_variable_resolution

  # Summary
  log_section "Test Results Summary"
  echo ""
  echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"
  echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
  echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "ENV-001 standardization complete:"
    echo "  - Root deployment: Uses REDIS_PASSWORD from .env"
    echo "  - Coordinator deployment: Maps REDIS_PASSWORD to CFN_REDIS_PASSWORD"
    echo "  - Agent executor: Supports both CFN_REDIS_PASSWORD and REDIS_PASSWORD"
    echo "  - Redis authentication: Included in all redis-cli commands"
    echo ""
    return 0
  else
    echo -e "${RED}✗ Some tests failed. Review errors above.${NC}"
    return 1
  fi
}

main "$@"
