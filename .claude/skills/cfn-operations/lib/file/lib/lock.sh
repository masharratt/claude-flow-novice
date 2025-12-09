#!/bin/bash
#
# File Lock Operations Library
#
# Provides file locking functions for bash scripts.
# Part of Task 4.2: Centralized File Locking & Atomic Operations
#

# Lock directory
LOCK_DIR="${CFN_LOCK_DIR:-/tmp/cfn-locks}"

# Ensure lock directory exists
mkdir -p "$LOCK_DIR" 2>/dev/null || true

#
# Acquire a file lock
#
# Usage: acquire_file_lock <file-path> [--agent-id ID] [--timeout MS]
#
# Returns: LOCK_ID:LOCK_PATH
#
acquire_file_lock() {
  local file_path="$1"
  shift

  if [ -z "$file_path" ]; then
    echo "Error: file-path required" >&2
    return 1
  fi

  local agent_id=""
  local timeout=300000  # 5 minutes default
  local retry_interval=100  # 100ms default

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --agent-id)
        agent_id="$2"
        shift 2
        ;;
      --timeout)
        timeout="$2"
        shift 2
        ;;
      --retry-interval)
        retry_interval="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  # Generate lock ID
  local lock_id
  lock_id="lock-$(date +%s%N | tail -c 10)-$$"

  # Calculate lock file path (hash of target file path)
  local file_hash
  file_hash=$(echo -n "$file_path" | sha256sum | cut -c1-16)
  local lock_path="${LOCK_DIR}/${file_hash}.lock"

  # Calculate timeout deadline
  local start_time
  start_time=$(date +%s%3N)
  local deadline=$((start_time + timeout))

  local acquired=0

  while [ "$(date +%s%3N)" -lt "$deadline" ]; do
    # Check if lock exists
    if [ -f "$lock_path" ]; then
      # Check if lock is stale
      if is_lock_stale "$lock_path" "$timeout"; then
        echo "Warning: Removing stale lock: $lock_path" >&2
        rm -f "$lock_path"
      else
        # Wait and retry
        sleep "${retry_interval:0:1}.${retry_interval:1}" 2>/dev/null || sleep 0.1
        continue
      fi
    fi

    # Try to create lock
    local owner_data
    owner_data=$(create_lock_metadata "$lock_id" "$file_path" "$agent_id" "$timeout")

    # Write lock file atomically
    if echo "$owner_data" > "${lock_path}.tmp" && mv "${lock_path}.tmp" "$lock_path" 2>/dev/null; then
      # Verify we won the race
      local verify_lock_id
      verify_lock_id=$(jq -r '.lockId' "$lock_path" 2>/dev/null || echo "")

      if [ "$verify_lock_id" = "$lock_id" ]; then
        acquired=1
        break
      else
        # Lost the race
        sleep "${retry_interval:0:1}.${retry_interval:1}" 2>/dev/null || sleep 0.1
        continue
      fi
    else
      sleep "${retry_interval:0:1}.${retry_interval:1}" 2>/dev/null || sleep 0.1
      continue
    fi
  done

  if [ "$acquired" -eq 0 ]; then
    echo "Error: Failed to acquire lock on $file_path (timeout after ${timeout}ms)" >&2
    return 1
  fi

  local acquisition_time=$(($(date +%s%3N) - start_time))
  echo "Lock acquired: $lock_id ($acquisition_time ms)" >&2
  echo "${lock_id}:${lock_path}"
}

#
# Release a file lock
#
# Usage: release_file_lock <lock-id>
#
release_file_lock() {
  local lock_info="$1"

  if [ -z "$lock_info" ]; then
    echo "Error: lock-info required (format: LOCK_ID:LOCK_PATH)" >&2
    return 1
  fi

  local lock_id="${lock_info%%:*}"
  local lock_path="${lock_info#*:}"

  if [ ! -f "$lock_path" ]; then
    echo "Warning: Lock file not found: $lock_path" >&2
    return 0
  fi

  # Verify ownership
  local verify_lock_id
  verify_lock_id=$(jq -r '.lockId' "$lock_path" 2>/dev/null || echo "")

  if [ "$verify_lock_id" != "$lock_id" ]; then
    echo "Error: Lock ownership mismatch (expected: $lock_id, actual: $verify_lock_id)" >&2
    return 1
  fi

  # Remove lock file
  rm -f "$lock_path"
  echo "Lock released: $lock_id" >&2
}

