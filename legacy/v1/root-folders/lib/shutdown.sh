#!/usr/bin/env bash
# lib/shutdown.sh - Graceful shutdown system for CLI coordination agents
# Phase 1 Sprint 1.4: Graceful Shutdown Implementation
# Provides graceful agent termination with inbox draining and resource cleanup

set -euo pipefail

# ==============================================================================
# SHUTDOWN CONFIGURATION
# ==============================================================================

# Shutdown timeout (seconds before force-kill)
SHUTDOWN_TIMEOUT="${SHUTDOWN_TIMEOUT:-5}"

# Inbox drain settings
INBOX_DRAIN_INTERVAL="${INBOX_DRAIN_INTERVAL:-0.1}"  # Seconds between drain checks
INBOX_MAX_BATCH="${INBOX_MAX_BATCH:-10}"  # Max messages per drain batch

# Resource cleanup settings
CLEANUP_ORPHANED_PROCESSES="${CLEANUP_ORPHANED_PROCESSES:-true}"
CLEANUP_TEMP_FILES="${CLEANUP_TEMP_FILES:-true}"

# Global shutdown flag
SHUTDOWN_IN_PROGRESS=false

# Base directory for CLI coordination
CFN_BASE_DIR="${CFN_BASE_DIR:-/dev/shm/cfn-coordination}"
CFN_HEALTH_DIR="${HEALTH_DIR:-/dev/shm/cfn-health}"
MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"

