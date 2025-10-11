#!/usr/bin/env bash
#
# cleanup-blocking-coordination.sh
# Sprint 3.2: Auto-Recovery Mechanisms - On-Demand Cleanup Script
#
# Finds and removes stale blocking coordinator state from Redis.
# Stale detection: Heartbeat age >10 minutes (600 seconds)
#
# Features:
# - Uses Redis SCAN (not KEYS) to prevent DoS in production
# - Dry-run mode for testing: --dry-run flag
# - Logs to ~/.claude-flow/logs/blocking-cleanup.log
# - Exit codes: 0 (success), 1 (Redis connection failed), 2 (cleanup errors)
# - Cleanup categories: heartbeats, ACKs, signals, idempotency, activity
#
# Usage:
#   ./scripts/cleanup-blocking-coordination.sh         # Production cleanup
#   ./scripts/cleanup-blocking-coordination.sh --dry-run  # Test mode
#
# Scheduled execution:
#   - systemd timer: Every 5 minutes (systemd/cleanup-blocking-coordination.timer)
#   - cron: */5 * * * * (cron.d/cleanup-blocking-coordination)
#   - npm: npm run cleanup:blocking
#

set -euo pipefail

# ===== CONFIGURATION =====

# Stale threshold: 10 minutes = 600 seconds
STALE_THRESHOLD_SECONDS=600

# Log file location
LOG_DIR="${HOME}/.claude-flow/logs"
LOG_FILE="${LOG_DIR}/blocking-cleanup.log"

# Redis connection (uses environment variables or defaults)
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DB="${REDIS_DB:-0}"

# Dry-run mode flag
DRY_RUN=false

# Metrics counters
TOTAL_COORDINATORS_CHECKED=0
STALE_COORDINATORS_FOUND=0
KEYS_DELETED=0
CLEANUP_ERRORS=0

# ===== HELPER FUNCTIONS =====

# Log with timestamp
log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Redis command wrapper with authentication
redis_cmd() {
  if [ -n "${REDIS_PASSWORD}" ]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" -n "${REDIS_DB}" "$@" 2>/dev/null
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -n "${REDIS_DB}" "$@" 2>/dev/null
  fi
}

# Redis SCAN wrapper (non-blocking alternative to KEYS)
redis_scan() {
  local pattern="$1"
  local cursor=0
  local keys=()

  while true; do
    # SCAN returns: [cursor, [key1, key2, ...]]
    local result
    result=$(redis_cmd SCAN "${cursor}" MATCH "${pattern}" COUNT 100)

    # Extract new cursor (first line)
    cursor=$(echo "${result}" | head -n 1)

    # Extract keys (remaining lines)
    local batch_keys
    batch_keys=$(echo "${result}" | tail -n +2)

    # Add to results
    if [ -n "${batch_keys}" ]; then
      keys+=( ${batch_keys} )
    fi

    # Check if scan is complete
    if [ "${cursor}" = "0" ]; then
      break
    fi
  done

  # Return unique keys (SCAN may return duplicates)
  printf '%s\n' "${keys[@]}" | sort -u
}

# Get current Unix timestamp
current_timestamp() {
  date +%s
}

# Calculate age of heartbeat in seconds
get_heartbeat_age() {
  local heartbeat_key="$1"

  # Get heartbeat timestamp from Redis
  local heartbeat_value
  heartbeat_value=$(redis_cmd GET "${heartbeat_key}")

  if [ -z "${heartbeat_value}" ]; then
    echo "-1"  # Heartbeat not found
    return
  fi

  # Parse JSON to extract timestamp (format: {"coordinatorId":"...","timestamp":1234567890,...})
  local heartbeat_timestamp
  heartbeat_timestamp=$(echo "${heartbeat_value}" | grep -oP '(?<="timestamp":)\d+' || echo "0")

  if [ "${heartbeat_timestamp}" = "0" ]; then
    echo "-1"  # Invalid timestamp
    return
  fi

  # Calculate age
  local now
  now=$(current_timestamp)
  local age=$((now - heartbeat_timestamp / 1000))  # Convert ms to seconds

  echo "${age}"
}

