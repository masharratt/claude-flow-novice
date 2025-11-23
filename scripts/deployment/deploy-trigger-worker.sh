#!/bin/bash
# scripts/deployment/deploy-trigger-worker.sh
# Phase 1.3 :: Blue-green deployment automation for trigger.dev worker
# Reference: Phase 1.3 Production Deployment - Requirement 1 (Deployment Script)

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_DIR="$PROJECT_ROOT/docker/trigger-dev"
HEALTH_CHECK_SCRIPT="$SCRIPT_DIR/health-checks.sh"

# Deployment environment (default: dev)
ENVIRONMENT="${1:-dev}"
VALID_ENVIRONMENTS=("dev" "staging" "prod")

# Container names
WORKER_CONTAINER="trigger-dev-worker"
WORKER_GREEN="trigger-dev-worker-green"
BACKUP_SUFFIX="-blue"

# State preservation
STATE_DIR="${STATE_DIR:-$PROJECT_ROOT/.artifacts/deployment-state}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
STATE_BACKUP="$STATE_DIR/$ENVIRONMENT-$TIMESTAMP"

# Deployment configuration
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_WAIT=10
STARTUP_WAIT=30
MAX_DEPLOYMENT_TIME=600  # 10 minutes

# Log file
LOG_FILE="${LOG_FILE:-/tmp/trigger-worker-deployment-${TIMESTAMP}.log}"

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

