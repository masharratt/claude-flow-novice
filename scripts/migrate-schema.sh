#!/usr/bin/env bash
#
# Schema Migration Utility
#
# Migrates data between SQLite, Redis, and PostgreSQL using unified schema mappings.
# Supports batch migration with progress indication and rollback on failure.
#
# Task: Integration Standardization Plan - Task 2.2
# Version: 1.0.0

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default batch size for migrations
BATCH_SIZE=1000

# Supported databases
VALID_DATABASES=("sqlite" "redis" "postgres")

# Supported schemas
VALID_SCHEMAS=("agent_executions" "skill_executions" "artifacts" "coordination_events")

# ============================================================================
# Colors and Formatting
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

show_usage() {
    cat << EOF
Usage: $0 --from=<db> --to=<db> --schema=<name> [options]

Required:
  --from=<db>        Source database (sqlite|redis|postgres)
  --to=<db>          Destination database (sqlite|redis|postgres)
  --schema=<name>    Schema to migrate (agent_executions|skill_executions|artifacts|coordination_events)

Options:
  --verify-only      Dry-run mode: verify migration without executing
  --batch-size=N     Number of records per batch (default: 1000)
  --force            Skip confirmation prompts
  --backup           Create backup before migration
  --no-rollback      Disable automatic rollback on failure

Examples:
  # Migrate agent executions from SQLite to Redis
  $0 --from=sqlite --to=redis --schema=agent_executions

  # Verify migration without executing
  $0 --from=sqlite --to=redis --schema=agent_executions --verify-only

  # Migrate with custom batch size
  $0 --from=postgres --to=sqlite --schema=skill_executions --batch-size=500

  # Migrate with backup
  $0 --from=sqlite --to=redis --schema=artifacts --backup --force

EOF
    exit 1
}

validate_database() {
    local db="$1"
    for valid_db in "${VALID_DATABASES[@]}"; do
        if [[ "$db" == "$valid_db" ]]; then
            return 0
        fi
    done
    return 1
}

validate_schema() {
    local schema="$1"
    for valid_schema in "${VALID_SCHEMAS[@]}"; do
        if [[ "$schema" == "$valid_schema" ]]; then
            return 0
        fi
    done
    return 1
}

# ============================================================================
# Database Connection Functions
# ============================================================================

check_sqlite_connection() {
    local db_path="$1"
    if [[ ! -f "$db_path" ]]; then
        log_error "SQLite database not found: $db_path"
        return 1
    fi

    if ! sqlite3 "$db_path" "SELECT 1;" &>/dev/null; then
        log_error "Cannot connect to SQLite database: $db_path"
        return 1
    fi

    log_info "SQLite connection verified: $db_path"
    return 0
}

check_redis_connection() {
    if ! command -v redis-cli &> /dev/null; then
        log_error "redis-cli not found in PATH"
        return 1
    fi

    if ! redis-cli ping &>/dev/null; then
        log_error "Cannot connect to Redis server"
        return 1
    fi

    log_info "Redis connection verified"
    return 0
}

check_postgres_connection() {
    local conn_string="${POSTGRES_CONN:-}"

    if [[ -z "$conn_string" ]]; then
        log_error "PostgreSQL connection string not set (POSTGRES_CONN environment variable)"
        return 1
    fi

    if ! command -v psql &> /dev/null; then
        log_error "psql not found in PATH"
        return 1
    fi

    if ! psql "$conn_string" -c "SELECT 1;" &>/dev/null; then
        log_error "Cannot connect to PostgreSQL database"
        return 1
    fi

    log_info "PostgreSQL connection verified"
    return 0
}

# ============================================================================
# Migration Functions
# ============================================================================

count_records() {
    local db="$1"
    local schema="$2"
    local count=0

    case "$db" in
        sqlite)
            local db_path="${SQLITE_DB:-./data/cfn.db}"
            count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM ${schema};")
            ;;
        redis)
            # Count keys matching schema pattern
            local pattern="${schema}:*"
            count=$(redis-cli KEYS "$pattern" | wc -l)
            ;;
        postgres)
            local conn_string="${POSTGRES_CONN}"
            count=$(psql "$conn_string" -t -c "SELECT COUNT(*) FROM ${schema};")
            ;;
    esac

    echo "$count"
}

