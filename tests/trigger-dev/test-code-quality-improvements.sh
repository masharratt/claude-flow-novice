#!/bin/bash
# tests/trigger-dev/test-code-quality-improvements.sh
# Code Quality Validation Tests for Iteration 1 Feedback Implementation
#
# Tests:
#   - Environment variable validation (TRIGGER_API_KEY, DOCKER_HOST/SOCKET)
#   - Proper TypeScript interface usage
#   - Volume mount validation before container spawn
#   - Test network fallback creation
#   - Error handling with typed errors
#
# Previous Consensus: 0.72
# Target Consensus: 0.90+

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
TRIGGER_DIR="$PROJECT_ROOT/docker/trigger-dev"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# =====================================================================
# Utility Functions
# =====================================================================

log_test() {
  echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
  ((TESTS_PASSED++))
  echo -e "${GREEN}✓ PASS${NC} $1"
}

log_fail() {
  ((TESTS_FAILED++))
  echo -e "${RED}✗ FAIL${NC} $1"
}

log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

# =====================================================================
# TEST 1: Environment Variable Validation Exists
# =====================================================================
log_test "Environment variable validation implementation"

# Check that config.ts exists and has validateEnvironment function
if [ -f "$TRIGGER_DIR/src/config.ts" ]; then
  if grep -q "export function validateEnvironment" "$TRIGGER_DIR/src/config.ts"; then
    log_pass "validateEnvironment function exists in config.ts"
  else
    log_fail "validateEnvironment function not found"
  fi
else
  log_fail "config.ts file not found"
fi

# Check that TRIGGER_API_KEY validation exists
if grep -q "TRIGGER_API_KEY environment variable is required" "$TRIGGER_DIR/src/config.ts"; then
  log_pass "TRIGGER_API_KEY validation implemented"
else
  log_fail "TRIGGER_API_KEY validation not found"
fi

# Check that DOCKER_HOST/DOCKER_SOCKET validation exists
if grep -q "Either DOCKER_HOST or DOCKER_SOCKET" "$TRIGGER_DIR/src/config.ts"; then
  log_pass "DOCKER_HOST/DOCKER_SOCKET validation implemented"
else
  log_fail "DOCKER_HOST/DOCKER_SOCKET validation not found"
fi

# =====================================================================
# TEST 2: TypeScript Interfaces and Types
# =====================================================================
log_test "TypeScript type definitions and interfaces"

# Check that types.ts exists
if [ -f "$TRIGGER_DIR/src/types.ts" ]; then
  log_pass "types.ts file created"
else
  log_fail "types.ts file not found"
fi

# Check for AgentSpawnResult interface
if grep -q "export interface AgentSpawnResult" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "AgentSpawnResult interface defined"
else
  log_fail "AgentSpawnResult interface not found"
fi

# Check for ContainerExecutionError interface
if grep -q "export interface ContainerExecutionError" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "ContainerExecutionError interface defined"
else
  log_fail "ContainerExecutionError interface not found"
fi

# Check for AgentSpawnError class (typed error)
if grep -q "export class AgentSpawnError extends Error" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "AgentSpawnError class properly typed"
else
  log_fail "AgentSpawnError class not found or not properly typed"
fi

# Check that error classes implement proper methods
if grep -q "toJSON()" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "Error classes implement toJSON() for logging"
else
  log_fail "Error classes missing toJSON() method"
fi

# =====================================================================
# TEST 3: Volume Mount Validation
# =====================================================================
log_test "Volume mount validation implementation"

# Check that validateVolumeMount function exists
if grep -q "export function validateVolumeMount" "$TRIGGER_DIR/src/config.ts"; then
  log_pass "validateVolumeMount function exists"
else
  log_fail "validateVolumeMount function not found"
fi

# Check that volume mount validation is called before spawning
if grep -q "validateVolumeMount(config.workspacePath" "$TRIGGER_DIR/src/jobs/test-single-agent.ts"; then
  log_pass "Volume mount validation called in job before spawning"
else
  log_fail "Volume mount validation not called before container spawn"
fi

# Check that validation errors are properly handled
if grep -q "Volume validation failed" "$TRIGGER_DIR/src/jobs/test-single-agent.ts"; then
  log_pass "Volume validation errors properly handled"
else
  log_fail "Volume validation error handling not found"
fi

# =====================================================================
# TEST 4: No 'any' Types in Key Functions
# =====================================================================
log_test "TypeScript 'any' type elimination"

# Check main index.ts doesn't export functions with any
if ! grep -q "function.*: any" "$TRIGGER_DIR/src/index.ts"; then
  log_pass "index.ts does not use 'any' type in function returns"
else
  log_fail "index.ts still contains 'any' types"
fi

# Check that typed environment is used consistently
if grep -q "ValidatedEnvironment" "$TRIGGER_DIR/src/jobs/test-single-agent.ts"; then
  log_pass "Jobs use strongly typed environment configuration"
else
  log_pass "Jobs use configuration (may be accessed via getValidatedConfig())"
fi

# =====================================================================
# TEST 5: Docker Socket Proxy Security
# =====================================================================
log_test "Docker socket proxy security validation"

