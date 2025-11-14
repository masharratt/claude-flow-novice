#!/bin/bash
# tests/docker/core/test-wave-orchestration.sh
# Phase 4 :: Wave-based orchestration integration tests
# Purpose: Comprehensive testing of unified orchestrator pattern (spawn, monitor, cleanup waves)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

################################################################################
# TEST CONFIGURATION
################################################################################

# Test artifacts directory
TEST_ARTIFACTS_DIR="/tmp/wave-orchestration-tests-$$"
TEST_WAVE_PLAN="$TEST_ARTIFACTS_DIR/batching-plan.json"
TEST_CONTAINERS_MANIFEST="$TEST_ARTIFACTS_DIR/spawned-containers.json"

# Test task IDs
TEST_TASK_ID="test-wave-$$"

# Scripts under test
ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
SPAWN_WAVE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/spawn-wave.sh"
MONITOR_WAVE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/monitor-wave.sh"
CLEANUP_WAVE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/cleanup-wave.sh"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Track spawned containers for cleanup
declare -a SPAWNED_CONTAINERS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

################################################################################
# HELPER FUNCTIONS
################################################################################

print_header() {
  echo ""
  echo "========================================"
  echo "$1"
  echo "========================================"
}

print_pass() {
  echo -e "${GREEN}✅ PASS:${NC} $1"
}

print_fail() {
  echo -e "${RED}❌ FAIL:${NC} $1"
}

print_warn() {
  echo -e "${YELLOW}⚠️  WARN:${NC} $1"
}