#
# Renew a file lock
#
# Usage: renew_file_lock <lock-id> [--extension MS]
#
renew_file_lock() {
  local lock_info="$1"
  shift

  if [ -z "$lock_info" ]; then
    echo "Error: lock-info required (format: LOCK_ID:LOCK_PATH)" >&2
    return 1
  fi

  local extension=300000  # 5 minutes default

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --extension)
        extension="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  local lock_id="${lock_info%%:*}"
  local lock_path="${lock_info#*:}"

  if [ ! -f "$lock_path" ]; then
    echo "Error: Lock file not found: $lock_path" >&2
    return 1
  fi

  # Read current metadata
  local metadata
  metadata=$(cat "$lock_path")

  # Verify ownership
  local verify_lock_id
  verify_lock_id=$(echo "$metadata" | jq -r '.lockId')

  if [ "$verify_lock_id" != "$lock_id" ]; then
    echo "Error: Lock ownership mismatch during renewal" >&2
    return 1
  fi

  # Update expiration
  local new_expires_at
  new_expires_at=$(date -u -d "+${extension} milliseconds" +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  local renewal_count
  renewal_count=$(echo "$metadata" | jq -r '.renewalCount')
  renewal_count=$((renewal_count + 1))

  # Update metadata
  local updated_metadata
  updated_metadata=$(echo "$metadata" | jq \
    --arg expires "$new_expires_at" \
    --arg renewed "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")" \
    --argjson count "$renewal_count" \
    '.expiresAt = $expires | .lastRenewedAt = $renewed | .renewalCount = $count')

  # Write updated metadata
  echo "$updated_metadata" > "$lock_path"

  echo "Lock renewed: $lock_id (renewals: $renewal_count)" >&2
}

#
# Force release a lock
#
# Usage: force_release_lock <lock-path>
#
force_release_lock() {
  local lock_path="$1"

  if [ -z "$lock_path" ]; then
    echo "Error: lock-path required" >&2
    return 1
  fi

  if [ ! -f "$lock_path" ]; then
    echo "Warning: Lock file not found: $lock_path" >&2
    return 0
  fi

  # Read lock metadata for logging
  local lock_id
  lock_id=$(jq -r '.lockId' "$lock_path" 2>/dev/null || echo "unknown")

  # Force remove
  rm -f "$lock_path"
  echo "Lock force-released: $lock_id (path: $lock_path)" >&2
}

#
# Check if lock is stale
#
# Usage: is_lock_stale <lock-path> <timeout-ms>
#
is_lock_stale() {
  local lock_path="$1"
  local timeout_ms="${2:-300000}"

  if [ ! -f "$lock_path" ]; then
    return 0  # Missing lock is considered stale
  fi

  # Read expiration time
  local expires_at
  expires_at=$(jq -r '.expiresAt' "$lock_path" 2>/dev/null || echo "")

  if [ -z "$expires_at" ]; then
    return 0  # Invalid lock is stale
  fi

  # Convert to epoch
  local expires_epoch
  expires_epoch=$(date -d "$expires_at" +%s 2>/dev/null || echo "0")

  local now_epoch
  now_epoch=$(date +%s)

  if [ "$now_epoch" -gt "$expires_epoch" ]; then
    return 0  # Expired
  else
    return 1  # Not stale
  fi
}

#
# Create lock metadata JSON
#
# Usage: create_lock_metadata <lock-id> <file-path> <agent-id> <timeout-ms>
#
create_lock_metadata() {
  local lock_id="$1"
  local file_path="$2"
  local agent_id="$3"
  local timeout_ms="$4"

  local acquired_at
  acquired_at=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  local expires_at
  expires_at=$(date -u -d "+${timeout_ms} milliseconds" +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  local hostname
  hostname=$(hostname)

  jq -n \
    --arg lockId "$lock_id" \
    --arg filePath "$file_path" \
    --argjson pid "$$" \
    --arg agentId "$agent_id" \
    --arg hostname "$hostname" \
    --arg acquiredAt "$acquired_at" \
    --arg expiresAt "$expires_at" \
    --argjson timeoutMs "$timeout_ms" \
    --argjson renewalCount 0 \
    '{
      lockId: $lockId,
      filePath: $filePath,
      owner: {
        pid: $pid,
        agentId: $agentId,
        hostname: $hostname
      },
      acquiredAt: $acquiredAt,
      expiresAt: $expiresAt,
      timeoutMs: $timeoutMs,
      renewalCount: $renewalCount
    }'
}

#
# Get lock metrics
#
get_lock_metrics() {
  local lock_count=0
  local stale_count=0

  if [ -d "$LOCK_DIR" ]; then
    lock_count=$(find "$LOCK_DIR" -name "*.lock" 2>/dev/null | wc -l)

    for lock_file in "$LOCK_DIR"/*.lock; do
      [ -f "$lock_file" ] || continue
      if is_lock_stale "$lock_file" 300000; then
        stale_count=$((stale_count + 1))
      fi
    done
  fi

  jq -n \
    --argjson activeLocks "$lock_count" \
    --argjson staleLocks "$stale_count" \
    --arg lockDir "$LOCK_DIR" \
    '{
      activeLocks: $activeLocks,
      staleLocks: $staleLocks,
      lockDirectory: $lockDir
    }'
}