# Cleanup coordinator state
cleanup_coordinator() {
  local coordinator_id="$1"
  local age_seconds="$2"

  log "INFO" "Cleaning up stale coordinator: ${coordinator_id} (age: ${age_seconds}s, threshold: ${STALE_THRESHOLD_SECONDS}s)"

  local keys_to_delete=()

  # 1. Heartbeat key
  keys_to_delete+=( "blocking:heartbeat:${coordinator_id}" )

  # 2. Signal ACK keys (blocking:ack:coordinatorId:*)
  local ack_keys
  ack_keys=$(redis_scan "blocking:ack:${coordinator_id}:*")
  if [ -n "${ack_keys}" ]; then
    while IFS= read -r key; do
      keys_to_delete+=( "${key}" )
    done <<< "${ack_keys}"
  fi

  # 3. Signal key (blocking:signal:coordinatorId)
  keys_to_delete+=( "blocking:signal:${coordinator_id}" )

  # 4. Idempotency keys (blocking:idempotency:*coordinatorId*)
  local idempotency_keys
  idempotency_keys=$(redis_scan "blocking:idempotency:*${coordinator_id}*")
  if [ -n "${idempotency_keys}" ]; then
    while IFS= read -r key; do
      keys_to_delete+=( "${key}" )
    done <<< "${idempotency_keys}"
  fi

  # 5. Activity tracking key
  keys_to_delete+=( "coordinator:activity:${coordinator_id}" )

  # Log keys to delete
  local key_count=${#keys_to_delete[@]}
  log "DEBUG" "Found ${key_count} keys to delete for coordinator ${coordinator_id}"

  if [ "${DRY_RUN}" = true ]; then
    log "INFO" "[DRY-RUN] Would delete ${key_count} keys for coordinator ${coordinator_id}"
    for key in "${keys_to_delete[@]}"; do
      log "DEBUG" "[DRY-RUN] Would delete: ${key}"
    done
  else
    # Delete keys in batch
    if [ ${key_count} -gt 0 ]; then
      redis_cmd DEL "${keys_to_delete[@]}" >/dev/null || {
        log "ERROR" "Failed to delete keys for coordinator ${coordinator_id}"
        CLEANUP_ERRORS=$((CLEANUP_ERRORS + 1))
        return 1
      }

      KEYS_DELETED=$((KEYS_DELETED + key_count))
      log "INFO" "Deleted ${key_count} keys for coordinator ${coordinator_id}"
    fi
  fi

  STALE_COORDINATORS_FOUND=$((STALE_COORDINATORS_FOUND + 1))
  return 0
}

# ===== MAIN EXECUTION =====

main() {
  # Parse command line arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      *)
        echo "Unknown option: $1"
        echo "Usage: $0 [--dry-run]"
        exit 2
        ;;
    esac
  done

  # Create log directory if it doesn't exist
  mkdir -p "${LOG_DIR}"

  # Start cleanup
  log "INFO" "========================================"
  log "INFO" "Blocking Coordination Cleanup Started"
  log "INFO" "Dry-run mode: ${DRY_RUN}"
  log "INFO" "Stale threshold: ${STALE_THRESHOLD_SECONDS}s"
  log "INFO" "========================================"

  # Check Redis connection
  if ! redis_cmd PING >/dev/null 2>&1; then
    log "ERROR" "Redis connection failed (host: ${REDIS_HOST}, port: ${REDIS_PORT})"
    log "ERROR" "Cleanup aborted"
    exit 1
  fi

  log "INFO" "Redis connection established"

  # Find all blocking:heartbeat:* keys using SCAN
  log "INFO" "Scanning for blocking coordinator heartbeats..."

  local heartbeat_keys
  heartbeat_keys=$(redis_scan "blocking:heartbeat:*")

  if [ -z "${heartbeat_keys}" ]; then
    log "INFO" "No coordinator heartbeats found"
    log "INFO" "Cleanup complete (nothing to do)"
    exit 0
  fi

  # Process each heartbeat
  while IFS= read -r heartbeat_key; do
    TOTAL_COORDINATORS_CHECKED=$((TOTAL_COORDINATORS_CHECKED + 1))

    # Extract coordinator ID from key: blocking:heartbeat:{coordinatorId}
    local coordinator_id
    coordinator_id=$(echo "${heartbeat_key}" | sed 's/^blocking:heartbeat://')

    log "DEBUG" "Checking coordinator: ${coordinator_id}"

    # Get heartbeat age
    local age_seconds
    age_seconds=$(get_heartbeat_age "${heartbeat_key}")

    if [ "${age_seconds}" = "-1" ]; then
      log "WARN" "Invalid or missing heartbeat for coordinator: ${coordinator_id}"
      continue
    fi

    # Check if stale
    if [ "${age_seconds}" -gt "${STALE_THRESHOLD_SECONDS}" ]; then
      log "WARN" "Stale coordinator detected: ${coordinator_id} (age: ${age_seconds}s)"
      cleanup_coordinator "${coordinator_id}" "${age_seconds}" || true
    else
      log "DEBUG" "Coordinator active: ${coordinator_id} (age: ${age_seconds}s)"
    fi
  done <<< "${heartbeat_keys}"

  # Log summary
  log "INFO" "========================================"
  log "INFO" "Cleanup Summary:"
  log "INFO" "  Total coordinators checked: ${TOTAL_COORDINATORS_CHECKED}"
  log "INFO" "  Stale coordinators found: ${STALE_COORDINATORS_FOUND}"
  log "INFO" "  Keys deleted: ${KEYS_DELETED}"
  log "INFO" "  Cleanup errors: ${CLEANUP_ERRORS}"
  log "INFO" "========================================"

  # Exit code based on errors
  if [ ${CLEANUP_ERRORS} -gt 0 ]; then
    log "ERROR" "Cleanup completed with ${CLEANUP_ERRORS} errors"
    exit 2
  else
    log "INFO" "Cleanup completed successfully"
    exit 0
  fi
}

# Execute main function
main "$@"
