#!/bin/bash

################################################################################
# CFN Docker Wave Execution - Container Cleanup
# Purpose: Remove containers and clean up Docker artifacts after wave execution
# Version: 1.0.0
# Exit Codes: 0=success, 1=partial, 2=error
################################################################################

set -euo pipefail

# Get script directory and source helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$SCRIPT_DIR"
LIB_DIR="$SKILL_DIR/lib"

# Source helper functions
if [[ ! -f "$LIB_DIR/docker-helpers.sh" ]]; then
  echo "ERROR: docker-helpers.sh not found at $LIB_DIR/docker-helpers.sh"
  exit 2
fi
source "$LIB_DIR/docker-helpers.sh"

################################################################################
# CONFIGURATION
################################################################################

# Command line arguments
WAVE_NUMBER=""
PATTERN=""
CONTAINERS_FILE=""
PRESERVE_FAILED_LOGS=false
PRESERVE_ALL_LOGS=false
DRY_RUN=false
FORCE_REMOVE=false
OUTPUT_FILE=""
VERBOSE=false

declare -a CONTAINER_IDS=()

################################################################################
# HELP/USAGE
################################################################################

usage() {
  cat << 'EOF'
CFN Docker Wave Execution - Container Cleanup

Usage: cleanup-wave.sh [OPTIONS]

Options (one of --wave-number, --pattern, or --containers required):
  --wave-number N               Wave number to cleanup
  --pattern PATTERN             Container name pattern
  --containers FILE             Cleanup from containers manifest

Optional Options:
  --preserve-failed-logs        Keep logs from failed containers (exit != 0)
  --preserve-all-logs           Keep all logs regardless of exit code
  --force                       Force remove containers without stopping
  --dry-run                     Show what would be removed
  --output FILE                 Write cleanup report to file
  --verbose                     Enable verbose logging
  --help                        Show this help message

Examples:
  cleanup-wave.sh --wave-number 1
  cleanup-wave.sh --wave-number 2 --preserve-failed-logs
  cleanup-wave.sh --pattern "cfn-wave1-*"
  cleanup-wave.sh --containers spawned.json
  cleanup-wave.sh --wave-number 1 --dry-run

EOF
}

################################################################################
# ARGUMENT PARSING
################################################################################

while [[ $# -gt 0 ]]; do
  case $1 in
    --wave-number)
      WAVE_NUMBER="$2"
      shift 2
      ;;
    --pattern)
      PATTERN="$2"
      shift 2
      ;;
    --containers)
      CONTAINERS_FILE="$2"
      shift 2
      ;;
    --preserve-failed-logs)
      PRESERVE_FAILED_LOGS=true
      shift
      ;;
    --preserve-all-logs)
      PRESERVE_ALL_LOGS=true
      shift
      ;;
    --force)
      FORCE_REMOVE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
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
      exit 2
      ;;
  esac
done

################################################################################
# VALIDATION
################################################################################

validate_arguments() {
  # Check that at least one identification method is provided
  if [[ -z "$WAVE_NUMBER" ]] && [[ -z "$PATTERN" ]] && [[ -z "$CONTAINERS_FILE" ]]; then
    log_error "Must provide one of: --wave-number, --pattern, or --containers"
    usage
    exit 2
  fi

  # Validate containers file if provided
  if [[ -n "$CONTAINERS_FILE" ]] && ! validate_json_file "$CONTAINERS_FILE"; then
    log_error "Invalid containers manifest: $CONTAINERS_FILE"
    exit 2
  fi

  # Validate cleanup pattern if provided (MEDIUM FIX #3)
  if [[ -n "$PATTERN" ]]; then
    validate_container_cleanup_pattern "$PATTERN" || exit 2
  fi

  if ! validate_docker_access; then
    log_error "Docker not accessible"
    exit 2
  fi

  if ! validate_jq; then
    log_error "jq not available"
    exit 2
  fi

  log_debug "Arguments validated"
}

# Extract container IDs from manifest
extract_container_ids_from_manifest() {
  local containers_file="$1"

  jq -r '.containers[].container_id' "$containers_file"
}

# Extract container IDs by wave number
extract_container_ids_by_wave() {
  local wave_num="$1"
  local pattern="cfn-wave${wave_num}-*"

  docker ps -a --filter "name=$pattern" --format "{{.ID}}"
}

# Extract container IDs by pattern
extract_container_ids_by_pattern() {
  local pattern="$1"

  docker ps -a --filter "name=$pattern" --format "{{.ID}}"
}

################################################################################
# CLEANUP LOGIC
################################################################################

# Get container exit code safely
safe_get_exit_code() {
  local container_id="$1"

  local status exit_code
  status=$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || echo "unknown")

  if [[ "$status" != "exited" ]]; then
    echo "-1"
    return 0
  fi

  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$container_id" 2>/dev/null || echo "-1")
  echo "$exit_code"
}

# Preserve container logs before removal
preserve_logs_for_container() {
  local container_id="$1"
  local log_dir="${2:-.artifacts/container-logs}"
  local preserve_all="${3:-false}"

  # Check if we should preserve logs
  if [[ "$preserve_all" == "true" ]]; then
    save_container_logs "$container_id" "$log_dir" || return 1
  else
    # Only preserve failed containers
    local exit_code
    exit_code=$(safe_get_exit_code "$container_id")

    if [[ "$exit_code" != "0" ]]; then
      save_container_logs "$container_id" "$log_dir" || return 1
    fi
  fi

  return 0
}

