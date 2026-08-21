#!/usr/bin/env bash

################################################################################
# CFN Wave Checkpoint - Save Execution State
# Purpose: Persist wave execution state to Redis for recovery
# Version: 1.0.0
# Exit Codes: 0=success, 1=validation_error, 2=redis_error
################################################################################

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../" && pwd)"

# Redis configuration
# Guarded, not `readonly`. All three of these scripts declare the same names and
# the documented integration pattern in SKILL.md sources more than one of them in
# a single shell, so `readonly` made the second `source` a fatal error:
#   source save-checkpoint.sh && source resume-wave.sh
#   -> resume-wave.sh: line 17: REDIS_HOST: readonly variable   (exit 1)
# Assigning to a name the caller already froze fails whether or not the keyword
# is present, so the guard is what fixes it, not dropping `readonly` alone.
[[ -n ${REDIS_HOST:-} ]] || REDIS_HOST="${REDIS_HOST:-localhost}"
[[ -n ${REDIS_PORT:-} ]] || REDIS_PORT="${REDIS_PORT:-6379}"
[[ -n ${DEFAULT_REDIS_DB:-} ]] || DEFAULT_REDIS_DB=0
[[ -n ${DEFAULT_TIMEOUT:-} ]] || DEFAULT_TIMEOUT=30
[[ -n ${CHECKPOINT_TTL:-} ]] || CHECKPOINT_TTL="${CHECKPOINT_TTL:-3600}"

# Helper: Check Redis connection
check_redis_connection() {
    if ! command -v redis-cli &> /dev/null; then
        return 1
    fi

    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1
    return $?
}

# Color codes
[[ -n ${RED:-} ]] || RED='\033[0;31m'
[[ -n ${GREEN:-} ]] || GREEN='\033[0;32m'
[[ -n ${YELLOW:-} ]] || YELLOW='\033[1;33m'
[[ -n ${BLUE:-} ]] || BLUE='\033[0;34m'
[[ -n ${NC:-} ]] || NC='\033[0m'

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

################################################################################
# CHECKPOINT SAVE FUNCTION
################################################################################

save_checkpoint() {
    local task_id="$1"
    local wave_number="$2"
    local container_ids="$3"
    local spawn_time="$4"
    local expected_count="$5"

    # Validation
    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]] || [[ -z "$expected_count" ]]; then
        log_error "Usage: save_checkpoint TASK_ID WAVE_NUMBER CONTAINER_IDS SPAWN_TIME EXPECTED_COUNT"
        return 1
    fi

    # Verify Redis connectivity
    if ! check_redis_connection >/dev/null 2>&1; then
        log_error "Redis not available - checkpoint persistence disabled"
        log_warning "Wave execution will proceed without recovery capability"
        return 0  # Non-fatal: continue execution
    fi

    # Build checkpoint JSON
    local checkpoint_json
    checkpoint_json=$(jq -n \
        --arg task_id "$task_id" \
        --arg wave_number "$wave_number" \
        --arg container_ids "$container_ids" \
        --arg spawn_time "$spawn_time" \
        --arg expected_count "$expected_count" \
        --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            task_id: $task_id,
            wave_number: ($wave_number | tonumber),
            container_ids: ($container_ids | split(",")),
            spawn_time: ($spawn_time | tonumber),
            expected_count: ($expected_count | tonumber),
            created_at: $created_at,
            status: "in_progress"
        }')

    # Generate checkpoint key
    local checkpoint_key="cfn:wave:checkpoint:${task_id}:${wave_number}"

    # Store in Redis with TTL
    log_info "Saving checkpoint: $checkpoint_key"

    if redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        SET "$checkpoint_key" "$checkpoint_json" \
        EX "${CHECKPOINT_TTL:-3600}" 2>/dev/null; then

        log_success "Checkpoint saved for task=$task_id wave=$wave_number"

        # Also track in a set for recovery scanning
        redis-cli \
            -h "${REDIS_HOST:-localhost}" \
            -p "${REDIS_PORT:-6379}" \
            SADD "cfn:wave:checkpoints:${task_id}" "$wave_number" 2>/dev/null || true

        # Set expiry separately (SADD doesn't support EX)
        redis-cli \
            -h "${REDIS_HOST:-localhost}" \
            -p "${REDIS_PORT:-6379}" \
            EXPIRE "cfn:wave:checkpoints:${task_id}" "${CHECKPOINT_TTL:-3600}" 2>/dev/null || true

        return 0
    else
        log_error "Failed to save checkpoint to Redis"
        return 2
    fi
}

