#!/bin/bash
# ==============================================================================
# Environment Validation Script - trigger.dev Multi-Environment Deployment
# ==============================================================================
#
# Purpose: Validate Docker Compose configuration and environment setup
# before deploying to dev, staging, or production environments
#
# Usage:
#   ./scripts/deployment/validate-environment.sh [env] [--fix]
#
# Arguments:
#   env      Environment to validate (dev|staging|prod) - optional
#   --fix    Automatically fix common issues
#   --quiet  Suppress output
#   --help   Show this message
#
# Examples:
#   # Validate development environment
#   ./scripts/deployment/validate-environment.sh dev
#
#   # Validate staging with auto-fixes
#   ./scripts/deployment/validate-environment.sh staging --fix
#
#   # Validate production (strictest checks)
#   ./scripts/deployment/validate-environment.sh prod
#
# Exit Codes:
#   0 = All validations passed
#   1 = Validation failures (non-critical)
#   2 = Validation failures (critical)
#   3 = Configuration error
#
# ==============================================================================

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker/trigger-dev"
ENVIRONMENTS_DIR="$DOCKER_DIR/environments"

# Default values
ENVIRONMENT="${1:-dev}"
AUTO_FIX=false
QUIET=false
CRITICAL_ERRORS=0
WARNINGS=0

# ==============================================================================
# Helper Functions
# ==============================================================================

log_info() {
    [ "$QUIET" = false ] && echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
    [ "$QUIET" = false ] && echo -e "${GREEN}✓${NC} $*"
}

log_warning() {
    [ "$QUIET" = false ] && echo -e "${YELLOW}⚠${NC} $*"
    WARNINGS=$((WARNINGS + 1))
}

log_error() {
    echo -e "${RED}✗${NC} $*" >&2
    CRITICAL_ERRORS=$((CRITICAL_ERRORS + 1))
}

show_help() {
    grep '^# ' "$0" | tail -n +3 | sed 's/^# //'
}

# ==============================================================================
# Validation Functions
# ==============================================================================

validate_environment_argument() {
    case "$ENVIRONMENT" in
        dev|staging|prod)
            log_success "Environment: $ENVIRONMENT"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT (must be dev, staging, or prod)"
            return 2
            ;;
    esac
}

validate_directory_structure() {
    log_info "Checking directory structure..."

    local REQUIRED_FILES=(
        "$DOCKER_DIR/docker-compose.yml"
        "$DOCKER_DIR/docker-compose.secrets.yml"
        "$ENVIRONMENTS_DIR/dev.yml"
        "$ENVIRONMENTS_DIR/staging.yml"
        "$ENVIRONMENTS_DIR/prod.yml"
    )

    for file in "${REQUIRED_FILES[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Missing required file: $file"
            return 2
        fi
        log_success "Found: $(basename "$file")"
    done
}

validate_compose_syntax() {
    log_info "Validating Docker Compose syntax..."

    local COMPOSE_FILES=(
        "$DOCKER_DIR/docker-compose.yml"
        "$DOCKER_DIR/docker-compose.yml:$DOCKER_DIR/docker-compose.secrets.yml"
        "$DOCKER_DIR/docker-compose.yml:$DOCKER_DIR/docker-compose.secrets.yml:$ENVIRONMENTS_DIR/$ENVIRONMENT.yml"
    )

    for files in "${COMPOSE_FILES[@]}"; do
        IFS=':' read -ra FILE_ARRAY <<< "$files"

        local file_list=""
        for f in "${FILE_ARRAY[@]}"; do
            file_list="$file_list -f $f"
        done

        if docker-compose $file_list config > /dev/null 2>&1; then
            log_success "Valid: $(echo $files | tr ':' ' ')"
        else
            log_error "Invalid compose syntax: $files"
            docker-compose $file_list config 2>&1 | head -5
            return 2
        fi
    done
}