# Remove single container
remove_container_safe() {
  local container_id="$1"
  local force="${2:-false}"

  # Determine removal options
  local remove_opts=()
  if [[ "$force" == "true" ]] || [[ "$DRY_RUN" == "true" ]]; then
    remove_opts+=("-f")
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY-RUN] Would remove container: $container_id"
    return 0
  fi

  log_info "Removing container: $container_id"
  if docker rm "${remove_opts[@]}" "$container_id" > /dev/null 2>&1; then
    log_success "Removed: $container_id"
    return 0
  else
    log_error "Failed to remove: $container_id"
    return 1
  fi
}

# Remove all containers
remove_containers_batch() {
  local -n container_ids=$1
  local force="${2:-false}"

  if [[ ${#container_ids[@]} -eq 0 ]]; then
    log_warn "No containers to remove"
    return 0
  fi

  log_info "Removing ${#container_ids[@]} containers..."

  local removed_count=0
  local failed_count=0

  for container_id in "${container_ids[@]}"; do
    if remove_container_safe "$container_id" "$force"; then
      removed_count=$((removed_count + 1))
    else
      failed_count=$((failed_count + 1))
    fi
  done

  log_info "Removed: $removed_count, Failed: $failed_count"

  if (( failed_count == 0 )); then
    return 0
  else
    return 1
  fi
}

# Cleanup dangling resources
cleanup_dangling_resources() {
  log_info "Cleaning up dangling resources..."

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY-RUN] Would remove dangling volumes"
    return 0
  fi

  local dangling_count
  dangling_count=$(docker volume ls -qf dangling=true 2>/dev/null | wc -l)

  if (( dangling_count > 0 )); then
    log_info "Removing $dangling_count dangling volumes"
    docker volume rm $(docker volume ls -qf dangling=true) 2>/dev/null || true
    log_success "Cleaned up dangling volumes"
  else
    log_info "No dangling volumes to clean"
  fi

  return 0
}

################################################################################
# MAIN CLEANUP
################################################################################

cleanup_wave() {
  local container_ids_method="unknown"

  # Extract container IDs based on provided method
  if [[ -n "$CONTAINERS_FILE" ]]; then
    log_info "Reading container IDs from manifest: $CONTAINERS_FILE"
    container_ids_method="manifest"
    while IFS= read -r container_id; do
      if [[ -n "$container_id" ]]; then
        CONTAINER_IDS+=("$container_id")
      fi
    done < <(extract_container_ids_from_manifest "$CONTAINERS_FILE")
  elif [[ -n "$WAVE_NUMBER" ]]; then
    log_info "Finding containers for Wave $WAVE_NUMBER"
    container_ids_method="wave"
    while IFS= read -r container_id; do
      if [[ -n "$container_id" ]]; then
        CONTAINER_IDS+=("$container_id")
      fi
    done < <(extract_container_ids_by_wave "$WAVE_NUMBER")
  elif [[ -n "$PATTERN" ]]; then
    log_info "Finding containers matching pattern: $PATTERN"
    container_ids_method="pattern"
    while IFS= read -r container_id; do
      if [[ -n "$container_id" ]]; then
        CONTAINER_IDS+=("$container_id")
      fi
    done < <(extract_container_ids_by_pattern "$PATTERN")
  fi

  local container_count=${#CONTAINER_IDS[@]}
  log_info "Found $container_count containers to process"

  if [[ $container_count -eq 0 ]]; then
    log_warn "No containers found for cleanup"
    return 0
  fi

  # Preserve logs if requested
  local logs_preserved=0
  if [[ "$PRESERVE_FAILED_LOGS" == "true" ]] || [[ "$PRESERVE_ALL_LOGS" == "true" ]]; then
    log_info "Preserving container logs..."

    local log_dir=".artifacts/container-logs"
    mkdir -p "$log_dir"

    for container_id in "${CONTAINER_IDS[@]}"; do
      if preserve_logs_for_container "$container_id" "$log_dir" "$PRESERVE_ALL_LOGS"; then
        logs_preserved=$((logs_preserved + 1))
      fi
    done

    log_success "Preserved logs for $logs_preserved containers"
  fi

  # Remove containers
  log_info "Removing containers..."
  local remove_success=false
  if remove_containers_batch CONTAINER_IDS "$FORCE_REMOVE"; then
    remove_success=true
  fi

  # Cleanup dangling resources
  cleanup_dangling_resources

  # Build cleanup report
  local summary
  if [[ "$remove_success" == "true" ]]; then
    summary="Successfully removed $container_count containers"
  else
    summary="Partially removed containers (check logs)"
  fi

  local report
  report=$(jq -n \
    --arg cleanup_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg containers_removed "$container_count" \
    --arg logs_preserved "$logs_preserved" \
    --arg method "$container_ids_method" \
    --arg summary "$summary" \
    --arg dry_run "$DRY_RUN" \
    '{
      cleanup_at: $cleanup_at,
      containers_removed: ($containers_removed | tonumber),
      logs_preserved: ($logs_preserved | tonumber),
      cleanup_method: $method,
      dry_run: ($dry_run | tonumber),
      summary: $summary
    }')

  echo "$report"

  # Save to output file if requested
  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$report" > "$OUTPUT_FILE"
    log_success "Cleanup report saved to: $OUTPUT_FILE"
  fi

  # Return appropriate exit code
  if [[ "$remove_success" == "true" ]]; then
    return 0
  else
    return 1
  fi
}

################################################################################
# MAIN
################################################################################

main() {
  # Validate arguments
  validate_arguments

  # Run cleanup
  local report
  if ! report=$(cleanup_wave); then
    log_error "Cleanup failed"
    echo "$report"
    exit 2
  fi

  # Output report
  echo "$report"

  log_success "Cleanup complete"
  exit 0
}

# Run main function
main
