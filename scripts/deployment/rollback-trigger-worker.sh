#!/bin/bash
# scripts/deployment/rollback-trigger-worker.sh
# Phase 1.3 :: Fast rollback automation for trigger.dev worker
# Reference: Phase 1.3 Production Deployment - Requirement 2 (Rollback Script)

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_DIR="$PROJECT_ROOT/docker/trigger-dev"
HEALTH_CHECK_SCRIPT="$SCRIPT_DIR/health-checks.sh"

# Rollback environment (default: dev)
ENVIRONMENT="${1:-dev}"

# Rollback reason (optional, for logging)
ROLLBACK_REASON="${2:-Manual rollback requested}"

# Container names
WORKER_CONTAINER="trigger-dev-worker"

# State preservation
STATE_DIR="${STATE_DIR:-$PROJECT_ROOT/.artifacts/deployment-state}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ROLLBACK_BACKUP="$STATE_DIR/rollback-$ENVIRONMENT-$TIMESTAMP"

# Rollback configuration
RTO_TARGET=300  # 5 minutes Recovery Time Objective
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_WAIT=10

# Log file
LOG_FILE="${LOG_FILE:-/tmp/trigger-worker-rollback-${TIMESTAMP}.log}"

# ==============================================================================
# Logging Functions
# ==============================================================================

log() {
    local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

log_success() {
    log "✅ $*"
}

log_error() {
    log "❌ $*"
}

log_warning() {
    log "⚠️  $*"
}

log_step() {
    log "📋 $*"
}

# ==============================================================================
# Validation Functions
# ==============================================================================

validate_state_backup_exists() {
    log_step "Validating deployment state backup exists"

    local latest_state_file="$STATE_DIR/latest-$ENVIRONMENT"

    if [[ ! -f "$latest_state_file" ]]; then
        log_error "No deployment state found for environment: $ENVIRONMENT"
        log_error "Cannot rollback without previous deployment state"
        return 1
    fi

    local backup_path=$(cat "$latest_state_file")

    if [[ ! -d "$backup_path" ]]; then
        log_error "State backup directory not found: $backup_path"
        return 1
    fi

    log_success "Found deployment state: $backup_path"
    echo "$backup_path"
    return 0
}

# ==============================================================================
# State Preservation
# ==============================================================================

preserve_pre_rollback_state() {
    log_step "Preserving current state before rollback"

    mkdir -p "$ROLLBACK_BACKUP"

    # Save current container configuration
    if docker inspect "$WORKER_CONTAINER" &>/dev/null; then
        docker inspect "$WORKER_CONTAINER" > "$ROLLBACK_BACKUP/container-config.json"
        log_success "Saved current container configuration"
    else
        log_warning "No running worker container to preserve"
        echo "{}" > "$ROLLBACK_BACKUP/container-config.json"
    fi

    # Save current image tag
    if docker inspect "$WORKER_CONTAINER" &>/dev/null; then
        local current_image=$(docker inspect --format='{{.Config.Image}}' "$WORKER_CONTAINER" 2>/dev/null || echo "none")
        echo "$current_image" > "$ROLLBACK_BACKUP/image-tag.txt"
        log_success "Saved current image tag: $current_image"
    fi

    # Save rollback metadata
    cat > "$ROLLBACK_BACKUP/rollback-metadata.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "reason": "$ROLLBACK_REASON",
  "rolled_back_by": "${USER:-unknown}",
  "hostname": "$(hostname)"
}
EOF

    log_success "Pre-rollback state preserved to: $ROLLBACK_BACKUP"
}

# ==============================================================================
# Rollback Functions
# ==============================================================================

stop_current_worker() {
    log_step "Stopping current worker deployment"

    if docker ps --filter "name=$WORKER_CONTAINER" --format "{{.Names}}" | grep -q "$WORKER_CONTAINER"; then
        docker stop "$WORKER_CONTAINER" >> "$LOG_FILE" 2>&1

        if [[ $? -eq 0 ]]; then
            log_success "Worker stopped"
            return 0
        else
            log_error "Failed to stop worker"
            return 1
        fi
    else
        log_warning "No running worker to stop"
        return 0
    fi
}

remove_current_worker() {
    log_step "Removing current worker deployment"

    if docker ps -a --filter "name=$WORKER_CONTAINER" --format "{{.Names}}" | grep -q "$WORKER_CONTAINER"; then
        docker rm -f "$WORKER_CONTAINER" >> "$LOG_FILE" 2>&1

        if [[ $? -eq 0 ]]; then
            log_success "Worker removed"
            return 0
        else
            log_error "Failed to remove worker"
            return 1
        fi
    else
        log_warning "No worker container to remove"
        return 0
    fi
}

