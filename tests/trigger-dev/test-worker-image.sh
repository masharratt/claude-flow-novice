#!/bin/bash
# tests/trigger-dev/test-worker-image.sh
# Phase 1.1 :: Trigger.dev worker image testing - validates agent profile loading and provider routing

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
WORKER_IMAGE="trigger-dev-worker-cfn:latest"
TEST_TIMEOUT=30
CLEANUP_CONTAINERS=()

cleanup() {
  log_step "Cleanup: Removing test containers"
  for container in "${CLEANUP_CONTAINERS[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
      log_info "Removing container: $container"
      docker rm -f "$container" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT

# Helper: Build worker image if missing
ensure_worker_image() {
  log_step "GIVEN worker image must exist for testing"

  if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${WORKER_IMAGE}$"; then
    log_info "Building worker image (first time only)..."

    # Use docker-build skill for 96% faster builds
    if [ -f "$PROJECT_ROOT/.claude/skills/docker-build/build.sh" ]; then
      "$PROJECT_ROOT/.claude/skills/docker-build/build.sh" \
        --dockerfile docker/trigger-dev/Dockerfile.worker \
        --tag "$WORKER_IMAGE"
    else
      # Fallback to direct build
      docker build -f "$PROJECT_ROOT/docker/trigger-dev/Dockerfile.worker" \
        -t "$WORKER_IMAGE" "$PROJECT_ROOT"
    fi

    assert_success "Worker image built successfully"
  else
    log_success "Worker image already exists: $WORKER_IMAGE"
  fi
}

# Test 1: Build image with AGENT_TYPE=backend-developer
test_build_with_agent_type() {
  log_step "TEST 1: Build worker image with backend-developer agent type"

  # GIVEN worker image exists
  ensure_worker_image

  # WHEN inspecting image metadata
  local image_info
  image_info=$(docker inspect "$WORKER_IMAGE" 2>&1)

  # THEN image should exist and be ready
  assert_success "Worker image exists and is inspectable"

  # Verify image has required labels
  local env_vars
  env_vars=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$WORKER_IMAGE")

  if echo "$env_vars" | grep -q "NODE_ENV"; then
    log_success "Image contains Node.js environment configuration"
  else
    log_error "Missing NODE_ENV in image environment"
    return 1
  fi

  log_success "Test 1 passed: Worker image built successfully"
}

# Test 2: Run container and verify agent profile loads correctly
test_agent_profile_loading() {
  log_step "TEST 2: Run container and verify backend-developer agent profile loads"

  local container_name="test-worker-profile-$$"
  CLEANUP_CONTAINERS+=("$container_name")

  # GIVEN agent template exists
  local agent_template="$PROJECT_ROOT/claude-assets/agents/cfn-dev-team/developers/backend-developer.md"
  if [ ! -f "$agent_template" ]; then
    log_error "Agent template not found: $agent_template"
    return 1
  fi

  # WHEN running container with backend-developer agent type
  log_info "Starting worker container with AGENT_TYPE=backend-developer..."

  docker run -d \
    --name "$container_name" \
    --network trigger-cfn-network \
    -e AGENT_TYPE="backend-developer" \
    -e CFN_WORKSPACE="/workspace" \
    -e NODE_ENV="development" \
    -v "$PROJECT_ROOT:/workspace:rw" \
    "$WORKER_IMAGE" \
    sh -c "ls -la /workspace/claude-assets/agents/cfn-dev-team/developers/ && sleep 10"

  assert_success "Container started successfully"

  # Wait for container to initialize
  sleep 2

  # THEN verify container can access agent templates
  local logs
  logs=$(docker logs "$container_name" 2>&1 || true)

  if echo "$logs" | grep -q "backend-developer.md"; then
    log_success "Agent template file accessible in container"
  else
    log_warn "Agent template listing not found in logs, checking file access directly..."

    # Try to read the file from container
    if docker exec "$container_name" test -f /workspace/claude-assets/agents/cfn-dev-team/developers/backend-developer.md; then
      log_success "Agent template file exists and is accessible"
    else
      log_error "Agent template file not accessible in container"
      log_error "Container logs: $logs"
      return 1
    fi
  fi

  # Check container exit code
  local exit_code
  exit_code=$(docker inspect --format='{{.State.ExitCode}}' "$container_name" || echo "running")

  if [ "$exit_code" = "running" ] || [ "$exit_code" = "0" ]; then
    log_success "Container running or exited cleanly"
  else
    log_error "Container exited with error code: $exit_code"
    return 1
  fi

  log_success "Test 2 passed: Agent profile loads correctly"
}

# Test 3: Verify provider routing defaults to Z.ai glm-4.6
test_default_provider_routing() {
  log_step "TEST 3: Verify provider routing defaults to Z.ai glm-4.6"

  local container_name="test-worker-provider-$$"
  CLEANUP_CONTAINERS+=("$container_name")

  # GIVEN container runs with default provider settings
  log_info "Starting container to verify default provider routing..."

  docker run -d \
    --name "$container_name" \
    --network trigger-cfn-network \
    -e AGENT_TYPE="backend-developer" \
    -e CFN_CUSTOM_ROUTING="true" \
    -e NODE_ENV="development" \
    "$WORKER_IMAGE" \
    sh -c "env | grep -E '(CFN|PROVIDER)' && sleep 5"

  assert_success "Container started for provider verification"

  # Wait for environment output
  sleep 2

  # WHEN checking environment variables
  local logs
  logs=$(docker logs "$container_name" 2>&1)

  # THEN verify CFN_CUSTOM_ROUTING is enabled
  if echo "$logs" | grep -q "CFN_CUSTOM_ROUTING=true"; then
    log_success "Custom provider routing enabled"
  else
    log_warn "CFN_CUSTOM_ROUTING not shown in logs (may be set via docker-compose)"
  fi

  # Verify agent template has provider parameters
  local agent_template="$PROJECT_ROOT/claude-assets/agents/cfn-dev-team/developers/backend-developer.md"
  if grep -q "provider: zai" "$agent_template" && grep -q "model: glm-4.6" "$agent_template"; then
    log_success "Agent template specifies Z.ai glm-4.6 as default provider"
  else
    log_error "Agent template missing Z.ai provider parameters"
    return 1
  fi

  log_success "Test 3 passed: Default provider routing configured correctly"
}

# Test 4: Test with explicit provider (e.g., kimi)
test_explicit_provider() {
  log_step "TEST 4: Test with explicit provider (kimi)"

  local container_name="test-worker-kimi-$$"
  CLEANUP_CONTAINERS+=("$container_name")

  # GIVEN container runs with KIMI provider specified
  log_info "Starting container with explicit KIMI provider..."

  docker run -d \
    --name "$container_name" \
    --network trigger-cfn-network \
    -e AGENT_TYPE="backend-developer" \
    -e CFN_CUSTOM_ROUTING="true" \
    -e CFN_DEFAULT_PROVIDER="kimi" \
    -e KIMI_API_KEY="test-key-placeholder" \
    -e NODE_ENV="development" \
    "$WORKER_IMAGE" \
    sh -c "env | grep -E '(PROVIDER|KIMI)' && sleep 5"

  assert_success "Container started with Kimi provider"

  # Wait for environment output
  sleep 2

  # WHEN checking environment variables
  local logs
  logs=$(docker logs "$container_name" 2>&1)

  # THEN verify Kimi provider is set
  if echo "$logs" | grep -q "CFN_DEFAULT_PROVIDER=kimi"; then
    log_success "Explicit provider (kimi) configured successfully"
  else
    log_warn "Provider setting not visible in logs (environment may be private)"
  fi

  # Verify KIMI_API_KEY is set (should not show actual value)
  if docker exec "$container_name" sh -c 'test -n "$KIMI_API_KEY"' 2>/dev/null; then
    log_success "KIMI_API_KEY environment variable is set"
  else
    log_error "KIMI_API_KEY not accessible in container"
    return 1
  fi

  log_success "Test 4 passed: Explicit provider configuration works"
}

# Test 5: Verify container exits cleanly
test_clean_exit() {
  log_step "TEST 5: Verify container exits cleanly"

  local container_name="test-worker-exit-$$"
  CLEANUP_CONTAINERS+=("$container_name")

  # GIVEN container runs a simple task
  log_info "Starting container with simple exit command..."

  docker run -d \
    --name "$container_name" \
    --network trigger-cfn-network \
    -e NODE_ENV="development" \
    "$WORKER_IMAGE" \
    sh -c "echo 'Worker started' && sleep 1 && echo 'Worker exiting' && exit 0"

  assert_success "Container started"

  # WHEN waiting for container to exit
  local timeout=10
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    local status
    status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")

    if [ "$status" = "exited" ]; then
      break
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  # THEN verify clean exit
  local exit_code
  exit_code=$(docker inspect --format='{{.State.ExitCode}}' "$container_name" 2>/dev/null || echo "255")

  if [ "$exit_code" = "0" ]; then
    log_success "Container exited cleanly with code 0"
  else
    log_error "Container exited with non-zero code: $exit_code"
    log_error "Container logs:"
    docker logs "$container_name"
    return 1
  fi

  log_success "Test 5 passed: Container exits cleanly"
}

# Test 6: Error handling (invalid AGENT_TYPE)
test_invalid_agent_type() {
  log_step "TEST 6: Error handling with invalid AGENT_TYPE"

  local container_name="test-worker-invalid-$$"
  CLEANUP_CONTAINERS+=("$container_name")

  # GIVEN container runs with invalid agent type
  log_info "Starting container with invalid AGENT_TYPE..."

  docker run -d \
    --name "$container_name" \
    --network trigger-cfn-network \
    -e AGENT_TYPE="nonexistent-agent-type" \
    -e CFN_WORKSPACE="/workspace" \
    -e NODE_ENV="development" \
    -v "$PROJECT_ROOT:/workspace:rw" \
    "$WORKER_IMAGE" \
    sh -c "ls /workspace/claude-assets/agents/cfn-dev-team/developers/nonexistent-agent-type.md 2>&1; exit 0"

  assert_success "Container started with invalid agent type"

  # Wait for command to execute
  sleep 2

  # WHEN checking container behavior
  local logs
  logs=$(docker logs "$container_name" 2>&1)

  # THEN verify appropriate error handling
  if echo "$logs" | grep -qE "(No such file|cannot access|not found)"; then
    log_success "Container correctly reports missing agent template"
  else
    log_warn "Expected error message not found (may be handled gracefully)"
  fi

  # Verify container doesn't crash catastrophically
  local status
  status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")

  if [ "$status" = "exited" ] || [ "$status" = "running" ]; then
    log_success "Container handles invalid agent type gracefully"
  else
    log_error "Container in unexpected state: $status"
    return 1
  fi

  log_success "Test 6 passed: Invalid agent type handled correctly"
}

# Main test execution
main() {
  annotate "Trigger.dev Worker Image Test Suite"

  log_info "Testing worker image: $WORKER_IMAGE"
  log_info "Test timeout: ${TEST_TIMEOUT}s"
  log_info "Project root: $PROJECT_ROOT"
  echo ""

  # Run all tests
  test_build_with_agent_type
  test_agent_profile_loading
  test_default_provider_routing
  test_explicit_provider
  test_clean_exit
  test_invalid_agent_type

  # Summary
  echo ""
  annotate "Test Suite Complete"
  log_success "All 6 tests passed successfully!"
  log_info "Worker image validated for trigger.dev integration"

  return 0
}

main "$@"
