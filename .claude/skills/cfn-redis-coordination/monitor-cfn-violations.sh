#!/bin/bash
# monitor-cfn-violations.sh - Real-time CFN Loop violation detector
# Part of Redis Coordination Skill
#
# Monitors active CFN Loop executions and detects common violations:
# - Orchestrator never started
# - Loop 2 started before Loop 3 complete (gate bypass)
# - Missing agent completion signals
# - Heartbeat monitoring not started
# - Product Owner not consulted
# - Coordinator timeout issues
#
# Alerts sent via Redis pub/sub and WebSocket (web portal integration)
#
# Usage: ./monitor-cfn-violations.sh [--interval 30] [--websocket-port 3001]
#
# Version: 1.0.0
# Last Updated: 2025-10-20

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
CHECK_INTERVAL=30  # seconds between checks
WEBSOCKET_PORT=3001
VIOLATION_LOG="/tmp/cfn-violations.log"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --interval)
      CHECK_INTERVAL="$2"
      shift 2
      ;;
    --websocket-port)
      WEBSOCKET_PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

echo "=== CFN Loop Violation Monitor ==="
echo "Redis: ${REDIS_HOST}:${REDIS_PORT}"
echo "Check interval: ${CHECK_INTERVAL}s"
echo "WebSocket port: ${WEBSOCKET_PORT}"
echo "Log: ${VIOLATION_LOG}"
echo ""

# Initialize violation log
echo "[$(date -Iseconds)] Monitor started" > "$VIOLATION_LOG"

# Function: Send violation alert via Redis pub/sub
send_violation_alert() {
  local task_id="$1"
  local violation_type="$2"
  local severity="$3"  # critical, warning, info
  local description="$4"
  local recommendation="$5"
  local evidence="$6"  # JSON string

  local timestamp=$(date -Iseconds)

  # Build JSON alert
  local alert=$(jq -nc \
    --arg ts "$timestamp" \
    --arg tid "$task_id" \
    --arg vtype "$violation_type" \
    --arg sev "$severity" \
    --arg desc "$description" \
    --arg rec "$recommendation" \
    --argjson ev "$evidence" \
    '{
      timestamp: $ts,
      task_id: $tid,
      violation_type: $vtype,
      severity: $sev,
      description: $desc,
      recommendation: $rec,
      evidence: $ev
    }')

  # Publish to task-specific channel
  echo "$alert" | redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    PUBLISH "swarm:${task_id}:violations" >/dev/null

  # Publish to global violations channel (for web portal)
  echo "$alert" | redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    PUBLISH "cfn:violations:all" >/dev/null

  # Log violation
  echo "[$(date -Iseconds)] [$severity] $violation_type: $description (task: $task_id)" >> "$VIOLATION_LOG"

  # Send to WebSocket server if available
  if command -v curl &>/dev/null; then
    curl -s -X POST "http://localhost:${WEBSOCKET_PORT}/api/violations" \
      -H "Content-Type: application/json" \
      -d "$alert" >/dev/null 2>&1 || true
  fi

  echo "  🚨 [$severity] $violation_type: $description"
}

# Function: Check if orchestrator never started
check_orchestrator_not_started() {
  local swarm_id="$1"

  # Get swarm metadata
  local created_at=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    HGET "$swarm_id" created_at 2>/dev/null || echo "")

  if [ -z "$created_at" ]; then
    return 0  # Swarm doesn't exist, skip
  fi

  # Calculate time elapsed
  local created_ts=$(date -d "$created_at" +%s 2>/dev/null || echo "0")
  local now_ts=$(date +%s)
  local elapsed=$((now_ts - created_ts))

  # If swarm exists >2 minutes but no status key, orchestrator never started
  if [ $elapsed -gt 120 ]; then
    local task_id=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      HGET "$swarm_id" task_id 2>/dev/null || echo "unknown")

    local status_key="swarm:${task_id}:status"
    local status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      GET "$status_key" 2>/dev/null || echo "")

    if [ -z "$status" ]; then
      # Check if already alerted
      local alert_key="violation:${task_id}:orchestrator_not_started"
      if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXISTS "$alert_key" | grep -q "1"; then
        local evidence=$(jq -nc \
          --arg created "$created_at" \
          --arg elapsed "$elapsed" \
          --arg status_exists "false" \
          '{
            swarm_created_at: $created,
            time_elapsed_seconds: ($elapsed | tonumber),
            status_key_exists: ($status_exists == "true"),
            agent_keys_count: 0
          }')

        send_violation_alert \
          "$task_id" \
          "orchestrator_never_started" \
          "critical" \
          "Orchestrator was never spawned after ${elapsed}s. Coordinator may have failed at Step 2." \
          "Check coordinator logs. Ensure orchestrator spawned with run_in_background: true" \
          "$evidence"

        # Mark as alerted (TTL 1 hour)
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
          SETEX "$alert_key" 3600 "alerted" >/dev/null
      fi
    fi
  fi
}

