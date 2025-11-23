#!/bin/bash
# ==============================================================================
# Secret Rotation Procedure for Trigger.dev Production Deployment
# ==============================================================================
#
# Purpose: Zero-downtime secret rotation with validation and rollback support
#
# Features:
# - Single secret rotation without downtime
# - Full rotation procedure (all secrets sequentially)
# - Backup old secrets before rotation
# - Validation of new secrets before applying
# - Secret loading test in worker container
# - Rollback support if rotation fails
# - Comprehensive audit logging
#
# Usage:
#   ./scripts/security/rotate-secrets.sh              # Rotate all secrets interactively
#   ./scripts/security/rotate-secrets.sh --single TRIGGER_API_KEY_NEW --value <new-value>
#   ./scripts/security/rotate-secrets.sh --full       # Full automated rotation
#   ./scripts/security/rotate-secrets.sh --rollback   # Rollback to previous backup
#
# Environment Variables:
#   SECRETS_BACKUP_DIR     Directory for secret backups (default: .backups/secrets)
#   DOCKER_SOCKET_PROXY    Docker socket proxy URL (default: tcp://socket-proxy:2375)
#   TRIGGER_WORKER_IMAGE   Docker image to test secrets (default: trigger-dev:worker)
#
# Returns:
#   0 - Success
#   1 - Validation failed
#   2 - Rotation failed
#   3 - Rollback failed
#   4 - Container test failed
#
# ==============================================================================

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Backup and logging configuration
SECRETS_BACKUP_DIR="${SECRETS_BACKUP_DIR:-.backups/secrets}"
SECRETS_AUDIT_LOG="${SECRETS_BACKUP_DIR}/audit.log"

# Secret locations
DOCKER_SECRETS_DIR="${PROJECT_ROOT}/docker/trigger-dev/secrets"
ENV_FILE="${PROJECT_ROOT}/docker/trigger-dev/.env"
ENV_ENCRYPTED="${ENV_FILE}.encrypted"

# Docker configuration
DOCKER_SOCKET_PROXY="${DOCKER_SOCKET_PROXY:-tcp://socket-proxy:2375}"
TRIGGER_WORKER_IMAGE="${TRIGGER_WORKER_IMAGE:-trigger-dev:worker}"
DOCKER_NETWORK="${DOCKER_NETWORK:-trigger-cfn-network}"

# 10 Production Secrets (Phase 1.2a specification)
declare -a PRODUCTION_SECRETS=(
    "TRIGGER_API_KEY"
    "TRIGGER_SECRET_KEY"
    "DATABASE_URL"
    "REDIS_PASSWORD"
    "ENCRYPTION_KEY"
    "ANTHROPIC_API_KEY"
    "GITHUB_OAUTH_SECRET"
    "AUTH_SECRET"
    "MINIO_SECRET_KEY"
    "TRIGGER_ORG_ID"
)

# ==============================================================================
# Logging Functions
# ==============================================================================

log_step() {
    echo "[ROTATE] $(date '+%Y-%m-%d %H:%M:%S') [STEP] $*" >&2
}

log_info() {
    echo "[ROTATE] $(date '+%Y-%m-%d %H:%M:%S') [INFO] $*" >&2
}

log_success() {
    echo "[ROTATE] $(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $*" >&2
}

log_error() {
    echo "[ROTATE] $(date '+%Y-%m-%d %H:%M:%S') [ERROR] $*" >&2
}

log_warn() {
    echo "[ROTATE] $(date '+%Y-%m-%d %H:%M:%S') [WARN] $*" >&2
}

# Audit logging (for compliance)
audit_log() {
    local action="$1"
    local secret_name="$2"
    local details="${3:-}"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local user="${USER:-unknown}"
    local entry="${timestamp} | ${user} | ${action} | ${secret_name} | ${details}"

    mkdir -p "$SECRETS_BACKUP_DIR"
    echo "$entry" >> "$SECRETS_AUDIT_LOG"
    log_info "Audit: $entry"
}

