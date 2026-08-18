#!/usr/bin/env bash
set -eu

# google-sheets-progress/track-progress.sh
# Tracks micro-sprint completion state for Google Sheets operations
# Version: 1.0.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="track-progress.sh"

# Configuration
STATE_FILE="${STATE_FILE:-./.claude/cfn-extras/.gs-progress-state.json}"
TASK_ID="${TASK_ID:-}"
ACTION="read"
LOCK_TIMEOUT=5
MAX_RETRIES=3

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Trap for cleanup
cleanup() {
  if [ -f "${STATE_FILE}.lock" ]; then
    rm -f "${STATE_FILE}.lock" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Usage information
usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --action ACTION         Action to perform: read, write, update, reset (default: read)
  --state-file FILE       Path to progress state file (default: .claude/cfn-extras/.gs-progress-state.json)
  --task-id ID            Task ID for coordination context
  --completed ARRAY       JSON array of completed sprints: ["schema_001","data_001"]
  --current SPRINT        Current active sprint identifier: schema_001
  --remaining ARRAY       JSON array of remaining sprints: ["formula_001"]
  --status STATUS         State status: in_progress, completed, blocked, paused
  --metadata JSON         Additional JSON metadata to track
  -h, --help              Show this help message
  -v, --verbose           Enable verbose output

Examples:
  # Read current progress state
  $0 --action read

  # Initialize new sprint tracking
  $0 --action write \\
    --completed '[]' \\
    --current schema_001 \\
    --remaining '["data_001","formula_001"]' \\
    --status in_progress

  # Update after completing a sprint
  $0 --action update \\
    --completed '["schema_001"]' \\
    --current data_001 \\
    --remaining '["formula_001"]'

  # Reset state for retry
  $0 --action reset
EOF
}

# Parse arguments
VERBOSE=false
COMPLETED=""
CURRENT=""
REMAINING=""
STATUS=""
METADATA=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --action)
      ACTION="$2"
      shift 2
      ;;
    --state-file)
      STATE_FILE="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --completed)
      COMPLETED="$2"
      shift 2
      ;;
    --current)
      CURRENT="$2"
      shift 2
      ;;
    --remaining)
      REMAINING="$2"
      shift 2
      ;;
    --status)
      STATUS="$2"
      shift 2
      ;;
    --metadata)
      METADATA="$2"
      shift 2
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

# Logging helper
log_verbose() {
  if [ "$VERBOSE" = true ]; then
    echo "[VERBOSE] $*" >&2
  fi
}

# Error handling
error_exit() {
  local message="$1"
  local code="${2:-1}"
  echo "ERROR: $message" >&2
  exit "$code"
}

# Validate enum values
validate_enum() {
  local value="$1"
  local field="$2"
  local allowed="$3"

  if ! [[ "$allowed" =~ $value ]]; then
    error_exit "Invalid $field value: $value. Allowed: $allowed"
  fi
}

# Validate sprint identifier format
validate_sprint_id() {
  local sprint="$1"
  if ! [[ "$sprint" =~ ^[a-z]+_[0-9]{3}$ ]]; then
    error_exit "Invalid sprint identifier format: $sprint (expected: pattern_###)"
  fi
}

# Validate JSON format
validate_json() {
  local json_str="$1"
  local field="$2"

  if ! jq empty <<<"$json_str" 2>/dev/null; then
    error_exit "Invalid JSON in $field: $json_str"
  fi
}

# Acquire lock with exponential backoff
acquire_lock() {
  local attempt=0
  local wait_time=100

  while [ $attempt -lt $MAX_RETRIES ]; do
    if mkdir "${STATE_FILE}.lock" 2>/dev/null; then
      log_verbose "Lock acquired on attempt $((attempt + 1))"
      return 0
    fi

    attempt=$((attempt + 1))
    if [ $attempt -lt $MAX_RETRIES ]; then
      log_verbose "Lock contention, waiting ${wait_time}ms..."
      sleep 0.$((wait_time))
      wait_time=$((wait_time * 2))
    fi
  done

  error_exit "Failed to acquire lock after $MAX_RETRIES attempts"
}

# Create directory for state file
ensure_state_dir() {
  local dir
  dir=$(dirname "$STATE_FILE")
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
  fi
}