# Source dependencies if available
if [[ -f "$(dirname "${BASH_SOURCE[0]}")/health.sh" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/health.sh"
fi

# Source message-bus for coordination
MESSAGE_BUS_LIB="${MESSAGE_BUS_LIB:-/mnt/c/Users/masha/Documents/claude-flow-novice/tests/cli-coordination/message-bus.sh}"
if [[ -f "$MESSAGE_BUS_LIB" ]]; then
  source "$MESSAGE_BUS_LIB"
  SHUTDOWN_MESSAGE_BUS_AVAILABLE=true
else
  SHUTDOWN_MESSAGE_BUS_AVAILABLE=false
fi

# Source metrics for coordination events
METRICS_LIB="${METRICS_LIB:-$(dirname "${BASH_SOURCE[0]}")/metrics.sh}"
if [[ -f "$METRICS_LIB" ]]; then
  source "$METRICS_LIB"
fi

# Validate agent_id format to prevent path traversal attacks
# Usage: validate_agent_id <agent_id>
# Returns: 0 if valid, 1 if invalid
validate_agent_id() {
    local agent_id="$1"

    # SECURITY: Prevent path traversal (CWE-22)
    # Allow only alphanumeric, dash, underscore (1-64 chars)
    if [[ ! "$agent_id" =~ ^[a-zA-Z0-9_-]{1,64}$ ]]; then
        echo "[ERROR] Invalid agent_id format: '$agent_id' (must be alphanumeric, dash, underscore, 1-64 chars)" >&2
        return 1
    fi

    return 0
}

# ==============================================================================
# INBOX DRAINING FUNCTIONS
# ==============================================================================

# archive_message - Archive message for post-shutdown analysis
# Usage: archive_message <message_file> <category>
# Args:
#   $1 - message_file: Path to message JSON file
#   $2 - category: Archive category (coordination, health, metrics, unknown, malformed)
# Returns: 0 on success, 1 on failure
archive_message() {
  local msg_file="$1"
  local category="${2:-unknown}"

  if [[ ! -f "$msg_file" ]]; then
    echo "[ERROR] Message file not found: $msg_file" >&2
    return 1
  fi

  # Create archive directory structure
  local archive_base="/dev/shm/cfn-mvp/archived-messages"
  local archive_dir="$archive_base/$category"
  mkdir -p "$archive_dir" 2>/dev/null || {
    echo "[ERROR] Failed to create archive directory: $archive_dir" >&2
    return 1
  }

  # Generate archive filename with timestamp
  local timestamp=$(date +%s)
  local basename=$(basename "$msg_file")
  local archive_file="$archive_dir/${timestamp}-${basename}"

  # Copy message to archive (preserve original for debugging)
  if cp "$msg_file" "$archive_file" 2>/dev/null; then
    echo "[DEBUG] Archived message: $archive_file" >&2

    # Emit archive metric
    if command -v emit_metric &>/dev/null; then
      emit_metric "shutdown.message_archived" "1" "count" "{\"category\":\"$category\"}" 2>/dev/null || true
    fi

    return 0
  else
    echo "[ERROR] Failed to archive message: $msg_file" >&2
    return 1
  fi
}

# drain_inbox - Process remaining messages in agent inbox before shutdown
# Usage: drain_inbox <agent_id> [timeout_seconds]
# Args:
#   $1 - agent_id: Agent identifier (required)
#   $2 - timeout_seconds: Max time to drain (default: SHUTDOWN_TIMEOUT)
# Returns: Number of messages processed
drain_inbox() {
  local agent_id="$1"
  local timeout="${2:-$SHUTDOWN_TIMEOUT}"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] drain_inbox: agent_id required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  local inbox="$CFN_BASE_DIR/inbox/$agent_id"
  local processed=0
  local start_time=$(date +%s)

  if [[ ! -d "$inbox" ]]; then
    echo "[INFO] No inbox found for $agent_id, skipping drain" >&2
    return 0
  fi

  echo "[INFO] Draining inbox for $agent_id (timeout: ${timeout}s)" >&2

  while [ -d "$inbox" ] && [ "$(ls -A "$inbox" 2>/dev/null | wc -l)" -gt 0 ]; do
    local elapsed=$(($(date +%s) - start_time))

    # Check timeout
    if [ "$elapsed" -ge "$timeout" ]; then
      local remaining=$(ls -1 "$inbox"/*.msg 2>/dev/null | wc -l)
      echo "[WARN] Inbox drain timeout after ${timeout}s ($remaining messages remaining)" >&2
      break
    fi

    # Process batch of messages
    local batch=0
    for msg in "$inbox"/*.msg; do
      [ -f "$msg" ] || continue

      # Process message (implementation specific)
      if process_message "$msg"; then
        rm -f "$msg"
        processed=$((processed + 1))
        batch=$((batch + 1))
      else
        echo "[WARN] Failed to process message: $msg" >&2
        # Move failed message to failed directory
        local failed_dir="$CFN_BASE_DIR/failed/$agent_id"
        mkdir -p "$failed_dir"
        mv "$msg" "$failed_dir/" 2>/dev/null || true
      fi

      # Limit batch size to prevent starvation
      if [ "$batch" -ge "$INBOX_MAX_BATCH" ]; then
        break
      fi
    done

    # Small delay between batches
    sleep "$INBOX_DRAIN_INTERVAL"
  done

  echo "[INFO] Inbox drained for $agent_id: $processed messages processed" >&2
  echo "$processed"
}

# process_message - Process a single message (stub - override in implementation)
# Usage: process_message <message_file>
# Args:
#   $1 - message_file: Path to message JSON file
# Returns: 0 if processed, 1 if failed
process_message() {
  local msg_file="$1"

  if [[ ! -f "$msg_file" ]]; then
    return 1
  fi

  # Basic message validation (use jq if available, fallback to basic check)
  if command -v jq &>/dev/null; then
    if ! jq empty "$msg_file" 2>/dev/null; then
      echo "[ERROR] Invalid message JSON: $msg_file" >&2
      return 1
    fi
    # Log message processing
    local msg_id=$(jq -r '.message_id // "unknown"' "$msg_file" 2>/dev/null)
    echo "[DEBUG] Processing message: $msg_id" >&2
  else
    # Fallback: basic JSON validation (check for opening brace, allow whitespace)
    if ! grep -q '{' "$msg_file" 2>/dev/null; then
      echo "[ERROR] Invalid message format: $msg_file" >&2
      return 1
    fi
    # Extract message_id with basic grep (best effort)
    local msg_id=$(grep -o '"message_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)".*/\1/' 2>/dev/null || echo "unknown")
    echo "[DEBUG] Processing message: $msg_id" >&2
  fi

  # Extract message type from JSON (no jq dependency)
  local msg_type=""
  if command -v jq &>/dev/null; then
    msg_type=$(jq -r '.type // "unknown"' "$msg_file" 2>/dev/null)
  else
    # Fallback: extract type field using grep/sed
    msg_type=$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)".*/\1/' 2>/dev/null || echo "unknown")
  fi

  # Validate message type extraction
  if [[ -z "$msg_type" || "$msg_type" == "unknown" ]]; then
    echo "[WARN] Could not determine message type, archiving message: $msg_file" >&2
    archive_message "$msg_file" "unknown_type"
    return 0
  fi

  echo "[DEBUG] Message type: $msg_type" >&2

  # Route message based on type
  case "$msg_type" in
    agent:ready|agent:complete|agent:status)
      # Coordination messages: log and archive (coordinator handles these)
      echo "[INFO] Coordination message received: $msg_type - archiving for coordinator" >&2
      archive_message "$msg_file" "coordination"
      ;;

    health:status|health:probe)
      # Health messages: emit to health system if available
      if command -v report_health &>/dev/null && [[ -f "$msg_file" ]]; then
        local agent_id=""
        local status=""

        if command -v jq &>/dev/null; then
          agent_id=$(jq -r '.payload.agent_id // .from // "unknown"' "$msg_file" 2>/dev/null)
          status=$(jq -r '.payload.status // "unknown"' "$msg_file" 2>/dev/null)
        else
          agent_id=$(grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)".*/\1/' 2>/dev/null || echo "unknown")
        fi

        if [[ -n "$agent_id" && "$agent_id" != "unknown" ]]; then
          echo "[INFO] Forwarding health message for $agent_id" >&2
          # Archive health message for post-shutdown analysis
          archive_message "$msg_file" "health"
        else
          echo "[WARN] Invalid health message format, archiving" >&2
          archive_message "$msg_file" "malformed"
        fi
      else
        echo "[INFO] Health system unavailable, archiving message" >&2
        archive_message "$msg_file" "health"
      fi
      ;;

    metrics:report|metrics:event)
      # Metrics messages: emit to metrics system if available
      if command -v emit_metric &>/dev/null && [[ -f "$msg_file" ]]; then
        local metric_name=""
        local metric_value=""

        if command -v jq &>/dev/null; then
          metric_name=$(jq -r '.payload.name // "shutdown.message_processed"' "$msg_file" 2>/dev/null)
          metric_value=$(jq -r '.payload.value // "1"' "$msg_file" 2>/dev/null)
        else
          metric_name="shutdown.message_processed"
          metric_value="1"
        fi

        echo "[INFO] Forwarding metrics message: $metric_name=$metric_value" >&2
        emit_metric "$metric_name" "$metric_value" "count" "{\"source\":\"shutdown_drain\"}" 2>/dev/null || true

        # Archive metrics for post-shutdown analysis
        archive_message "$msg_file" "metrics"
      else
        echo "[INFO] Metrics system unavailable, archiving message" >&2
        archive_message "$msg_file" "metrics"
      fi
      ;;

    *)
      # Unknown message type: archive with warning
      echo "[WARN] Unknown message type '$msg_type', archiving for manual review" >&2
      archive_message "$msg_file" "unknown"
      ;;
  esac

  # Emit metric for processed message count
  if command -v emit_metric &>/dev/null; then
    emit_metric "shutdown.inbox_message_processed" "1" "count" "{\"type\":\"$msg_type\"}" 2>/dev/null || true
  fi

  return 0
}