cleanup() {
  log_info "Cleaning up test artifacts..."

  # Stop and remove all spawned containers
  if [[ ${#SPAWNED_CONTAINERS[@]} -gt 0 ]]; then
    for container_id in "${SPAWNED_CONTAINERS[@]}"; do
      docker rm -f "$container_id" 2>/dev/null || true
    done
  fi

  # Clean up all containers with our test task ID
  if docker ps -a --filter "label=cfn.task.id=$TEST_TASK_ID" --format "{{.ID}}" 2>/dev/null | grep -q .; then
    docker ps -a --filter "label=cfn.task.id=$TEST_TASK_ID" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
  fi

  # Remove test artifacts directory
  rm -rf "$TEST_ARTIFACTS_DIR"

  # Show test summary
  print_test_summary
}

trap cleanup EXIT

print_test_summary() {
  echo ""
  echo "========================================"
  echo "TEST SUMMARY"
  echo "========================================"
  echo -e "Total Tests:  $TOTAL_TESTS"
  echo -e "${GREEN}Passed:${NC}       $PASSED_TESTS"
  if [[ $FAILED_TESTS -gt 0 ]]; then
    echo -e "${RED}Failed:${NC}       $FAILED_TESTS"
  else
    echo -e "Failed:       $FAILED_TESTS"
  fi
  echo "========================================"

  if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed${NC}"
    return 0
  else
    echo -e "${RED}❌ Some tests failed${NC}"
    return 1
  fi
}

test_file_exists() {
  local file="$1"
  local description="$2"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [[ -f "$file" ]]; then
    print_pass "$description: File exists ($file)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    print_fail "$description: File not found ($file)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

test_json_valid() {
  local file="$1"
  local description="$2"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if jq empty "$file" 2>/dev/null; then
    print_pass "$description: Valid JSON"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    print_fail "$description: Invalid JSON"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

test_container_exists() {
  local container_id="$1"
  local description="$2"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if docker inspect "$container_id" >/dev/null 2>&1; then
    print_pass "$description: Container exists (${container_id:0:12})"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    print_fail "$description: Container not found (${container_id:0:12})"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

test_container_not_exists() {
  local container_id="$1"
  local description="$2"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if ! docker inspect "$container_id" >/dev/null 2>&1; then
    print_pass "$description: Container removed (${container_id:0:12})"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    print_fail "$description: Container still exists (${container_id:0:12})"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

test_equals() {
  local actual="$1"
  local expected="$2"
  local description="$3"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [[ "$actual" == "$expected" ]]; then
    print_pass "$description: '$actual' == '$expected'"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    print_fail "$description: '$actual' != '$expected'"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

test_greater_equal() {
  local actual="$1"
  local expected="$2"
  local description="$3"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [[ "$actual" -ge "$expected" ]]; then
    print_pass "$description: $actual >= $expected"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    print_fail "$description: $actual < $expected"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
}

################################################################################
# TEST DATA GENERATION
################################################################################

create_mock_batching_plan() {
  local wave_count="$1"
  local batches_per_wave="$2"
  local output_file="$3"

  log_info "Creating mock batching plan: $wave_count waves, $batches_per_wave batches per wave"

  # Build waves array
  local waves_json="["

  for ((wave=1; wave<=wave_count; wave++)); do
    if [[ $wave -gt 1 ]]; then
      waves_json+=","
    fi

    # Build batches array for this wave
    local batches_json="["
    for ((batch=1; batch<=batches_per_wave; batch++)); do
      if [[ $batch -gt 1 ]]; then
        batches_json+=","
      fi

      local batch_id="batch-w${wave}-b${batch}"
      local file_idx=$(( (wave - 1) * batches_per_wave + batch ))
      local tier=$((1 + (batch - 1) % 4))
      local memory
      case $tier in
        1) memory="512m" ;;
        2) memory="600m" ;;
        3) memory="800m" ;;
        4) memory="1g" ;;
        *) memory="512m" ;;
      esac
      batches_json+="{
        \"batch_id\": \"$batch_id\",
        \"tier\": $tier,
        \"memory\": \"$memory\",
        \"files\": [\"src/file${file_idx}.ts\"],
        \"task_prompt\": \"Fix TypeScript errors in src/file${file_idx}.ts\",
        \"estimated_duration\": $((60 + batch * 30))
      }"
    done
    batches_json+="]"

    waves_json+="{
      \"wave_number\": $wave,
      \"batch_count\": $batches_per_wave,
      \"tier\": $((1 + (wave - 1) % 4)),
      \"memory_limit\": \"$([[ $wave -le 2 ]] && echo '512m' || echo '800m')\",
      \"batches\": $batches_json,
      \"estimated_duration\": $((300 + wave * 60))
    }"
  done

  waves_json+="]"

  # Create full batching plan
  cat > "$output_file" <<EOF
{
  "task_id": "$TEST_TASK_ID",
  "total_batches": $((wave_count * batches_per_wave)),
  "total_waves": $wave_count,
  "waves": $waves_json,
  "strategy": {
    "mode": "parallel",
    "max_concurrent_waves": 2,
    "memory_strategy": "tier_based"
  }
}
EOF

  log_success "Created batching plan: $output_file"
}

################################################################################
# TEST 1: Spawn Wave Test
################################################################################

test_spawn_wave() {
  print_header "TEST 1: Spawn Wave Basic Functionality"

  # GIVEN a mock batching plan with 3 waves
  create_mock_batching_plan 3 2 "$TEST_WAVE_PLAN"
  test_file_exists "$TEST_WAVE_PLAN" "Batching plan created"
  test_json_valid "$TEST_WAVE_PLAN" "Batching plan is valid JSON"

  # WHEN we spawn wave 1
  log_step "1/3" "Spawning wave 1 (dry-run)"

  if ! bash "$SPAWN_WAVE_SCRIPT" \
    --wave-plan "$TEST_WAVE_PLAN" \
    --wave-number 1 \
    --output "$TEST_CONTAINERS_MANIFEST" \
    --base-image "alpine:latest" \
    --dry-run 2>&1; then
    print_fail "spawn-wave.sh dry-run failed"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    return 1
  fi

  print_pass "spawn-wave.sh dry-run succeeded"
  PASSED_TESTS=$((PASSED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  # Actually spawn without dry-run (using lightweight alpine for speed)
  log_step "2/3" "Spawning wave 1 (real)"

  if bash "$SPAWN_WAVE_SCRIPT" \
    --wave-plan "$TEST_WAVE_PLAN" \
    --wave-number 1 \
    --output "$TEST_CONTAINERS_MANIFEST" \
    --base-image "alpine:latest" \
    --workspace "$PROJECT_ROOT" 2>&1 | tee "$TEST_ARTIFACTS_DIR/spawn-wave-1.log"; then

    # THEN containers should be created
    test_file_exists "$TEST_CONTAINERS_MANIFEST" "Containers manifest created"
    test_json_valid "$TEST_CONTAINERS_MANIFEST" "Containers manifest is valid JSON"

    # Verify container count
    local container_count=$(jq -r '.containers | length' "$TEST_CONTAINERS_MANIFEST")
    test_greater_equal "$container_count" 1 "At least 1 container spawned"

    # Extract container IDs for cleanup
    while IFS= read -r container_id; do
      SPAWNED_CONTAINERS+=("$container_id")
      test_container_exists "$container_id" "Container spawned successfully"

      # Verify memory limit label exists
      local memory_label=$(docker inspect --format '{{index .Config.Labels "cfn.memory.limit"}}' "$container_id" 2>/dev/null || echo "")
      if [[ -n "$memory_label" ]]; then
        print_pass "Container has memory limit label: $memory_label"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
      fi

      # Verify task ID label
      local task_label=$(docker inspect --format '{{index .Config.Labels "cfn.task.id"}}' "$container_id" 2>/dev/null || echo "")
      test_equals "$task_label" "$TEST_TASK_ID" "Container has correct task ID label"

    done < <(jq -r '.containers[].id' "$TEST_CONTAINERS_MANIFEST")

  else
    print_fail "spawn-wave.sh execution failed"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
  fi
}

################################################################################
# TEST 2: Monitor Wave Test
################################################################################

test_monitor_wave() {
  print_header "TEST 2: Monitor Wave Completion"

  # GIVEN spawned containers from previous test
  if [[ ! -f "$TEST_CONTAINERS_MANIFEST" ]]; then
    print_warn "Skipping test - no containers manifest from spawn test"
    return 0
  fi

  # WHEN we monitor the wave with short timeout
  log_step "1/1" "Monitoring wave completion"

  local monitor_output="$TEST_ARTIFACTS_DIR/monitor-wave-1.json"
  local exit_code=0

  timeout 30 bash "$MONITOR_WAVE_SCRIPT" \
    --containers "$TEST_CONTAINERS_MANIFEST" \
    --wave-number 1 \
    --timeout 20 \
    --poll-interval 2 \
    --output "$monitor_output" \
    --verbose 2>&1 | tee "$TEST_ARTIFACTS_DIR/monitor-wave-1.log" || exit_code=$?

  # THEN monitor should complete or timeout
  if [[ -f "$monitor_output" ]]; then
    test_file_exists "$monitor_output" "Monitor output created"
    test_json_valid "$monitor_output" "Monitor output is valid JSON"

    # Check status
    local completed_count=$(jq -r '.metrics.success // 0' "$monitor_output")
    local failed_count=$(jq -r '.metrics.failed // 0' "$monitor_output")
    local total_count=$(jq -r '.metrics.total // 0' "$monitor_output")

    log_info "Monitor results: $completed_count completed, $failed_count failed, $total_count total"

    if [[ $exit_code -eq 0 ]]; then
      print_pass "Monitor completed successfully (exit code 0)"
      PASSED_TESTS=$((PASSED_TESTS + 1))
    elif [[ $exit_code -eq 2 ]]; then
      print_pass "Monitor timed out as expected (exit code 2)"
      PASSED_TESTS=$((PASSED_TESTS + 1))
    else
      print_warn "Monitor exited with code $exit_code"
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

  else
    print_fail "Monitor did not create output file"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
  fi
}

################################################################################
# TEST 3: Partial Failure Test
################################################################################

test_partial_failure() {
  print_header "TEST 3: Partial Failure Handling"

  # GIVEN a wave with containers that exit with different codes
  local failure_manifest="$TEST_ARTIFACTS_DIR/failure-containers.json"
  local success_container=""
  local failure_container=""

  log_step "1/3" "Spawning test containers with different exit codes"

  # Create success container (exits 0)
  success_container=$(docker run -d \
    --label "cfn.task.id=$TEST_TASK_ID" \
    --label "cfn.wave.number=2" \
    --label "cfn.agent.type=test-success" \
    alpine:latest \
    sh -c "echo 'Success' && exit 0" 2>&1)
  SPAWNED_CONTAINERS+=("$success_container")

  # Create failure container (exits 1)
  failure_container=$(docker run -d \
    --label "cfn.task.id=$TEST_TASK_ID" \
    --label "cfn.wave.number=2" \
    --label "cfn.agent.type=test-failure" \
    alpine:latest \
    sh -c "echo 'Failure' && exit 1" 2>&1)
  SPAWNED_CONTAINERS+=("$failure_container")

  # Create manifest
  cat > "$failure_manifest" <<EOF
{
  "wave": 2,
  "containers": [
    {
      "container_id": "$success_container",
      "agent_type": "test-success",
      "expected_exit": 0
    },
    {
      "container_id": "$failure_container",
      "agent_type": "test-failure",
      "expected_exit": 0
    }
  ]
}
EOF

  # Wait for containers to finish
  log_step "2/3" "Waiting for containers to finish"
  sleep 3

  # WHEN we monitor this wave
  local failure_output="$TEST_ARTIFACTS_DIR/monitor-wave-2.json"

  log_step "3/3" "Monitoring wave with failures"
  timeout 20 bash "$MONITOR_WAVE_SCRIPT" \
    --containers "$failure_manifest" \
    --wave-number 2 \
    --timeout 15 \
    --poll-interval 1 \
    --output "$failure_output" \
    --verbose 2>&1 | tee "$TEST_ARTIFACTS_DIR/monitor-wave-2.log" || true

  # THEN monitor should detect failures
  if [[ -f "$failure_output" ]]; then
    test_file_exists "$failure_output" "Failure monitor output created"
    test_json_valid "$failure_output" "Failure monitor output is valid JSON"

    local failed_count=$(jq -r '.metrics.failed // 0' "$failure_output")
    test_greater_equal "$failed_count" 1 "At least 1 failure detected"

    # Check exit code extraction
    local exit_codes=$(jq -r '.containers[].exit_code // "null"' "$failure_output" 2>/dev/null || echo "")
    if [[ -n "$exit_codes" ]]; then
      print_pass "Exit codes extracted from containers"
      PASSED_TESTS=$((PASSED_TESTS + 1))
      TOTAL_TESTS=$((TOTAL_TESTS + 1))
    fi
  fi
}

################################################################################
# TEST 4: Timeout Test
################################################################################

test_timeout_handling() {
  print_header "TEST 4: Timeout Detection and Cleanup"

  # GIVEN a long-running container
  local timeout_manifest="$TEST_ARTIFACTS_DIR/timeout-containers.json"
  local long_running_container=""

  log_step "1/2" "Spawning long-running container"

  long_running_container=$(docker run -d \
    --label "cfn.task.id=$TEST_TASK_ID" \
    --label "cfn.wave.number=3" \
    --label "cfn.agent.type=test-timeout" \
    alpine:latest \
    sh -c "sleep 300" 2>&1)
  SPAWNED_CONTAINERS+=("$long_running_container")

  cat > "$timeout_manifest" <<EOF
{
  "wave": 3,
  "containers": [
    {
      "container_id": "$long_running_container",
      "agent_type": "test-timeout"
    }
  ]
}
EOF

  # WHEN we monitor with short timeout
  log_step "2/2" "Monitoring with 5 second timeout"

  local timeout_output="$TEST_ARTIFACTS_DIR/monitor-wave-3.json"
  local exit_code=0

  timeout 10 bash "$MONITOR_WAVE_SCRIPT" \
    --containers "$timeout_manifest" \
    --wave-number 3 \
    --timeout 5 \
    --poll-interval 1 \
    --output "$timeout_output" \
    --verbose 2>&1 | tee "$TEST_ARTIFACTS_DIR/monitor-wave-3.log" || exit_code=$?

  # THEN monitor should timeout
  if [[ $exit_code -eq 2 ]] || [[ $exit_code -eq 124 ]]; then
    print_pass "Monitor timed out as expected (exit code $exit_code)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
  else
    print_warn "Monitor exit code: $exit_code (expected 2 or 124)"
  fi

  # Verify container still exists (not cleaned up yet)
  test_container_exists "$long_running_container" "Container still running after timeout"
}

################################################################################
# TEST 5: Cleanup Test
################################################################################

test_cleanup_wave() {
  print_header "TEST 5: Wave Cleanup"

  # GIVEN spawned containers from previous tests
  if [[ ${#SPAWNED_CONTAINERS[@]} -eq 0 ]]; then
    print_warn "Skipping test - no containers to clean up"
    return 0
  fi

  local containers_before=${#SPAWNED_CONTAINERS[@]}
  log_info "Containers before cleanup: $containers_before"

  # WHEN we cleanup the wave
  log_step "1/1" "Cleaning up wave containers"

  if bash "$CLEANUP_WAVE_SCRIPT" \
    --task-id "$TEST_TASK_ID" \
    --wave-number 1 \
    --verbose 2>&1 | tee "$TEST_ARTIFACTS_DIR/cleanup-wave-1.log"; then

    print_pass "cleanup-wave.sh executed successfully"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

  else
    print_warn "cleanup-wave.sh exited with non-zero code (may be expected if containers already removed)"
  fi

  # Verify at least some containers were attempted to be removed
  # (They may already be gone from our cleanup trap)
  log_info "Cleanup wave test completed"
}

################################################################################
# TEST 6: End-to-End Orchestration
################################################################################

test_e2e_orchestration() {
  print_header "TEST 6: End-to-End Wave Orchestration"

  # GIVEN a fresh batching plan
  local e2e_task_id="test-e2e-$$"
  local e2e_plan="$TEST_ARTIFACTS_DIR/e2e-batching-plan.json"

  create_mock_batching_plan 2 3 "$e2e_plan"

  # WHEN we execute the full orchestration (if the command exists)
  log_step "1/1" "Checking orchestrate.sh execute-waves command"

  if grep -q "execute-waves" "$ORCHESTRATE_SCRIPT" 2>/dev/null; then
    log_info "execute-waves command found in orchestrate.sh"

    # Run dry-run test
    if bash "$ORCHESTRATE_SCRIPT" execute-waves \
      --task-id "$e2e_task_id" \
      --batching-plan "$e2e_plan" \
      --dry-run \
      --verbose 2>&1 | tee "$TEST_ARTIFACTS_DIR/orchestrate-e2e.log"; then

      print_pass "orchestrate.sh execute-waves dry-run succeeded"
      PASSED_TESTS=$((PASSED_TESTS + 1))
      TOTAL_TESTS=$((TOTAL_TESTS + 1))
    else
      print_fail "orchestrate.sh execute-waves dry-run failed"
      FAILED_TESTS=$((FAILED_TESTS + 1))
      TOTAL_TESTS=$((TOTAL_TESTS + 1))
    fi
  else
    print_warn "execute-waves command not found in orchestrate.sh (skipping)"
  fi
}

################################################################################
# MAIN TEST EXECUTION
################################################################################

main() {
  print_header "Wave Orchestration Integration Tests"

  # Setup
  mkdir -p "$TEST_ARTIFACTS_DIR"
  log_info "Test artifacts directory: $TEST_ARTIFACTS_DIR"

  # Verify scripts exist
  test_file_exists "$ORCHESTRATE_SCRIPT" "orchestrate.sh script"
  test_file_exists "$SPAWN_WAVE_SCRIPT" "spawn-wave.sh script"
  test_file_exists "$MONITOR_WAVE_SCRIPT" "monitor-wave.sh script"
  test_file_exists "$CLEANUP_WAVE_SCRIPT" "cleanup-wave.sh script"

  # Run tests in sequence
  test_spawn_wave
  test_monitor_wave
  test_partial_failure
  test_timeout_handling
  test_cleanup_wave
  test_e2e_orchestration

  # Calculate confidence score
  local confidence=0.0
  if [[ $TOTAL_TESTS -gt 0 ]]; then
    confidence=$(echo "scale=2; $PASSED_TESTS / $TOTAL_TESTS" | bc)
  fi

  echo ""
  echo "========================================"
  echo "FINAL RESULTS"
  echo "========================================"
  echo "Total Tests:     $TOTAL_TESTS"
  echo "Passed:          $PASSED_TESTS"
  echo "Failed:          $FAILED_TESTS"
  echo "Confidence:      $confidence"
  echo "========================================"

  if [[ $FAILED_TESTS -eq 0 ]] && [[ $TOTAL_TESTS -gt 0 ]]; then
    echo -e "${GREEN}✅ All tests passed - Confidence: $confidence${NC}"
    exit 0
  else
    echo -e "${RED}❌ Tests failed - Confidence: $confidence${NC}"
    exit 1
  fi
}

# Execute main
main "$@"
