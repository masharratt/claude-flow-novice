#!/bin/bash

################################################################################
# Docker Helpers - Backward Compatibility Wrapper
# This script provides bash wrappers that delegate to the TypeScript implementation
# For new code, prefer using the TypeScript SDK directly
################################################################################

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'  # No Color

################################################################################
# LOGGING FUNCTIONS
################################################################################

log_info() {
  echo -e "${BLUE}[INFO]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_debug() {
  if [[ "${CFN_DEBUG:-false}" == "true" ]]; then
    echo -e "${BLUE}[DEBUG]${NC} $(date '+%H:%M:%S') $*" >&2
  fi
}

################################################################################
# VALIDATION FUNCTIONS
################################################################################

validate_docker_access() {
  if ! command -v docker &> /dev/null; then
    log_error "Docker CLI not found. Please install Docker."
    return 1
  fi

  if ! docker version &> /dev/null; then
    log_error "Docker daemon not accessible. Is it running?"
    return 1
  fi

  if ! docker ps &> /dev/null; then
    log_error "No permission to access Docker socket. Check user group."
    return 1
  fi

  log_debug "Docker access validated"
  return 0
}

validate_jq() {
  if ! command -v jq &> /dev/null; then
    log_error "jq not found. Please install jq for JSON processing."
    return 1
  fi
  return 0
}

validate_json_file() {
  local file="$1"

  if [[ ! -f "$file" ]]; then
    log_error "File not found: $file"
    return 1
  fi

  if ! jq . "$file" > /dev/null 2>&1; then
    log_error "Invalid JSON in file: $file"
    return 1
  fi

  log_debug "JSON file validated: $file"
  return 0
}

validate_memory_string() {
  local memory="$1"

  if ! [[ "$memory" =~ ^[0-9]+(b|k|m|g|gb|mb|kb)$ ]] && ! [[ "$memory" =~ ^[0-9]+$ ]]; then
    log_error "Invalid memory format: $memory (expected: 512m, 1g, 100, etc.)"
    return 1
  fi

  log_debug "Memory string validated: $memory"
  return 0
}

################################################################################
# MEMORY CONVERSION FUNCTIONS
################################################################################

parse_memory() {
  local memory="$1"
  local bytes

  if ! validate_memory_string "$memory"; then
    return 1
  fi

  local num="${memory%[a-zA-Z]*}"
  local unit="${memory#$num}"
  unit="${unit,,}"

  case "$unit" in
    b|'')
      bytes=$((num))
      ;;
    k|kb)
      bytes=$((num * 1024))
      ;;
    m|mb)
      bytes=$((num * 1024 * 1024))
      ;;
    g|gb)
      bytes=$((num * 1024 * 1024 * 1024))
      ;;
    *)
      log_error "Unknown memory unit: $unit"
      return 1
      ;;
  esac

  echo "$bytes"
  log_debug "Parsed memory: $memory -> $bytes bytes"
}

format_memory() {
  local bytes="$1"

  if (( bytes < 1024 )); then
    echo "${bytes}B"
  elif (( bytes < 1024 * 1024 )); then
    echo "$((bytes / 1024))KB"
  elif (( bytes < 1024 * 1024 * 1024 )); then
    echo "$((bytes / 1024 / 1024))MB"
  else
    echo "$((bytes / 1024 / 1024 / 1024))GB"
  fi
}

################################################################################
# CONTAINER STATUS FUNCTIONS
################################################################################

get_container_status() {
  local container_id="$1"

  if [[ -z "$container_id" ]]; then
    log_error "Container ID not provided"
    return 1
  fi

  local status
  status=$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || echo "unknown")

  case "$status" in
    running)
      echo "running"
      ;;
    exited)
      echo "exited"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

extract_exit_code() {
  local container_id="$1"

  if [[ -z "$container_id" ]]; then
    log_error "Container ID not provided"
    return 1
  fi

  local status exit_code
  status=$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null)

  if [[ "$status" != "exited" ]]; then
    echo "-1"
    return 0
  fi

  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$container_id" 2>/dev/null)
  echo "$exit_code"
}

get_exit_status() {
  local exit_code="$1"

  case "$exit_code" in
    0)
      echo "success"
      ;;
    124)
      echo "timeout"
      ;;
    *)
      echo "failed"
      ;;
  esac
}

get_container_started_at() {
  local container_id="$1"

  if [[ -z "$container_id" ]]; then
    return 1
  fi

  docker inspect -f '{{.State.StartedAt}}' "$container_id" 2>/dev/null || echo ""
}

get_container_finished_at() {
  local container_id="$1"

  if [[ -z "$container_id" ]]; then
    return 1
  fi

  docker inspect -f '{{.State.FinishedAt}}' "$container_id" 2>/dev/null || echo ""
}