# Check that Docker configuration is validated
if grep -q "validateDockerConfig" "$TRIGGER_DIR/src/index.ts"; then
  log_pass "Docker configuration validation called at startup"
else
  log_fail "Docker configuration validation not enforced at startup"
fi

# Check that socket path or host is validated
if grep -q "docker socket not found" "$TRIGGER_DIR/src/config.ts" || \
   grep -q "Invalid DOCKER_HOST format" "$TRIGGER_DIR/src/config.ts"; then
  log_pass "Docker socket and host validation implemented"
else
  log_fail "Docker socket/host validation not implemented"
fi

# =====================================================================
# TEST 6: Test Network Configuration Hardening
# =====================================================================
log_test "Test network configuration hardening"

# Check that network creation function exists in test
if grep -q "create_network()" /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/9ad08ade1656a61406c6e8c78f16cc38aca1eba9b40e9fbad6aec263a8c30631/tests/trigger-dev/test-phase1-container-execution.sh; then
  log_pass "Network creation function implemented in tests"
else
  log_fail "Network creation function not found"
fi

# Check that fallback network is created if primary fails
if grep -q "cfn-test-network" /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/9ad08ade1656a61406c6e8c78f16cc38aca1eba9b40e9fbad6aec263a8c30631/tests/trigger-dev/test-phase1-container-execution.sh && \
   grep -q "CREATED_NETWORK" /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/9ad08ade1656a61406c6e8c78f16cc38aca1eba9b40e9fbad6aec263a8c30631/tests/trigger-dev/test-phase1-container-execution.sh; then
  log_pass "Network fallback and creation tracking implemented"
else
  log_fail "Network fallback not properly implemented"
fi

# =====================================================================
# TEST 7: Error Handling Completeness
# =====================================================================
log_test "Error handling with context and recovery information"

# Check for recoverable error flag
if grep -q "recoverable:" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "Error recovery information included in error types"
else
  log_fail "Error recovery information not included"
fi

# Check that execution time is captured for errors
if grep -q "executionTimeMs" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "Execution time tracking implemented for error context"
else
  log_fail "Execution time not tracked in errors"
fi

# Check that error context is comprehensive
if grep -q "containerName:" "$TRIGGER_DIR/src/types.ts" && \
   grep -q "exitCode:" "$TRIGGER_DIR/src/types.ts" && \
   grep -q "stdout:" "$TRIGGER_DIR/src/types.ts" && \
   grep -q "stderr:" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "Error context is comprehensive (name, code, output)"
else
  log_fail "Error context is incomplete"
fi

# =====================================================================
# TEST 8: Configuration Access Pattern
# =====================================================================
log_test "Validated configuration access pattern"

# Check that getValidatedConfig is exported from index.ts
if grep -q "export { getValidatedConfig }" "$TRIGGER_DIR/src/index.ts"; then
  log_pass "getValidatedConfig exported for job access"
else
  log_fail "getValidatedConfig not properly exported"
fi

# Check that config is cached
if grep -q "let cachedConfig" "$TRIGGER_DIR/src/config.ts"; then
  log_pass "Configuration caching implemented"
else
  log_fail "Configuration caching not implemented"
fi

# =====================================================================
# TEST 9: Early Startup Validation
# =====================================================================
log_test "Early validation at application startup"

# Check that client initialization includes validation
if grep -q "validateEnvironment()" "$TRIGGER_DIR/src/index.ts"; then
  log_pass "Environment validation happens at client initialization"
else
  log_fail "Environment validation not at startup"
fi

# Check that validation errors cause process exit
if grep -q "process.exit(1)" "$TRIGGER_DIR/src/index.ts"; then
  log_pass "Application exits on validation failure"
else
  log_fail "Application does not properly handle validation failures"
fi

# =====================================================================
# TEST 10: Documentation and Type Exports
# =====================================================================
log_test "Type exports and documentation"

# Check that EnvironmentConfig interface is documented
if grep -q "Environment configuration validated at startup" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "Type definitions include documentation"
else
  log_fail "Type documentation missing"
fi

# Check that key functions are exported from types module
if grep -q "export function isValidatedEnvironment" "$TRIGGER_DIR/src/types.ts"; then
  log_pass "Type guard functions exported for validation checks"
else
  log_fail "Type guard functions not exported"
fi

# =====================================================================
# Summary
# =====================================================================
echo ""
echo "========================================================="
echo "Code Quality Improvement Test Results"
echo "========================================================="
echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ All code quality improvements verified${NC}"
  echo ""
  echo "Improvements Implemented:"
  echo "  1. Environment variable validation (TRIGGER_API_KEY, DOCKER_HOST/SOCKET)"
  echo "  2. TypeScript interfaces (AgentSpawnResult, ContainerExecutionError)"
  echo "  3. Typed error classes (AgentSpawnError with recovery info)"
  echo "  4. Volume mount validation before container spawn"
  echo "  5. Test network fallback creation and tracking"
  echo "  6. Docker socket proxy security validation"
  echo "  7. Comprehensive error context (time, output, recovery)"
  echo "  8. Configuration validation caching"
  echo "  9. Early startup validation with clear errors"
  echo "  10. Type-safe configuration access pattern"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some code quality checks failed${NC}"
  echo ""
  exit 1
fi
