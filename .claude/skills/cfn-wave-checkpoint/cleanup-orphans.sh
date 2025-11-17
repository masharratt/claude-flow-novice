#!/bin/bash

################################################################################
# CFN Wave Checkpoint - Cleanup Orphaned Containers
# Purpose: Remove containers from failed orchestrator runs, preserve logs
# Version: 1.0.0
# Exit Codes: 0=success, 1=validation_error, 2=cleanup_error
################################################################################

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

# Redis configuration
readonly REDIS_HOST="${REDIS_HOST:-localhost}"
readonly REDIS_PORT="${REDIS_PORT:-6379}"
readonly DEFAULT_REDIS_DB=0
readonly DEFAULT_TIMEOUT=30
readonly CHECKPOINT_TTL="${CHECKPOINT_TTL:-3600}"

# Helper: Check Redis connection
check_redis_connection() {
    if ! command -v redis-cli &> /dev/null; then
        return 1
    fi

    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1
    return $?
}

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
LOG_PRESERVE_DIR="${LOG_PRESERVE_DIR:-./.logs/wave-recovery}"
DRY_RUN=${DRY_RUN:-false}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $*" >&2
}

log_debug() {
    echo -e "${CYAN}[DEBUG]${NC} $(date '+%H:%M:%S') $*" >&2
}

################################################################################
# ORPHAN CONTAINER DETECTION AND CLEANUP
################################################################################

cleanup_orphans() {
    local task_id="$1"
    local wave_number="${2:-}"

    if [[ -z "$task_id" ]]; then
        log_error "Usage: cleanup_orphans TASK_ID [WAVE_NUMBER]"
        return 1
    fi

    log_info "Starting orphan container cleanup for task=$task_id"

    # Verify Redis connectivity
    if ! check_redis_connection >/dev/null 2>&1; then
        log_warning "Redis not available - proceeding with Docker-only cleanup"
    fi

    local cleanup_count=0
    local failed_count=0

    if [[ -z "$wave_number" ]]; then
        # Clean all waves for this task
        log_info "Scanning for all orphaned containers in task=$task_id"

        local orphans
        orphans=$(docker ps -a --filter "label=cfn.task=$task_id" --format "{{.ID}}" 2>/dev/null || echo "")

        if [[ -z "$orphans" ]]; then
            log_info "No orphaned containers found for task=$task_id"
            return 0
        fi

        while IFS= read -r container_id; do
            if [[ -n "$container_id" ]]; then
                if _cleanup_container "$container_id" "$task_id"; then
                    ((cleanup_count++))
                else
                    ((failed_count++))
                fi
            fi
        done <<< "$orphans"
    else
        # Clean specific wave
        log_info "Scanning for orphaned containers in task=$task_id wave=$wave_number"

        local orphans
        orphans=$(docker ps -a \
            --filter "label=cfn.task=$task_id" \
            --filter "label=cfn.wave=$wave_number" \
            --format "{{.ID}}" 2>/dev/null || echo "")

        if [[ -z "$orphans" ]]; then
            log_info "No orphaned containers found for wave $wave_number"
            return 0
        fi

        while IFS= read -r container_id; do
            if [[ -n "$container_id" ]]; then
                if _cleanup_container "$container_id" "$task_id" "$wave_number"; then
                    ((cleanup_count++))
                else
                    ((failed_count++))
                fi
            fi
        done <<< "$orphans"
    fi

    log_success "Orphan cleanup complete: $cleanup_count removed, $failed_count failed"

    if [[ $failed_count -gt 0 ]]; then
        return 2
    fi

    return 0
}

################################################################################
# SINGLE CONTAINER CLEANUP
################################################################################

_cleanup_container() {
    local container_id="$1"
    local task_id="$2"
    local wave_number="${3:-}"

    log_info "Cleaning up container: $container_id"

    # Preserve logs before cleanup
    if ! _preserve_logs "$container_id" "$task_id" "$wave_number"; then
        log_warning "Failed to preserve logs for container $container_id"
    fi

    # Get container info for post-mortem
    local container_info
    container_info=$(docker ps -a --filter "id=$container_id" --format "json" 2>/dev/null || echo "{}")

    # Stop container if running
    if docker ps --filter "id=$container_id" --format "{{.ID}}" 2>/dev/null | grep -q "$container_id"; then
        log_debug "Stopping container $container_id"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_debug "[DRY_RUN] Would stop container: docker stop $container_id"
        else
            docker stop "$container_id" 2>/dev/null || log_warning "Failed to stop container gracefully"
        fi
    fi

    # Remove container
    log_debug "Removing container $container_id"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_debug "[DRY_RUN] Would remove container: docker rm -f $container_id"
        return 0
    else
        if docker rm -f "$container_id" 2>/dev/null; then
            log_success "Removed orphaned container: $container_id"

            # Record removal in cleanup log
            _record_cleanup "$container_id" "$task_id" "$container_info"
            return 0
        else
            log_error "Failed to remove container: $container_id"
            return 1
        fi
    fi
}