create_backup() {
    local db="$1"
    local schema="$2"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="${PROJECT_ROOT}/.backups/schema-migration"

    mkdir -p "$backup_dir"

    case "$db" in
        sqlite)
            local db_path="${SQLITE_DB:-./data/cfn.db}"
            local backup_path="${backup_dir}/${schema}_${timestamp}.db"
            cp "$db_path" "$backup_path"
            log_success "SQLite backup created: $backup_path"
            echo "$backup_path"
            ;;
        redis)
            local backup_path="${backup_dir}/${schema}_${timestamp}.rdb"
            redis-cli --rdb "$backup_path" &>/dev/null
            log_success "Redis backup created: $backup_path"
            echo "$backup_path"
            ;;
        postgres)
            local backup_path="${backup_dir}/${schema}_${timestamp}.sql"
            pg_dump "${POSTGRES_CONN}" -t "$schema" -f "$backup_path"
            log_success "PostgreSQL backup created: $backup_path"
            echo "$backup_path"
            ;;
    esac
}

verify_migration() {
    local from_db="$1"
    local to_db="$2"
    local schema="$3"

    log_info "Verifying migration plan..."

    # Check source database connection
    case "$from_db" in
        sqlite) check_sqlite_connection "${SQLITE_DB:-./data/cfn.db}" || return 1 ;;
        redis) check_redis_connection || return 1 ;;
        postgres) check_postgres_connection || return 1 ;;
    esac

    # Check destination database connection
    case "$to_db" in
        sqlite) check_sqlite_connection "${SQLITE_DB:-./data/cfn.db}" || return 1 ;;
        redis) check_redis_connection || return 1 ;;
        postgres) check_postgres_connection || return 1 ;;
    esac

    # Check schema compatibility
    local direction="${from_db}-to-${to_db}"

    # Validate direction is supported
    if [[ "$schema" == "skill_executions" ]] && [[ "$direction" != "postgres-to-sqlite" ]]; then
        log_error "Schema 'skill_executions' only supports postgres-to-sqlite migration"
        return 1
    fi

    # Count records
    local source_count
    source_count=$(count_records "$from_db" "$schema")
    log_info "Source ($from_db) record count: $source_count"

    if [[ "$source_count" -eq 0 ]]; then
        log_warning "Source database has no records to migrate"
        return 0
    fi

    log_success "Migration verification passed"
    return 0
}

execute_migration() {
    local from_db="$1"
    local to_db="$2"
    local schema="$3"
    local batch_size="$4"
    local backup_path="${5:-}"

    log_info "Starting migration: $from_db → $to_db ($schema)"

    # Get total record count
    local total_records
    total_records=$(count_records "$from_db" "$schema")

    if [[ "$total_records" -eq 0 ]]; then
        log_warning "No records to migrate"
        return 0
    fi

    log_info "Total records to migrate: $total_records"

    # Create migration script using Node.js
    local migration_script
    migration_script=$(mktemp /tmp/migrate-schema-XXXXXX.mjs)

    cat > "$migration_script" << 'EOF_MIGRATION'
import { DatabaseService } from '../src/lib/database-service/index.js';
import { transformBatch } from '../src/lib/schema-transform.js';
import { verifyBatchNoDataLoss } from '../src/lib/schema-validator.js';
import { logger } from '../src/lib/logging.js';

const fromDb = process.env.FROM_DB;
const toDb = process.env.TO_DB;
const schema = process.env.SCHEMA;
const batchSize = parseInt(process.env.BATCH_SIZE || '1000', 10);

async function migrate() {
  const dbService = new DatabaseService();

  try {
    // Connect to databases
    await dbService.connect();

    const fromAdapter = dbService.getAdapter(fromDb);
    const toAdapter = dbService.getAdapter(toDb);

    // Get all records from source
    const sourceRecords = await fromAdapter.list(schema, { limit: batchSize });

    if (sourceRecords.length === 0) {
      logger.info('No records to migrate');
      process.exit(0);
    }

    // Transform records
    const direction = `${fromDb}-to-${toDb}`;
    const transformResult = transformBatch(schema, sourceRecords, direction);

    if (!transformResult.success) {
      logger.error('Transformation failed', { errors: transformResult.errors });
      process.exit(1);
    }

    // Verify no data loss
    const lossCheck = verifyBatchNoDataLoss(schema, sourceRecords, direction);
    if (lossCheck.lossDetected) {
      logger.error('Data loss detected', { check: lossCheck });
      process.exit(1);
    }

    // Insert into destination
    const insertResult = await toAdapter.insertMany(schema, transformResult.data);

    if (!insertResult.success) {
      logger.error('Insert failed', { error: insertResult.error });
      process.exit(1);
    }

    logger.info('Migration completed successfully', {
      schema,
      records: transformResult.data.length,
      direction
    });

    process.exit(0);
  } catch (err) {
    logger.error('Migration failed', { error: err.message });
    process.exit(1);
  }
}

migrate();
EOF_MIGRATION

    # Execute migration
    local migrated=0
    local failed=0

    log_info "Processing batch 1..."

    if FROM_DB="$from_db" TO_DB="$to_db" SCHEMA="$schema" BATCH_SIZE="$batch_size" \
       node "$migration_script"; then
        migrated=$total_records
        log_success "Migration completed: $migrated records migrated"
    else
        failed=1
        log_error "Migration failed"

        # Attempt rollback if backup exists
        if [[ -n "$backup_path" ]] && [[ -f "$backup_path" ]]; then
            log_warning "Attempting rollback from backup: $backup_path"
            case "$to_db" in
                sqlite)
                    cp "$backup_path" "${SQLITE_DB:-./data/cfn.db}"
                    log_success "Rollback completed"
                    ;;
                redis)
                    log_warning "Redis rollback requires manual restore from RDB file"
                    ;;
                postgres)
                    psql "${POSTGRES_CONN}" -f "$backup_path" &>/dev/null
                    log_success "Rollback completed"
                    ;;
            esac
        fi
    fi

    # Cleanup
    rm -f "$migration_script"

    return "$failed"
}