# ==============================================================================
# RESOURCE CLEANUP FUNCTIONS
# ==============================================================================

# cleanup_agent_resources - Remove all files and resources for an agent
# Usage: cleanup_agent_resources <agent_id>
# Args:
#   $1 - agent_id: Agent identifier (required)
cleanup_agent_resources() {
  local agent_id="$1"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] cleanup_agent_resources: agent_id required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  echo "[INFO] Cleaning up resources for $agent_id" >&2

  # Remove inbox directory
  if [[ -d "$CFN_BASE_DIR/inbox/$agent_id" ]]; then
    rm -rf "$CFN_BASE_DIR/inbox/$agent_id"
    echo "[DEBUG] Removed inbox for $agent_id" >&2
  fi

  # Remove outbox directory
  if [[ -d "$CFN_BASE_DIR/outbox/$agent_id" ]]; then
    rm -rf "$CFN_BASE_DIR/outbox/$agent_id"
    echo "[DEBUG] Removed outbox for $agent_id" >&2
  fi

  # Remove health status
  if [[ -d "$CFN_HEALTH_DIR/$agent_id" ]]; then
    rm -rf "$CFN_HEALTH_DIR/$agent_id"
    echo "[DEBUG] Removed health data for $agent_id" >&2
  fi

  # Remove any PID files
  local pid_file="$CFN_BASE_DIR/pids/$agent_id.pid"
  if [[ -f "$pid_file" ]]; then
    rm -f "$pid_file"
    echo "[DEBUG] Removed PID file for $agent_id" >&2
  fi

  # Remove temp files if enabled
  if [[ "$CLEANUP_TEMP_FILES" == "true" ]]; then
    local temp_dir="$CFN_BASE_DIR/tmp/$agent_id"
    if [[ -d "$temp_dir" ]]; then
      rm -rf "$temp_dir"
      echo "[DEBUG] Removed temp directory for $agent_id" >&2
    fi
  fi

  echo "[INFO] Resource cleanup complete for $agent_id" >&2
}