################################################################################
# CONTAINER MONITORING FUNCTIONS
################################################################################

wait_for_container() {
  local container_id="$1"
  local timeout="${2:-300}"
  local poll_interval="${3:-2}"

  if [[ -z "$container_id" ]]; then
    log_error "Container ID not provided"
    return 3
  fi

  local start_time elapsed_time
  start_time=$(date +%s)

  log_info "Waiting for container $container_id (timeout: ${timeout}s)"

  while true; do
    elapsed_time=$(($(date +%s) - start_time))

    if (( elapsed_time > timeout )); then
      log_warn "Container $container_id timeout after ${timeout}s"
      return 2
    fi

    local status
    status=$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || echo "unknown")

    if [[ "$status" == "exited" ]]; then
      local exit_code
      exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$container_id" 2>/dev/null)

      if [[ "$exit_code" == "0" ]]; then
        log_success "Container $container_id completed successfully"
        return 0
      else
        log_error "Container $container_id failed with exit code: $exit_code"
        return 1
      fi
    fi

    sleep "$poll_interval"
  done
}

################################################################################
# LOGGING FUNCTIONS
################################################################################

get_container_logs() {
  local container_id="$1"

  if [[ -z "$container_id" ]]; then
    log_error "Container ID not provided"
    return 1
  fi

  docker logs "$container_id" 2>&1 || true
}

save_container_logs() {
  local container_id="$1"
  local output_dir="$2"

  if [[ -z "$container_id" ]] || [[ -z "$output_dir" ]]; then
    log_error "Container ID and output directory required"
    return 1
  fi

  mkdir -p "$output_dir"
  chmod 700 "$output_dir" || {
    log_warn "Failed to restrict log directory permissions: $output_dir"
  }

  local log_file="$output_dir/${container_id}.log"

  touch "$log_file"
  chmod 600 "$log_file" || {
    log_error "Failed to set log file permissions: $log_file"
    return 1
  }

  log_info "Saving logs for container $container_id to $log_file"

  docker logs "$container_id" > "$log_file" 2>&1 || {
    log_error "Failed to save logs for container $container_id"
    return 1
  }

  log_success "Logs saved: $log_file (permissions: 0600)"
  return 0
}

################################################################################
# CLEANUP FUNCTIONS
################################################################################

remove_container() {
  local container_id="$1"
  local force="${2:-false}"

  if [[ -z "$container_id" ]]; then
    log_error "Container ID not provided"
    return 1
  fi

  local remove_opts=()
  if [[ "$force" == "true" ]]; then
    remove_opts+=("-f")
  fi

  log_info "Removing container $container_id"
  if docker rm "${remove_opts[@]}" "$container_id" > /dev/null 2>&1; then
    log_success "Container removed: $container_id"
    return 0
  else
    log_error "Failed to remove container: $container_id"
    return 1
  fi
}

remove_dangling_volumes() {
  log_info "Cleaning up dangling volumes"

  local volume_count
  volume_count=$(docker volume ls -qf dangling=true | wc -l)

  if (( volume_count > 0 )); then
    docker volume rm $(docker volume ls -qf dangling=true) 2>/dev/null || true
    log_success "Removed $volume_count dangling volumes"
  else
    log_info "No dangling volumes to remove"
  fi

  return 0
}

################################################################################
# NETWORK FUNCTIONS
################################################################################

create_network_if_missing() {
  local network_name="${1:-cfn-network}"

  if docker network inspect "$network_name" > /dev/null 2>&1; then
    log_debug "Network already exists: $network_name"
    return 0
  fi

  log_info "Creating Docker network: $network_name"
  if docker network create "$network_name" > /dev/null 2>&1; then
    log_success "Network created: $network_name"
    return 0
  else
    log_error "Failed to create network: $network_name"
    return 1
  fi
}

verify_network_exists() {
  local network_name="${1:-cfn-network}"

  if docker network inspect "$network_name" > /dev/null 2>&1; then
    log_debug "Network verified: $network_name"
    return 0
  else
    log_error "Network not found: $network_name"
    return 1
  fi
}

################################################################################
# EXPORT FUNCTIONS
################################################################################

export -f log_info log_success log_warn log_error log_debug
export -f validate_docker_access validate_jq validate_json_file validate_memory_string
export -f parse_memory format_memory
export -f get_container_status extract_exit_code get_exit_status
export -f get_container_started_at get_container_finished_at
export -f wait_for_container
export -f get_container_logs save_container_logs
export -f remove_container remove_dangling_volumes
export -f create_network_if_missing verify_network_exists

log_debug "Docker helpers library (bash wrapper) loaded"
