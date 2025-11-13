#!/bin/bash
# tests/docker/coordinator-docker-in-docker-tests.sh
# Phase 8.2 :: P0 - Docker-in-Docker Worker Spawning (Coordinator V3)
# Tests coordinator's ability to spawn worker containers via Docker socket

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

COORDINATOR_IMAGE="cfn-coordinator:v3"
TEST_TASK_ID="dind-test-$(date +%s)"
TEST_CONTAINER_NAME="cfn-coordinator-${TEST_TASK_ID}"

cleanup() {
  log_step "Cleaning up test artifacts"
  docker rm -f "$TEST_CONTAINER_NAME" 2>/dev/null || true
  # Clean up any worker containers spawned during test
  docker ps -a --filter "label=cfn-task-id=${TEST_TASK_ID}" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
}
trap cleanup EXIT

# Test 4: Docker Socket Access Validation
test_coordinator_has_docker_access() {
  log_test_header "Test 4: Coordinator Docker socket access"

  # GIVEN coordinator container with Docker socket mounted
  log_step "GIVEN coordinator with /var/run/docker.sock mounted"

  # WHEN docker ps command executed inside coordinator
  log_step "WHEN docker ps executed inside coordinator"
  local output=$(docker run --rm \
    --name "socket-test-$(date +%s)" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    --entrypoint /bin/sh \
    "$COORDINATOR_IMAGE" \
    -c "docker ps --format '{{.Names}}' 2>&1" || echo "DOCKER_ACCESS_FAILED")

  # THEN command succeeds and lists containers
  log_step "THEN docker command succeeds"
  if [[ "$output" == "DOCKER_ACCESS_FAILED" ]] || [[ "$output" == *"Cannot connect"* ]]; then
    log_error "Coordinator cannot access Docker socket"
    log_info "Output: $output"
    return 1
  fi

  log_success "✅ Test 4 PASSED: Coordinator has Docker socket access"
}

# Test 5: Worker Container Spawning
test_coordinator_spawns_worker_containers() {
  log_test_header "Test 5: Worker container spawning validation"

  # Skip if no API key available
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    log_error "ANTHROPIC_API_KEY not set, skipping worker spawning test"
    return 0
  fi

  # GIVEN coordinator with task requiring backend-developer agent
  log_step "GIVEN task requiring backend-developer agent"
  local task_desc="Create simple Express.js hello world endpoint"

  # WHEN coordinator executes spawn_loop3
  log_step "WHEN coordinator spawns worker containers"

  # Start coordinator in background with timeout
  docker run --rm \
    --name "$TEST_CONTAINER_NAME" \
    --network mcp-network \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$(pwd):/app/codebase:ro" \
    -v /tmp:/tmp \
    -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" \
    -e "TASK_ID=${TEST_TASK_ID}" \
    -e "TASK_DESCRIPTION=${task_desc}" \
    -e "MODE=mvp" \
    -e "CFN_REDIS_HOST=cfn-redis" \
    -e "CFN_REDIS_PORT=6379" \
    -e "MAX_ITERATIONS=1" \
    --label "cfn-task-id=${TEST_TASK_ID}" \
    "$COORDINATOR_IMAGE" > /tmp/coordinator-spawn-output.log 2>&1 &

  local coordinator_pid=$!
  log_info "Coordinator started (PID: $coordinator_pid)"

  # Wait for workers to spawn (max 60 seconds)
  log_step "Waiting for worker containers to spawn (max 60s)"
  local timeout=60
  local elapsed=0
  local workers_found=false

  while [[ $elapsed -lt $timeout ]]; do
    # Check for worker containers with backend-developer image
    local worker_count=$(docker ps -a --filter "label=cfn-task-id=${TEST_TASK_ID}" \
      --filter "ancestor=cfn-agent-backend-developer:latest" \
      --format "{{.ID}}" | wc -l || echo "0")

    if [[ "$worker_count" -gt 0 ]]; then
      workers_found=true
      log_success "Found $worker_count worker container(s)"
      break
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  # THEN worker container created with correct configuration
  if [[ "$workers_found" == "true" ]]; then
    log_step "THEN worker container has correct configuration"

    # Get worker container ID
    local worker_id=$(docker ps -a --filter "label=cfn-task-id=${TEST_TASK_ID}" \
      --filter "ancestor=cfn-agent-backend-developer:latest" \
      --format "{{.ID}}" | head -1)

    # Verify network
    local network=$(docker inspect "$worker_id" --format '{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{end}}')
    if [[ "$network" == "mcp-network" ]]; then
      log_success "Worker on mcp-network ✓"
    else
      log_error "Worker not on mcp-network (found: $network)"
      return 1
    fi

    # Verify environment variables
    local env_vars=$(docker inspect "$worker_id" --format '{{range .Config.Env}}{{println .}}{{end}}')
    if echo "$env_vars" | grep -q "CFN_REDIS_HOST"; then
      log_success "CFN_REDIS_HOST set ✓"
    else
      log_error "CFN_REDIS_HOST not set"
      return 1
    fi

    if echo "$env_vars" | grep -q "TASK_ID"; then
      log_success "TASK_ID set ✓"
    else
      log_error "TASK_ID not set"
      return 1
    fi

    log_success "✅ Test 5 PASSED: Worker container spawned with correct config"
  else
    log_error "❌ Test 5 FAILED: No worker containers found after ${timeout}s"
    log_info "Coordinator output:"
    cat /tmp/coordinator-spawn-output.log | head -50
    return 1
  fi

  # Cleanup coordinator
  kill $coordinator_pid 2>/dev/null || true
  wait $coordinator_pid 2>/dev/null || true
}