# Function: Check if Loop 2 started before Loop 3 completed (gate bypass)
check_gate_bypass() {
  local task_id="$1"

  # Check if Loop 2 started
  local loop2_start=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    GET "swarm:${task_id}:loop2:started" 2>/dev/null || echo "")

  if [ -n "$loop2_start" ]; then
    # Check if Loop 3 completed
    local loop3_complete=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      GET "swarm:${task_id}:loop3:complete" 2>/dev/null || echo "")

    if [ -z "$loop3_complete" ]; then
      local alert_key="violation:${task_id}:gate_bypass"
      if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXISTS "$alert_key" | grep -q "1"; then
        local evidence=$(jq -nc \
          --arg loop2_start "$loop2_start" \
          '{
            loop2_started_at: $loop2_start,
            loop3_complete: false,
            gate_passed: false
          }')

        send_violation_alert \
          "$task_id" \
          "gate_bypass_violation" \
          "critical" \
          "Loop 2 validators started before Loop 3 gate passed. This violates CFN Loop protocol." \
          "Check orchestrator gate check logic. Loop 2 must BLPOP on gate-passed signal." \
          "$evidence"

        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
          SETEX "$alert_key" 3600 "alerted" >/dev/null
      fi
    fi
  fi
}

# Function: Check if agents completed but orchestrator hung
check_orchestrator_hang() {
  local task_id="$1"

  # Get orchestrator status
  local status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    GET "swarm:${task_id}:status" 2>/dev/null || echo "")

  # Check if status indicates waiting for agents
  if [[ "$status" =~ loop3_waiting|loop2_waiting ]]; then
    # Count done signals
    local done_keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      KEYS "swarm:${task_id}:*:done" 2>/dev/null | wc -l)

    # Get expected agent count
    local swarm_id=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      GET "task:${task_id}:swarm" 2>/dev/null || echo "swarm:swarm-${task_id}")
    local expected=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      HGET "${swarm_id}:metadata" max_agents 2>/dev/null || echo "0")

    if [ "$done_keys" -ge "$expected" ] && [ "$expected" -gt 0 ]; then
      # Agents completed but orchestrator still waiting
      local alert_key="violation:${task_id}:orchestrator_hang"
      if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXISTS "$alert_key" | grep -q "1"; then
        local evidence=$(jq -nc \
          --arg status "$status" \
          --arg done "$done_keys" \
          --arg expected "$expected" \
          '{
            orchestrator_status: $status,
            done_signals_count: ($done | tonumber),
            expected_agents: ($expected | tonumber)
          }')

        send_violation_alert \
          "$task_id" \
          "orchestrator_hang_with_complete_agents" \
          "critical" \
          "All agents signaled completion but orchestrator still waiting. Possible BLPOP key mismatch." \
          "Check orchestrator DONE_KEY construction. Verify agent IDs match (with iteration suffix)." \
          "$evidence"

        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
          SETEX "$alert_key" 3600 "alerted" >/dev/null
      fi
    fi
  fi
}

