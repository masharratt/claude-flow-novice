#!/bin/bash
# tests/docker/core/test-wave-security-edgecases.sh
# Phase 4 :: Wave Security & Edge Case Tests
# Purpose: Validate security fixes and edge case handling in spawn-wave.sh

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

################################################################################
# TEST CONFIGURATION
################################################################################

TEST_ARTIFACTS_DIR="/tmp/wave-security-tests-$$"
TEST_WAVE_PLAN="$TEST_ARTIFACTS_DIR/batching-plan.json"
TEST_CONTAINERS_MANIFEST="$TEST_ARTIFACTS_DIR/spawned-containers.json"
TEST_TASK_ID="test-security-$$"

SPAWN_WAVE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution/spawn-wave.sh"

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
  echo "SECURITY & EDGE CASE TEST SUMMARY"
  echo "========================================"
  echo -e "Total Tests:  $TOTAL_TESTS"
  echo -e "${GREEN}Passed:${NC}       $PASSED_TESTS"
  if [[ $FAILED_TESTS -gt 0 ]]; then
    echo -e "${RED}Failed:${NC}       $FAILED_TESTS"
  else
    echo -e "Failed:       $FAILED_TESTS"
  fi
  echo "========================================"

  if [[ $FAILED_TESTS -eq 0 ]] && [[ $TOTAL_TESTS -gt 0 ]]; then
    echo -e "${GREEN}✅ All security & edge case tests passed${NC}"
    return 0
  else
    echo -e "${RED}❌ Some tests failed${NC}"
    return 1
  fi
}

