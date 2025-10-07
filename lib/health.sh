#!/usr/bin/env bash
# lib/health.sh - Health check and liveness tracking for CLI coordination agents
# Phase 1 Sprint 1.2: Health Checks & Liveness
# Provides health status reporting, agent liveness tracking, and cluster health monitoring

set -euo pipefail

# ==============================================================================
# HEALTH CHECK CONFIGURATION
# ==============================================================================

# Health storage location (tmpfs for performance, fallback to /tmp)
HEALTH_DIR="${HEALTH_DIR:-/dev/shm/cfn-health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"  # Seconds before agent considered unhealthy
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-5}"  # Seconds between health checks

# Health status API endpoint (for HTTP health checks)
HEALTH_API_PORT="${HEALTH_API_PORT:-8080}"
HEALTH_API_ENABLED="${HEALTH_API_ENABLED:-false}"

# Lock file for thread-safe operations
HEALTH_LOCK_FILE="${HEALTH_LOCK_FILE:-/var/lock/cfn-health.lock}"

# Initialize health directory
mkdir -p "$HEALTH_DIR"
mkdir -p "$(dirname "$HEALTH_LOCK_FILE")"
chmod 755 "$HEALTH_DIR"

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
# MESSAGE BUS INTEGRATION
# ==============================================================================

# Source message-bus library if available
MESSAGE_BUS_LIB="${MESSAGE_BUS_LIB:-/mnt/c/Users/masha/Documents/claude-flow-novice/tests/cli-coordination/message-bus.sh}"
MESSAGE_BUS_ENABLED="${MESSAGE_BUS_ENABLED:-true}"

if [[ -f "$MESSAGE_BUS_LIB" ]] && [[ "$MESSAGE_BUS_ENABLED" == "true" ]]; then
  source "$MESSAGE_BUS_LIB"
  HEALTH_MESSAGE_BUS_AVAILABLE=true
else
  HEALTH_MESSAGE_BUS_AVAILABLE=false
fi

# publish_health_event - Publish health status change to message-bus
# Usage: publish_health_event <agent_id> <status> [details]
# Args:
#   $1 - agent_id: Agent reporting health
#   $2 - status: Health status (healthy|unhealthy|degraded|unknown)
#   $3 - details: Optional JSON or string with additional context
# Returns: 0 on success, 1 on failure
publish_health_event() {
  local agent_id="$1"
  local status="$2"
  local details="${3:-{}}"

  # Skip if message bus not available
  if [[ "$HEALTH_MESSAGE_BUS_AVAILABLE" != "true" ]]; then
    return 0
  fi

  # Validate parameters
  if [[ -z "$agent_id" || -z "$status" ]]; then
    echo "[ERROR] publish_health_event: agent_id and status required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  # Build health event payload
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  local payload

  # Parse details if JSON, otherwise wrap as string
  if echo "$details" | jq empty 2>/dev/null; then
    payload=$(jq -n \
      --arg agent "$agent_id" \
      --arg status "$status" \
      --arg ts "$timestamp" \
      --argjson details "$details" \
      '{
        event: "health_change",
        agent_id: $agent,
        status: $status,
        timestamp: $ts,
        details: $details
      }')
  else
    payload=$(jq -n \
      --arg agent "$agent_id" \
      --arg status "$status" \
      --arg ts "$timestamp" \
      --arg details "$details" \
      '{
        event: "health_change",
        agent_id: $agent,
        status: $status,
        timestamp: $ts,
        details: {message: $details}
      }')
  fi

  # Broadcast to all agents by sending to "health-coordinator"
  # The health-coordinator can be a virtual agent that all agents subscribe to
  if type -t send_message >/dev/null 2>&1; then
    send_message "$agent_id" "health-coordinator" "health_event" "$payload" 2>/dev/null || true
  fi

  return 0
}