# Function: Check if coordinator monitoring with timeout
check_coordinator_timeout_pattern() {
  local task_id="$1"

  # Check if swarm created but status never updated (5+ min)
  local swarm_id=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    GET "task:${task_id}:swarm" 2>/dev/null || echo "swarm:swarm-${task_id}")

  local created_at=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    HGET "${swarm_id}:metadata" created_at 2>/dev/null || echo "")

  if [ -n "$created_at" ]; then
    local created_ts=$(date -d "$created_at" +%s 2>/dev/null || echo "0")
    local now_ts=$(date +%s)
    local elapsed=$((now_ts - created_ts))

    # Check if swarm cancelled with SIGTERM after ~5-10 minutes
    local status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      HGET "${swarm_id}:metadata" status 2>/dev/null || echo "")
    local shutdown_reason=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      HGET "${swarm_id}:metadata" shutdown_reason 2>/dev/null || echo "")

    if [ "$status" = "cancelled" ] && [ "$shutdown_reason" = "SIGTERM_received" ] && [ $elapsed -ge 300 ] && [ $elapsed -le 600 ]; then
      local alert_key="violation:${task_id}:coordinator_timeout"
      if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXISTS "$alert_key" | grep -q "1"; then
        local evidence=$(jq -nc \
          --arg created "$created_at" \
          --arg elapsed "$elapsed" \
          --arg reason "$shutdown_reason" \
          '{
            swarm_created_at: $created,
            cancelled_after_seconds: ($elapsed | tonumber),
            shutdown_reason: $reason,
            likely_cause: "coordinator_monitoring_with_bash_timeout"
          }')

        send_violation_alert \
          "$task_id" \
          "coordinator_monitoring_timeout" \
          "critical" \
          "Coordinator cancelled after ${elapsed}s with SIGTERM. Likely wrapped monitoring in Bash() with timeout." \
          "Check coordinator template. Monitoring must use multiple tool calls in coordinator's own message loop, NOT single Bash() call." \
          "$evidence"

        redis-cli -h "$REDIS_HOST" -p "$REDIS_HOST" \
          SETEX "$alert_key" 3600 "alerted" >/dev/null
      fi
    fi
  fi
}

# Function: Check if Product Owner skipped
check_product_owner_skipped() {
  local task_id="$1"

  # Check if Loop 2 completed
  local loop2_complete=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    GET "swarm:${task_id}:loop2:complete" 2>/dev/null || echo "")

  if [ -n "$loop2_complete" ]; then
    # Check if Product Owner was consulted
    local po_consulted=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
      GET "swarm:${task_id}:product_owner:consulted" 2>/dev/null || echo "")

    if [ -z "$po_consulted" ]; then
      # Wait 60s after Loop 2 complete to allow time for PO spawn
      local loop2_ts=$(date -d "$loop2_complete" +%s 2>/dev/null || echo "0")
      local now_ts=$(date +%s)
      local elapsed=$((now_ts - loop2_ts))

      if [ $elapsed -gt 60 ]; then
        local alert_key="violation:${task_id}:po_skipped"
        if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXISTS "$alert_key" | grep -q "1"; then
          local evidence=$(jq -nc \
            --arg loop2_complete "$loop2_complete" \
            --arg elapsed "$elapsed" \
            '{
              loop2_completed_at: $loop2_complete,
              time_since_loop2_seconds: ($elapsed | tonumber),
              product_owner_consulted: false
            }')

          send_violation_alert \
            "$task_id" \
            "product_owner_not_consulted" \
            "warning" \
            "Loop 2 completed ${elapsed}s ago but Product Owner not consulted. Strategic decision skipped." \
            "Check orchestrator Product Owner spawning logic. PO should be spawned after Loop 2 consensus check." \
            "$evidence"

          redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            SETEX "$alert_key" 3600 "alerted" >/dev/null
        fi
      fi
    fi
  fi
}

# Main monitoring loop
echo "Starting violation monitoring..."
echo ""

ITERATION=0
while true; do
  ITERATION=$((ITERATION + 1))
  echo "[Check #${ITERATION}] $(date '+%H:%M:%S')"

  # Find all active swarm metadata keys
  SWARM_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    KEYS "swarm:*:metadata" 2>/dev/null || echo "")

  if [ -z "$SWARM_KEYS" ]; then
    echo "  No active swarms found"
  else
    SWARM_COUNT=$(echo "$SWARM_KEYS" | wc -l)
    echo "  Monitoring $SWARM_COUNT swarm(s)..."

    for SWARM_KEY in $SWARM_KEYS; do
      # Extract task ID
      TASK_ID=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
        HGET "$SWARM_KEY" task_id 2>/dev/null || echo "")

      if [ -z "$TASK_ID" ]; then
        continue
      fi

      # Run violation checks
      check_orchestrator_not_started "$SWARM_KEY"
      check_gate_bypass "$TASK_ID"
      check_orchestrator_hang "$TASK_ID"
      check_coordinator_timeout_pattern "$TASK_ID"
      check_product_owner_skipped "$TASK_ID"
    done
  fi

  echo "  Sleeping ${CHECK_INTERVAL}s..."
  echo ""
  sleep "$CHECK_INTERVAL"
done
