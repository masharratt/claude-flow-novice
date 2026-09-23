#!/usr/bin/env bash

##############################################################################
# CFN Error Logging - Docker Integration Script
# Version: 1.0.0
#
# Integration script for Docker CFN Loop error logging
# Automatically triggers error capture on Docker container failures
#
# Usage: Source this script in Docker commands or orchestrator scripts
# source /path/to/integrate-docker.sh
##############################################################################

# CFN Error Logging Docker Integration
# This script provides helper functions for Docker CFN Loop error logging

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_LOGGING_SCRIPT="$SCRIPT_DIR/invoke-error-logging.sh"

# Helper function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Ensure error logging script exists
if [ ! -f "$ERROR_LOGGING_SCRIPT" ]; then
  echo "⚠️  Warning: CFN error logging script not found at $ERROR_LOGGING_SCRIPT"
  return 1
fi

# Docker-specific environment detection
is_docker_environment() {
  [ -f /.dockerenv ] || [ -n "${DOCKER_CONTAINER:-}" ] || grep -q 'docker\|container' /proc/1/cgroup 2>/dev/null
}

# Function to capture Docker container error
cfn_capture_docker_error() {
  local task_id="$1"
  local container_name="$2"
  local error_type="${3:-docker}"
  local error_message="${4:-Docker container failed}"
  local exit_code="${5:-$?}"
  local context_json="${6:-}"

  # Add Docker-specific context
  local docker_context="{"
  docker_context+=","
  docker_context+="\"container_name\": \"$container_name\","
  docker_context+="\"docker_id\": \"${DOCKER_CONTAINER_ID:-unknown}\","
  docker_context+="\"docker_image\": \"${DOCKER_IMAGE:-unknown}\","
  docker_context+="\"docker_network\": \"${DOCKER_NETWORK:-unknown}\""

  # Container resource information
  if command -v docker >/dev/null 2>&1 && [ -n "$container_name" ]; then
    local container_info=$(docker inspect "$container_name" 2>/dev/null || echo "{}")
    local memory_usage=$(echo "$container_info" | jq -r '.[0].MemoryUsage // 0' 2>/dev/null || echo "0")
    local cpu_usage=$(echo "$container_info" | jq -r '.[0].CPUUsage // 0' 2>/dev/null || echo "0")

    docker_context+=","
    docker_context+="\"memory_usage_mb\": $memory_usage,"
    docker_context+="\"cpu_usage_percent\": $cpu_usage"
  fi

  docker_context+="}"

  # Merge with provided context
  if [ -n "$CONTEXT_JSON" ]; then
    docker_context="$docker_context,$CONTEXT_JSON"
  fi

  docker_context+="}"

  # Only capture if we have a task ID
  if [ -n "$task_id" ]; then
    "$ERROR_LOGGING_SCRIPT" \
      --action capture \
      --task-id "$task_id" \
      --error-type "$error_type" \
      --error-message "$error_message" \
      --exit-code "$exit_code" \
      --context "$docker_context" \
      >/dev/null 2>&1 || true
  fi
}

# Function to capture Docker logs
cfn_capture_docker_logs() {
  local task_id="$1"
  local container_name="$2"
  local lines="${3:-100}"

  if [ -n "$container_name" ] && command -v docker >/dev/null 2>&1; then
    local log_file="$LOG_BASE_DIR/docker-logs-${task_id}-$(date +%s).txt"
    mkdir -p "$LOG_BASE_DIR"

    log "INFO Capturing Docker logs for container: $container_name"

    docker logs --tail "$lines" "$container_name" > "$log_file" 2>&1 || true

    log "Docker logs captured: $log_file"
  fi
}

# Function to capture Docker container state
cfn_capture_docker_state() {
  local task_id="$1"
  local container_name="$2"

  if [ -n "$container_name" ] && command -v docker >/dev/null 2>&1; then
    local state_file="$LOG_BASE_DIR/docker-state-${task_id}-$(date +%s).json"
    mkdir -p "$LOG_BASE_DIR"

    log "CAPTURING Capturing Docker container state for: $container_name"

    docker inspect "$container_name" 2> "$state_file" || true

    log "Docker state captured: $state_file"
  fi
}

# Enhanced Docker command wrapper with error logging
cfn_docker_wrapper() {
  local docker_command="$1"
  local container_name="$2"
  local task_id="$3"
  shift 3

  # Generate task ID if not provided
  if [ -z "$task_id" ]; then
    task_id="cfn-docker-$(date +%s%N | tail -c 7)-${RANDOM}"
  fi

  # Generate container name if not provided
  if [ -z "$container_name" ]; then
    container_name="cfn-${task_id}"
  fi

  log "Starting Docker container: $container_name (task: $task_id)"

  # Execute Docker command with error capture
  if $docker_command; then
    local exit_code=$?
    log "SUCCESS Docker command succeeded for task: $task_id (container: $container_name)"
    return $exit_code
  else
    local exit_code=$?
    log "ERROR Docker command failed for task: $task_id (container: $container_name, exit code: $exit_code)"

    # Capture comprehensive Docker error information
    cfn_capture_docker_error "$task_id" "$container_name" "docker" "Docker command failed: $docker_command" "$exit_code"
    cfn_capture_docker_logs "$task_id" "$container_name"
    cfn_capture_docker_state "$task_id" "$container_name"

    # Generate and show report
    echo ""
    echo "INFO Generating Docker error report..."
    cfn_generate_report "$task_id"

    return $exit_code
  fi
}

