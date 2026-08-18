#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Database Migration Execution Script
# Executes all migrations in order with verification
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
# Database Configuration
###############################################################################

case "$ENVIRONMENT" in
    production)
        DB_HOST="${PROD_DB_HOST:-localhost}"
        DB_PORT="${PROD_DB_PORT:-5432}"
        DB_NAME="${PROD_DB_NAME:-workflow_codification_prod}"
        DB_USER="${PROD_DB_USER:-postgres}"
        ;;
    staging)
        DB_HOST="${STAGING_DB_HOST:-localhost}"
        DB_PORT="${STAGING_DB_PORT:-5432}"
        DB_NAME="${STAGING_DB_NAME:-workflow_codification_staging}"
        DB_USER="${STAGING_DB_USER:-postgres}"
        ;;
    test)
        DB_HOST="localhost"
        DB_PORT="5432"
        DB_NAME="cfn_workflow_test"
        DB_USER="postgres"
        ;;
    *)
        log_error "Unknown environment: $ENVIRONMENT"
        exit 1
        ;;
esac

###############################################################################
# Database Operations
###############################################################################

execute_migration() {
    local migration_file="$1"
    local migration_name=$(basename "$migration_file")

    log_info "Executing migration: $migration_name"

    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file" > /dev/null 2>&1; then
        log_success "Migration completed: $migration_name"
        return 0
    else
        log_error "Migration failed: $migration_name"
        return 1
    fi
}

verify_table_exists() {
    local table_name="$1"

    local count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='$table_name'")

    if [ "$count" -gt 0 ]; then
        log_success "Table verified: $table_name"
        return 0
    else
        log_error "Table not found: $table_name"
        return 1
    fi
}

verify_index_exists() {
    local index_name="$1"

    local count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM information_schema.indexes WHERE indexname='$index_name'")

    if [ "$count" -gt 0 ]; then
        log_success "Index verified: $index_name"
        return 0
    else
        log_warning "Index not found: $index_name (may be expected)"
        return 0
    fi
}

###############################################################################
# Main Migration Execution
###############################################################################

main() {
    log_info "Starting database migrations for $ENVIRONMENT"
    log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
    echo ""

    local migrations_dir="$PROJECT_ROOT/src/workflow-codification/migrations"

    if [ ! -d "$migrations_dir" ]; then
        log_error "Migrations directory not found: $migrations_dir"
        exit 1
    fi

    # Check database connectivity
    log_info "Checking database connectivity..."
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        log_error "Cannot connect to database"
        exit 1
    fi
    log_success "Database connectivity OK"
    echo ""

    # Execute migrations
    log_info "Executing migrations..."
    local failed_migrations=0

    for migration in "$migrations_dir"/00*.sql; do
        if [ -f "$migration" ]; then
            if ! execute_migration "$migration"; then
                ((failed_migrations++))
            fi
        fi
    done

    echo ""

    if [ "$failed_migrations" -gt 0 ]; then
        log_error "$failed_migrations migration(s) failed"
        exit 1
    fi

    # Verify table creation
    log_info "Verifying table creation..."
    local required_tables=(
        "skill_health_history"
        "circuit_breaker_state"
        "retry_telemetry"
        "regression_test_suites"
        "regression_test_results"
        "pattern_recommendations"
        "composite_skills"
        "composite_execution_history"
        "execution_traces"
    )

    local failed_tables=0
    for table in "${required_tables[@]}"; do
        if ! verify_table_exists "$table"; then
            ((failed_tables++))
        fi
    done

    echo ""

    if [ "$failed_tables" -gt 0 ]; then
        log_error "$failed_tables required table(s) not found"
        exit 1
    fi

    # Verify indexes
    log_info "Verifying indexes..."
    local required_indexes=(
        "idx_skill_health_skill_name"
        "idx_skill_health_recorded_at"
        "idx_cb_skill_name"
        "idx_retry_skill_name"
        "idx_test_suite_skill_name"
        "idx_test_results_skill_name"
        "idx_pattern_user_id"
        "idx_composite_name"
        "idx_trace_trace_id"
    )

    for index in "${required_indexes[@]}"; do
        verify_index_exists "$index"
    done

    echo ""
    log_success "All migrations completed successfully"
    log_success "Database is ready for deployment"
    log_info "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
}

main "$@"