# cleanup_orphaned_processes - Kill processes associated with an agent
# Usage: cleanup_orphaned_processes <agent_id>
# Args:
#   $1 - agent_id: Agent identifier (required)
cleanup_orphaned_processes() {
  local agent_id="$1"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] cleanup_orphaned_processes: agent_id required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  if [[ "$CLEANUP_ORPHANED_PROCESSES" != "true" ]]; then
    echo "[INFO] Orphaned process cleanup disabled" >&2
    return 0
  fi

  echo "[INFO] Cleaning up orphaned processes for $agent_id" >&2

  # Check for PID file
  local pid_file="$CFN_BASE_DIR/pids/$agent_id.pid"
  if [[ -f "$pid_file" ]]; then
    local pid=$(cat "$pid_file")

    if kill -0 "$pid" 2>/dev/null; then
      echo "[INFO] Terminating process $pid for $agent_id" >&2
      kill -TERM "$pid" 2>/dev/null || true

      # Wait up to 2 seconds for graceful termination
      local wait_count=0
      while kill -0 "$pid" 2>/dev/null && [ "$wait_count" -lt 20 ]; do
        sleep 0.1
        wait_count=$((wait_count + 1))
      done

      # Force kill if still alive
      if kill -0 "$pid" 2>/dev/null; then
        echo "[WARN] Force killing process $pid for $agent_id" >&2
        kill -KILL "$pid" 2>/dev/null || true
      fi
    fi
  fi

  # Search for processes by agent ID in command line (fallback)
  pkill -f "agent_id=$agent_id" 2>/dev/null || true
}

# ==============================================================================
# GRACEFUL SHUTDOWN FUNCTIONS
# ==============================================================================