restore_previous_configuration() {
    local backup_path="$1"

    log_step "Restoring previous deployment configuration"

    # Restore docker-compose configuration
    if [[ -f "$backup_path/docker-compose.yml.backup" ]]; then
        cp "$backup_path/docker-compose.yml.backup" "$COMPOSE_DIR/docker-compose.yml"
        log_success "Restored docker-compose.yml"
    fi

    if [[ -f "$backup_path/docker-compose.secrets.yml.backup" ]]; then
        cp "$backup_path/docker-compose.secrets.yml.backup" "$COMPOSE_DIR/docker-compose.secrets.yml"
        log_success "Restored docker-compose.secrets.yml"
    fi

    # Restore environment file
    if [[ -f "$backup_path/env-backup" ]]; then
        cp "$backup_path/env-backup" "$PROJECT_ROOT/.env"
        log_success "Restored .env file"
    fi

    return 0
}

restore_previous_image() {
    local backup_path="$1"

    log_step "Restoring previous Docker image"

    if [[ ! -f "$backup_path/image-tag.txt" ]]; then
        log_error "Image tag not found in backup"
        return 1
    fi

    local previous_image=$(cat "$backup_path/image-tag.txt")

    log "Previous image: $previous_image"

    # Check if image exists locally
    if ! docker inspect "$previous_image" &>/dev/null; then
        log_warning "Previous image not found locally, rebuilding"

        cd "$COMPOSE_DIR"
        if ! docker-compose build trigger-worker >> "$LOG_FILE" 2>&1; then
            log_error "Failed to rebuild image"
            return 1
        fi
        log_success "Image rebuilt"
    else
        log_success "Previous image found locally"
    fi

    return 0
}

start_previous_deployment() {
    log_step "Starting previous deployment"

    cd "$COMPOSE_DIR"

    docker-compose up -d trigger-worker >> "$LOG_FILE" 2>&1

    if [[ $? -ne 0 ]]; then
        log_error "Failed to start previous deployment"
        tail -50 "$LOG_FILE"
        return 1
    fi

    log_success "Previous deployment started"

    # Wait for container to initialize
    log "Waiting for container initialization (30s)"
    sleep 30

    return 0
}

validate_rollback_health() {
    log_step "Validating rolled-back deployment health"

    local attempt=1

    while [[ $attempt -le $HEALTH_CHECK_RETRIES ]]; do
        log "Health check attempt $attempt/$HEALTH_CHECK_RETRIES"

        "$HEALTH_CHECK_SCRIPT"

        if [[ $? -eq 0 ]]; then
            log_success "Rolled-back deployment is healthy"
            return 0
        fi

        if [[ $attempt -lt $HEALTH_CHECK_RETRIES ]]; then
            log_warning "Health check failed, waiting ${HEALTH_CHECK_WAIT}s before retry"
            sleep "$HEALTH_CHECK_WAIT"
        fi

        ((attempt++))
    done

    log_error "Rolled-back deployment failed health checks after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

# ==============================================================================
# Emergency Fallback
# ==============================================================================

emergency_fallback() {
    log_error "Rollback failed, attempting emergency recovery"

    # Try to start any version of the worker
    cd "$COMPOSE_DIR"

    log "Attempting to start worker with latest image"
    docker-compose up -d trigger-worker >> "$LOG_FILE" 2>&1

    if docker ps --filter "name=$WORKER_CONTAINER" --format "{{.Names}}" | grep -q "$WORKER_CONTAINER"; then
        log_warning "Emergency recovery successful, but manual intervention required"
        return 0
    else
        log_error "Emergency recovery failed, manual intervention CRITICAL"
        return 1
    fi
}

# ==============================================================================
# Main Rollback Flow
# ==============================================================================

main() {
    local start_time=$(date +%s)

    log "========================================="
    log "Trigger.dev Worker Rollback"
    log "========================================="
    log "Environment: $ENVIRONMENT"
    log "Reason: $ROLLBACK_REASON"
    log "Timestamp: $TIMESTAMP"
    log "RTO Target: ${RTO_TARGET}s"
    log "Log file: $LOG_FILE"
    log ""

    # Validate state backup exists
    local backup_path
    backup_path=$(validate_state_backup_exists) || exit 1

    # Preserve pre-rollback state
    preserve_pre_rollback_state

    # Stop current deployment
    stop_current_worker || { emergency_fallback; exit 1; }
    remove_current_worker || { emergency_fallback; exit 1; }

    # Restore previous configuration
    restore_previous_configuration "$backup_path" || { emergency_fallback; exit 1; }
    restore_previous_image "$backup_path" || { emergency_fallback; exit 1; }

    # Start previous deployment
    start_previous_deployment || { emergency_fallback; exit 1; }

    # Validate health
    validate_rollback_health || { emergency_fallback; exit 1; }

    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))

    log ""
    log "========================================="
    log "Rollback Complete"
    log "========================================="
    log "Environment: $ENVIRONMENT"
    log "Duration: ${total_duration}s"
    log "RTO Target: ${RTO_TARGET}s"

    if [[ $total_duration -le $RTO_TARGET ]]; then
        log_success "RTO met (${total_duration}s ≤ ${RTO_TARGET}s) ✅"
    else
        log_warning "RTO exceeded (${total_duration}s > ${RTO_TARGET}s) ⚠️"
    fi

    log "Pre-rollback state: $ROLLBACK_BACKUP"
    log "Restored state: $backup_path"
    log_success "Rollback successful ✅"

    return 0
}

# Run rollback
main "$@"