################################################################################
# CHECKPOINT EXISTS CHECK
################################################################################

checkpoint_exists() {
    local task_id="$1"
    local wave_number="${2:-}"

    if [[ -z "$task_id" ]]; then
        log_error "checkpoint_exists requires TASK_ID"
        return 1
    fi

    # Verify Redis connectivity
    if ! check_redis_connection >/dev/null 2>&1; then
        log_warning "Redis not available - checkpoint check skipped"
        return 1
    fi

    if [[ -z "$wave_number" ]]; then
        # Check if any checkpoints exist for task
        local checkpoint_count
        checkpoint_count=$(redis-cli \
            -h "${REDIS_HOST:-localhost}" \
            -p "${REDIS_PORT:-6379}" \
            SCARD "cfn:wave:checkpoints:${task_id}" 2>/dev/null || echo "0")

        [[ "$checkpoint_count" -gt 0 ]]
    else
        # Check specific wave checkpoint
        local checkpoint_key="cfn:wave:checkpoint:${task_id}:${wave_number}"
        redis-cli \
            -h "${REDIS_HOST:-localhost}" \
            -p "${REDIS_PORT:-6379}" \
            EXISTS "$checkpoint_key" 2>/dev/null | grep -q "^1$"
    fi
}

################################################################################
# GET CHECKPOINT DATA
################################################################################

get_checkpoint() {
    local task_id="$1"
    local wave_number="$2"

    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]]; then
        log_error "Usage: get_checkpoint TASK_ID WAVE_NUMBER"
        return 1
    fi

    # Verify Redis connectivity
    if ! check_redis_connection >/dev/null 2>&1; then
        log_error "Redis not available"
        return 2
    fi

    local checkpoint_key="cfn:wave:checkpoint:${task_id}:${wave_number}"

    redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        GET "$checkpoint_key" 2>/dev/null || {
        log_error "Failed to retrieve checkpoint"
        return 2
    }
}

################################################################################
# UPDATE CHECKPOINT STATUS
################################################################################

update_checkpoint_status() {
    local task_id="$1"
    local wave_number="$2"
    local status="$3"

    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]] || [[ -z "$status" ]]; then
        log_error "Usage: update_checkpoint_status TASK_ID WAVE_NUMBER STATUS"
        return 1
    fi

    # Verify Redis connectivity
    if ! check_redis_connection >/dev/null 2>&1; then
        log_warning "Redis not available - status update skipped"
        return 0
    fi

    local checkpoint_key="cfn:wave:checkpoint:${task_id}:${wave_number}"

    # Get existing checkpoint
    local existing
    existing=$(redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        GET "$checkpoint_key" 2>/dev/null || echo "{}")

    # Update status
    local updated
    updated=$(echo "$existing" | jq --arg status "$status" '.status = $status')

    # Save updated checkpoint
    redis-cli \
        -h "${REDIS_HOST:-localhost}" \
        -p "${REDIS_PORT:-6379}" \
        SET "$checkpoint_key" "$updated" \
        EX "${CHECKPOINT_TTL:-3600}" 2>/dev/null || {
        log_error "Failed to update checkpoint status"
        return 2
    }

    log_success "Updated checkpoint status: $status"
    return 0
}

################################################################################
# MAIN OPERATION DISPATCH
################################################################################

main() {
    local operation="${1:-}"
    shift || true

    case "$operation" in
        save)
            # save TASK_ID WAVE_NUMBER CONTAINER_IDS SPAWN_TIME EXPECTED_COUNT
            save_checkpoint "$@"
            ;;
        exists)
            # exists TASK_ID [WAVE_NUMBER]
            checkpoint_exists "$@"
            ;;
        get)
            # get TASK_ID WAVE_NUMBER
            get_checkpoint "$@"
            ;;
        update-status)
            # update-status TASK_ID WAVE_NUMBER STATUS
            update_checkpoint_status "$@"
            ;;
        *)
            log_error "Unknown operation: $operation"
            echo "Available operations: save, exists, get, update-status"
            return 1
            ;;
    esac
}

# Execute if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
