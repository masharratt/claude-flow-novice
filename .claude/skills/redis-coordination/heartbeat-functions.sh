#!/usr/bin/env bash

##############################################################################
# Heartbeat Monitoring Functions Library
# Extracted from orchestrate-cfn-loop.sh for standalone testing
##############################################################################

##############################################################################
# Heartbeat Monitoring Functions
##############################################################################
declare -A MISSED_HEARTBEATS  # Track missed heartbeats per agent

function check_agent_heartbeat() {
  local agent="$1"
  local task_id="$2"

  HB_KEY="swarm:${task_id}:${agent}:heartbeat"
  HB_DATA=$(redis-cli GET "$HB_KEY" 2>/dev/null || echo "")

  if [ -z "$HB_DATA" ] || [ "$HB_DATA" = "(nil)" ]; then
    return 1  # Dead
  else
    return 0  # Alive
  fi
}

function calculate_quorum() {
  local quorum_spec="$1"
  local total_agents="$2"

  # If no quorum specified, require all agents
  if [ -z "$quorum_spec" ]; then
    echo "$total_agents"
    return 0
  fi

  # Check if percentage format (e.g., "85%")
  if [[ "$quorum_spec" =~ %$ ]]; then
    # Extract percentage value (remove % suffix)
    local pct="${quorum_spec%\%}"
    # Calculate: ceil(total_agents * pct / 100)
    echo "scale=0; ($total_agents * $pct + 50) / 100" | bc
  # Check if decimal (0.0-1.0), treat as fraction
  elif [[ "$quorum_spec" =~ ^0?\.[0-9]+$ ]]; then
    # Calculate: ceil(total_agents * fraction)
    echo "scale=0; ($quorum_spec * $total_agents + 0.5) / 1" | bc
  else
    # Absolute number - validate it doesn't exceed total
    if [ "$quorum_spec" -gt "$total_agents" ]; then
      echo "Error: Quorum ($quorum_spec) exceeds total agents ($total_agents)" >&2
      return 1
    fi
    echo "$quorum_spec"
  fi
}

function check_heartbeats_loop() {
  local task_id="$1"
  local loop_name="$2"
  shift 2
  local agents=("$@")

  for AGENT in "${agents[@]}"; do
    # Skip agents already marked as failed
    if [[ " ${LOOP3_FAILED_AGENTS[@]} ${LOOP2_FAILED_AGENTS[@]} " =~ " ${AGENT} " ]]; then
      continue
    fi

    if ! check_agent_heartbeat "$AGENT" "$task_id"; then
      MISSED_HEARTBEATS["$AGENT"]=$((${MISSED_HEARTBEATS["$AGENT"]:-0} + 1))

      if [ ${MISSED_HEARTBEATS["$AGENT"]} -ge 2 ]; then
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        echo "  [$timestamp] [$loop_name] ⚠️ $AGENT appears hung (no heartbeat for 60s)" >&2

        # Determine which loop this agent belongs to and check quorum
        if [[ " ${LOOP3_AGENTS} " =~ " ${AGENT} " ]]; then
          REMAINING=$((${#LOOP3_COMPLETED_AGENTS[@]}))
          REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP3" "$LOOP3_TOTAL")
        elif [[ " ${LOOP2_AGENTS} " =~ " ${LOOP2_AGENTS} " ]]; then
          REMAINING=$((${#LOOP2_COMPLETED_AGENTS[@]}))
          REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP2" "$LOOP2_TOTAL")
        else
          continue
        fi

        if [ $REMAINING -ge $REQUIRED ]; then
          echo "  [$timestamp] [$loop_name] ℹ️ Continuing with quorum (${REMAINING}/${REQUIRED} agents)" >&2
        else
          echo "  [$timestamp] [$loop_name] ⚠️ Cannot meet quorum without $AGENT (${REMAINING}/${REQUIRED})" >&2
        fi
      fi
    else
      MISSED_HEARTBEATS["$AGENT"]=0  # Reset counter
    fi
  done
}

function start_heartbeat_monitor() {
  local task_id="$1"
  local loop_name="$2"
  shift 2
  local agents=("$@")

  # Create marker file for this monitor
  local monitor_marker="/tmp/heartbeat-monitor-${task_id}-${loop_name}.active"
  touch "$monitor_marker"

  (
    while [ -f "$monitor_marker" ]; do
      # Check for shutdown
      if [ "${SHUTDOWN_REQUESTED:-0}" -eq 1 ]; then
        break
      fi

      check_heartbeats_loop "$task_id" "$loop_name" "${agents[@]}"
      sleep 30
    done
  ) &

  echo "$!"  # Return PID
}

function stop_heartbeat_monitor() {
  local task_id="$1"
  local loop_name="$2"
  local monitor_pid="$3"

  # Remove marker file to stop the monitor loop
  rm -f "/tmp/heartbeat-monitor-${task_id}-${loop_name}.active"

  # Kill monitor process if still running
  if [ -n "$monitor_pid" ] && kill -0 "$monitor_pid" 2>/dev/null; then
    kill "$monitor_pid" 2>/dev/null || true
    wait "$monitor_pid" 2>/dev/null || true
  fi
}