# subscribe_health_updates - Subscribe to health updates from message-bus
# Usage: subscribe_health_updates <agent_id> [callback_function]
# Args:
#   $1 - agent_id: Subscribing agent ID
#   $2 - callback_function: Optional function to call for each health event
# Returns: JSON array of health events
subscribe_health_updates() {
  local agent_id="$1"
  local callback="${2:-}"

  # Skip if message bus not available
  if [[ "$HEALTH_MESSAGE_BUS_AVAILABLE" != "true" ]]; then
    echo "[]"
    return 0
  fi

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] subscribe_health_updates: agent_id required" >&2
    return 1
  fi

  # Receive messages for health-coordinator (where health events are published)
  local messages="[]"

  if type -t receive_messages >/dev/null 2>&1; then
    # For agents subscribing to health updates, they receive from their own inbox
    # (health events are sent to "health-coordinator" but copied to all agent inboxes)
    messages=$(receive_messages "$agent_id" 2>/dev/null || echo "[]")
  fi

  # Filter for health_event type messages
  local health_events
  health_events=$(echo "$messages" | jq '[.[] | select(.type == "health_event")]' 2>/dev/null || echo "[]")

  # If callback provided, call it for each event
  if [[ -n "$callback" ]] && type -t "$callback" >/dev/null 2>&1; then
    local event_count=$(echo "$health_events" | jq 'length')
    for ((i=0; i<event_count; i++)); do
      local event=$(echo "$health_events" | jq ".[$i]")
      "$callback" "$event" || true
    done
  fi

  echo "$health_events"
  return 0
}