# Initialize default state
init_default_state() {
  local task_id="${1:-unknown}"
  cat <<EOF
{
  "task_id": "$task_id",
  "sprint_sequence": [],
  "completed": [],
  "current": "",
  "remaining": [],
  "status": "pending",
  "timestamps": {
    "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "started": null,
    "completed": null
  },
  "metrics": {
    "total_sprints": 0,
    "completed_count": 0,
    "remaining_count": 0,
    "progress_percentage": 0.0,
    "estimated_completion": null
  },
  "metadata": {}
}
EOF
}

# Validate state structure
validate_state_structure() {
  local state="$1"

  # Check required fields
  if ! echo "$state" | jq -e '.completed and .current and .remaining and .status' >/dev/null 2>&1; then
    error_exit "State missing required fields (completed, current, remaining, status)"
  fi

  # Validate status enum
  local status
  status=$(echo "$state" | jq -r '.status')
  validate_enum "$status" "status" "in_progress|completed|blocked|paused"

  log_verbose "State structure validation passed"
}

# Calculate metrics
calculate_metrics() {
  local state="$1"
  local completed_count
  local total_sprints

  completed_count=$(echo "$state" | jq '.completed | length')
  total_sprints=$(echo "$state" | jq '.metrics.total_sprints')

  local progress_percentage
  if [ "$total_sprints" -gt 0 ]; then
    progress_percentage=$(echo "scale=2; $completed_count * 100 / $total_sprints" | bc)
  else
    progress_percentage=0
  fi

  echo "$state" | jq \
    --arg progress "$progress_percentage" \
    '.metrics.progress_percentage = ($progress | tonumber)'
}

# Action: read state
action_read() {
  log_verbose "Reading state from: $STATE_FILE"

  if [ ! -f "$STATE_FILE" ]; then
    log_verbose "State file not found, initializing default state"
    ensure_state_dir
    init_default_state "$TASK_ID" > "$STATE_FILE"
  fi

  # Validate and read state
  local state
  state=$(cat "$STATE_FILE")

  if ! validate_json "$state" "state file"; then
    error_exit "Failed to parse state file as JSON"
  fi

  validate_state_structure "$state"

  # Output state in JSON format
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  jq \
    --arg now "$now" \
    '.action = "read" | .success = true | .confidence = 0.98 | .execution_timestamp = $now' \
    <<<"$state"
}

# Action: write state (initialize)
action_write() {
  log_verbose "Writing new state"

  if [ -z "$CURRENT" ] || [ -z "$STATUS" ]; then
    error_exit "Write action requires --current and --status arguments"
  fi

  # Validate inputs
  validate_sprint_id "$CURRENT"
  validate_enum "$STATUS" "status" "in_progress|completed|blocked|paused"

  if [ -n "$COMPLETED" ]; then
    validate_json "$COMPLETED" "completed"
  fi
  if [ -n "$REMAINING" ]; then
    validate_json "$REMAINING" "remaining"
  fi

  local completed_array="${COMPLETED:-[]}"
  local remaining_array="${REMAINING:-[]}"

  # Build sprint sequence
  local sprint_sequence
  sprint_sequence=$(jq -n \
    --argjson completed "$completed_array" \
    --arg current "$CURRENT" \
    --argjson remaining "$remaining_array" \
    '($completed + [$current] + $remaining) | unique')

  # Create new state
  local state
  state=$(jq -n \
    --arg task_id "$TASK_ID" \
    --argjson sprint_sequence "$sprint_sequence" \
    --argjson completed "$completed_array" \
    --arg current "$CURRENT" \
    --argjson remaining "$remaining_array" \
    --arg status "$STATUS" \
    --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      task_id: $task_id,
      sprint_sequence: $sprint_sequence,
      completed: $completed,
      current: $current,
      remaining: $remaining,
      status: $status,
      timestamps: {
        created: $now,
        last_updated: $now,
        started: $now,
        completed: null
      },
      metrics: {
        total_sprints: ($sprint_sequence | length),
        completed_count: ($completed | length),
        remaining_count: ($remaining | length),
        progress_percentage: 0.0,
        estimated_completion: null
      },
      metadata: {}
    }')

  # Add user metadata if provided
  if [ -n "$METADATA" ]; then
    validate_json "$METADATA" "metadata"
    state=$(jq --argjson meta "$METADATA" '.metadata = $meta' <<<"$state")
  fi

  # Calculate metrics
  state=$(calculate_metrics "$state")

  # Write state atomically
  ensure_state_dir
  acquire_lock
  echo "$state" > "${STATE_FILE}.tmp"
  mv "${STATE_FILE}.tmp" "$STATE_FILE"

  log_verbose "State written successfully"

  # Output result
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  jq \
    --arg now "$now" \
    '.action = "write" | .success = true | .confidence = 0.99 | .execution_timestamp = $now | .deliverables = [env.STATE_FILE] | .errors = []' \
    --arg STATE_FILE "$STATE_FILE" \
    <<<"$state"
}