validate_required_secrets() {
    log_info "Checking required secrets..."

    local REQUIRED_SECRETS=(
        "ANTHROPIC_API_KEY"
        "POSTGRES_PASSWORD"
        "REDIS_PASSWORD"
        "AUTH_SECRET"
        "ENCRYPTION_KEY"
        "MAGIC_LINK_SECRET"
        "JWT_SECRET"
    )

    local SECRETS_DIR="$DOCKER_DIR/.secrets"

    if [ ! -d "$SECRETS_DIR" ]; then
        log_warning "Secrets directory not found: $SECRETS_DIR"
        if [ "$AUTO_FIX" = true ]; then
            mkdir -p "$SECRETS_DIR"
            log_success "Created secrets directory"
        else
            log_error "Create secrets directory with: mkdir -p $SECRETS_DIR"
            return 1
        fi
    fi

    for secret in "${REQUIRED_SECRETS[@]}"; do
        local secret_file="$SECRETS_DIR/$secret"

        if [ -f "$secret_file" ]; then
            local size=$(wc -c < "$secret_file")
            if [ "$size" -gt 0 ]; then
                log_success "Secret configured: $secret"
            else
                log_warning "Secret is empty: $secret"
            fi
        else
            log_warning "Secret file not found: $secret"
            if [ "$AUTO_FIX" = true ] && [ "$ENVIRONMENT" = "dev" ]; then
                echo "placeholder-$secret" > "$secret_file"
                log_success "Created placeholder secret: $secret"
            fi
        fi
    done
}

validate_env_file() {
    log_info "Validating .env file..."

    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        log_warning ".env file not found"
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            log_info "Found .env.example - copy it to .env"
            if [ "$AUTO_FIX" = true ]; then
                cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
                log_success "Created .env from .env.example"
            fi
        else
            log_error "Neither .env nor .env.example found"
            return 1
        fi
    else
        log_success "Found .env file"

        # Check for required variables
        local REQUIRED_VARS=(
            "POSTGRES_PASSWORD"
            "REDIS_PASSWORD"
            "AUTH_SECRET"
            "ENCRYPTION_KEY"
        )

        for var in "${REQUIRED_VARS[@]}"; do
            if grep -q "^$var=" "$PROJECT_ROOT/.env"; then
                log_success "Environment variable set: $var"
            else
                log_warning "Environment variable not set: $var"
            fi
        done
    fi
}

validate_resource_limits() {
    log_info "Validating resource limits for $ENVIRONMENT environment..."

    case "$ENVIRONMENT" in
        dev)
            # Development: relaxed limits
            if grep -q "memory: 512M" "$ENVIRONMENTS_DIR/dev.yml"; then
                log_success "Development memory limits appropriate"
            fi
            ;;
        staging)
            # Staging: moderate limits
            if grep -q "memory: 768M" "$ENVIRONMENTS_DIR/staging.yml" || \
               grep -q "memory: 1G" "$ENVIRONMENTS_DIR/staging.yml"; then
                log_success "Staging memory limits appropriate"
            else
                log_warning "Staging memory limits may be too low"
            fi
            ;;
        prod)
            # Production: strict limits
            if grep -q "memory: 1G" "$ENVIRONMENTS_DIR/prod.yml" || \
               grep -q "memory: 2G" "$ENVIRONMENTS_DIR/prod.yml" || \
               grep -q "memory: 4G" "$ENVIRONMENTS_DIR/prod.yml"; then
                log_success "Production memory limits appropriate"
            else
                log_error "Production memory limits insufficient"
                return 1
            fi
            ;;
    esac
}

validate_replicas() {
    log_info "Validating service replicas for $ENVIRONMENT..."

    case "$ENVIRONMENT" in
        dev)
            # Development: single replicas
            if grep -q "replicas: 1" "$ENVIRONMENTS_DIR/dev.yml"; then
                log_success "Development: single replica configuration"
            fi
            ;;
        staging)
            # Staging: 2 replicas for key services
            if grep -q "replicas: 2" "$ENVIRONMENTS_DIR/staging.yml"; then
                log_success "Staging: multi-replica configuration for HA testing"
            else
                log_warning "Staging should have replicas: 2 for HA testing"
            fi
            ;;
        prod)
            # Production: 3+ replicas
            if grep -q "replicas: 3" "$ENVIRONMENTS_DIR/prod.yml"; then
                log_success "Production: 3-replica configuration for high availability"
            else
                log_error "Production should have replicas: 3 for HA"
                return 1
            fi
            ;;
    esac
}

