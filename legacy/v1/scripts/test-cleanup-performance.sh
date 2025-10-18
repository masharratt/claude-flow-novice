#!/usr/bin/env bash
#
# test-cleanup-performance.sh
# Performance validation script for cleanup-blocking-coordination.sh
#
# This script:
# 1. Populates Redis with 10,000 test coordinators (mix of active and stale)
# 2. Runs cleanup with timing
# 3. Verifies 100% stale key removal, 0% active key deletion
# 4. Reports performance metrics
#
# Success criteria:
# - <5s execution time for 10,000 coordinators
# - 100% stale key removal (TTL > 10 minutes)
# - 0% active key deletion (TTL < 10 minutes)
#

set -euo pipefail

# ===== CONFIGURATION =====

# Redis connection
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DB="${REDIS_DB:-0}"

# Test parameters
TOTAL_COORDINATORS=10000
STALE_COORDINATOR_COUNT=9900  # 99% stale
ACTIVE_COORDINATOR_COUNT=100  # 1% active
STALE_THRESHOLD_SECONDS=600   # 10 minutes

# Script paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEANUP_SCRIPT="${SCRIPT_DIR}/cleanup-blocking-coordination.sh"

# ===== HELPER FUNCTIONS =====

# Redis command wrapper
redis_cmd() {
  if [ -n "${REDIS_PASSWORD}" ]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" -n "${REDIS_DB}" "$@" 2>/dev/null
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -n "${REDIS_DB}" "$@" 2>/dev/null
  fi
}

# Color output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() {
  echo -e "${GREEN}✓${NC} $*"
}

log_error() {
  echo -e "${RED}✗${NC} $*"
}

log_info() {
  echo -e "${YELLOW}→${NC} $*"
}

# Get current timestamp in milliseconds
current_timestamp_ms() {
  echo $(($(date +%s) * 1000))
}

# Count keys matching pattern
count_keys() {
  local pattern="$1"
  local count=0
  local cursor=0

  while true; do
    local result
    result=$(redis_cmd SCAN "${cursor}" MATCH "${pattern}" COUNT 1000)
    cursor=$(echo "${result}" | head -n 1)
    local keys
    keys=$(echo "${result}" | tail -n +2)

    if [ -n "${keys}" ]; then
      count=$((count + $(echo "${keys}" | wc -l)))
    fi

    if [ "${cursor}" = "0" ]; then
      break
    fi
  done

  echo "${count}"
}

# ===== TEST FUNCTIONS =====

# Clean up any existing test data
cleanup_test_data() {
  log_info "Cleaning up any existing test data..."

  local patterns=(
    "blocking:heartbeat:test-coordinator-*"
    "blocking:ack:test-coordinator-*"
    "blocking:signal:test-coordinator-*"
    "blocking:idempotency:*test-coordinator-*"
    "coordinator:activity:test-coordinator-*"
  )

  for pattern in "${patterns[@]}"; do
    local cursor=0
    while true; do
      local result
      result=$(redis_cmd SCAN "${cursor}" MATCH "${pattern}" COUNT 1000)
      cursor=$(echo "${result}" | head -n 1)
      local keys
      keys=$(echo "${result}" | tail -n +2 | tr '\n' ' ')

      if [ -n "${keys}" ]; then
        redis_cmd DEL ${keys} >/dev/null
      fi

      if [ "${cursor}" = "0" ]; then
        break
      fi
    done
  done

  log_success "Test data cleaned up"
}