# shutdown_agent - Gracefully shutdown a single agent
# Usage: shutdown_agent <agent_id> [timeout_seconds]
# Args:
#   $1 - agent_id: Agent identifier (required)
#   $2 - timeout_seconds: Max shutdown time (default: SHUTDOWN_TIMEOUT)
# Returns: 0 on success, 1 on failure
shutdown_agent() {
  local agent_id="$1"
  local timeout="${2:-$SHUTDOWN_TIMEOUT}"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] shutdown_agent: agent_id required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  local start_time=$(date +%s)

  echo "[INFO] Initiating graceful shutdown for $agent_id (timeout: ${timeout}s)" >&2

  # Set global shutdown flag
  SHUTDOWN_IN_PROGRESS=true

  # Step 1: Mark as shutting down in health system
  if command -v report_health &>/dev/null; then
    report_health "$agent_id" "unhealthy" '{"reason":"shutting_down"}' || true
  fi

  # Step 2: Drain inbox (process remaining messages)
  local processed
  processed=$(drain_inbox "$agent_id" "$timeout") || true
  echo "[INFO] Processed $processed messages during shutdown" >&2

  # Step 3: Stop liveness probe
  if command -v stop_liveness_probe &>/dev/null; then
    stop_liveness_probe "$agent_id" || true
  fi

  # Step 4: Cleanup orphaned processes
  cleanup_orphaned_processes "$agent_id" || true

  # Step 5: Cleanup agent resources
  cleanup_agent_resources "$agent_id" || true

  # Step 6: Final health report (shutdown complete)
  if command -v report_health &>/dev/null; then
    report_health "$agent_id" "unhealthy" '{"reason":"shutdown_complete"}' || true
  fi

  local elapsed=$(($(date +%s) - start_time))
  echo "[INFO] Agent $agent_id shutdown complete in ${elapsed}s" >&2

  # Verify shutdown completed within timeout
  if [ "$elapsed" -gt "$timeout" ]; then
    echo "[WARN] Shutdown exceeded timeout (${elapsed}s > ${timeout}s)" >&2
    return 1
  fi

  return 0
}