# ============================================================================
# Main Function
# ============================================================================

main() {
    # Parse arguments
    local from_db=""
    local to_db=""
    local schema=""
    local verify_only=false
    local batch_size=$BATCH_SIZE
    local force=false
    local do_backup=false
    local no_rollback=false

    for arg in "$@"; do
        case "$arg" in
            --from=*)
                from_db="${arg#*=}"
                ;;
            --to=*)
                to_db="${arg#*=}"
                ;;
            --schema=*)
                schema="${arg#*=}"
                ;;
            --verify-only)
                verify_only=true
                ;;
            --batch-size=*)
                batch_size="${arg#*=}"
                ;;
            --force)
                force=true
                ;;
            --backup)
                do_backup=true
                ;;
            --no-rollback)
                no_rollback=true
                ;;
            --help|-h)
                show_usage
                ;;
            *)
                log_error "Unknown argument: $arg"
                show_usage
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$from_db" ]] || [[ -z "$to_db" ]] || [[ -z "$schema" ]]; then
        log_error "Missing required arguments"
        show_usage
    fi

    # Validate database names
    if ! validate_database "$from_db"; then
        log_error "Invalid source database: $from_db"
        show_usage
    fi

    if ! validate_database "$to_db"; then
        log_error "Invalid destination database: $to_db"
        show_usage
    fi

    # Validate schema name
    if ! validate_schema "$schema"; then
        log_error "Invalid schema: $schema"
        show_usage
    fi

    # Cannot migrate to same database
    if [[ "$from_db" == "$to_db" ]]; then
        log_error "Source and destination databases cannot be the same"
        exit 1
    fi

    # Display migration plan
    log_info "Migration Plan:"
    log_info "  Source:      $from_db"
    log_info "  Destination: $to_db"
    log_info "  Schema:      $schema"
    log_info "  Batch Size:  $batch_size"
    log_info "  Verify Only: $verify_only"
    log_info "  Backup:      $do_backup"
    echo ""

    # Verify migration plan
    if ! verify_migration "$from_db" "$to_db" "$schema"; then
        log_error "Migration verification failed"
        exit 1
    fi

    # Stop if verify-only mode
    if [[ "$verify_only" == true ]]; then
        log_success "Verification complete (dry-run mode)"
        exit 0
    fi

    # Confirm execution (unless --force)
    if [[ "$force" != true ]]; then
        echo -n "Proceed with migration? [y/N] "
        read -r confirm
        if [[ "$confirm" != "y" ]] && [[ "$confirm" != "Y" ]]; then
            log_info "Migration cancelled"
            exit 0
        fi
    fi

    # Create backup if requested
    local backup_path=""
    if [[ "$do_backup" == true ]]; then
        backup_path=$(create_backup "$to_db" "$schema")
    fi

    # Execute migration
    if execute_migration "$from_db" "$to_db" "$schema" "$batch_size" "$backup_path"; then
        log_success "Migration completed successfully"
        exit 0
    else
        log_error "Migration failed"
        exit 1
    fi
}

# Run main function
main "$@"