# Populate Redis with test coordinators
populate_test_data() {
  log_info "Populating Redis with ${TOTAL_COORDINATORS} test coordinators..."
  log_info "  - ${STALE_COORDINATOR_COUNT} stale coordinators (age > 10 minutes)"
  log_info "  - ${ACTIVE_COORDINATOR_COUNT} active coordinators (age < 10 minutes)"

  local current_time_ms
  current_time_ms=$(current_timestamp_ms)

  # Stale threshold timestamp (10 minutes ago)
  local stale_timestamp_ms=$((current_time_ms - (STALE_THRESHOLD_SECONDS * 1000) - 60000))  # 11 minutes ago

  # Active timestamp (1 minute ago)
  local active_timestamp_ms=$((current_time_ms - 60000))  # 1 minute ago

  # Use batch pipeline for faster insertion
  local batch_size=1000
  local coordinator_id
  local timestamp_ms

  # Populate stale coordinators
  for ((i=1; i<=STALE_COORDINATOR_COUNT; i+=batch_size)); do
    {
      for ((j=i; j<i+batch_size && j<=STALE_COORDINATOR_COUNT; j++)); do
        coordinator_id="test-coordinator-stale-${j}"
        timestamp_ms="${stale_timestamp_ms}"

        # Heartbeat key
        echo "SET blocking:heartbeat:${coordinator_id} '{\"coordinatorId\":\"${coordinator_id}\",\"timestamp\":${timestamp_ms}}'"

        # ACK keys (2 per coordinator)
        echo "SET blocking:ack:${coordinator_id}:agent-1 '1'"
        echo "SET blocking:ack:${coordinator_id}:agent-2 '1'"

        # Signal key
        echo "SET blocking:signal:${coordinator_id} 'CONTINUE'"

        # Idempotency key
        echo "SET blocking:idempotency:${coordinator_id}:init '1'"

        # Activity tracking key
        echo "SET coordinator:activity:${coordinator_id} '${timestamp_ms}'"
      done
    } | redis_cmd --pipe >/dev/null

    if ((i % 1000 == 0)); then
      log_info "  Progress: ${i}/${STALE_COORDINATOR_COUNT} stale coordinators populated"
    fi
  done

  # Populate active coordinators
  for ((i=1; i<=ACTIVE_COORDINATOR_COUNT; i+=batch_size)); do
    {
      for ((j=i; j<i+batch_size && j<=ACTIVE_COORDINATOR_COUNT; j++)); do
        coordinator_id="test-coordinator-active-${j}"
        timestamp_ms="${active_timestamp_ms}"

        # Heartbeat key
        echo "SET blocking:heartbeat:${coordinator_id} '{\"coordinatorId\":\"${coordinator_id}\",\"timestamp\":${timestamp_ms}}'"

        # ACK keys (2 per coordinator)
        echo "SET blocking:ack:${coordinator_id}:agent-1 '1'"
        echo "SET blocking:ack:${coordinator_id}:agent-2 '1'"

        # Signal key
        echo "SET blocking:signal:${coordinator_id} 'CONTINUE'"

        # Idempotency key
        echo "SET blocking:idempotency:${coordinator_id}:init '1'"

        # Activity tracking key
        echo "SET coordinator:activity:${coordinator_id} '${timestamp_ms}'"
      done
    } | redis_cmd --pipe >/dev/null
  done

  log_success "Test data populated successfully"
}

# Verify test data population
verify_test_data() {
  log_info "Verifying test data..."

  local heartbeat_count
  heartbeat_count=$(count_keys "blocking:heartbeat:test-coordinator-*")

  if [ "${heartbeat_count}" -ne "${TOTAL_COORDINATORS}" ]; then
    log_error "Expected ${TOTAL_COORDINATORS} heartbeat keys, found ${heartbeat_count}"
    return 1
  fi

  log_success "Test data verified: ${heartbeat_count} coordinators"
}

# Run cleanup and measure performance
run_cleanup_test() {
  log_info "Running cleanup script (Lua-based)..."

  local start_time
  start_time=$(date +%s%3N)

  # Run cleanup script
  if ! bash "${CLEANUP_SCRIPT}"; then
    log_error "Cleanup script failed"
    return 1
  fi

  local end_time
  end_time=$(date +%s%3N)
  local execution_time_ms=$((end_time - start_time))

  log_success "Cleanup completed in ${execution_time_ms}ms"

  # Return execution time
  echo "${execution_time_ms}"
}

# Verify cleanup results
verify_cleanup_results() {
  log_info "Verifying cleanup results..."

  # Count remaining heartbeat keys
  local stale_heartbeat_count
  stale_heartbeat_count=$(count_keys "blocking:heartbeat:test-coordinator-stale-*")

  local active_heartbeat_count
  active_heartbeat_count=$(count_keys "blocking:heartbeat:test-coordinator-active-*")

  # Verify stale coordinators removed
  if [ "${stale_heartbeat_count}" -ne 0 ]; then
    log_error "Stale coordinator removal failed: ${stale_heartbeat_count} stale coordinators remaining (expected 0)"
    return 1
  fi

  log_success "100% stale coordinator removal: ${STALE_COORDINATOR_COUNT} removed"

  # Verify active coordinators preserved
  if [ "${active_heartbeat_count}" -ne "${ACTIVE_COORDINATOR_COUNT}" ]; then
    log_error "Active coordinator preservation failed: ${active_heartbeat_count} active coordinators remaining (expected ${ACTIVE_COORDINATOR_COUNT})"
    return 1
  fi

  log_success "100% active coordinator preservation: ${ACTIVE_COORDINATOR_COUNT} preserved"

  # Verify related keys also removed
  local stale_ack_count
  stale_ack_count=$(count_keys "blocking:ack:test-coordinator-stale-*")

  local stale_signal_count
  stale_signal_count=$(count_keys "blocking:signal:test-coordinator-stale-*")

  if [ "${stale_ack_count}" -ne 0 ] || [ "${stale_signal_count}" -ne 0 ]; then
    log_error "Related key removal failed: ${stale_ack_count} ACK keys, ${stale_signal_count} signal keys remaining"
    return 1
  fi

  log_success "100% related key removal verified"
}