validate_health_checks() {
    log_info "Validating health check configuration..."

    # Count health checks in base compose
    local health_checks=$(grep -c "healthcheck:" "$DOCKER_DIR/docker-compose.yml" || true)

    if [ "$health_checks" -ge 5 ]; then
        log_success "Health checks configured for all services ($health_checks found)"
    else
        log_warning "Some services may be missing health checks (found: $health_checks)"
    fi

    # Check specific services
    for service in postgres redis minio clickhouse trigger-webapp trigger-worker; do
        if grep -A2 "^  $service:" "$DOCKER_DIR/docker-compose.yml" | grep -q "healthcheck:"; then
            log_success "Health check: $service"
        else
            log_warning "Missing health check: $service"
        fi
    done
}

validate_network_config() {
    log_info "Validating network configuration..."

    if grep -q "trigger-cfn-network:" "$DOCKER_DIR/docker-compose.yml"; then
        log_success "Custom network configured: trigger-cfn-network"
    else
        log_warning "Network configuration missing"
        return 1
    fi

    # Check all services are on the network
    local services=("postgres" "redis" "minio" "clickhouse" "trigger-webapp" "trigger-worker" "socket-proxy")

    for service in "${services[@]}"; do
        if grep -A30 "^  $service:" "$DOCKER_DIR/docker-compose.yml" | grep -q "trigger-cfn-network"; then
            log_success "Service connected to network: $service"
        else
            log_warning "Service not explicitly on network: $service"
        fi
    done
}

validate_socket_proxy() {
    log_info "Validating socket proxy configuration..."

    if grep -q "socket-proxy:" "$DOCKER_DIR/docker-compose.yml"; then
        log_success "Socket proxy service configured"
    else
        log_error "Socket proxy not found in configuration"
        return 1
    fi

    # Check trigger-worker is using socket proxy
    if grep -A20 "trigger-worker:" "$DOCKER_DIR/docker-compose.yml" | grep -q "DOCKER_HOST.*socket-proxy"; then
        log_success "Worker configured to use socket proxy"
    else
        log_warning "Worker may not be using socket proxy"
    fi
}

validate_environment_specific_settings() {
    log_info "Validating $ENVIRONMENT-specific settings..."

    case "$ENVIRONMENT" in
        dev)
            # Check debug logging is enabled
            if grep -q "LOG_LEVEL: debug" "$ENVIRONMENTS_DIR/dev.yml"; then
                log_success "Debug logging enabled"
            else
                log_warning "Debug logging not enabled in dev environment"
            fi

            # Check fast restart policy
            if grep -q "restart_policy:" "$ENVIRONMENTS_DIR/dev.yml"; then
                log_success "Restart policy configured for quick iteration"
            fi
            ;;
        staging)
            # Check rollback strategy
            if grep -q "failure_action: rollback" "$ENVIRONMENTS_DIR/staging.yml"; then
                log_success "Rollback strategy enabled"
            else
                log_warning "Rollback strategy not configured"
            fi

            # Check update strategy
            if grep -q "parallelism: 1" "$ENVIRONMENTS_DIR/staging.yml"; then
                log_success "Sequential update strategy (safer deployment)"
            fi
            ;;
        prod)
            # Check maximum replicas
            if grep -q "replicas: 3" "$ENVIRONMENTS_DIR/prod.yml"; then
                log_success "Maximum replicas configured for HA"
            fi

            # Check restart policy
            if grep -q "max_attempts: 5" "$ENVIRONMENTS_DIR/prod.yml"; then
                log_success "Restart policy configured"
            fi

            # Check monitoring
            if grep -q "ENABLE_METRICS: 'true'" "$ENVIRONMENTS_DIR/prod.yml"; then
                log_success "Monitoring enabled"
            else
                log_warning "Monitoring not explicitly enabled"
            fi

            # Check telemetry
            if grep -q "TRIGGER_TELEMETRY_DISABLED: 'true'" "$ENVIRONMENTS_DIR/prod.yml"; then
                log_success "Telemetry disabled for production"
            fi
            ;;
    esac
}

