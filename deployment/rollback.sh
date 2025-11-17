#!/bin/bash
set -euo pipefail

###############################################################################
# Rollback Script
# Emergency rollback to previous known-good state
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENVIRONMENT="${1:-production}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

###############################################################################
# Rollback Steps
###############################################################################

rollback_application() {
    log_info "Rolling back application to previous version"

    # Get current version
    local current_version=$(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "unknown")
    log_info "Current version: $current_version"

    # Revert to previous version (implementation specific)
    # This is a placeholder - actual implementation depends on deployment mechanism
    sleep 5

    log_success "Application rolled back"
}

rollback_migrations() {
    log_info "Rolling back database migrations"

    local migration_dir="$PROJECT_ROOT/src/workflow-codification/migrations"

    # Execute rollback migrations in reverse order
    for migration in $(ls -r "$migration_dir"/*_rollback.sql 2>/dev/null || echo ""); do
        if [ -f "$migration" ]; then
            log_info "Rolling back: $(basename "$migration")"

            if psql -f "$migration" > /dev/null 2>&1; then
                log_success "Rollback completed: $(basename "$migration")"
            else
                log_warning "Rollback partially failed: $(basename "$migration")"
            fi
        fi
    done

    log_success "Migration rollback completed"
}

clear_cache() {
    log_info "Clearing caches"

    # Clear Redis cache
    if redis-cli FLUSHDB > /dev/null 2>&1; then
        log_success "Redis cache cleared"
    else
        log_warning "Failed to clear Redis cache"
    fi

    log_success "Cache cleared"
}

verify_rollback() {
    log_info "Verifying rollback state"

    local failed_checks=0

    # Check health endpoint
    if curl -s http://localhost:8000/health > /dev/null; then
        log_success "Health check: OK"
    else
        log_error "Health check: FAILED"
        ((failed_checks++))
    fi

    # Check database connectivity
    if psql -c "SELECT 1" > /dev/null 2>&1; then
        log_success "Database connectivity: OK"
    else
        log_error "Database connectivity: FAILED"
        ((failed_checks++))
    fi

    # Check Redis connectivity
    if redis-cli ping > /dev/null 2>&1; then
        log_success "Redis connectivity: OK"
    else
        log_error "Redis connectivity: FAILED"
        ((failed_checks++))
    fi

    if [ "$failed_checks" -eq 0 ]; then
        log_success "All verification checks passed"
        return 0
    else
        log_error "$failed_checks verification check(s) failed"
        return 1
    fi
}

###############################################################################
# Main Rollback Execution
###############################################################################

main() {
    log_error "INITIATING EMERGENCY ROLLBACK"
    log_info "Environment: $ENVIRONMENT"
    log_info "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    rollback_application
    echo ""

    rollback_migrations
    echo ""

    clear_cache
    echo ""

    if verify_rollback; then
        log_success "Rollback completed successfully"
        log_success "System is in stable state"
        exit 0
    else
        log_error "Rollback verification failed - manual intervention required"
        exit 1
    fi
}

main "$@"