# shutdown_all_agents - Gracefully shutdown all agents in parallel
# Usage: shutdown_all_agents [timeout_seconds]
# Args:
#   $1 - timeout_seconds: Max shutdown time per agent (default: SHUTDOWN_TIMEOUT)
shutdown_all_agents() {
  local timeout="${1:-$SHUTDOWN_TIMEOUT}"
  local start_time=$(date +%s)
  local shutdown_pids=()

  echo "[INFO] Initiating cluster-wide shutdown (timeout: ${timeout}s)" >&2

  # Set global shutdown flag
  SHUTDOWN_IN_PROGRESS=true

  # Find all active agents
  local agent_count=0
  if [[ -d "$CFN_BASE_DIR/inbox" ]]; then
    for agent_dir in "$CFN_BASE_DIR/inbox"/*; do
      [ -d "$agent_dir" ] || continue

      local agent_id=$(basename "$agent_dir")
      echo "[INFO] Scheduling shutdown for $agent_id" >&2

      # Shutdown each agent in background (parallel)
      shutdown_agent "$agent_id" "$timeout" &
      shutdown_pids+=($!)
      agent_count=$((agent_count + 1))
    done
  fi

  # Wait for all shutdowns to complete
  echo "[INFO] Waiting for $agent_count agents to shutdown..." >&2
  local failed=0
  for pid in "${shutdown_pids[@]}"; do
    if ! wait "$pid"; then
      failed=$((failed + 1))
    fi
  done

  # Cleanup shared resources
  echo "[INFO] Cleaning up shared resources..." >&2
  if [[ -d "$CFN_BASE_DIR" ]]; then
    # Remove coordination directories
    rm -rf "$CFN_BASE_DIR/inbox" "$CFN_BASE_DIR/outbox" "$CFN_BASE_DIR/pids"

    # Keep logs and metrics for analysis
    echo "[INFO] Preserved logs and metrics in $CFN_BASE_DIR" >&2
  fi

  local elapsed=$(($(date +%s) - start_time))
  echo "[INFO] Cluster shutdown complete in ${elapsed}s ($failed failures)" >&2

  if [ "$failed" -gt 0 ]; then
    return 1
  fi

  return 0
}

# ==============================================================================
# SIGNAL HANDLERS
# ==============================================================================

# handle_shutdown_signal - Handle shutdown signals gracefully
# Usage: Automatically called by trap on SIGTERM/SIGINT
handle_shutdown_signal() {
  local signal="$1"

  echo "[INFO] Received $signal signal, initiating graceful shutdown..." >&2

  # Shutdown all agents
  shutdown_all_agents "$SHUTDOWN_TIMEOUT"

  # Exit with appropriate code
  exit 0
}

# Setup signal handlers (only if script is executed, not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  trap 'handle_shutdown_signal SIGTERM' SIGTERM
  trap 'handle_shutdown_signal SIGINT' SIGINT
  trap 'handle_shutdown_signal SIGHUP' SIGHUP
fi

# ==============================================================================
# SHUTDOWN STATUS FUNCTIONS
# ==============================================================================

# is_shutdown_in_progress - Check if shutdown is in progress
# Usage: is_shutdown_in_progress
# Returns: 0 if shutdown active, 1 otherwise
is_shutdown_in_progress() {
  if [[ "$SHUTDOWN_IN_PROGRESS" == "true" ]]; then
    return 0
  fi
  return 1
}

# wait_for_shutdown - Wait for shutdown to complete
# Usage: wait_for_shutdown [timeout_seconds]
# Args:
#   $1 - timeout_seconds: Max wait time (default: 60)
wait_for_shutdown() {
  local timeout="${1:-60}"
  local start_time=$(date +%s)

  while is_shutdown_in_progress; do
    local elapsed=$(($(date +%s) - start_time))

    if [ "$elapsed" -ge "$timeout" ]; then
      echo "[ERROR] Shutdown wait timeout after ${timeout}s" >&2
      return 1
    fi

    sleep 0.5
  done

  echo "[INFO] Shutdown complete" >&2
  return 0
}

# ==============================================================================
# VALIDATION FUNCTIONS
# ==============================================================================

# validate_shutdown_system - Run self-tests on shutdown system
# Usage: validate_shutdown_system
# Returns: 0 if all tests pass, 1 otherwise
validate_shutdown_system() {
  local failures=0

  echo "[TEST] Validating shutdown system..."

  # Test 1: Base directory exists
  if [[ ! -d "$CFN_BASE_DIR" ]]; then
    mkdir -p "$CFN_BASE_DIR/inbox" "$CFN_BASE_DIR/outbox" "$CFN_BASE_DIR/pids"
  fi

  if [[ -d "$CFN_BASE_DIR" ]]; then
    echo "[PASS] Base directory exists"
  else
    echo "[FAIL] Failed to create base directory"
    failures=$((failures + 1))
  fi

  # Test 2: Create test agent
  local test_agent="test-shutdown-agent-$$"
  mkdir -p "$CFN_BASE_DIR/inbox/$test_agent"

  # Create test message
  echo '{"message_id":"test-1","content":"test"}' > "$CFN_BASE_DIR/inbox/$test_agent/test-1.msg"

  # Test 3: Drain inbox
  local processed
  processed=$(drain_inbox "$test_agent" 5)
  if [[ "$processed" -eq 1 ]]; then
    echo "[PASS] Inbox drain works"
  else
    echo "[FAIL] Inbox drain failed (processed: $processed)"
    failures=$((failures + 1))
  fi

  # Test 4: Cleanup resources
  if cleanup_agent_resources "$test_agent"; then
    echo "[PASS] Resource cleanup works"
  else
    echo "[FAIL] Resource cleanup failed"
    failures=$((failures + 1))
  fi

  # Test 5: Verify cleanup
  if [[ ! -d "$CFN_BASE_DIR/inbox/$test_agent" ]]; then
    echo "[PASS] Cleanup verification successful"
  else
    echo "[FAIL] Agent directory still exists after cleanup"
    failures=$((failures + 1))
  fi

  if [[ $failures -eq 0 ]]; then
    echo "[SUCCESS] All shutdown system tests passed"
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
      validate_shutdown_system
      ;;
    shutdown-all)
      shutdown_all_agents "${2:-$SHUTDOWN_TIMEOUT}"
      ;;
    shutdown-agent)
      if [[ -z "${2:-}" ]]; then
        echo "Usage: $0 shutdown-agent <agent_id> [timeout]" >&2
        exit 1
      fi
      shutdown_agent "$2" "${3:-$SHUTDOWN_TIMEOUT}"
      ;;
    *)
      echo "Usage: $0 {validate|shutdown-all|shutdown-agent <agent_id>}" >&2
      exit 1
      ;;
  esac
fi
