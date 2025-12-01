#!/usr/bin/env bash
set -euo pipefail

# Integration test for Z.ai memory leak fix
# Tests that sequential subagent spawns don't cause unbounded memory growth
#
# Related: Root cause analysis of HTTP client connection pooling leak
# Expected: <50MB memory growth across 10 agent spawns
# Actual (before fix): >500MB growth due to unclosed HTTP connections

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source test utilities
source "$PROJECT_ROOT/tests/test-utils.sh" 2>/dev/null || {
  echo "Error: test-utils.sh not found"
  exit 1
}

# Test configuration
readonly TEST_NAME="Z.ai Memory Leak Prevention"
readonly NUM_SPAWNS=10
readonly MAX_MEMORY_GROWTH_MB=50
readonly MEMORY_LOG="/tmp/cfn-memory-leak-test-$$.log"
readonly TEST_TASK_PREFIX="mem-test-$$"

# Cleanup function
cleanup() {
  log_info "Cleaning up test artifacts"
  rm -f "$MEMORY_LOG"

  # Kill any hanging node processes from test
  pkill -f "cfn-memory-leak-test" || true

  log_info "Cleanup complete"
}

trap cleanup EXIT

# Main test
main() {
  log_step "Starting $TEST_NAME"

  # Verify provider is set to Z.ai
  if [ "${CLAUDE_API_PROVIDER:-}" != "zai" ] && [ "${PROVIDER:-}" != "zai" ]; then
    log_info "Setting provider to Z.ai for test"
    export PROVIDER="zai"
  fi

  # Verify Z.ai API key exists
  if [ -z "${ZAI_API_KEY:-}" ]; then
    log_info "ZAI_API_KEY not set - skipping memory leak test"
    echo "SKIP"
    exit 0
  fi

  log_step "Spawning $NUM_SPAWNS sequential agents and monitoring memory"

  # Get initial memory baseline (wait for system to stabilize)
  sleep 2
  local initial_mem
  initial_mem=$(ps aux | grep -E "node.*dist/cli" | grep -v grep | awk '{sum+=$6} END {print sum}')
  initial_mem=${initial_mem:-0}

  log_info "Initial memory baseline: ${initial_mem}KB"
  echo "$initial_mem" > "$MEMORY_LOG"

  # Spawn agents sequentially
  for i in $(seq 1 $NUM_SPAWNS); do
    local task_id="${TEST_TASK_PREFIX}-${i}"

    log_info "Spawning agent $i/$NUM_SPAWNS (task: $task_id)"

    # Use simple agent with minimal processing to isolate memory leak
    # Timeout after 30s to prevent hanging
    timeout 30s node "$PROJECT_ROOT/dist/cli/index.js" agent coder \
      --context "Memory test iteration $i - simple echo task" \
      --task-id "$task_id" \
      --model "haiku" \
      > /dev/null 2>&1 || {
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
          log_info "Agent $i timed out (expected for memory test)"
        else
          log_info "Agent $i exited with code $exit_code"
        fi
      }

    # Measure memory after spawn
    sleep 1
    local current_mem
    current_mem=$(ps aux | grep -E "node.*dist/cli" | grep -v grep | awk '{sum+=$6} END {print sum}')
    current_mem=${current_mem:-0}

    echo "$current_mem" >> "$MEMORY_LOG"

    local delta=$((current_mem - initial_mem))
    log_info "Memory after agent $i: ${current_mem}KB (delta: ${delta}KB)"

    # Small delay between spawns
    sleep 1
  done

  log_step "Analyzing memory growth"

  # Calculate total memory growth
  local final_mem
  final_mem=$(tail -1 "$MEMORY_LOG")
  local total_growth_kb=$((final_mem - initial_mem))
  local total_growth_mb=$((total_growth_kb / 1024))

  log_info "Initial memory: ${initial_mem}KB"
  log_info "Final memory: ${final_mem}KB"
  log_info "Total growth: ${total_growth_mb}MB"

  # Assert memory growth is within acceptable threshold
  if [ $total_growth_mb -gt $MAX_MEMORY_GROWTH_MB ]; then
    log_info "FAIL: Memory leak detected - grew by ${total_growth_mb}MB (threshold: ${MAX_MEMORY_GROWTH_MB}MB)"
    log_info "Memory samples:"
    cat "$MEMORY_LOG"
    exit 1
  fi

  log_info "PASS: Memory growth within acceptable range (${total_growth_mb}MB < ${MAX_MEMORY_GROWTH_MB}MB)"

  # Additional validation: Check for consistent growth pattern
  log_step "Checking for linear growth pattern"

  local samples=()
  while IFS= read -r line; do
    samples+=("$line")
  done < "$MEMORY_LOG"

  local mid_index=$((NUM_SPAWNS / 2))
  local mid_mem=${samples[$mid_index]}
  local mid_growth_kb=$((mid_mem - initial_mem))
  local mid_growth_mb=$((mid_growth_kb / 1024))

  log_info "Mid-point memory (after $mid_index spawns): ${mid_mem}KB (growth: ${mid_growth_mb}MB)"

  # If memory leak exists, final growth should be >> mid growth
  # With fix, growth should be roughly linear (final ~= 2x mid)
  local expected_final_max=$((mid_growth_kb * 3))  # Allow 3x for variance

  if [ $total_growth_kb -gt $expected_final_max ]; then
    log_info "WARN: Non-linear memory growth detected (possible leak)"
    log_info "Mid growth: ${mid_growth_kb}KB, Final growth: ${total_growth_kb}KB"
  fi

  log_step "Test complete - memory leak prevention validated"
}

main "$@"