validate_security_settings() {
    log_info "Validating security configuration..."

    # Check secrets are used (not env vars)
    if grep -q "^secrets:" "$DOCKER_DIR/docker-compose.secrets.yml"; then
        log_success "Secrets defined in separate file"
    fi

    # Check socket proxy is not exposing dangerous endpoints
    if grep -q "ALLOW_START:" "$ENVIRONMENTS_DIR/prod.yml"; then
        log_success "Socket proxy restrictions configured"
    fi

    # Check TLS validation
    if grep -q "NODE_TLS_REJECT_UNAUTHORIZED" "$ENVIRONMENTS_DIR/prod.yml"; then
        log_success "TLS validation configured"
    fi
}

validate_volume_configuration() {
    log_info "Validating volume configuration..."

    # Check volumes are defined
    local volumes=$(grep -c "^  [a-z_]*_data:" "$DOCKER_DIR/docker-compose.yml" || true)

    if [ "$volumes" -ge 4 ]; then
        log_success "Named volumes configured ($volumes found)"
    else
        log_warning "Some services may be missing named volumes"
    fi

    # Check backup volumes for production
    if [ "$ENVIRONMENT" = "prod" ]; then
        if grep -q "./backups/" "$ENVIRONMENTS_DIR/prod.yml"; then
            log_success "Backup volume paths configured for production"
        else
            log_warning "Backup volume paths not configured for production"
        fi
    fi
}

run_docker_compose_validation() {
    log_info "Running docker-compose config validation..."

    local compose_cmd="docker-compose -f $DOCKER_DIR/docker-compose.yml \
        -f $DOCKER_DIR/docker-compose.secrets.yml \
        -f $ENVIRONMENTS_DIR/$ENVIRONMENT.yml"

    if $compose_cmd config > /dev/null 2>&1; then
        log_success "Docker Compose configuration is valid"
    else
        log_error "Docker Compose configuration validation failed"
        $compose_cmd config 2>&1 | head -10
        return 2
    fi
}

# ==============================================================================
# Parse Arguments
# ==============================================================================

while [[ $# -gt 1 ]]; do
    case "$2" in
        --fix)
            AUTO_FIX=true
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $2"
            exit 3
            ;;
    esac
done

# ==============================================================================
# Main Validation Flow
# ==============================================================================

main() {
    echo -e "${BLUE}=== Trigger.dev Environment Validation ===${NC}"
    echo "Environment: $ENVIRONMENT"
    echo "Project: $PROJECT_ROOT"
    echo ""

    # Run all validations
    validate_environment_argument || return $?
    validate_directory_structure || return $?
    validate_compose_syntax || return $?
    validate_required_secrets || true
    validate_env_file || true
    validate_resource_limits || true
    validate_replicas || true
    validate_health_checks || true
    validate_network_config || true
    validate_socket_proxy || true
    validate_environment_specific_settings || true
    validate_security_settings || true
    validate_volume_configuration || true
    run_docker_compose_validation || return $?

    # Summary
    echo ""
    echo -e "${BLUE}=== Validation Summary ===${NC}"

    if [ $CRITICAL_ERRORS -eq 0 ]; then
        echo -e "${GREEN}Critical errors: 0${NC}"
    else
        echo -e "${RED}Critical errors: $CRITICAL_ERRORS${NC}"
    fi

    echo "Warnings: $WARNINGS"

    if [ $CRITICAL_ERRORS -gt 0 ]; then
        echo -e "${RED}Validation FAILED${NC}"
        return 2
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Validation PASSED with warnings${NC}"
        return 1
    else
        echo -e "${GREEN}Validation PASSED${NC}"
        return 0
    fi
}

main "$@"
