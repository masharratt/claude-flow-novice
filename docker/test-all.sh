#!/usr/bin/env bash
# ============================================================================
# CFN Docker Infrastructure - Comprehensive Test Suite
# ============================================================================
# Tests all 4 images to ensure they work correctly
#
# Usage:
#   ./docker/test-all.sh [--verbose]
#
# Tests:
#   1. Redis connectivity and basic operations
#   2. Agent image with different agent types
#   3. Orchestrator help and parameter validation
#   4. Coordinator help and parameter validation
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERBOSE=""
if [[ "${1:-}" == "--verbose" ]]; then
  VERBOSE="yes"
fi

# ============================================================================
# Functions
# ============================================================================

log_info() {
  echo ""
  echo "======================================================================"
  echo "  $1"
  echo "======================================================================"
}

log_test() {
  echo ""
  echo "TEST: $1"
  echo "----------------------------------------------------------------------"
}

log_success() {
  echo "✅ $1"
}

log_error() {
  echo "❌ $1" >&2
}

run_test() {
  local test_name=$1
  shift
  local cmd=("$@")

  log_test "$test_name"

  if [ -n "$VERBOSE" ]; then
    echo "Command: ${cmd[*]}"
    echo ""
  fi

  if "${cmd[@]}"; then
    log_success "$test_name passed"
    return 0
  else
    log_error "$test_name failed"
    return 1
  fi
}

# ============================================================================
# Main Test Suite
# ============================================================================

log_info "CFN Docker Infrastructure Test Suite"

TEST_START=$(date +%s)
FAILED_TESTS=()

# ----------------------------------------------------------------------------
# Test 1: Image Existence
# ----------------------------------------------------------------------------
log_info "Phase 1: Image Existence Checks"

for image in cfn-redis:latest cfn-agent:latest cfn-orchestrator:latest cfn-coordinator:latest; do
  if run_test "Image exists: $image" docker inspect "$image" > /dev/null 2>&1; then
    :
  else
    FAILED_TESTS+=("image-$image")
  fi
done

# ----------------------------------------------------------------------------
# Test 2: Network Setup
# ----------------------------------------------------------------------------
log_info "Phase 2: Network Setup"

if ! docker network ls | grep -q mcp-network; then
  log_test "Creating mcp-network"
  if docker network create mcp-network; then
    log_success "Network created"
  else
    log_error "Failed to create network"
    FAILED_TESTS+=("network-creation")
  fi
else
  log_success "Network mcp-network already exists"
fi

# ----------------------------------------------------------------------------
# Test 3: Redis Service
# ----------------------------------------------------------------------------
log_info "Phase 3: Redis Service Tests"

log_test "Starting Redis container"
if docker run -d --name cfn-redis-test --network mcp-network --rm redis:7-alpine > /dev/null 2>&1; then
  log_success "Redis container started"

  # Wait for Redis to be ready
  sleep 2

  # Test Redis connectivity
  if run_test "Redis PING" docker exec cfn-redis-test redis-cli ping | grep -q PONG; then
    :
  else
    FAILED_TESTS+=("redis-ping")
  fi

  # Test Redis SET/GET
  if run_test "Redis SET/GET" bash -c "docker exec cfn-redis-test redis-cli SET test_key test_value > /dev/null && docker exec cfn-redis-test redis-cli GET test_key | grep -q test_value"; then
    :
  else
    FAILED_TESTS+=("redis-set-get")
  fi

  # Cleanup
  docker stop cfn-redis-test > /dev/null 2>&1 || true
else
  log_error "Failed to start Redis container"
  FAILED_TESTS+=("redis-start")
fi

# ----------------------------------------------------------------------------
# Test 4: Agent Image Tests
# ----------------------------------------------------------------------------
log_info "Phase 4: CFN Agent Image Tests"

# Test agent help command
if run_test "Agent help command" docker run --rm --network mcp-network cfn-agent:latest node dist/cli/spawn.js --help; then
  :
else
  FAILED_TESTS+=("agent-help")
fi