test_pass() {
  local description="$1"
  print_pass "$description"
  PASSED_TESTS=$((PASSED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

test_fail() {
  local description="$1"
  print_fail "$description"
  FAILED_TESTS=$((FAILED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

################################################################################
# TEST DATA GENERATION
################################################################################

create_wave_plan_with_special_chars() {
  local output_file="$1"

  cat > "$output_file" <<'EOF'
{
  "task_id": "test-security-$$",
  "total_batches": 3,
  "total_waves": 1,
  "waves": [{
    "wave_number": 1,
    "batch_count": 3,
    "tier": 1,
    "memory_limit": "512m",
    "batches": [
      {
        "batch_id": "batch-special-chars",
        "tier": 1,
        "memory": "512m",
        "files": ["src/file with spaces.ts", "src/special!@#$chars.ts"],
        "task_prompt": "Fix errors in 'file with spaces.ts' and \"quoted.ts\""
      },
      {
        "batch_id": "batch-unicode-文字",
        "tier": 2,
        "memory": "600m",
        "files": ["src/unicode-文字.ts"],
        "task_prompt": "Fix Unicode файл errors"
      },
      {
        "batch_id": "batch-newlines\nand\ttabs",
        "tier": 1,
        "memory": "512m",
        "files": ["src/normal.ts"],
        "task_prompt": "Fix\nerrors\twith\nnewlines"
      }
    ]
  }]
}
EOF
}

create_empty_wave_plan() {
  local output_file="$1"

  cat > "$output_file" <<EOF
{
  "task_id": "$TEST_TASK_ID",
  "total_batches": 0,
  "total_waves": 1,
  "waves": [{
    "wave_number": 1,
    "batch_count": 0,
    "tier": 1,
    "memory_limit": "512m",
    "batches": []
  }]
}
EOF
}

create_large_batch_plan() {
  local batch_count="$1"
  local output_file="$2"

  local batches_json="["
  for ((i=1; i<=batch_count; i++)); do
    if [[ $i -gt 1 ]]; then
      batches_json+=","
    fi
    batches_json+="{
      \"batch_id\": \"batch-$i\",
      \"tier\": $((1 + (i % 4))),
      \"memory\": \"$((512 + (i % 4) * 100))m\",
      \"files\": [\"src/file${i}.ts\"],
      \"task_prompt\": \"Fix errors in file${i}.ts\"
    }"
  done
  batches_json+="]"

  cat > "$output_file" <<EOF
{
  "task_id": "$TEST_TASK_ID",
  "total_batches": $batch_count,
  "total_waves": 1,
  "waves": [{
    "wave_number": 1,
    "batch_count": $batch_count,
    "tier": 1,
    "memory_limit": "512m",
    "batches": $batches_json
  }]
}
EOF
}

################################################################################
# SECURITY TESTS
################################################################################

test_batch_parsing_special_chars() {
  print_header "SECURITY TEST 1: Batch Parsing with Special Characters"

  create_wave_plan_with_special_chars "$TEST_WAVE_PLAN"

  # WHEN we parse batches with special characters
  log_info "Testing batch parsing with special characters..."

  if bash "$SPAWN_WAVE_SCRIPT" \
    --wave-plan "$TEST_WAVE_PLAN" \
    --wave-number 1 \
    --output "$TEST_CONTAINERS_MANIFEST" \
    --base-image "alpine:latest" \
    --dry-run 2>&1 | tee "$TEST_ARTIFACTS_DIR/special-chars.log"; then

    # THEN parsing should succeed without errors
    if ! grep -q "jq: parse error" "$TEST_ARTIFACTS_DIR/special-chars.log"; then
      test_pass "No jq parse errors with special characters"
    else
      test_fail "jq parse errors detected with special characters"
    fi

    if ! grep -q "Cannot index string with string" "$TEST_ARTIFACTS_DIR/special-chars.log"; then
      test_pass "No string indexing errors"
    else
      test_fail "String indexing errors detected"
    fi

    # Verify manifest was created
    if [[ -f "$TEST_CONTAINERS_MANIFEST" ]]; then
      test_pass "Manifest created with special character batches"

      # Verify all 3 batches were processed (check dry-run log)
      local batch_count=$(grep -c "Spawning container:" "$TEST_ARTIFACTS_DIR/special-chars.log" || echo "0")
      if [[ "$batch_count" == "3" ]]; then
        test_pass "All 3 batches with special characters processed"
      else
        test_fail "Expected 3 batches in log, got $batch_count"
      fi
    else
      test_fail "Manifest not created"
    fi

  else
    test_fail "spawn-wave.sh failed with special characters"
  fi
}

test_empty_batch_handling() {
  print_header "EDGE CASE TEST 2: Empty Batch Array"

  create_empty_wave_plan "$TEST_WAVE_PLAN"

  # WHEN we spawn a wave with no batches
  log_info "Testing empty batch array..."

  if bash "$SPAWN_WAVE_SCRIPT" \
    --wave-plan "$TEST_WAVE_PLAN" \
    --wave-number 1 \
    --output "$TEST_CONTAINERS_MANIFEST" \
    --base-image "alpine:latest" \
    --dry-run 2>&1 | tee "$TEST_ARTIFACTS_DIR/empty-batch.log"; then

    test_pass "spawn-wave.sh handles empty batch array gracefully"

    # THEN manifest should show 0 spawned
    if [[ -f "$TEST_CONTAINERS_MANIFEST" ]]; then
      local spawned_count=$(jq -r '.total_spawned // 0' "$TEST_CONTAINERS_MANIFEST")
      if [[ "$spawned_count" == "0" ]]; then
        test_pass "Manifest correctly shows 0 spawned containers"
      else
        test_fail "Expected 0 spawned, got $spawned_count"
      fi
    fi

  else
    test_fail "spawn-wave.sh crashed with empty batch array"
  fi
}

test_large_batch_processing() {
  print_header "EDGE CASE TEST 3: Large Batch Count (100 batches)"

  create_large_batch_plan 100 "$TEST_WAVE_PLAN"

  # WHEN we process 100 batches
  log_info "Testing processing of 100 batches..."

  local start_time=$(date +%s)

  if timeout 60 bash "$SPAWN_WAVE_SCRIPT" \
    --wave-plan "$TEST_WAVE_PLAN" \
    --wave-number 1 \
    --output "$TEST_CONTAINERS_MANIFEST" \
    --base-image "alpine:latest" \
    --dry-run 2>&1 | tee "$TEST_ARTIFACTS_DIR/large-batch.log"; then

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    test_pass "Large batch (100 batches) processed successfully in ${duration}s"

    # THEN all batches should be processed (check log, not manifest in dry-run)
    local spawned_count=$(grep -c "dry-run-batch-" "$TEST_ARTIFACTS_DIR/large-batch.log" || echo "0")
    if [[ "$spawned_count" == "100" ]]; then
      test_pass "All 100 batches processed (verified in dry-run log)"
    else
      test_fail "Expected 100 batches in log, got $spawned_count"
    fi

    # Performance check: should complete in < 30 seconds
    if [[ $duration -lt 30 ]]; then
      test_pass "Large batch processing completed within 30 seconds"
    else
      test_fail "Large batch processing took ${duration}s (expected < 30s)"
    fi

  else
    test_fail "Large batch processing failed or timed out"
  fi
}

################################################################################
# MAIN TEST EXECUTION
################################################################################

main() {
  print_header "Wave Security & Edge Case Tests"

  # Setup
  mkdir -p "$TEST_ARTIFACTS_DIR"
  log_info "Test artifacts directory: $TEST_ARTIFACTS_DIR"

  # Run security and edge case tests
  test_batch_parsing_special_chars
  test_empty_batch_handling
  test_large_batch_processing

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
    echo -e "${GREEN}✅ All security & edge case tests passed - Confidence: $confidence${NC}"
    exit 0
  else
    echo -e "${RED}❌ Tests failed - Confidence: $confidence${NC}"
    exit 1
  fi
}

# Execute main
main "$@"
