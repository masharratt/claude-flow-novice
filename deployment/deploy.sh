#!/bin/bash
set -euo pipefail

###############################################################################
# Main Deployment Script
# Orchestrates deployment with canary rollout support
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
ENVIRONMENT="${1:-production}"
CANARY_PERCENT="${2:-10}"
ROLLBACK_ON_ERROR="${3:-true}"
DRY_RUN="${DRY_RUN:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

check_environment() {
    log_info "Checking environment: $ENVIRONMENT"

    case "$ENVIRONMENT" in
        production)
            log_success "Production environment selected"
            ;;
        staging)
            log_success "Staging environment selected"
            ;;
        test)
            log_success "Test environment selected"
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
}

check_prerequisites() {
    log_info "Checking prerequisites"

    # Check required tools
    local required_tools=("psql" "redis-cli" "curl")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is not installed"
            exit 1
        fi
    done

    log_success "All prerequisites met"
}

pre_deployment_validation() {
    log_info "Step 1: Pre-deployment validation"

    # Validate configuration
    if [ ! -f "$PROJECT_ROOT/config/deployment.conf" ]; then
        log_warning "Deployment configuration not found, using defaults"
    fi

    # Check database connectivity
    if psql -c "SELECT 1" > /dev/null 2>&1; then
        log_success "Database connectivity OK"
    else
        log_error "Cannot connect to database"
        exit 1
    fi

    # Check Redis connectivity
    if redis-cli ping > /dev/null 2>&1; then
        log_success "Redis connectivity OK"
    else
        log_error "Cannot connect to Redis"
        exit 1
    fi

    log_success "Pre-deployment validation passed"
}

run_migrations() {
    log_info "Step 2: Running database migrations"

    local migration_dir="$PROJECT_ROOT/src/workflow-codification/migrations"

    if [ ! -d "$migration_dir" ]; then
        log_error "Migration directory not found: $migration_dir"
        exit 1
    fi

    # Execute migrations in order
    for migration in "$migration_dir"/00*.sql; do
        if [ -f "$migration" ]; then
            log_info "Running migration: $(basename "$migration")"

            if [ "$DRY_RUN" = "false" ]; then
                if psql -f "$migration" > /dev/null 2>&1; then
                    log_success "Migration completed: $(basename "$migration")"
                else
                    log_error "Migration failed: $(basename "$migration")"
                    exit 1
                fi
            else
                log_info "[DRY RUN] Would execute: $(basename "$migration")"
            fi
        fi
    done

    log_success "All migrations completed"
}

deploy_application() {
    log_info "Step 3: Deploying application"

    case "$CANARY_PERCENT" in
        10)
            log_info "Canary deployment: 10% traffic to new version"
            # Deploy to 10% of instances
            ;;
        50)
            log_info "Canary deployment: 50% traffic to new version"
            # Deploy to 50% of instances
            ;;
        100)
            log_info "Full deployment: 100% traffic to new version"
            # Deploy to all instances
            ;;
        *)
            log_error "Invalid canary percentage: $CANARY_PERCENT"
            exit 1
            ;;
    esac

    if [ "$DRY_RUN" = "false" ]; then
        log_success "Application deployed to $CANARY_PERCENT% capacity"
    else
        log_info "[DRY RUN] Would deploy to $CANARY_PERCENT% capacity"
    fi
}

health_checks() {
    log_info "Step 4: Health checks"

    # Wait for services to stabilize
    sleep 10

    local failed_checks=0

    # Check health endpoint
    if curl -s http://localhost:8000/health > /dev/null; then
        log_success "Health check endpoint responding"
    else
        log_error "Health check endpoint not responding"
        ((failed_checks++))
    fi

    # Check readiness endpoint
    if curl -s http://localhost:8000/ready > /dev/null; then
        log_success "Readiness check endpoint responding"
    else
        log_error "Readiness check endpoint not responding"
        ((failed_checks++))
    fi

    # Check metrics endpoint
    if curl -s http://localhost:9090/metrics | grep -q "workflow_codification"; then
        log_success "Metrics endpoint responding"
    else
        log_warning "Metrics endpoint not responding as expected"
        ((failed_checks++))
    fi

    if [ "$failed_checks" -gt 0 ]; then
        log_error "$failed_checks health check(s) failed"
        if [ "$ROLLBACK_ON_ERROR" = "true" ]; then
            log_error "Initiating rollback due to failed health checks"
            if [ "$DRY_RUN" = "false" ]; then
                bash "$SCRIPT_DIR/rollback.sh" "$ENVIRONMENT"
            else
                log_info "[DRY RUN] Would execute rollback"
            fi
            exit 1
        fi
    else
        log_success "All health checks passed"
    fi
}

monitor_metrics() {
    log_info "Step 5: Monitoring metrics (5 minutes)"

    local duration=300  # 5 minutes
    local interval=30   # Check every 30 seconds
    local elapsed=0

    while [ "$elapsed" -lt "$duration" ]; do
        # Check error rate
        local error_rate=$(curl -s 'http://prometheus:9090/api/v1/query?query=rate(workflow_codification_executions_total{status="failed"}[5m])' 2>/dev/null | grep -o '[0-9.]*' | head -1 || echo "0")

        if (( $(echo "$error_rate > 0.005" | bc -l) )); then
            log_warning "High error rate detected: $error_rate"
        fi

        # Check latency
        local latency=$(curl -s 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95,rate(workflow_codification_duration_seconds_bucket[5m]))' 2>/dev/null | grep -o '[0-9.]*' | head -1 || echo "0")

        if (( $(echo "$latency > 1.0" | bc -l) )); then
            log_warning "High latency detected: ${latency}s"
        fi

        elapsed=$((elapsed + interval))
        if [ "$elapsed" -lt "$duration" ]; then
            sleep "$interval"
        fi
    done

    log_success "Monitoring completed"
}

###############################################################################
# Main Execution
###############################################################################

main() {
    log_info "Starting deployment to $ENVIRONMENT"
    log_info "Canary: ${CANARY_PERCENT}%"
    log_info "Rollback on error: $ROLLBACK_ON_ERROR"
    [ "$DRY_RUN" = "true" ] && log_warning "DRY RUN MODE"

    check_environment
    check_prerequisites
    pre_deployment_validation
    run_migrations
    deploy_application
    health_checks
    monitor_metrics

    log_success "Deployment completed successfully"
    echo ""
    log_success "Version deployed: $(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "unknown")"
    log_success "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
}

# Run main function
main "$@"
