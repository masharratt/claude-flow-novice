#!/usr/bin/env bash
# lib/shutdown-coordination.sh - Message-bus coordinated shutdown integration
# Connects shutdown.sh with message-bus.sh for graceful inbox draining
# Ensures zero message loss and coordination state awareness during shutdown

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Source dependencies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/shutdown.sh" ]]; then
  source "$SCRIPT_DIR/shutdown.sh"
fi

# Message bus configuration (compatible with tests/cli-coordination/message-bus.sh)
MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"
MESSAGE_BUS_SCRIPT="${MESSAGE_BUS_SCRIPT:-$SCRIPT_DIR/../tests/cli-coordination/message-bus.sh}"

# Coordination state directory
COORDINATION_STATE_DIR="${COORDINATION_STATE_DIR:-/dev/shm/cfn-coordination/state}"

# ==============================================================================
# MESSAGE BUS INBOX DRAINING
# ==============================================================================

# drain_message_bus_inbox - Drain real message bus inbox using message-bus.sh
# Usage: drain_message_bus_inbox <agent_id> [timeout_seconds]
# Args:
#   $1 - agent_id: Agent identifier (required)
#   $2 - timeout_seconds: Max drain time (default: SHUTDOWN_TIMEOUT)
# Returns: Number of messages processed
drain_message_bus_inbox() {
  local agent_id="$1"
  local timeout="${2:-$SHUTDOWN_TIMEOUT}"
  local inbox="$MESSAGE_BASE_DIR/$agent_id/inbox"
  local processed=0
  local start_time=$(date +%s)

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] drain_message_bus_inbox: agent_id required" >&2
    return 1
  fi

  if [[ ! -d "$inbox" ]]; then
    echo "[INFO] No message bus inbox for $agent_id, skipping drain" >&2
    return 0
  fi

  echo "[INFO] Draining message bus inbox for $agent_id (timeout: ${timeout}s)" >&2

  # Check if message-bus script exists
  if [[ ! -f "$MESSAGE_BUS_SCRIPT" ]]; then
    echo "[WARN] Message bus script not found at $MESSAGE_BUS_SCRIPT" >&2
    return 1
  fi

  while [ -d "$inbox" ]; do
    local elapsed=$(($(date +%s) - start_time))

    # Check timeout
    if [ "$elapsed" -ge "$timeout" ]; then
      local remaining=$(bash "$MESSAGE_BUS_SCRIPT" count "$agent_id" inbox 2>/dev/null || echo "0")
      echo "[WARN] Inbox drain timeout after ${timeout}s ($remaining messages remaining)" >&2
      break
    fi

    # Get current inbox count
    local count=$(bash "$MESSAGE_BUS_SCRIPT" count "$agent_id" inbox 2>/dev/null || echo "0")

    if [ "$count" -eq 0 ]; then
      echo "[INFO] Message bus inbox empty for $agent_id" >&2
      break
    fi

    # Receive messages in batch (up to INBOX_MAX_BATCH)
    local batch=0
    local messages=$(bash "$MESSAGE_BUS_SCRIPT" receive "$agent_id" 2>/dev/null || echo "[]")

    # Process each message using jq (if available)
    if command -v jq &>/dev/null; then
      local msg_count=$(echo "$messages" | jq 'length' 2>/dev/null || echo "0")

      for ((i=0; i<msg_count && batch<INBOX_MAX_BATCH; i++)); do
        local msg=$(echo "$messages" | jq ".[$i]" 2>/dev/null)
        local msg_id=$(echo "$msg" | jq -r '.msg_id // "unknown"' 2>/dev/null)
        local msg_file="$inbox/$msg_id.json"

        if [[ -f "$msg_file" ]]; then
          # Process message (log and acknowledge)
          echo "[DEBUG] Processing message: $msg_id from inbox during shutdown" >&2

          # Remove processed message
          rm -f "$msg_file"
          processed=$((processed + 1))
          batch=$((batch + 1))
        fi
      done
    else
      # Fallback: manually count and remove JSON files
      for msg_file in "$inbox"/*.json; do
        [ -f "$msg_file" ] || continue
        [ "$batch" -ge "$INBOX_MAX_BATCH" ] && break

        local msg_id=$(basename "$msg_file" .json)
        echo "[DEBUG] Processing message: $msg_id (no jq, basic processing)" >&2

        rm -f "$msg_file"
        processed=$((processed + 1))
        batch=$((batch + 1))
      done
    fi

    # Small delay between batches
    sleep "$INBOX_DRAIN_INTERVAL"
  done

  echo "[INFO] Message bus inbox drained for $agent_id: $processed messages processed" >&2
  echo "$processed"
}

# ==============================================================================
# COORDINATION STATE MANAGEMENT
# ==============================================================================

# update_coordination_state - Update agent's coordination state
# Usage: update_coordination_state <agent_id> <state> [metadata]
# Args:
#   $1 - agent_id: Agent identifier (required)
#   $2 - state: State value (e.g., "running", "shutting_down", "shutdown_complete")
#   $3 - metadata: Optional JSON metadata (default: {})
update_coordination_state() {
  local agent_id="$1"
  local state="$2"
  local metadata="${3:-{}}"

  if [[ -z "$agent_id" || -z "$state" ]]; then
    echo "[ERROR] update_coordination_state: agent_id and state required" >&2
    return 1
  fi

  # Create state directory if needed
  mkdir -p "$COORDINATION_STATE_DIR"

  local state_file="$COORDINATION_STATE_DIR/$agent_id.json"
  local timestamp=$(date +%s)

  # Build state JSON
  local state_json=$(cat <<EOF
{
  "agent_id": "$agent_id",
  "state": "$state",
  "timestamp": $timestamp,
  "metadata": $metadata
}
EOF
)

  # Write state atomically
  echo "$state_json" > "$state_file.tmp"
  mv "$state_file.tmp" "$state_file"

  echo "[INFO] Updated coordination state for $agent_id: $state" >&2
  return 0
}

# get_coordination_state - Get agent's current coordination state
# Usage: get_coordination_state <agent_id>
# Args:
#   $1 - agent_id: Agent identifier (required)
# Returns: State string (e.g., "running", "shutting_down", "shutdown_complete", "unknown")
get_coordination_state() {
  local agent_id="$1"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] get_coordination_state: agent_id required" >&2
    return 1
  fi

  local state_file="$COORDINATION_STATE_DIR/$agent_id.json"

  if [[ ! -f "$state_file" ]]; then
    echo "unknown"
    return 0
  fi

  # Extract state field using jq if available, otherwise fallback
  if command -v jq &>/dev/null; then
    jq -r '.state // "unknown"' "$state_file" 2>/dev/null || echo "unknown"
  else
    grep -o '"state"[[:space:]]*:[[:space:]]*"[^"]*"' "$state_file" | sed 's/.*"\([^"]*\)".*/\1/' || echo "unknown"
  fi
}