# Docker container monitoring
cfn_monitor_docker_container() {
  local container_name="$1"
  local task_id="$2"
  local duration="${3:-60}"  # Default 60 seconds

  if [ -z "$container_name" ]; then
    echo "ERROR Error: Container name required for monitoring"
    return 1
  fi

  log "WATCHING Monitoring Docker container: $container_name (duration: ${duration}s)"

  local start_time=$(date +%s)
  local end_time=$((start_time + duration))
  local current_time

  while [ $current_time -lt $end_time ]; do
    if command -v docker >/dev/null 2>&1 && docker ps --filter "name=$container_name" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | grep -q "$container_name"; then
      # Container is running
      local container_status=$(docker ps --filter "name=$container_name" --format "{{.Status}}" 2>/dev/null)
      local resource_usage=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" --filter "name=$container_name" 2>/dev/null | tail -n +2)

      if [ -n "$resource_usage" ]; then
        log "MONITORING Container $container_name ($container_status): $resource_usage"
      fi
    else
      # Container stopped or failed
      log "⚠️  Container $container_name is no longer running"

      # Capture final state and error information
      cfn_capture_docker_error "$task_id" "$container_name" "docker-monitoring" "Container stopped during monitoring"
      break
    fi

    sleep 5
    current_time=$(date +%s)
  done

  log "WATCHING Docker monitoring completed for: $container_name"
}

# Docker cleanup with error logging
cfn_docker_cleanup() {
  local task_id="$1"
  local container_pattern="$2"

  log "CLEANING Running Docker cleanup for task: $task_id"

  # Stop and remove containers matching pattern
  if [ -n "$container_pattern" ]; then
    local containers=$(docker ps -a --filter "name=$container_pattern" --format "{{.Names}}" 2>/dev/null || echo "")

    for container in $containers; do
      log "  Stopping container: $container"
      docker stop "$container" >/dev/null 2>&1 || true
      docker rm "$container" >/dev/null 2>/dev/null || true
    done
  fi

  # Remove Docker networks if they belong to this task
  local networks=$(docker network ls --filter "name=cfn-$task_id-*" --format "{{.Name}}" 2>/dev/null || echo "")

  for network in $networks; do
    log "  Removing network: $network"
    docker network rm "$network" >/dev/null 2>/dev/null || true
  done

  # Remove Docker volumes if they belong to this task
  local volumes=$(docker volume ls --filter "name=cfn-$task_id-*" --format "{{.Name}}" 2>/dev/null || echo "")

  for volume in $volumes; do
    log "  Removing volume: $volume"
    docker volume rm "$volume" >/dev/null 2/dv/null || true
  done

  # Capture cleanup state
  cfn_capture_docker_error "$task_id" "docker-cleanup" "Docker cleanup completed" "0"

  # Run standard cleanup
  if [ -f "$ERROR_LOGGING_SCRIPT" ]; then
    "$ERROR_LOGGING_SCRIPT" --action cleanup --retention-days 7 >/dev/null 2>&1 || true
  fi

  log "SUCCESS Docker cleanup completed"
}

# Docker resource monitoring
cfn_monitor_docker_resources() {
  local task_id="$1"

  log "MONITORING Monitoring Docker resources for task: $task_id"

  if command -v docker >/dev/null 2>&1; then
    echo "Docker System Status:"
    docker system df
    echo ""

    echo "Running Containers:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Size}}"
    echo ""

    echo "Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\{{.MemUsage}}\t{{.NetIO}}" | head -10
    echo ""

    # CFN-specific containers
    echo "CFN Loop Containers:"
    docker ps --filter "name=cfn-*" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}" 2>/dev/null || echo "No CFN containers running"
  fi
}

# Export functions for use in other scripts
export -f cfn_capture_docker_error
export -f cfn_capture_docker_logs
export -f cfn_capture_docker_state
export -f cfn_docker_wrapper
export -f cfn_monitor_docker_container
export -f cfn_docker_cleanup
export -f cfn_monitor_docker_resources

# Convenience aliases
if is_docker_environment; then
  alias cfn-docker-logs='cfn_capture_docker_logs'
  alias cfn-docker-state='cfn_capture_docker_state'
  alias cfn-docker-monitor='cfn_monitor_docker_container'
  alias cfn-docker-cleanup='cfn_docker_cleanup'
  alias cfn-docker-resources='cfn_monitor_docker_resources'
fi

log "CFN Error Logging Docker integration loaded"