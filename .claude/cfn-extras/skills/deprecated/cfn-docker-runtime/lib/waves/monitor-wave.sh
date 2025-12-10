#!/bin/bash

################################################################################
# CFN Docker Wave Execution - Container Status Monitoring
# Purpose: Poll Docker containers for status until completion or timeout
# Version: 1.0.0
# Exit Codes: 0=all_complete, 1=some_failed, 2=timeout, 3=error
################################################################################

set -euo pipefail

# Get script directory and source helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$SCRIPT_DIR"
LIB_DIR="$SKILL_DIR/lib"

# Source helper functions
if [[ ! -f "$LIB_DIR/docker-helpers.sh" ]]; then
  echo "ERROR: docker-helpers.sh not found at $LIB_DIR/docker-helpers.sh"
  exit 3
fi
source "$LIB_DIR/docker-helpers.sh"

################################################################################
# CONFIGURATION
################################################################################

# Default values
DEFAULT_TIMEOUT=1800        # 30 minutes
DEFAULT_POLL_INTERVAL=5     # 5 seconds

# Command line arguments
CONTAINERS_FILE=""
WAVE_NUMBER=""
TIMEOUT="$DEFAULT_TIMEOUT"
POLL_INTERVAL="$DEFAULT_POLL_INTERVAL"
OUTPUT_FILE=""
PRESERVE_LOGS=false
VERBOSE=false

declare -a CONTAINER_IDS=()

################################################################################
# HELP/USAGE
################################################################################

usage() {
  cat << 'EOF'
CFN Docker Wave Execution - Container Monitoring

Usage: monitor-wave.sh [OPTIONS]

Required Options:
  --containers FILE             Path to spawned containers manifest

Optional Options:
  --wave-number N               Wave number (for filtering)
  --timeout SECONDS             Max wait time (default: 1800)
  --poll-interval SECONDS       Check frequency (default: 5)
  --output FILE                 Write results to file
  --preserve-logs               Keep container logs for analysis
  --verbose                     Enable verbose logging
  --help                        Show this help message

Examples:
  monitor-wave.sh --containers spawned.json
  monitor-wave.sh --containers spawned.json --timeout 3600
  monitor-wave.sh --containers spawned.json --preserve-logs

EOF
}

################################################################################
# ARGUMENT PARSING
################################################################################

while [[ $# -gt 0 ]]; do
  case $1 in
    --containers)
      CONTAINERS_FILE="$2"
      shift 2
      ;;
    --wave-number)
      WAVE_NUMBER="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --poll-interval)
      POLL_INTERVAL="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --preserve-logs)
      PRESERVE_LOGS=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      CFN_DEBUG=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 3
      ;;
  esac
done

################################################################################
# VALIDATION
################################################################################

validate_arguments() {
  if [[ -z "$CONTAINERS_FILE" ]]; then
    log_error "Missing required argument: --containers"
    exit 3
  fi

  if ! validate_json_file "$CONTAINERS_FILE"; then
    log_error "Invalid containers manifest: $CONTAINERS_FILE"
    exit 3
  fi

  if ! validate_docker_access; then
    log_error "Docker not accessible"
    exit 3
  fi

  if ! validate_jq; then
    log_error "jq not available"
    exit 3
  fi

  # Validate timeout is numeric and positive
  if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]]; then
    log_error "Invalid timeout: $TIMEOUT (must be numeric)"
    exit 3
  fi

  if ! [[ "$POLL_INTERVAL" =~ ^[0-9]+$ ]]; then
    log_error "Invalid poll interval: $POLL_INTERVAL (must be numeric)"
    exit 3
  fi

  log_debug "Arguments validated"
}

# Extract container IDs from manifest
extract_container_ids() {
  local containers_file="$1"

  jq -r '.containers[].container_id' "$containers_file"
}

################################################################################
# MONITORING LOGIC
################################################################################