validate_environment() {
    log_step "Validating deployment environment: $ENVIRONMENT"

    local valid=0
    for env in "${VALID_ENVIRONMENTS[@]}"; do
        if [[ "$ENVIRONMENT" == "$env" ]]; then
            valid=1
            break
        fi
    done

    if [[ $valid -eq 0 ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        return 1
    fi

    log_success "Environment '$ENVIRONMENT' is valid"
    return 0
}

validate_secrets_exist() {
    log_step "Validating Docker secrets exist"

    local required_secrets=(
        "zai_api_key"
        "kimi_api_key"
        "openrouter_api_key"
        "anthropic_api_key"
        "trigger_secret_key"
        "auth_secret"
        "encryption_key"
        "magic_link_secret"
        "jwt_secret"
        "postgres_password"
    )

    local missing_secrets=()

    for secret in "${required_secrets[@]}"; do
        if ! docker secret inspect "$secret" &>/dev/null; then
            missing_secrets+=("$secret")
        fi
    done

    if [[ ${#missing_secrets[@]} -gt 0 ]]; then
        log_error "Missing Docker secrets: ${missing_secrets[*]}"
        log_error "Run Phase 1.2a secret creation script first"
        return 1
    fi

    log_success "All required secrets exist"
    return 0
}

validate_config_files() {
    log_step "Validating configuration files"

    local required_files=(
        "$COMPOSE_DIR/docker-compose.yml"
        "$COMPOSE_DIR/docker-compose.secrets.yml"
        "$COMPOSE_DIR/Dockerfile.worker"
        "$PROJECT_ROOT/.env"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Required file not found: $file"
            return 1
        fi
    done

    log_success "All configuration files exist"
    return 0
}

validate_dependencies_healthy() {
    log_step "Validating dependent services are healthy"

    local required_services=(
        "trigger-dev-postgres"
        "trigger-dev-redis"
        "trigger-dev-socket-proxy"
        "trigger-dev-webapp"
    )

    local unhealthy_services=()

    for service in "${required_services[@]}"; do
        if ! docker ps --filter "name=$service" --filter "status=running" --format "{{.Names}}" | grep -q "$service"; then
            unhealthy_services+=("$service")
        fi
    done

    if [[ ${#unhealthy_services[@]} -gt 0 ]]; then
        log_error "Unhealthy services: ${unhealthy_services[*]}"
        log_error "Start dependencies first: cd $COMPOSE_DIR && docker-compose up -d"
        return 1
    fi

    log_success "All dependent services are healthy"
    return 0
}

# ==============================================================================
# State Management
# ==============================================================================

preserve_current_state() {
    log_step "Preserving current deployment state"

    mkdir -p "$STATE_BACKUP"

    # Save current container configuration
    if docker inspect "$WORKER_CONTAINER" &>/dev/null; then
        docker inspect "$WORKER_CONTAINER" > "$STATE_BACKUP/container-config.json"
        log_success "Saved container configuration"
    else
        log_warning "No existing worker container to preserve"
        echo "{}" > "$STATE_BACKUP/container-config.json"
    fi

    # Save current image tag
    if docker inspect "$WORKER_CONTAINER" &>/dev/null; then
        local current_image=$(docker inspect --format='{{.Config.Image}}' "$WORKER_CONTAINER" 2>/dev/null || echo "none")
        echo "$current_image" > "$STATE_BACKUP/image-tag.txt"
        log_success "Saved image tag: $current_image"
    else
        echo "trigger-dev-worker-cfn:latest" > "$STATE_BACKUP/image-tag.txt"
    fi

    # Save environment file
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        cp "$PROJECT_ROOT/.env" "$STATE_BACKUP/env-backup"
        log_success "Saved environment file"
    fi

    # Save docker-compose configuration
    cp "$COMPOSE_DIR/docker-compose.yml" "$STATE_BACKUP/docker-compose.yml.backup"
    cp "$COMPOSE_DIR/docker-compose.secrets.yml" "$STATE_BACKUP/docker-compose.secrets.yml.backup"
    log_success "Saved docker-compose configuration"

    # Save deployment metadata
    cat > "$STATE_BACKUP/deployment-metadata.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "deployed_by": "${USER:-unknown}",
  "hostname": "$(hostname)",
  "project_root": "$PROJECT_ROOT"
}
EOF

    log_success "State preserved to: $STATE_BACKUP"
    echo "$STATE_BACKUP" > "$STATE_DIR/latest-$ENVIRONMENT"
}

# ==============================================================================
# Blue-Green Deployment Functions
# ==============================================================================

build_worker_image() {
    log_step "Building worker Docker image"

    cd "$COMPOSE_DIR"

    local build_start=$(date +%s)

    if docker-compose build --no-cache trigger-worker >> "$LOG_FILE" 2>&1; then
        local build_end=$(date +%s)
        local build_duration=$((build_end - build_start))
        log_success "Worker image built in ${build_duration}s"
        return 0
    else
        log_error "Failed to build worker image"
        tail -50 "$LOG_FILE"
        return 1
    fi
}

start_green_deployment() {
    log_step "Starting green deployment (new worker instance)"

    cd "$COMPOSE_DIR"

    # Stop and remove any existing green container
    if docker ps -a --filter "name=$WORKER_GREEN" --format "{{.Names}}" | grep -q "$WORKER_GREEN"; then
        log "Removing existing green container"
        docker rm -f "$WORKER_GREEN" >> "$LOG_FILE" 2>&1
    fi

    # Start new green instance with different name
    docker-compose run -d \
        --name "$WORKER_GREEN" \
        --no-deps \
        trigger-worker >> "$LOG_FILE" 2>&1

    if [[ $? -ne 0 ]]; then
        log_error "Failed to start green deployment"
        tail -50 "$LOG_FILE"
        return 1
    fi

    log_success "Green deployment started: $WORKER_GREEN"
    return 0
}

wait_for_green_startup() {
    log_step "Waiting for green deployment to initialize (${STARTUP_WAIT}s)"

    sleep "$STARTUP_WAIT"

    # Check if container is still running
    if ! docker ps --filter "name=$WORKER_GREEN" --format "{{.Names}}" | grep -q "$WORKER_GREEN"; then
        log_error "Green deployment failed to start"
        docker logs --tail 50 "$WORKER_GREEN" 2>&1 | tee -a "$LOG_FILE"
        return 1
    fi

    log_success "Green deployment initialized"
    return 0
}

validate_green_health() {
    log_step "Validating green deployment health"

    local attempt=1

    while [[ $attempt -le $HEALTH_CHECK_RETRIES ]]; do
        log "Health check attempt $attempt/$HEALTH_CHECK_RETRIES"

        # Temporarily override container name for health checks
        WORKER_CONTAINER="$WORKER_GREEN" "$HEALTH_CHECK_SCRIPT"

        if [[ $? -eq 0 ]]; then
            log_success "Green deployment is healthy"
            return 0
        fi

        if [[ $attempt -lt $HEALTH_CHECK_RETRIES ]]; then
            log_warning "Health check failed, waiting ${HEALTH_CHECK_WAIT}s before retry"
            sleep "$HEALTH_CHECK_WAIT"
        fi

        ((attempt++))
    done

    log_error "Green deployment failed health checks after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

switch_to_green() {
    log_step "Switching from blue to green deployment (zero downtime cutover)"

    # Rename current worker to blue (backup)
    if docker ps --filter "name=$WORKER_CONTAINER" --format "{{.Names}}" | grep -q "$WORKER_CONTAINER"; then
        log "Renaming current worker to blue backup"
        docker rename "$WORKER_CONTAINER" "${WORKER_CONTAINER}${BACKUP_SUFFIX}" >> "$LOG_FILE" 2>&1
    fi

    # Rename green to primary
    log "Promoting green deployment to primary"
    docker rename "$WORKER_GREEN" "$WORKER_CONTAINER" >> "$LOG_FILE" 2>&1

    if [[ $? -ne 0 ]]; then
        log_error "Failed to promote green deployment"
        # Attempt rollback
        if docker ps -a --filter "name=${WORKER_CONTAINER}${BACKUP_SUFFIX}" --format "{{.Names}}" | grep -q "${WORKER_CONTAINER}${BACKUP_SUFFIX}"; then
            docker rename "${WORKER_CONTAINER}${BACKUP_SUFFIX}" "$WORKER_CONTAINER" >> "$LOG_FILE" 2>&1
        fi
        return 1
    fi

    log_success "Green deployment promoted to primary"
    return 0
}

cleanup_blue_deployment() {
    log_step "Cleaning up blue deployment (old worker)"

    if docker ps -a --filter "name=${WORKER_CONTAINER}${BACKUP_SUFFIX}" --format "{{.Names}}" | grep -q "${WORKER_CONTAINER}${BACKUP_SUFFIX}"; then
        log "Stopping blue deployment"
        docker stop "${WORKER_CONTAINER}${BACKUP_SUFFIX}" >> "$LOG_FILE" 2>&1

        log "Removing blue deployment"
        docker rm "${WORKER_CONTAINER}${BACKUP_SUFFIX}" >> "$LOG_FILE" 2>&1

        log_success "Blue deployment cleaned up"
    else
        log_warning "No blue deployment to clean up"
    fi

    return 0
}

# ==============================================================================
# Post-Deployment Validation
# ==============================================================================

final_health_validation() {
    log_step "Running final health validation on primary deployment"

    "$HEALTH_CHECK_SCRIPT"

    if [[ $? -ne 0 ]]; then
        log_error "Final health validation failed"
        return 1
    fi

    log_success "Final health validation passed"
    return 0
}

# ==============================================================================
# Rollback on Failure
# ==============================================================================

rollback_on_failure() {
    log_error "Deployment failed, initiating automatic rollback"

    # Stop and remove green deployment
    if docker ps -a --filter "name=$WORKER_GREEN" --format "{{.Names}}" | grep -q "$WORKER_GREEN"; then
        docker rm -f "$WORKER_GREEN" >> "$LOG_FILE" 2>&1
    fi

    # Restore blue deployment if it exists
    if docker ps -a --filter "name=${WORKER_CONTAINER}${BACKUP_SUFFIX}" --format "{{.Names}}" | grep -q "${WORKER_CONTAINER}${BACKUP_SUFFIX}"; then
        docker rename "${WORKER_CONTAINER}${BACKUP_SUFFIX}" "$WORKER_CONTAINER" >> "$LOG_FILE" 2>&1
        docker start "$WORKER_CONTAINER" >> "$LOG_FILE" 2>&1
        log_success "Rolled back to blue deployment"
    else
        log_error "No blue deployment to rollback to"
    fi

    return 1
}

# ==============================================================================
# Main Deployment Flow
# ==============================================================================

main() {
    local start_time=$(date +%s)

    log "========================================="
    log "Trigger.dev Worker Deployment"
    log "========================================="
    log "Environment: $ENVIRONMENT"
    log "Timestamp: $TIMESTAMP"
    log "Log file: $LOG_FILE"
    log ""

    # Pre-deployment validation
    validate_environment || exit 1
    validate_secrets_exist || exit 1
    validate_config_files || exit 1
    validate_dependencies_healthy || exit 1

    # State preservation
    preserve_current_state || exit 1

    # Build new image
    build_worker_image || { rollback_on_failure; exit 1; }

    # Blue-green deployment
    start_green_deployment || { rollback_on_failure; exit 1; }
    wait_for_green_startup || { rollback_on_failure; exit 1; }
    validate_green_health || { rollback_on_failure; exit 1; }
    switch_to_green || { rollback_on_failure; exit 1; }
    cleanup_blue_deployment

    # Final validation
    final_health_validation || { rollback_on_failure; exit 1; }

    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))

    log ""
    log "========================================="
    log "Deployment Complete"
    log "========================================="
    log "Environment: $ENVIRONMENT"
    log "Duration: ${total_duration}s"
    log "State backup: $STATE_BACKUP"
    log_success "Deployment successful ✅"

    return 0
}

# Run deployment
main "$@"
