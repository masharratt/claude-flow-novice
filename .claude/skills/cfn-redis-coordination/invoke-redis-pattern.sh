#!/usr/bin/env bash
set -euo pipefail

# Version 1.3.0
# Redis Coordination Pattern CLI

# Load configuration
CONFIG_PATH="$(dirname "$0")/config.json"
REDIS_HOST=$(jq -r '.host' "$CONFIG_PATH")
REDIS_PORT=$(jq -r '.port' "$CONFIG_PATH")
REDIS_DB=$(jq -r '.db' "$CONFIG_PATH")

# Utility functions
log_error() {
  echo "{\"status\": \"error\", \"message\": \"$1\"}" >&2
  exit 1
}

invoke_redis_command() {
  local command="$1"
  shift
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" "$command" "$@"
}

# Waiting mode operations
wait_mode() {
  local task_id=""
  local agent_id=""
  local context=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task-id)
        task_id="$2"
        shift 2
        ;;
      --agent-id)
        agent_id="$2"
        shift 2
        ;;
      --context)
        context="$2"
        shift 2
        ;;
      *)
        log_error "Invalid argument for wait: $1"
        ;;
    esac
  done

  [[ -z "$task_id" ]] && log_error "task-id is required"
  [[ -z "$agent_id" ]] && log_error "agent-id is required"

  local wake_channel="task:$task_id:agent:$agent_id:wake"

  # Blocking pop with timeout
  result=$(invoke_redis_command BLPOP "$wake_channel" 300)

  if [[ -z "$result" ]]; then
    echo "{\"status\": \"timeout\", \"task_id\": \"$task_id\", \"agent_id\": \"$agent_id\", \"context\": \"$context\"}"
  else
    echo "{\"status\": \"woken\", \"task_id\": \"$task_id\", \"agent_id\": \"$agent_id\", \"payload\": $result, \"context\": \"$context\"}"
  fi
}

wake_mode() {
  local task_id=""
  local agent_id=""
  local payload=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task-id)
        task_id="$2"
        shift 2
        ;;
      --agent-id)
        agent_id="$2"
        shift 2
        ;;
      --payload)
        payload="$2"
        shift 2
        ;;
      *)
        log_error "Invalid argument for wake: $1"
        ;;
    esac
  done

  [[ -z "$task_id" ]] && log_error "task-id is required"
  [[ -z "$agent_id" ]] && log_error "agent-id is required"
  [[ -z "$payload" ]] && log_error "payload is required"

  local wake_channel="task:$task_id:agent:$agent_id:wake"

  invoke_redis_command LPUSH "$wake_channel" "$payload" > /dev/null

  echo "{\"status\": \"success\", \"task_id\": \"$task_id\", \"agent_id\": \"$agent_id\"}"
}

report_mode() {
  local task_id=""
  local agent_id=""
  local confidence=0.0
  local result=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task-id)
        task_id="$2"
        shift 2
        ;;
      --agent-id)
        agent_id="$2"
        shift 2
        ;;
      --confidence)
        confidence="$2"
        shift 2
        ;;
      --result)
        result="$2"
        shift 2
        ;;
      *)
        log_error "Invalid argument for report: $1"
        ;;
    esac
  done

  [[ -z "$task_id" ]] && log_error "task-id is required"
  [[ -z "$agent_id" ]] && log_error "agent-id is required"

  local result_key="task:$task_id:agent:$agent_id:result"
  local result_json=$(jq -n \
    --arg r "$result" \
    --arg c "$confidence" \
    '{result: $r, confidence: ($c | tonumber), timestamp: now}')

  invoke_redis_command SET "$result_key" "$result_json" > /dev/null

  echo "{\"status\": \"success\", \"task_id\": \"$task_id\", \"agent_id\": \"$agent_id\", \"confidence\": $confidence}"
}

collect_mode() {
  local task_id=""
  local agent_ids=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task-id)
        task_id="$2"
        shift 2
        ;;
      --agent-ids)
        IFS=',' read -r -a agent_ids <<< "$2"
        shift 2
        ;;
      *)
        log_error "Invalid argument for collect: $1"
        ;;
    esac
  done

  [[ -z "$task_id" ]] && log_error "task-id is required"
  [[ ${#agent_ids[@]} -eq 0 ]] && log_error "agent-ids is required"

  local results=()
  local total_confidence=0.0
  local valid_results=0

  for agent_id in "${agent_ids[@]}"; do
    local result_key="task:$task_id:agent:$agent_id:result"
    result=$(invoke_redis_command GET "$result_key")

    if [[ -n "$result" ]]; then
      results+=("$result")
      confidence=$(echo "$result" | jq '.confidence')
      total_confidence=$(echo "$total_confidence + $confidence" | bc)
      ((valid_results++))
    fi
  done

  local avg_confidence=0.0
  if [[ $valid_results -gt 0 ]]; then
    avg_confidence=$(echo "scale=2; $total_confidence / $valid_results" | bc)
  fi

  local consensus_threshold="0.90"
  local status="insufficient_consensus"
  if (( $(echo "$avg_confidence >= $consensus_threshold" | bc -l) )); then
    status="consensus"
  fi

  echo "{\"status\": \"$status\", \"task_id\": \"$task_id\", \"results\": $(printf '%s\n' "${results[@]}" | jq -s '.'), \"avgConfidence\": $avg_confidence, \"consensusThreshold\": $consensus_threshold}"
}

# Determine action
case "${1:-}" in
  wait)
    shift
    wait_mode "$@"
    ;;
  wake)
    shift
    wake_mode "$@"
    ;;
  report)
    shift
    report_mode "$@"
    ;;
  collect)
    shift
    collect_mode "$@"
    ;;
  *)
    log_error "Usage: $0 {wait|wake|report|collect} [options]"
    ;;
esac