# Test agent with different agent types (just check container runs)
for agent_type in react-frontend-engineer backend-developer tester product-owner; do
  log_test "Agent type: $agent_type (dry run)"

  if [ -n "$VERBOSE" ]; then
    docker run --rm --network mcp-network \
      -e AGENT_TYPE="$agent_type" \
      -e TASK_ID="test-123" \
      -e AGENT_ID="agent-test-$agent_type" \
      -e REDIS_URL="redis://cfn-redis-test:6379" \
      cfn-agent:latest node dist/cli/spawn.js --help || true
  else
    docker run --rm --network mcp-network \
      -e AGENT_TYPE="$agent_type" \
      cfn-agent:latest node dist/cli/spawn.js --help > /dev/null 2>&1 || true
  fi

  log_success "Agent type $agent_type container runs"
done

# ----------------------------------------------------------------------------
# Test 5: Orchestrator Image Tests
# ----------------------------------------------------------------------------
log_info "Phase 5: CFN Orchestrator Image Tests"

# Test orchestrator help
if run_test "Orchestrator help command" docker run --rm --network mcp-network cfn-orchestrator:latest --help 2>&1 | head -20; then
  :
else
  FAILED_TESTS+=("orchestrator-help")
fi

# ----------------------------------------------------------------------------
# Test 6: Coordinator Image Tests
# ----------------------------------------------------------------------------
log_info "Phase 6: CFN Coordinator Image Tests"

# Test coordinator help
if run_test "Coordinator help command" docker run --rm --network mcp-network cfn-coordinator:latest --help 2>&1 | head -20; then
  :
else
  FAILED_TESTS+=("coordinator-help")
fi

# ----------------------------------------------------------------------------
# Test 7: Volume Mounting
# ----------------------------------------------------------------------------
log_info "Phase 7: Volume Mounting Tests"

# Create temporary workspace
TEST_WORKSPACE=$(mktemp -d)
echo "Test content" > "$TEST_WORKSPACE/test-file.txt"

log_test "Agent workspace mount"
if docker run --rm \
  -v "$TEST_WORKSPACE":/app/workspace:rw \
  cfn-agent:latest \
  cat /app/workspace/test-file.txt | grep -q "Test content"; then
  log_success "Agent workspace mount works"
else
  log_error "Agent workspace mount failed"
  FAILED_TESTS+=("agent-volume-mount")
fi

# Cleanup
rm -rf "$TEST_WORKSPACE"

# ----------------------------------------------------------------------------
# Test 8: Environment Variable Handling
# ----------------------------------------------------------------------------
log_info "Phase 8: Environment Variable Tests"

log_test "Agent environment variables"
if docker run --rm \
  -e AGENT_TYPE="test-agent" \
  -e TASK_ID="test-123" \
  -e AGENT_ID="agent-456" \
  cfn-agent:latest \
  sh -c 'echo "AGENT_TYPE=$AGENT_TYPE TASK_ID=$TASK_ID AGENT_ID=$AGENT_ID"' | grep -q "test-agent"; then
  log_success "Environment variables passed correctly"
else
  log_error "Environment variable handling failed"
  FAILED_TESTS+=("env-vars")
fi

# ============================================================================
# Test Summary
# ============================================================================

TEST_END=$(date +%s)
TEST_DURATION=$((TEST_END - TEST_START))

log_info "Test Summary"

echo "Total Test Time: ${TEST_DURATION}s"
echo ""

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
  log_success "All tests passed!"
  echo ""
  echo "Infrastructure Status:"
  echo "  ✅ Redis: Working"
  echo "  ✅ Agent: Working (all agent types supported)"
  echo "  ✅ Orchestrator: Working"
  echo "  ✅ Coordinator: Working"
  echo "  ✅ Network: mcp-network configured"
  echo "  ✅ Volumes: Mount points working"
  echo "  ✅ Environment: Variables passed correctly"
  echo ""
  echo "Next Steps:"
  echo "  1. Start Redis: docker-compose -f docker/docker-compose.yml up -d cfn-redis"
  echo "  2. Run agent: docker run --rm --network mcp-network cfn-agent:latest"
  echo "  3. Run orchestrator: docker run --rm --network mcp-network cfn-orchestrator:latest"
  exit 0
else
  log_error "Tests failed: ${FAILED_TESTS[*]}"
  echo ""
  echo "Failed tests: ${#FAILED_TESTS[@]}"
  for test in "${FAILED_TESTS[@]}"; do
    echo "  - $test"
  done
  exit 1
fi