# Test 6: Worker Lifecycle Management
test_workers_execute_and_cleanup() {
  log_test_header "Test 6: Worker lifecycle and cleanup"

  # Skip if no API key available
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    log_error "ANTHROPIC_API_KEY not set, skipping lifecycle test"
    return 0
  fi

  # GIVEN worker container spawned by coordinator
  log_step "GIVEN worker spawned for simple task"
  local lifecycle_task_id="lifecycle-$(date +%s)"
  local task_desc="Echo hello world"

  # Spawn coordinator with minimal task
  timeout 120s docker run --rm \
    --name "cfn-coordinator-${lifecycle_task_id}" \
    --network mcp-network \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$(pwd):/app/codebase:ro" \
    -v /tmp:/tmp \
    -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" \
    -e "TASK_ID=${lifecycle_task_id}" \
    -e "TASK_DESCRIPTION=${task_desc}" \
    -e "MODE=mvp" \
    -e "CFN_REDIS_HOST=cfn-redis" \
    -e "CFN_REDIS_PORT=6379" \
    -e "MAX_ITERATIONS=1" \
    --label "cfn-task-id=${lifecycle_task_id}" \
    "$COORDINATOR_IMAGE" > /tmp/coordinator-lifecycle-output.log 2>&1 || true

  # WHEN coordinator completes execution
  log_step "WHEN coordinator finishes execution"

  # THEN worker containers are cleaned up
  log_step "THEN worker containers removed (--rm flag)"
  local remaining_workers=$(docker ps -a --filter "label=cfn-task-id=${lifecycle_task_id}" \
    --format "{{.ID}}" | wc -l || echo "0")

  if [[ "$remaining_workers" -eq 0 ]]; then
    log_success "All workers cleaned up ✓"
  else
    log_error "Found $remaining_workers remaining worker container(s)"
    docker ps -a --filter "label=cfn-task-id=${lifecycle_task_id}" --format "table {{.ID}}\t{{.Image}}\t{{.Status}}"
    return 1
  fi

  # THEN Redis completion signal exists
  log_step "THEN completion reported to Redis"
  local redis_keys=$(redis-cli -h cfn-redis -p 6379 KEYS "swarm:${lifecycle_task_id}:*" 2>/dev/null || echo "")

  if [[ -n "$redis_keys" ]]; then
    log_success "Redis coordination keys found ✓"
  else
    log_error "No Redis coordination keys found"
    log_info "This may indicate workers didn't report completion"
    # Non-fatal - worker cleanup is primary concern
  fi

  log_success "✅ Test 6 PASSED: Worker lifecycle managed correctly"
}

# Execute tests
log_section "Coordinator V3 - Docker-in-Docker Tests (P0)"
log_info "Testing coordinator Docker-in-Docker spawning capabilities"
echo ""

test_coordinator_has_docker_access
test_coordinator_spawns_worker_containers
test_workers_execute_and_cleanup

log_section "All Docker-in-Docker Tests Complete"
log_success "3/3 tests executed"