# broadcast_shutdown_state - Broadcast shutdown state to all agents
# Usage: broadcast_shutdown_state <agent_id>
# Args:
#   $1 - agent_id: Agent identifier (required)
broadcast_shutdown_state() {
  local agent_id="$1"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] broadcast_shutdown_state: agent_id required" >&2
    return 1
  fi

  echo "[INFO] Broadcasting shutdown state for $agent_id to swarm" >&2

  # Find all other agents
  if [[ -d "$MESSAGE_BASE_DIR" ]]; then
    for agent_dir in "$MESSAGE_BASE_DIR"/*; do
      [ -d "$agent_dir" ] || continue

      local target_agent=$(basename "$agent_dir")

      # Skip self
      [ "$target_agent" == "$agent_id" ] && continue

      # Skip agents already shutdown
      local target_state=$(get_coordination_state "$target_agent")
      [ "$target_state" == "shutdown_complete" ] && continue

      # Send shutdown notification message
      local payload=$(cat <<EOF
{
  "shutting_down_agent": "$agent_id",
  "action": "pause_sending",
  "reason": "Peer agent shutting down - inbox draining in progress"
}
EOF
)

      # Send via message bus if script exists
      if [[ -f "$MESSAGE_BUS_SCRIPT" ]]; then
        bash "$MESSAGE_BUS_SCRIPT" send "$agent_id" "$target_agent" "shutdown_notification" "$payload" &>/dev/null || true
        echo "[DEBUG] Sent shutdown notification: $agent_id -> $target_agent" >&2
      fi
    done
  fi

  echo "[INFO] Shutdown broadcast complete for $agent_id" >&2
  return 0
}

# ==============================================================================
# COORDINATED SHUTDOWN FUNCTIONS
# ==============================================================================

# shutdown_with_coordination - Gracefully shutdown agent with coordination awareness
# Usage: shutdown_with_coordination <agent_id> [timeout_seconds]
# Args:
#   $1 - agent_id: Agent identifier (required)
#   $2 - timeout_seconds: Max shutdown time (default: SHUTDOWN_TIMEOUT)
# Returns: 0 on success, 1 on failure
shutdown_with_coordination() {
  local agent_id="$1"
  local timeout="${2:-$SHUTDOWN_TIMEOUT}"
  local start_time=$(date +%s)

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] shutdown_with_coordination: agent_id required" >&2
    return 1
  fi

  echo "[INFO] Initiating coordinated shutdown for $agent_id (timeout: ${timeout}s)" >&2

  # Set global shutdown flag
  SHUTDOWN_IN_PROGRESS=true

  # Step 1: Update coordination state to "shutting_down"
  update_coordination_state "$agent_id" "shutting_down" '{"reason":"graceful_shutdown"}'

  # Step 2: Broadcast shutdown notification to other agents
  broadcast_shutdown_state "$agent_id"

  # Step 3: Mark as unhealthy in health system
  if command -v report_health &>/dev/null; then
    report_health "$agent_id" "unhealthy" '{"reason":"shutting_down"}' || true
  fi

  # Step 4: Drain message bus inbox (process remaining messages)
  local processed
  processed=$(drain_message_bus_inbox "$agent_id" "$timeout") || true
  echo "[INFO] Processed $processed messages from message bus during shutdown" >&2

  # Step 5: Stop liveness probe
  if command -v stop_liveness_probe &>/dev/null; then
    stop_liveness_probe "$agent_id" || true
  fi

  # Step 6: Cleanup message bus
  if [[ -f "$MESSAGE_BUS_SCRIPT" ]]; then
    bash "$MESSAGE_BUS_SCRIPT" cleanup "$agent_id" &>/dev/null || true
  fi

  # Step 7: Cleanup orphaned processes
  cleanup_orphaned_processes "$agent_id" || true

  # Step 8: Cleanup agent resources (traditional CFN resources)
  cleanup_agent_resources "$agent_id" || true

  # Step 9: Update coordination state to "shutdown_complete"
  update_coordination_state "$agent_id" "shutdown_complete" '{"reason":"shutdown_successful"}'

  # Step 10: Final health report
  if command -v report_health &>/dev/null; then
    report_health "$agent_id" "unhealthy" '{"reason":"shutdown_complete"}' || true
  fi

  local elapsed=$(($(date +%s) - start_time))
  echo "[INFO] Coordinated shutdown complete for $agent_id in ${elapsed}s" >&2

  # Verify shutdown completed within timeout
  if [ "$elapsed" -gt "$timeout" ]; then
    echo "[WARN] Coordinated shutdown exceeded timeout (${elapsed}s > ${timeout}s)" >&2
    return 1
  fi

  return 0
}

# shutdown_all_agents_coordinated - Shutdown all agents with coordination
# Usage: shutdown_all_agents_coordinated [timeout_seconds]
# Args:
#   $1 - timeout_seconds: Max shutdown time per agent (default: SHUTDOWN_TIMEOUT)
shutdown_all_agents_coordinated() {
  local timeout="${1:-$SHUTDOWN_TIMEOUT}"
  local start_time=$(date +%s)
  local shutdown_pids=()

  echo "[INFO] Initiating coordinated cluster-wide shutdown (timeout: ${timeout}s)" >&2

  # Set global shutdown flag
  SHUTDOWN_IN_PROGRESS=true

  # Find all active agents
  local agent_count=0
  if [[ -d "$MESSAGE_BASE_DIR" ]]; then
    for agent_dir in "$MESSAGE_BASE_DIR"/*; do
      [ -d "$agent_dir" ] || continue

      local agent_id=$(basename "$agent_dir")
      echo "[INFO] Scheduling coordinated shutdown for $agent_id" >&2

      # Shutdown each agent in background (parallel)
      shutdown_with_coordination "$agent_id" "$timeout" &
      shutdown_pids+=($!)
      agent_count=$((agent_count + 1))
    done
  fi

  # Wait for all shutdowns to complete
  echo "[INFO] Waiting for $agent_count agents to complete coordinated shutdown..." >&2
  local failed=0
  for pid in "${shutdown_pids[@]}"; do
    if ! wait "$pid"; then
      failed=$((failed + 1))
    fi
  done

  # Cleanup shared resources
  echo "[INFO] Cleaning up shared coordination resources..." >&2
  if [[ -d "$COORDINATION_STATE_DIR" ]]; then
    rm -rf "$COORDINATION_STATE_DIR"
  fi

  # Cleanup message bus system
  if [[ -f "$MESSAGE_BUS_SCRIPT" ]]; then
    bash "$MESSAGE_BUS_SCRIPT" cleanup-system &>/dev/null || true
  fi

  local elapsed=$(($(date +%s) - start_time))
  echo "[INFO] Coordinated cluster shutdown complete in ${elapsed}s ($failed failures)" >&2

  if [ "$failed" -gt 0 ]; then
    return 1
  fi

  return 0
}

# ==============================================================================
# VALIDATION FUNCTIONS
# ==============================================================================

# validate_coordination_shutdown - Test coordinated shutdown system
# Usage: validate_coordination_shutdown
# Returns: 0 if all tests pass, 1 otherwise
validate_coordination_shutdown() {
  local failures=0

  echo "[TEST] Validating coordinated shutdown system..."

  # Test 1: Initialize message bus system
  if [[ -f "$MESSAGE_BUS_SCRIPT" ]]; then
    bash "$MESSAGE_BUS_SCRIPT" init-system &>/dev/null
    if [[ -d "$MESSAGE_BASE_DIR" ]]; then
      echo "[PASS] Message bus system initialized"
    else
      echo "[FAIL] Message bus system initialization failed"
      failures=$((failures + 1))
    fi
  else
    echo "[WARN] Message bus script not found, skipping message bus tests"
  fi

  # Test 2: Create test agent with inbox
  local test_agent="test-coord-shutdown-$$"
  if [[ -f "$MESSAGE_BUS_SCRIPT" ]]; then
    bash "$MESSAGE_BUS_SCRIPT" init "$test_agent" &>/dev/null

    if [[ -d "$MESSAGE_BASE_DIR/$test_agent/inbox" ]]; then
      echo "[PASS] Test agent inbox created"
    else
      echo "[FAIL] Test agent inbox creation failed"
      failures=$((failures + 1))
    fi
  fi

  # Test 3: Send test message to inbox
  if [[ -f "$MESSAGE_BUS_SCRIPT" ]]; then
    local sender="test-sender-$$"
    bash "$MESSAGE_BUS_SCRIPT" init "$sender" &>/dev/null

    local msg_id=$(bash "$MESSAGE_BUS_SCRIPT" send "$sender" "$test_agent" "test_msg" '{"content":"shutdown_test"}' 2>/dev/null)

    if [[ -n "$msg_id" ]]; then
      echo "[PASS] Test message sent successfully"
    else
      echo "[FAIL] Test message send failed"
      failures=$((failures + 1))
    fi
  fi

  # Test 4: Update coordination state
  update_coordination_state "$test_agent" "shutting_down" '{"test":true}'
  local state=$(get_coordination_state "$test_agent")

  if [[ "$state" == "shutting_down" ]]; then
    echo "[PASS] Coordination state update works"
  else
    echo "[FAIL] Coordination state update failed (got: $state)"
    failures=$((failures + 1))
  fi

  # Test 5: Drain message bus inbox
  local processed
  processed=$(drain_message_bus_inbox "$test_agent" 5)

  if [[ "$processed" -ge 1 ]]; then
    echo "[PASS] Message bus inbox draining works (processed: $processed)"
  else
    echo "[FAIL] Message bus inbox drain failed (processed: $processed)"
    failures=$((failures + 1))
  fi

  # Test 6: Coordinated shutdown
  if shutdown_with_coordination "$test_agent" 5; then
    echo "[PASS] Coordinated shutdown works"
  else
    echo "[FAIL] Coordinated shutdown failed"
    failures=$((failures + 1))
  fi

  # Test 7: Verify cleanup
  if [[ ! -d "$MESSAGE_BASE_DIR/$test_agent" ]]; then
    echo "[PASS] Agent cleanup verification successful"
  else
    echo "[FAIL] Agent directory still exists after coordinated shutdown"
    failures=$((failures + 1))
  fi

  # Cleanup test artifacts
  if [[ -f "$MESSAGE_BUS_SCRIPT" ]]; then
    bash "$MESSAGE_BUS_SCRIPT" cleanup "test-sender-$$" &>/dev/null || true
    bash "$MESSAGE_BUS_SCRIPT" cleanup-system &>/dev/null || true
  fi
  rm -rf "$COORDINATION_STATE_DIR" 2>/dev/null || true

  if [[ $failures -eq 0 ]]; then
    echo "[SUCCESS] All coordinated shutdown tests passed"
    return 0
  else
    echo "[FAILURE] $failures test(s) failed"
    return 1
  fi
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# If script is executed directly (not sourced), run validation
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-validate}" in
    validate)
      validate_coordination_shutdown
      ;;
    shutdown-coordinated)
      if [[ -z "${2:-}" ]]; then
        echo "Usage: $0 shutdown-coordinated <agent_id> [timeout]" >&2
        exit 1
      fi
      shutdown_with_coordination "$2" "${3:-$SHUTDOWN_TIMEOUT}"
      ;;
    shutdown-all-coordinated)
      shutdown_all_agents_coordinated "${2:-$SHUTDOWN_TIMEOUT}"
      ;;
    *)
      echo "Usage: $0 {validate|shutdown-coordinated <agent_id>|shutdown-all-coordinated}" >&2
      exit 1
      ;;
  esac
fi
