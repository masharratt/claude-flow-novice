#!/usr/bin/env bash

################################################################################
# CFN Wave Checkpoint - Resume Execution from Checkpoint
# Purpose: Detect and resume orphaned containers from failed orchestrator runs
# Version: 1.0.0
# Exit Codes: 0=success, 1=validation_error, 2=redis_error
################################################################################

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../" && pwd)"

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
# CHECKPOINT RECOVERY
################################################################################

resume_wave() {
    local task_id="$1"
    local wave_number="${2:-}"

    if [[ -z "$task_id" ]]; then
        log_error "Usage: resume_wave TASK_ID [WAVE_NUMBER]"
        return 1
    fi

    # Verify Redis connectivity
    if ! check_redis_connection >/dev/null 2>&1; then
        log_error "Redis not available - cannot resume from checkpoint"
        return 2
    fi

    log_info "Attempting to resume wave execution for task=$task_id"

    if [[ -z "$wave_number" ]]; then
        # Resume all waves with checkpoints
        local checkpoints
        checkpoints=$(redis-cli \
            -h "${REDIS_HOST:-localhost}" \
            -p "${REDIS_PORT:-6379}" \
            SMEMBERS "cfn:wave:checkpoints:${task_id}" 2>/dev/null || echo "")

        if [[ -z "$checkpoints" ]]; then
            log_warning "No checkpoints found for task=$task_id"
            return 1
        fi

        log_info "Found checkpoints for waves: $checkpoints"

        local resume_count=0
        while IFS= read -r wave_num; do
            if [[ -n "$wave_num" ]]; then
                if _resume_single_wave "$task_id" "$wave_num"; then
                    ((resume_count++))
                fi
            fi
        done <<< "$checkpoints"

        if [[ $resume_count -gt 0 ]]; then
            log_success "Resumed $resume_count wave(s)"
            return 0
        else
            log_warning "Failed to resume any waves"
            return 1
        fi
    else
        # Resume specific wave
        _resume_single_wave "$task_id" "$wave_number"
    fi
}

################################################################################
# SINGLE WAVE RESUME
################################################################################

_resume_single_wave() {
    local task_id="$1"
    local wave_number="$2"

    log_info "Resuming wave $wave_number of task=$task_id"

    # Get checkpoint data
    local checkpoint_key="cfn:wave:checkpoint:${task_id}:${wave_number}"
    local checkpoint_data
    checkpoint_data=$(redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        GET "$checkpoint_key" 2>/dev/null || echo "{}")

    if [[ -z "$checkpoint_data" ]] || [[ "$checkpoint_data" == "{}" ]]; then
        log_error "No checkpoint data found for wave $wave_number"
        return 1
    fi

    log_debug "Checkpoint data: $checkpoint_data"

    # Extract container IDs
    local container_ids
    container_ids=$(echo "$checkpoint_data" | jq -r '.container_ids | join(",")')

    local expected_count
    expected_count=$(echo "$checkpoint_data" | jq -r '.expected_count')

    log_info "Expected $expected_count containers, resuming with IDs: $container_ids"

    # Verify containers still exist
    local running_count=0
    local failed_containers=""

    while IFS=',' read -r container_id; do
        if [[ -n "$container_id" ]]; then
            if docker ps -a --filter "id=$container_id" --format "{{.ID}}" 2>/dev/null | grep -q "$container_id"; then
                ((running_count++))
                log_debug "Container $container_id exists"
            else
                log_warning "Container $container_id not found"
                failed_containers="${failed_containers}${container_id},"
            fi
        fi
    done <<< "$container_ids"

    log_info "Found $running_count/$expected_count containers still running"

    if [[ $running_count -eq 0 ]]; then
        log_error "No containers found for recovery"
        return 1
    fi

    # Update checkpoint status
    echo "$checkpoint_data" | jq \
        --arg status "resumed" \
        --arg resumed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg running_count "$running_count" \
        '.status = $status | .resumed_at = $resumed_at | .running_count = ($running_count | tonumber)' \
        > /tmp/checkpoint_update.json

    redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        SET "$checkpoint_key" "$(cat /tmp/checkpoint_update.json)" \
        EX "${CHECKPOINT_TTL:-3600}" 2>/dev/null || true

    log_success "Resumed wave $wave_number with $running_count active containers"
    return 0
}

################################################################################
# GET RESUMABLE WAVES FOR TASK
################################################################################

get_resumable_waves() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        log_error "Usage: get_resumable_waves TASK_ID"
        return 1
    fi

    # Verify Redis connectivity
    if ! check_redis_connection >/dev/null 2>&1; then
        log_error "Redis not available"
        return 2
    fi

    local checkpoints
    checkpoints=$(redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        SMEMBERS "cfn:wave:checkpoints:${task_id}" 2>/dev/null || echo "")

    if [[ -z "$checkpoints" ]]; then
        return 1
    fi

    echo "$checkpoints"
    return 0
}

################################################################################
# VERIFY CONTAINER STATUS
################################################################################

verify_container_status() {
    local task_id="$1"
    local wave_number="$2"

    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]]; then
        log_error "Usage: verify_container_status TASK_ID WAVE_NUMBER"
        return 1
    fi

    local checkpoint_key="cfn:wave:checkpoint:${task_id}:${wave_number}"

    # Get checkpoint data
    local checkpoint_data
    checkpoint_data=$(redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        GET "$checkpoint_key" 2>/dev/null || echo "{}")

    if [[ -z "$checkpoint_data" ]] || [[ "$checkpoint_data" == "{}" ]]; then
        log_error "No checkpoint found"
        return 1
    fi

    # Extract container IDs and verify
    local container_ids
    container_ids=$(echo "$checkpoint_data" | jq -r '.container_ids | join(" ")')

    local status_json='{
        "wave_number": '$wave_number',
        "containers": []
    }'

    for container_id in $container_ids; do
        if [[ -z "$container_id" ]]; then
            continue
        fi

        # Check container state
        local container_info
        container_info=$(docker ps -a --filter "id=$container_id" --format "json" 2>/dev/null || echo "{}")

        if [[ "$container_info" != "{}" ]]; then
            local container_status=$(echo "$container_info" | jq -r '.State // "unknown"')
            status_json=$(echo "$status_json" | jq \
                --arg id "$container_id" \
                --arg state "$container_status" \
                '.containers += [{id: $id, state: $state}]')

            log_debug "Container $container_id state: $container_status"
        else
            status_json=$(echo "$status_json" | jq \
                --arg id "$container_id" \
                '.containers += [{id: $id, state: "missing"}]')

            log_warning "Container $container_id not found"
        fi
    done

    echo "$status_json"
    return 0
}

################################################################################
# MAIN OPERATION DISPATCH
################################################################################

main() {
    local operation="${1:-}"
    shift || true

    case "$operation" in
        resume)
            # resume TASK_ID [WAVE_NUMBER]
            resume_wave "$@"
            ;;
        get-resumable)
            # get-resumable TASK_ID
            get_resumable_waves "$@"
            ;;
        verify)
            # verify TASK_ID WAVE_NUMBER
            verify_container_status "$@"
            ;;
        *)
            log_error "Unknown operation: $operation"
            echo "Available operations: resume, get-resumable, verify"
            return 1
            ;;
    esac
}

# Execute if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