# Poll single container status
poll_container() {
  local container_id="$1"

  local status exit_code started_at finished_at exit_status
  status=$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || echo "unknown")

  case "$status" in
    running)
      echo "{\"container_id\": \"$container_id\", \"status\": \"running\", \"exit_code\": -1}"
      return 0
      ;;
    exited)
      exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$container_id" 2>/dev/null || echo "1")
      exit_status=$(get_exit_status "$exit_code")
      started_at=$(docker inspect -f '{{.State.StartedAt}}' "$container_id" 2>/dev/null || echo "")
      finished_at=$(docker inspect -f '{{.State.FinishedAt}}' "$container_id" 2>/dev/null || echo "")

      jq -n \
        --arg container_id "$container_id" \
        --arg status "exited" \
        --arg exit_code "$exit_code" \
        --arg exit_status "$exit_status" \
        --arg started_at "$started_at" \
        --arg finished_at "$finished_at" \
        '{
          container_id: $container_id,
          status: $status,
          exit_code: ($exit_code | tonumber),
          exit_status: $exit_status,
          started_at: $started_at,
          finished_at: $finished_at
        }'
      return 0
      ;;
    *)
      echo "{\"container_id\": \"$container_id\", \"status\": \"unknown\"}"
      return 1
      ;;
  esac
}