# broadcast_health_to_agents - Broadcast health event to all known agents
# Usage: broadcast_health_to_agents <from_agent_id> <status> [details]
# Internal function used for distributed health monitoring
broadcast_health_to_agents() {
  local from_agent="$1"
  local status="$2"
  local details="${3:-{}}"

  # Skip if message bus not available
  if [[ "$HEALTH_MESSAGE_BUS_AVAILABLE" != "true" ]]; then
    return 0
  fi

  # Build payload
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  local payload

  if echo "$details" | jq empty 2>/dev/null; then
    payload=$(jq -n \
      --arg agent "$from_agent" \
      --arg status "$status" \
      --arg ts "$timestamp" \
      --argjson details "$details" \
      '{
        event: "health_broadcast",
        agent_id: $agent,
        status: $status,
        timestamp: $ts,
        details: $details
      }')
  else
    payload="{\"event\":\"health_broadcast\",\"agent_id\":\"$from_agent\",\"status\":\"$status\",\"timestamp\":\"$timestamp\"}"
  fi

  # Find all agent directories in message bus
  if [[ -d "$MESSAGE_BASE_DIR" ]]; then
    for agent_dir in "$MESSAGE_BASE_DIR"/*; do
      [[ -d "$agent_dir" ]] || continue
      local target_agent=$(basename "$agent_dir")

      # Skip self
      [[ "$target_agent" == "$from_agent" ]] && continue

      # Send health broadcast
      if type -t send_message >/dev/null 2>&1; then
        send_message "$from_agent" "$target_agent" "health_broadcast" "$payload" 2>/dev/null || true
      fi
    done
  fi

  return 0
}

# ==============================================================================
# CORE HEALTH REPORTING FUNCTIONS
# ==============================================================================

# report_health - Report agent health status with structured metadata
# Usage: report_health <agent_id> [status] [details]
# Args:
#   $1 - agent_id: Unique identifier for the agent (required)
#   $2 - status: Health status (healthy|unhealthy|degraded|unknown) (default: healthy)
#   $3 - details: Optional JSON or string with additional context
# Example: report_health "agent-123" "healthy" '{"last_task":"completed","queue_depth":5}'
report_health() {
  local agent_id="$1"
  local status="${2:-healthy}"
  local details="${3:-}"

  # Validate required parameters
  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] report_health: agent_id required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  # Validate status is one of allowed values
  if [[ ! "$status" =~ ^(healthy|unhealthy|degraded|unknown)$ ]]; then
    echo "[ERROR] report_health: Invalid status '$status'. Must be: healthy|unhealthy|degraded|unknown" >&2
    return 1
  fi

  # Create agent-specific directory
  local agent_dir="$HEALTH_DIR/$agent_id"
  mkdir -p "$agent_dir"

  # Generate ISO 8601 timestamp
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  # Build health status JSON with jq for correctness
  local status_file="$agent_dir/status.json"

  # Check if status changed (for event publishing)
  local status_changed=false
  local previous_status="unknown"

  if [[ -f "$status_file" ]]; then
    previous_status=$(jq -r '.status' "$status_file" 2>/dev/null || echo "unknown")
    if [[ "$previous_status" != "$status" ]]; then
      status_changed=true
    fi
  else
    status_changed=true  # First time reporting
  fi

  # Acquire lock for thread-safe writes
  (
    flock -x 200

    # Create status JSON with proper escaping
    if [[ -n "$details" ]]; then
      # Try to parse details as JSON, fallback to string if invalid
      if echo "$details" | jq empty 2>/dev/null; then
        # Valid JSON - merge into status
        jq -n \
          --arg id "$agent_id" \
          --arg status "$status" \
          --arg ts "$timestamp" \
          --argjson details "$details" \
          '{
            agent_id: $id,
            status: $status,
            timestamp: $ts,
            details: $details,
            hostname: env.HOSTNAME,
            pid: env.BASHPID
          }' > "$status_file.tmp"
      else
        # Invalid JSON - treat as string message
        jq -n \
          --arg id "$agent_id" \
          --arg status "$status" \
          --arg ts "$timestamp" \
          --arg details "$details" \
          '{
            agent_id: $id,
            status: $status,
            timestamp: $ts,
            details: {message: $details},
            hostname: env.HOSTNAME,
            pid: env.BASHPID
          }' > "$status_file.tmp"
      fi
    else
      # No details provided
      jq -n \
        --arg id "$agent_id" \
        --arg status "$status" \
        --arg ts "$timestamp" \
        '{
          agent_id: $id,
          status: $status,
          timestamp: $ts,
          hostname: env.HOSTNAME,
          pid: env.BASHPID
        }' > "$status_file.tmp"
    fi

    # Atomic rename for consistency
    mv "$status_file.tmp" "$status_file"
    chmod 644 "$status_file"

  ) 200>"$HEALTH_LOCK_FILE"

  # Publish health event to message-bus if status changed
  if [[ "$status_changed" == "true" ]] && [[ "$HEALTH_MESSAGE_BUS_AVAILABLE" == "true" ]]; then
    publish_health_event "$agent_id" "$status" "$details" || true
  fi

  return 0
}

# check_agent_health - Check if a specific agent is healthy
# Usage: check_agent_health <agent_id>
# Returns: Status string (healthy|unhealthy|degraded|unknown) and exit code
# Exit codes: 0=healthy, 1=unhealthy/unknown, 2=degraded
check_agent_health() {
  local agent_id="$1"

  # Validate agent_id provided
  if [[ -z "$agent_id" ]]; then
    echo "unknown"
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    echo "unknown"
    return 1
  fi

  local status_file="$HEALTH_DIR/$agent_id/status.json"

  # Check if status file exists
  if [[ ! -f "$status_file" ]]; then
    echo "unknown"
    return 1
  fi

  # Get file modification time (last health report)
  local last_update=$(stat -c %Y "$status_file" 2>/dev/null || echo 0)
  local now=$(date +%s)
  local age=$((now - last_update))

  # Check if health report is stale (older than timeout)
  if [[ "$age" -gt "$HEALTH_TIMEOUT" ]]; then
    echo "unhealthy"
    return 1
  fi

  # Read status from JSON file
  local reported_status=$(jq -r '.status' "$status_file" 2>/dev/null || echo "unknown")

  echo "$reported_status"

  # Return appropriate exit code
  case "$reported_status" in
    healthy)
      return 0
      ;;
    degraded)
      return 2
      ;;
    unhealthy|unknown|*)
      return 1
      ;;
  esac
}

# get_agent_health_details - Get full health status JSON for an agent
# Usage: get_agent_health_details <agent_id>
# Returns: JSON object with full health data
get_agent_health_details() {
  local agent_id="$1"
  local status_file="$HEALTH_DIR/$agent_id/status.json"

  if [[ -z "$agent_id" ]]; then
    echo '{"error":"agent_id required"}'
    return 1
  fi

  if [[ ! -f "$status_file" ]]; then
    echo '{"error":"agent not found"}'
    return 1
  fi

  # Read and return JSON with age calculation
  local last_update=$(stat -c %Y "$status_file" 2>/dev/null || echo 0)
  local now=$(date +%s)
  local age=$((now - last_update))

  jq --arg age "$age" '. + {age_seconds: ($age|tonumber)}' "$status_file" 2>/dev/null || \
    echo '{"error":"invalid health data"}'
}

# ==============================================================================
# CLUSTER HEALTH FUNCTIONS
# ==============================================================================

# get_cluster_health - Get aggregated health status for all agents
# Usage: get_cluster_health [output_format]
# Args:
#   $1 - output_format: json|summary (default: json)
# Returns: JSON with total/healthy/unhealthy/degraded counts
get_cluster_health() {
  local output_format="${1:-json}"
  local total=0
  local healthy=0
  local unhealthy=0
  local degraded=0
  local unknown=0

  # Iterate through all agent directories
  if [[ -d "$HEALTH_DIR" ]]; then
    for agent_dir in "$HEALTH_DIR"/*; do
      [[ -d "$agent_dir" ]] || continue

      local agent_id=$(basename "$agent_dir")
      total=$((total + 1))

      # Get agent health status
      local status
      status=$(check_agent_health "$agent_id")
      local exit_code=$?

      case "$status" in
        healthy)
          healthy=$((healthy + 1))
          ;;
        degraded)
          degraded=$((degraded + 1))
          ;;
        unhealthy)
          unhealthy=$((unhealthy + 1))
          ;;
        unknown)
          unknown=$((unknown + 1))
          ;;
      esac
    done
  fi

  # Calculate health percentage
  local health_pct=0
  if [[ $total -gt 0 ]]; then
    health_pct=$((healthy * 100 / total))
  fi

  # Output in requested format
  case "$output_format" in
    json)
      jq -n \
        --arg total "$total" \
        --arg healthy "$healthy" \
        --arg unhealthy "$unhealthy" \
        --arg degraded "$degraded" \
        --arg unknown "$unknown" \
        --arg health_pct "$health_pct" \
        '{
          total: ($total|tonumber),
          healthy: ($healthy|tonumber),
          unhealthy: ($unhealthy|tonumber),
          degraded: ($degraded|tonumber),
          unknown: ($unknown|tonumber),
          health_percentage: ($health_pct|tonumber),
          timestamp: now|strftime("%Y-%m-%dT%H:%M:%SZ")
        }'
      ;;
    summary)
      echo "Cluster Health: $healthy/$total healthy ($health_pct%)"
      echo "  Healthy:   $healthy"
      echo "  Degraded:  $degraded"
      echo "  Unhealthy: $unhealthy"
      echo "  Unknown:   $unknown"
      ;;
    *)
      echo "[ERROR] Invalid output format: $output_format" >&2
      return 1
      ;;
  esac
}

# get_unhealthy_agents - List all unhealthy agents with details
# Usage: get_unhealthy_agents
# Returns: JSON array of unhealthy agent details
get_unhealthy_agents() {
  local unhealthy_list="[]"

  if [[ -d "$HEALTH_DIR" ]]; then
    for agent_dir in "$HEALTH_DIR"/*; do
      [[ -d "$agent_dir" ]] || continue

      local agent_id=$(basename "$agent_dir")
      local status
      status=$(check_agent_health "$agent_id")

      # Include unhealthy, degraded, and unknown agents
      if [[ "$status" != "healthy" ]]; then
        local details
        details=$(get_agent_health_details "$agent_id")

        # Append to array using jq
        unhealthy_list=$(echo "$unhealthy_list" | jq --argjson details "$details" '. += [$details]')
      fi
    done
  fi

  echo "$unhealthy_list"
}

# ==============================================================================
# LIVENESS PROBE FUNCTIONS
# ==============================================================================

# start_liveness_probe - Start periodic health reporting for an agent
# Usage: start_liveness_probe <agent_id> [interval_seconds]
# Background process that reports health at regular intervals
start_liveness_probe() {
  local agent_id="$1"
  local interval="${2:-$HEALTH_CHECK_INTERVAL}"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] start_liveness_probe: agent_id required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  # Create PID file for probe
  local pid_file="$HEALTH_DIR/$agent_id/liveness.pid"
  mkdir -p "$(dirname "$pid_file")"

  # Check if probe already running
  if [[ -f "$pid_file" ]]; then
    local existing_pid=$(cat "$pid_file")
    if kill -0 "$existing_pid" 2>/dev/null; then
      echo "[WARN] Liveness probe already running for $agent_id (PID $existing_pid)" >&2
      return 0
    fi
  fi

  # Initialize message bus for this agent if available
  if [[ "$HEALTH_MESSAGE_BUS_AVAILABLE" == "true" ]] && type -t init_message_bus >/dev/null 2>&1; then
    init_message_bus "$agent_id" 2>/dev/null || true
  fi

  # Start background liveness loop
  (
    echo $$ > "$pid_file"

    while true; do
      # Report healthy status (automatically publishes to message-bus if status changes)
      report_health "$agent_id" "healthy" "{\"probe\":\"liveness\",\"interval\":$interval}"
      sleep "$interval"
    done
  ) &

  local probe_pid=$!
  echo "$probe_pid" > "$pid_file"

  echo "[INFO] Started liveness probe for $agent_id (PID $probe_pid, interval ${interval}s)"
  return 0
}

# stop_liveness_probe - Stop periodic health reporting for an agent
# Usage: stop_liveness_probe <agent_id>
stop_liveness_probe() {
  local agent_id="$1"

  if [[ -z "$agent_id" ]]; then
    echo "[ERROR] stop_liveness_probe: agent_id required" >&2
    return 1
  fi

  # SECURITY: Validate agent_id to prevent path traversal
  if ! validate_agent_id "$agent_id"; then
    return 1
  fi

  local pid_file="$HEALTH_DIR/$agent_id/liveness.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "[WARN] No liveness probe found for $agent_id" >&2
    return 0
  fi

  local probe_pid=$(cat "$pid_file")

  if kill -0 "$probe_pid" 2>/dev/null; then
    kill "$probe_pid" 2>/dev/null || true
    echo "[INFO] Stopped liveness probe for $agent_id (PID $probe_pid)"
  fi

  rm -f "$pid_file"
  return 0
}

# ==============================================================================
# CLEANUP FUNCTIONS
# ==============================================================================

# cleanup_stale_agents - Remove health data for agents that haven't reported
# Usage: cleanup_stale_agents [max_age_seconds]
# Args:
#   $1 - max_age_seconds: Remove agents older than this (default: 3600 = 1 hour)
cleanup_stale_agents() {
  local max_age="${1:-3600}"
  local now=$(date +%s)
  local removed=0

  if [[ -d "$HEALTH_DIR" ]]; then
    for agent_dir in "$HEALTH_DIR"/*; do
      [[ -d "$agent_dir" ]] || continue

      local status_file="$agent_dir/status.json"
      if [[ -f "$status_file" ]]; then
        local last_update=$(stat -c %Y "$status_file" 2>/dev/null || echo 0)
        local age=$((now - last_update))

        if [[ "$age" -gt "$max_age" ]]; then
          local agent_id=$(basename "$agent_dir")
          echo "[INFO] Removing stale agent $agent_id (age: ${age}s)" >&2
          rm -rf "$agent_dir"
          removed=$((removed + 1))
        fi
      fi
    done
  fi

  echo "{\"removed\": $removed, \"max_age_seconds\": $max_age}"
}

# cleanup_all_health_data - Remove all health tracking data (reset)
# Usage: cleanup_all_health_data
cleanup_all_health_data() {
  if [[ -d "$HEALTH_DIR" ]]; then
    local count=$(find "$HEALTH_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
    rm -rf "$HEALTH_DIR"/*
    echo "[INFO] Removed health data for $count agents"
  else
    echo "[INFO] No health data to clean"
  fi
}

# ==============================================================================
# HTTP HEALTH CHECK API (Optional)
# ==============================================================================

# start_health_api - Start simple HTTP server for health checks
# Usage: start_health_api [port]
# Provides GET /health and GET /health/<agent_id> endpoints
start_health_api() {
  local port="${1:-$HEALTH_API_PORT}"

  if [[ "$HEALTH_API_ENABLED" != "true" ]]; then
    echo "[WARN] Health API disabled. Set HEALTH_API_ENABLED=true to enable" >&2
    return 0
  fi

  # Simple netcat-based HTTP server for health checks
  # Production deployments should use proper HTTP server
  echo "[INFO] Starting health API on port $port (basic implementation)"
  echo "[WARN] Use proper HTTP server for production (nginx, Apache, etc.)"

  while true; do
    {
      echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n"
      get_cluster_health json
    } | nc -l -p "$port" -q 1
  done &

  echo "[INFO] Health API started on port $port"
}

# ==============================================================================
# COORDINATION STATE INTEGRATION
# ==============================================================================

# update_coordination_topology - Update message-bus coordination state with health info
# Usage: update_coordination_topology [output_format]
# Returns: JSON with coordination topology including health status
update_coordination_topology() {
  local output_format="${1:-json}"

  # Get cluster health summary
  local cluster_health
  cluster_health=$(get_cluster_health json)

  # Build topology with health status
  local topology="[]"

  if [[ -d "$HEALTH_DIR" ]]; then
    for agent_dir in "$HEALTH_DIR"/*; do
      [[ -d "$agent_dir" ]] || continue

      local agent_id=$(basename "$agent_dir")
      local health_details
      health_details=$(get_agent_health_details "$agent_id")

      # Check if agent has message-bus presence
      local has_message_bus=false
      if [[ "$HEALTH_MESSAGE_BUS_AVAILABLE" == "true" ]] && [[ -d "$MESSAGE_BASE_DIR/$agent_id" ]]; then
        has_message_bus=true
      fi

      # Build agent topology entry
      local agent_entry
      agent_entry=$(echo "$health_details" | jq \
        --arg has_bus "$has_message_bus" \
        '. + {message_bus_enabled: ($has_bus == "true")}')

      topology=$(echo "$topology" | jq --argjson entry "$agent_entry" '. += [$entry]')
    done
  fi

  case "$output_format" in
    json)
      jq -n \
        --argjson cluster "$cluster_health" \
        --argjson agents "$topology" \
        '{
          cluster_health: $cluster,
          agents: $agents,
          timestamp: now|strftime("%Y-%m-%dT%H:%M:%SZ")
        }'
      ;;
    summary)
      echo "Coordination Topology:"
      echo "$cluster_health" | jq -r '"  Total Agents: \(.total)"'
      echo "$cluster_health" | jq -r '"  Healthy: \(.healthy)"'
      echo "$cluster_health" | jq -r '"  Unhealthy: \(.unhealthy)"'
      echo ""
      echo "Agent Details:"
      echo "$topology" | jq -r '.[] | "  \(.agent_id): \(.status) (bus: \(.message_bus_enabled))"'
      ;;
    *)
      echo "[ERROR] Invalid output format: $output_format" >&2
      return 1
      ;;
  esac
}

# detect_unhealthy_agents_fast - Fast detection of unhealthy agents (<5s requirement)
# Usage: detect_unhealthy_agents_fast
# Returns: JSON array of unhealthy agents detected in <5 seconds
detect_unhealthy_agents_fast() {
  local start_time=$(date +%s%3N)  # Milliseconds
  local unhealthy="[]"

  # Fast path: check only status files without complex processing
  if [[ -d "$HEALTH_DIR" ]]; then
    for agent_dir in "$HEALTH_DIR"/*; do
      [[ -d "$agent_dir" ]] || continue

      local agent_id=$(basename "$agent_dir")
      local status_file="$agent_dir/status.json"

      # Skip if no status file
      [[ -f "$status_file" ]] || continue

      # Quick staleness check
      local last_update=$(stat -c %Y "$status_file" 2>/dev/null || echo 0)
      local now=$(date +%s)
      local age=$((now - last_update))

      # Check if stale or reported unhealthy
      if [[ "$age" -gt "$HEALTH_TIMEOUT" ]]; then
        local entry=$(jq -n \
          --arg id "$agent_id" \
          --arg age "$age" \
          --arg reason "stale" \
          '{agent_id: $id, status: "unhealthy", age_seconds: ($age|tonumber), reason: $reason}')
        unhealthy=$(echo "$unhealthy" | jq --argjson entry "$entry" '. += [$entry]')
      else
        local reported_status=$(jq -r '.status' "$status_file" 2>/dev/null || echo "unknown")
        if [[ "$reported_status" != "healthy" ]]; then
          local entry=$(jq -n \
            --arg id "$agent_id" \
            --arg status "$reported_status" \
            --arg age "$age" \
            --arg reason "reported_$reported_status" \
            '{agent_id: $id, status: $status, age_seconds: ($age|tonumber), reason: $reason}')
          unhealthy=$(echo "$unhealthy" | jq --argjson entry "$entry" '. += [$entry]')
        fi
      fi
    done
  fi

  local end_time=$(date +%s%3N)
  local elapsed=$((end_time - start_time))

  # Add performance metadata
  jq -n \
    --argjson agents "$unhealthy" \
    --arg elapsed "$elapsed" \
    '{
      unhealthy_agents: $agents,
      detection_time_ms: ($elapsed|tonumber),
      timestamp: now|strftime("%Y-%m-%dT%H:%M:%SZ")
    }'
}

# publish_topology_update - Publish coordination topology update to message-bus
# Usage: publish_topology_update <coordinator_id>
# Broadcasts current topology state to all agents
publish_topology_update() {
  local coordinator_id="${1:-health-coordinator}"

  if [[ "$HEALTH_MESSAGE_BUS_AVAILABLE" != "true" ]]; then
    echo "[WARN] Message bus not available, skipping topology update" >&2
    return 0
  fi

  # Get current topology
  local topology
  topology=$(update_coordination_topology json)

  # Broadcast to all agents via message-bus
  if [[ -d "$MESSAGE_BASE_DIR" ]]; then
    for agent_dir in "$MESSAGE_BASE_DIR"/*; do
      [[ -d "$agent_dir" ]] || continue
      local target_agent=$(basename "$agent_dir")

      # Skip self
      [[ "$target_agent" == "$coordinator_id" ]] && continue

      # Send topology update
      if type -t send_message >/dev/null 2>&1; then
        send_message "$coordinator_id" "$target_agent" "topology_update" "$topology" 2>/dev/null || true
      fi
    done
  fi

  echo "[INFO] Published topology update to all agents"
  return 0
}

# ==============================================================================
# VALIDATION FUNCTIONS
# ==============================================================================

# validate_health_system - Run self-tests on health check system
# Usage: validate_health_system
# Returns: 0 if all tests pass, 1 otherwise
validate_health_system() {
  local failures=0

  echo "[TEST] Validating health check system..."

  # Test 1: Directory writable
  if [[ ! -w "$HEALTH_DIR" ]]; then
    echo "[FAIL] Health directory not writable: $HEALTH_DIR"
    failures=$((failures + 1))
  else
    echo "[PASS] Health directory writable"
  fi

  # Test 2: report_health function
  local test_agent="test-agent-$$"
  if report_health "$test_agent" "healthy" '{"test":true}' 2>/dev/null; then
    echo "[PASS] report_health function works"
  else
    echo "[FAIL] report_health function failed"
    failures=$((failures + 1))
  fi

  # Test 3: check_agent_health function
  local status
  status=$(check_agent_health "$test_agent")
  if [[ "$status" == "healthy" ]]; then
    echo "[PASS] check_agent_health function works"
  else
    echo "[FAIL] check_agent_health returned: $status"
    failures=$((failures + 1))
  fi

  # Test 4: get_cluster_health function
  if get_cluster_health json >/dev/null 2>&1; then
    echo "[PASS] get_cluster_health function works"
  else
    echo "[FAIL] get_cluster_health function failed"
    failures=$((failures + 1))
  fi

  # Cleanup test agent
  rm -rf "$HEALTH_DIR/$test_agent"

  if [[ $failures -eq 0 ]]; then
    echo "[SUCCESS] All health system tests passed"
    return 0
  else
    echo "[FAILURE] $failures test(s) failed"
    return 1
  fi
}

# ==============================================================================
# MAIN EXECUTION (if sourced vs executed)
# ==============================================================================

# If script is executed directly (not sourced), run validation
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  validate_health_system
fi