################################################################################
# LOG PRESERVATION
################################################################################

_preserve_logs() {
    local container_id="$1"
    local task_id="$2"
    local wave_number="${3:-unknown}"

    # Create log directory structure
    local log_dir="$LOG_PRESERVE_DIR/${task_id}/wave-${wave_number}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_debug "[DRY_RUN] Would preserve logs to: $log_dir"
        return 0
    fi

    mkdir -p "$log_dir" 2>/dev/null || {
        log_warning "Failed to create log directory: $log_dir"
        return 1
    }

    # Extract and save container logs
    local log_file="${log_dir}/${container_id}.log"

    if docker logs "$container_id" > "$log_file" 2>&1; then
        log_debug "Preserved logs to: $log_file"

        # Also save container inspect output
        docker inspect "$container_id" > "${log_dir}/${container_id}.inspect.json" 2>/dev/null || true

        return 0
    else
        log_warning "Failed to extract logs for container $container_id"
        return 1
    fi
}

################################################################################
# CLEANUP RECORDING
################################################################################

_record_cleanup() {
    local container_id="$1"
    local task_id="$2"
    local container_info="$3"

    if [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi

    # Create cleanup record in Redis
    if check_redis_connection >/dev/null 2>&1; then
        local cleanup_record
        cleanup_record=$(jq -n \
            --arg container_id "$container_id" \
            --arg task_id "$task_id" \
            --arg cleaned_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg container_info "$container_info" \
            '{
                container_id: $container_id,
                task_id: $task_id,
                cleaned_at: $cleaned_at,
                container_info: ($container_info | fromjson)
            }')

        redis-cli \
            -h "${REDIS_HOST:-localhost}" \
            -p "${REDIS_PORT:-6379}" \
            LPUSH "cfn:wave:cleanup-records:${task_id}" "$cleanup_record" 2>/dev/null || true
    fi

    # Also record in local file
    local cleanup_log="${LOG_PRESERVE_DIR}/${task_id}/cleanup.log"
    mkdir -p "$(dirname "$cleanup_log")" 2>/dev/null || true

    {
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | Removed container: $container_id"
        if [[ -n "$container_info" ]]; then
            echo "  Info: $container_info"
        fi
    } >> "$cleanup_log" 2>/dev/null || true
}

################################################################################
# LIST ORPHANED CONTAINERS
################################################################################

list_orphans() {
    local task_id="$1"
    local wave_number="${2:-}"

    if [[ -z "$task_id" ]]; then
        log_error "Usage: list_orphans TASK_ID [WAVE_NUMBER]"
        return 1
    fi

    local filter_args="--filter=label=cfn.task=$task_id"

    if [[ -n "$wave_number" ]]; then
        filter_args="$filter_args --filter=label=cfn.wave=$wave_number"
    fi

    log_info "Listing orphaned containers for task=$task_id"

    docker ps -a $filter_args --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Labels}}" 2>/dev/null || {
        log_error "Failed to list containers"
        return 1
    }
}

################################################################################
# CLEANUP SUMMARY
################################################################################

cleanup_summary() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        log_error "Usage: cleanup_summary TASK_ID"
        return 1
    fi

    log_info "Cleanup summary for task=$task_id"

    # Count cleanup records
    if check_redis_connection >/dev/null 2>&1; then
        local record_count
        record_count=$(redis-cli \
            -h "${REDIS_HOST:-localhost}" \
            -p "${REDIS_PORT:-6379}" \
            LLEN "cfn:wave:cleanup-records:${task_id}" 2>/dev/null || echo "0")

        echo "Containers cleaned: $record_count"
    fi

    # Count preserved logs
    if [[ -d "$LOG_PRESERVE_DIR/$task_id" ]]; then
        local log_count
        log_count=$(find "$LOG_PRESERVE_DIR/$task_id" -type f -name "*.log" 2>/dev/null | wc -l)

        echo "Logs preserved: $log_count"
        echo "Log directory: $LOG_PRESERVE_DIR/$task_id"
    fi
}

################################################################################
# MAIN OPERATION DISPATCH
################################################################################

main() {
    local operation="${1:-}"
    shift || true

    case "$operation" in
        cleanup)
            # cleanup TASK_ID [WAVE_NUMBER]
            cleanup_orphans "$@"
            ;;
        list)
            # list TASK_ID [WAVE_NUMBER]
            list_orphans "$@"
            ;;
        summary)
            # summary TASK_ID
            cleanup_summary "$@"
            ;;
        *)
            log_error "Unknown operation: $operation"
            echo "Available operations: cleanup, list, summary"
            return 1
            ;;
    esac
}

# Execute if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