# Action: update state
action_update() {
  log_verbose "Updating state"

  # Read current state
  local current_state
  if [ ! -f "$STATE_FILE" ]; then
    error_exit "State file does not exist. Use --action write to initialize."
  fi

  current_state=$(cat "$STATE_FILE")
  validate_json "$current_state" "state file"
  validate_state_structure "$current_state"

  # Apply updates if provided
  local updated_state="$current_state"

  if [ -n "$COMPLETED" ]; then
    validate_json "$COMPLETED" "completed"
    updated_state=$(jq --argjson completed "$COMPLETED" '.completed = $completed' <<<"$updated_state")
  fi

  if [ -n "$CURRENT" ]; then
    validate_sprint_id "$CURRENT"
    updated_state=$(jq --arg current "$CURRENT" '.current = $current' <<<"$updated_state")
  fi

  if [ -n "$REMAINING" ]; then
    validate_json "$REMAINING" "remaining"
    updated_state=$(jq --argjson remaining "$REMAINING" '.remaining = $remaining' <<<"$updated_state")
  fi

  if [ -n "$STATUS" ]; then
    validate_enum "$STATUS" "status" "in_progress|completed|blocked|paused"
    updated_state=$(jq --arg status "$STATUS" '.status = $status' <<<"$updated_state")
  fi

  if [ -n "$METADATA" ]; then
    validate_json "$METADATA" "metadata"
    updated_state=$(jq --argjson meta "$METADATA" '.metadata = $meta' <<<"$updated_state")
  fi

  # Update timestamps and metrics
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  updated_state=$(jq --arg now "$now" '.timestamps.last_updated = $now' <<<"$updated_state")

  # Update completion timestamp if status is completed
  local status
  status=$(echo "$updated_state" | jq -r '.status')
  if [ "$status" = "completed" ]; then
    updated_state=$(jq --arg now "$now" '.timestamps.completed = $now' <<<"$updated_state")
  fi

  # Recalculate metrics
  updated_state=$(calculate_metrics "$updated_state")

  # Write state atomically
  acquire_lock
  echo "$updated_state" > "${STATE_FILE}.tmp"
  mv "${STATE_FILE}.tmp" "$STATE_FILE"

  log_verbose "State updated successfully"

  # Output result
  jq \
    --arg now "$now" \
    '.action = "update" | .success = true | .confidence = 0.98 | .execution_timestamp = $now | .deliverables = [env.STATE_FILE] | .errors = []' \
    --arg STATE_FILE "$STATE_FILE" \
    <<<"$updated_state"
}

# Action: reset state
action_reset() {
  log_verbose "Resetting state"

  if [ -f "$STATE_FILE" ]; then
    # Create backup
    local backup_dir=".backups/gs-progress"
    mkdir -p "$backup_dir"
    local backup_file="$backup_dir/$(date +%s)_backup.json"
    cp "$STATE_FILE" "$backup_file"
    log_verbose "Backup created: $backup_file"

    # Remove state file
    rm -f "$STATE_FILE"
  fi

  log_verbose "State reset successfully"

  # Output result
  cat <<EOF
{
  "success": true,
  "action": "reset",
  "confidence": 0.99,
  "message": "State reset successfully",
  "deliverables": [],
  "errors": []
}
EOF
}

# Validate action parameter
validate_enum "$ACTION" "action" "read|write|update|reset"

# Execute action
case "$ACTION" in
  read)
    action_read
    ;;
  write)
    action_write
    ;;
  update)
    action_update
    ;;
  reset)
    action_reset
    ;;
  *)
    error_exit "Unknown action: $ACTION"
    ;;
esac