# Run fallback test for comparison
run_fallback_test() {
  log_info "Running fallback test for comparison..."

  # Re-populate test data
  cleanup_test_data
  populate_test_data

  log_info "Running cleanup script (bash fallback)..."

  local start_time
  start_time=$(date +%s%3N)

  # Run cleanup script with fallback flag
  if ! bash "${CLEANUP_SCRIPT}" --fallback; then
    log_error "Cleanup script (fallback) failed"
    return 1
  fi

  local end_time
  end_time=$(date +%s%3N)
  local execution_time_ms=$((end_time - start_time))

  log_success "Cleanup (fallback) completed in ${execution_time_ms}ms"

  # Return execution time
  echo "${execution_time_ms}"
}

# ===== MAIN EXECUTION =====

main() {
  echo "========================================"
  echo "Cleanup Performance Test"
  echo "========================================"
  echo ""

  # Check prerequisites
  if ! command -v redis-cli >/dev/null 2>&1; then
    log_error "redis-cli not found, please install Redis"
    exit 1
  fi

  if ! redis_cmd PING >/dev/null 2>&1; then
    log_error "Redis connection failed (host: ${REDIS_HOST}, port: ${REDIS_PORT})"
    exit 1
  fi

  if [ ! -f "${CLEANUP_SCRIPT}" ]; then
    log_error "Cleanup script not found: ${CLEANUP_SCRIPT}"
    exit 1
  fi

  log_success "Prerequisites verified"
  echo ""

  # Phase 1: Test Lua implementation
  echo "Phase 1: Lua Implementation Test"
  echo "========================================"

  cleanup_test_data
  populate_test_data
  verify_test_data

  echo ""
  local lua_execution_time_ms
  lua_execution_time_ms=$(run_cleanup_test)

  echo ""
  verify_cleanup_results

  echo ""
  echo "========================================"
  echo "Lua Implementation Results:"
  echo "  Execution time: ${lua_execution_time_ms}ms"
  echo "  Performance: $(awk "BEGIN {printf \"%.2f\", ${TOTAL_COORDINATORS} / (${lua_execution_time_ms} / 1000.0)}")" coordinators/sec
  echo "  Target: <5000ms (5 seconds)"

  if [ "${lua_execution_time_ms}" -lt 5000 ]; then
    log_success "Performance target met (${lua_execution_time_ms}ms < 5000ms)"
  else
    log_error "Performance target missed (${lua_execution_time_ms}ms >= 5000ms)"
  fi
  echo "========================================"
  echo ""

  # Phase 2: Test bash fallback for comparison
  echo "Phase 2: Bash Fallback Comparison Test"
  echo "========================================"

  local fallback_execution_time_ms
  fallback_execution_time_ms=$(run_fallback_test)

  echo ""
  echo "========================================"
  echo "Bash Fallback Results:"
  echo "  Execution time: ${fallback_execution_time_ms}ms"
  echo "  Performance: $(awk "BEGIN {printf \"%.2f\", ${TOTAL_COORDINATORS} / (${fallback_execution_time_ms} / 1000.0)}")" coordinators/sec
  echo "========================================"
  echo ""

  # Performance comparison
  echo "Performance Comparison:"
  echo "========================================"
  echo "  Lua implementation: ${lua_execution_time_ms}ms"
  echo "  Bash fallback: ${fallback_execution_time_ms}ms"
  echo "  Speedup: $(awk "BEGIN {printf \"%.1f\", ${fallback_execution_time_ms} / ${lua_execution_time_ms}}")x faster"
  echo "========================================"
  echo ""

  # Final cleanup
  log_info "Cleaning up test data..."
  cleanup_test_data
  log_success "Test completed successfully"

  # Exit with success if performance target met
  if [ "${lua_execution_time_ms}" -lt 5000 ]; then
    exit 0
  else
    exit 1
  fi
}

# Execute main function
main "$@"