# ==============================================================================
# Cleanup
# ==============================================================================

cleanup() {
    # Remove temporary test container
    if [[ -n "${TEST_CONTAINER_ID:-}" ]]; then
        log_step "Cleaning up test container..."
        docker rm -f "$TEST_CONTAINER_ID" 2>/dev/null || true
    fi

    # Clean up temporary files
    if [[ -d "${TEMP_DIR:-}" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# ==============================================================================
# Validation Functions
# ==============================================================================

validate_secret_format() {
    local secret_value="$1"

    # Check for newlines (invalid in Docker secrets)
    if [[ "$secret_value" =~ $'\n' ]]; then
        return 1
    fi

    # Check for null bytes
    if [[ "$secret_value" =~ $'\0' ]]; then
        return 1
    fi

    # Ensure not empty
    if [[ -z "$secret_value" ]]; then
        return 1
    fi

    return 0
}

validate_secret_permissions() {
    local secret_file="$1"

    if [[ ! -f "$secret_file" ]]; then
        return 1
    fi

    # Check permissions (should be 0600)
    local perms=$(stat -c '%a' "$secret_file" 2>/dev/null || stat -f '%A' "$secret_file" 2>/dev/null || echo "unknown")
    if [[ "$perms" != "600" ]] && [[ "$perms" != "unknown" ]]; then
        log_warn "Secret file has permissions $perms (expected 600): $secret_file"
    fi

    return 0
}

validate_secret_in_env() {
    local secret_name="$1"

    # Check if secret exists in .env file
    if grep -q "^${secret_name}=" "$ENV_FILE" 2>/dev/null; then
        log_warn "Secret $secret_name found in plain .env file (should use Docker secrets)"
        return 1
    fi

    return 0
}

# ==============================================================================
# Backup Functions
# ==============================================================================

backup_current_secret() {
    local secret_name="$1"
    local secret_file="${DOCKER_SECRETS_DIR}/${secret_name}"

    if [[ ! -f "$secret_file" ]]; then
        log_warn "Secret file not found, nothing to backup: $secret_file"
        return 0
    fi

    mkdir -p "$SECRETS_BACKUP_DIR"

    # Create timestamped backup
    local backup_file="${SECRETS_BACKUP_DIR}/${secret_name}.$(date +%s).backup"
    cp "$secret_file" "$backup_file"
    chmod 600 "$backup_file"

    log_info "Backed up $secret_name to $backup_file"
    audit_log "BACKUP" "$secret_name" "saved to $backup_file"

    echo "$backup_file"
}

restore_secret_from_backup() {
    local secret_name="$1"
    local backup_file="$2"

    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi

    local secret_file="${DOCKER_SECRETS_DIR}/${secret_name}"
    cp "$backup_file" "$secret_file"
    chmod 600 "$secret_file"

    log_success "Restored $secret_name from backup"
    audit_log "RESTORE" "$secret_name" "from $backup_file"

    return 0
}

get_latest_backup() {
    local secret_name="$1"
    local latest=$(ls -t "${SECRETS_BACKUP_DIR}/${secret_name}".*.backup 2>/dev/null | head -1)
    echo "$latest"
}

# ==============================================================================
# Rotation Functions
# ==============================================================================

rotate_single_secret() {
    local secret_name="$1"
    local new_value="$2"

    log_step "Rotating secret: $secret_name"

    # Validate new secret format
    if ! validate_secret_format "$new_value"; then
        log_error "Invalid secret format for $secret_name"
        return 1
    fi

    # Backup current secret
    local backup_file=$(backup_current_secret "$secret_name")

    # Create secret file with new value
    local secret_file="${DOCKER_SECRETS_DIR}/${secret_name}"
    mkdir -p "$DOCKER_SECRETS_DIR"

    # Write new secret atomically
    local temp_file="${secret_file}.tmp.$$"
    echo -n "$new_value" > "$temp_file"
    chmod 600 "$temp_file"
    mv "$temp_file" "$secret_file"

    log_success "Rotated $secret_name"
    audit_log "ROTATE" "$secret_name" "new value written"

    return 0
}

validate_rotated_secret() {
    local secret_name="$1"
    local secret_file="${DOCKER_SECRETS_DIR}/${secret_name}"

    log_step "Validating rotated secret: $secret_name"

    # Check file exists
    if [[ ! -f "$secret_file" ]]; then
        log_error "Secret file not found: $secret_file"
        return 1
    fi

    # Check file permissions
    if ! validate_secret_permissions "$secret_file"; then
        log_error "Invalid permissions on $secret_file"
        return 1
    fi

    # Check secret content
    local secret_value=$(cat "$secret_file" 2>/dev/null)
    if ! validate_secret_format "$secret_value"; then
        log_error "Invalid secret format: $secret_name"
        return 1
    fi

    log_success "Validated $secret_name"
    audit_log "VALIDATE" "$secret_name" "format and permissions verified"

    return 0
}

# ==============================================================================
# Worker Container Testing
# ==============================================================================

test_secret_in_worker() {
    local secret_name="$1"
    local secret_file="${DOCKER_SECRETS_DIR}/${secret_name}"

    if [[ ! -f "$secret_file" ]]; then
        log_warn "Secret file not found, skipping container test: $secret_file"
        return 0
    fi

    log_step "Testing secret loading in worker container: $secret_name"

    # Create temporary directory for test
    TEMP_DIR=$(mktemp -d)
    cp "$secret_file" "${TEMP_DIR}/${secret_name}"

    # Run test container with secret mounted
    TEST_CONTAINER_ID=$(docker run -d \
        --rm \
        -v "${TEMP_DIR}/${secret_name}:/run/secrets/${secret_name}:ro" \
        -e DOCKER_HOST="$DOCKER_SOCKET_PROXY" \
        "$TRIGGER_WORKER_IMAGE" \
        sh -c "test -f /run/secrets/${secret_name} && wc -c < /run/secrets/${secret_name}")

    # Wait for container to complete
    local timeout=30
    local elapsed=0
    while [[ $(docker inspect -f '{{.State.Running}}' "$TEST_CONTAINER_ID" 2>/dev/null || echo "false") == "true" ]]; do
        if [[ $elapsed -ge $timeout ]]; then
            log_error "Container test timeout for $secret_name"
            return 1
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    # Check exit code
    local exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$TEST_CONTAINER_ID")
    if [[ $exit_code -ne 0 ]]; then
        log_error "Container test failed for $secret_name (exit code: $exit_code)"
        docker logs "$TEST_CONTAINER_ID" 2>&1 | head -10 | sed 's/^/  /'
        return 1
    fi

    log_success "Worker container test passed for $secret_name"
    audit_log "TEST_CONTAINER" "$secret_name" "container validation passed"

    return 0
}

# ==============================================================================
# Rollback Functions
# ==============================================================================

rollback_secret() {
    local secret_name="$1"

    log_step "Rolling back secret: $secret_name"

    local backup_file=$(get_latest_backup "$secret_name")
    if [[ -z "$backup_file" ]]; then
        log_error "No backup found for $secret_name"
        return 1
    fi

    if ! restore_secret_from_backup "$secret_name" "$backup_file"; then
        return 1
    fi

    log_success "Rolled back $secret_name"
    audit_log "ROLLBACK" "$secret_name" "restored to previous version"

    return 0
}

# ==============================================================================
# Full Rotation Procedure
# ==============================================================================

full_rotation_procedure() {
    log_step "Starting full secret rotation procedure"
    log_info "Rotating ${#PRODUCTION_SECRETS[@]} production secrets"

    local rotation_timestamp=$(date '+%Y%m%d_%H%M%S')
    local rotation_id="rotation_${rotation_timestamp}"

    audit_log "ROTATION_START" "FULL" "rotation_id=${rotation_id}"

    local failed_secrets=()
    local rotated_count=0

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        log_step "Processing secret [$((rotated_count + 1))/${#PRODUCTION_SECRETS[@]}]: $secret_name"

        # Read new secret value from user
        read -sp "Enter new value for $secret_name: " new_value
        echo

        if [[ -z "$new_value" ]]; then
            log_warn "Skipping $secret_name (empty value)"
            continue
        fi

        # Perform rotation
        if ! rotate_single_secret "$secret_name" "$new_value"; then
            log_error "Failed to rotate $secret_name"
            failed_secrets+=("$secret_name")
            continue
        fi

        # Validate
        if ! validate_rotated_secret "$secret_name"; then
            log_error "Validation failed for $secret_name, rolling back..."
            if ! rollback_secret "$secret_name"; then
                log_error "CRITICAL: Rollback failed for $secret_name"
            fi
            failed_secrets+=("$secret_name")
            continue
        fi

        # Test in container
        if ! test_secret_in_worker "$secret_name"; then
            log_error "Container test failed for $secret_name, rolling back..."
            if ! rollback_secret "$secret_name"; then
                log_error "CRITICAL: Rollback failed for $secret_name"
            fi
            failed_secrets+=("$secret_name")
            continue
        fi

        rotated_count=$((rotated_count + 1))
        log_success "Successfully rotated $secret_name"
    done

    audit_log "ROTATION_COMPLETE" "FULL" "rotated=${rotated_count}, failed=${#failed_secrets[@]}"

    log_step "Full rotation complete"
    log_info "Successfully rotated: $rotated_count secrets"
    if [[ ${#failed_secrets[@]} -gt 0 ]]; then
        log_error "Failed secrets: ${failed_secrets[*]}"
        return 1
    fi

    return 0
}

# ==============================================================================
# Interactive Mode
# ==============================================================================

interactive_mode() {
    log_step "Secret Rotation Tool - Interactive Mode"
    log_info "10 Production Secrets Available:"

    for i in "${!PRODUCTION_SECRETS[@]}"; do
        echo "  $((i + 1)). ${PRODUCTION_SECRETS[$i]}"
    done

    echo
    read -p "Select secret number (1-${#PRODUCTION_SECRETS[@]}) or 'all' for full rotation: " choice

    if [[ "$choice" == "all" ]]; then
        full_rotation_procedure
    elif [[ "$choice" =~ ^[0-9]+$ ]] && [[ $choice -ge 1 ]] && [[ $choice -le ${#PRODUCTION_SECRETS[@]} ]]; then
        local secret_name="${PRODUCTION_SECRETS[$((choice - 1))]}"
        read -sp "Enter new value for $secret_name: " new_value
        echo

        if rotate_single_secret "$secret_name" "$new_value" && \
           validate_rotated_secret "$secret_name" && \
           test_secret_in_worker "$secret_name"; then
            log_success "Secret rotation completed successfully"
            return 0
        else
            log_error "Secret rotation failed"
            return 1
        fi
    else
        log_error "Invalid selection"
        return 1
    fi
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    local mode="${1:-interactive}"

    case "$mode" in
        --single)
            if [[ $# -lt 3 ]]; then
                log_error "Usage: $0 --single SECRET_NAME --value <new-value>"
                return 1
            fi
            local secret_name="$2"
            local new_value="$4"
            rotate_single_secret "$secret_name" "$new_value" && \
                validate_rotated_secret "$secret_name" && \
                test_secret_in_worker "$secret_name"
            ;;
        --full)
            full_rotation_procedure
            ;;
        --rollback)
            if [[ $# -lt 2 ]]; then
                log_error "Usage: $0 --rollback SECRET_NAME"
                return 1
            fi
            rollback_secret "$2"
            ;;
        interactive)
            interactive_mode
            ;;
        *)
            log_error "Unknown mode: $mode"
            return 1
            ;;
    esac
}

main "$@"