# Poll all containers and return status update
poll_all_containers() {
  local -n container_ids=$1
  local results=()

  for container_id in "${container_ids[@]}"; do
    if result=$(poll_container "$container_id"); then
      results+=("$result")
    fi
  done

  # Combine into JSON array
  local combined="["
  for i in "${!results[@]}"; do
    combined+="${results[$i]}"
    if (( i < ${#results[@]} - 1 )); then
      combined+=","
    fi
  done
  combined+="]"

  echo "$combined"
}

# Calculate wave metrics from container statuses
calculate_metrics() {
  local containers_json="$1"

  local total running exited success failed timeout
  total=$(echo "$containers_json" | jq 'length')
  running=$(echo "$containers_json" | jq '[.[] | select(.status == "running")] | length')
  exited=$(echo "$containers_json" | jq '[.[] | select(.status == "exited")] | length')
  success=$(echo "$containers_json" | jq '[.[] | select(.exit_status == "success")] | length')
  failed=$(echo "$containers_json" | jq '[.[] | select(.exit_status == "failed")] | length')
  timeout=$(echo "$containers_json" | jq '[.[] | select(.exit_status == "timeout")] | length')

  jq -n \
    --arg total "$total" \
    --arg running "$running" \
    --arg exited "$exited" \
    --arg success "$success" \
    --arg failed "$failed" \
    --arg timeout "$timeout" \
    '{
      total: ($total | tonumber),
      running: ($running | tonumber),
      exited: ($exited | tonumber),
      success: ($success | tonumber),
      failed: ($failed | tonumber),
      timeout: ($timeout | tonumber)
    }'
}

# Determine overall completion status
get_completion_status() {
  local metrics="$1"

  local running failed timeout
  running=$(echo "$metrics" | jq '.running')
  failed=$(echo "$metrics" | jq '.failed')
  timeout=$(echo "$metrics" | jq '.timeout')

  if (( running == 0 )); then
    if (( failed == 0 && timeout == 0 )); then
      echo "complete"
    elif (( failed > 0 )); then
      echo "failed"
    else
      echo "timeout"
    fi
  else
    echo "in_progress"
  fi
}

################################################################################
# MAIN MONITORING LOOP
################################################################################

monitor_wave() {
  local containers_file="$1"
  local timeout="$2"
  local poll_interval="$3"

  # Extract container IDs
  local container_count=0
  while IFS= read -r container_id; do
    CONTAINER_IDS+=("$container_id")
    container_count=$((container_count + 1))
  done < <(extract_container_ids "$containers_file")

  if [[ $container_count -eq 0 ]]; then
    log_error "No containers found in manifest"
    return 3
  fi

  log_info "Monitoring $container_count containers (timeout: ${timeout}s)"

  local start_time elapsed_time last_report poll_count
  start_time=$(date +%s)
  last_report=$start_time
  poll_count=0

  local containers_status="[]"
  local completion_status="in_progress"

  # Main monitoring loop
  while true; do
    elapsed_time=$(($(date +%s) - start_time))
    poll_count=$((poll_count + 1))

    # Check timeout
    if (( elapsed_time > timeout )); then
      log_warn "Timeout reached after ${elapsed_time}s"
      completion_status="timeout"
      break
    fi

    # Poll all containers
    containers_status=$(poll_all_containers CONTAINER_IDS)

    # Calculate metrics
    local metrics
    metrics=$(calculate_metrics "$containers_status")

    # Log progress every 30 seconds
    if (( elapsed_time - last_report >= 30 )); then
      local running success failed timeout
      running=$(echo "$metrics" | jq '.running')
      success=$(echo "$metrics" | jq '.success')
      failed=$(echo "$metrics" | jq '.failed')
      timeout=$(echo "$metrics" | jq '.timeout')

      log_info "Progress: Running=$running, Success=$success, Failed=$failed, Timeout=$timeout"
      last_report=$elapsed_time
    fi

    # Check if all containers have exited
    local running
    running=$(echo "$metrics" | jq '.running')

    if (( running == 0 )); then
      completion_status=$(get_completion_status "$metrics")
      log_info "All containers completed with status: $completion_status"
      break
    fi

    # Wait before next poll
    sleep "$poll_interval"
  done

  # Final metrics
  local final_metrics
  final_metrics=$(calculate_metrics "$containers_status")

  # Build final results
  local results
  results=$(jq -n \
    --arg wave_number "${WAVE_NUMBER:-1}" \
    --arg monitoring_duration "$elapsed_time" \
    --arg completion_status "$completion_status" \
    --arg poll_count "$poll_count" \
    --argjson containers "$containers_status" \
    --argjson metrics "$final_metrics" \
    --arg monitoring_end_time "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    '{
      wave_number: ($wave_number | tonumber),
      monitoring_duration: ($monitoring_duration | tonumber),
      completion_status: $completion_status,
      poll_count: ($poll_count | tonumber),
      containers: $containers,
      metrics: $metrics,
      monitoring_end_time: $monitoring_end_time
    }')

  echo "$results"

  # Determine exit code
  local failed_count timeout_count
  failed_count=$(echo "$final_metrics" | jq '.failed')
  timeout_count=$(echo "$final_metrics" | jq '.timeout')

  if [[ "$completion_status" == "complete" ]]; then
    return 0
  elif (( timeout_count > 0 )); then
    return 2
  elif (( failed_count > 0 )); then
    return 1
  else
    return 3
  fi
}

# Preserve container logs if requested
preserve_container_logs() {
  local containers_json="$1"
  local log_dir="${2:-.artifacts/container-logs}"

  if [[ "$PRESERVE_LOGS" != "true" ]]; then
    return 0
  fi

  log_info "Preserving container logs to: $log_dir"
  mkdir -p "$log_dir"

  local failed_containers
  failed_containers=$(echo "$containers_json" | jq -r '.[] | select(.exit_status == "failed") | .container_id')

  local preserved_count=0
  while IFS= read -r container_id; do
    if [[ -n "$container_id" ]]; then
      if save_container_logs "$container_id" "$log_dir"; then
        preserved_count=$((preserved_count + 1))
      fi
    fi
  done < <(echo "$failed_containers")

  log_success "Preserved logs for $preserved_count containers"
}

################################################################################
# MAIN
################################################################################

main() {
  # Validate arguments
  validate_arguments

  # Run monitoring
  local results
  if ! results=$(monitor_wave "$CONTAINERS_FILE" "$TIMEOUT" "$POLL_INTERVAL"); then
    local exit_code=$?
    results=$(jq -n \
      --arg error "Monitoring failed" \
      '{error: $error}')
    echo "$results"
    exit $exit_code
  fi

  # Preserve logs if requested
  if [[ "$PRESERVE_LOGS" == "true" ]]; then
    preserve_container_logs "$(echo "$results" | jq '.containers')"
  fi

  # Save to output file if requested
  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$results" > "$OUTPUT_FILE"
    log_success "Results saved to: $OUTPUT_FILE"
  fi

  # Output results
  echo "$results"

  # Determine exit code based on results
  local completion_status failed_count timeout_count
  completion_status=$(echo "$results" | jq -r '.completion_status')
  failed_count=$(echo "$results" | jq '.metrics.failed')
  timeout_count=$(echo "$results" | jq '.metrics.timeout')

  log_success "Wave monitoring complete (status: $completion_status)"

  if [[ "$completion_status" == "complete" ]]; then
    exit 0
  elif (( timeout_count > 0 )); then
    exit 2
  elif (( failed_count > 0 )); then
    exit 1
  else
    exit 3
  fi
}

# Run main function
main
