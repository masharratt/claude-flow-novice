#!/usr/bin/env bash

##############################################################################
# ACE System: Database Migration Runner
# Applies schema migrations to SQLite database
#
# Usage:
#   ./run-migration.sh [OPTIONS]
#
# Options:
#   --db-path           Path to SQLite database (default: .artifacts/database/swarm-memory.db)
#   --migration         Specific migration file to run (default: all pending)
#   --dry-run           Show SQL without executing
#   --rollback          Rollback last migration (requires version tracking)
#   --force             Force migration even if already applied
##############################################################################

set -euo pipefail

# Default values
DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
MIGRATION=""
DRY_RUN=false
ROLLBACK=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --db-path)
      DB_PATH="$2"
      shift 2
      ;;
    --migration)
      MIGRATION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --rollback)
      ROLLBACK=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--db-path PATH] [--migration FILE] [--dry-run] [--rollback] [--force]"
      exit 1
      ;;
  esac
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if database exists
if [[ ! -f "$DB_PATH" ]]; then
  log_warning "Database does not exist: $DB_PATH"
  log_info "Creating new database..."
  mkdir -p "$(dirname "$DB_PATH")"
  touch "$DB_PATH"
fi

# Check if sqlite3 is available
if ! command -v sqlite3 &> /dev/null; then
  log_error "sqlite3 command not found. Please install SQLite."
  exit 1
fi

# Get current schema version
get_current_version() {
  sqlite3 "$DB_PATH" "SELECT COALESCE(MAX(version), 0) FROM schema_version;" 2>/dev/null || echo "0"
}

# Check if table exists
table_exists() {
  local table_name="$1"
  sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table_name';" 2>/dev/null || echo "0"
}

# Apply migration
apply_migration() {
  local migration_file="$1"
  local migration_name=$(basename "$migration_file" .sql)

  log_info "Applying migration: $migration_name"

  if [[ "$DRY_RUN" == true ]]; then
    log_info "DRY RUN - Would execute:"
    cat "$migration_file"
    return 0
  fi

  # Execute migration in transaction
  if sqlite3 "$DB_PATH" < "$migration_file" 2>&1; then
    log_success "Migration applied: $migration_name"
    return 0
  else
    log_error "Failed to apply migration: $migration_name"
    return 1
  fi
}

# Main migration logic
main() {
  log_info "=== ACE System Database Migration ==="
  log_info "Database: $DB_PATH"

  # Check if schema_version table exists
  if [[ $(table_exists "schema_version") -eq 0 ]]; then
    log_warning "schema_version table does not exist. Creating..."
  fi

  # Get current version
  CURRENT_VERSION=$(get_current_version)
  log_info "Current schema version: $CURRENT_VERSION"

  # Handle rollback
  if [[ "$ROLLBACK" == true ]]; then
    log_error "Rollback not implemented yet. Manual rollback required."
    log_info "To rollback manually:"
    log_info "  1. Backup database: cp $DB_PATH ${DB_PATH}.backup"
    log_info "  2. Drop tables: sqlite3 $DB_PATH 'DROP TABLE context_reflections;'"
    log_info "  3. Re-run migration: $0"
    exit 1
  fi

  # Determine migrations to run
  if [[ -n "$MIGRATION" ]]; then
    # Run specific migration
    MIGRATION_FILE="$MIGRATION_DIR/$MIGRATION"
    if [[ ! -f "$MIGRATION_FILE" ]]; then
      log_error "Migration file not found: $MIGRATION_FILE"
      exit 1
    fi

    apply_migration "$MIGRATION_FILE" || exit 1
  else
    # Run all pending migrations
    log_info "Looking for migrations in: $MIGRATION_DIR"

    MIGRATION_COUNT=0
    for migration_file in "$MIGRATION_DIR"/*.sql; do
      if [[ -f "$migration_file" ]]; then
        # Extract version number from filename (e.g., 001-create-context-reflections.sql -> 1)
        VERSION=$(basename "$migration_file" | grep -oP '^\d+' || echo "0")

        if [[ "$FORCE" == true ]] || [[ "$VERSION" -gt "$CURRENT_VERSION" ]]; then
          apply_migration "$migration_file" || exit 1
          ((MIGRATION_COUNT++))
        else
          log_info "Skipping already applied migration: $(basename "$migration_file")"
        fi
      fi
    done

    if [[ $MIGRATION_COUNT -eq 0 ]]; then
      log_success "Database is up to date. No migrations applied."
    else
      log_success "Applied $MIGRATION_COUNT migration(s)."
    fi
  fi

  # Verify migration
  log_info "=== Migration Verification ==="

  # Check if context_reflections table exists
  if [[ $(table_exists "context_reflections") -eq 1 ]]; then
    log_success "✓ context_reflections table exists"

    # Get row count
    ROW_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM context_reflections;" 2>/dev/null || echo "0")
    log_info "  Rows: $ROW_COUNT"

    # Check indexes
    INDEX_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='context_reflections';" 2>/dev/null || echo "0")
    log_success "✓ $INDEX_COUNT indexes created"
  else
    log_error "✗ context_reflections table not found"
  fi

  # Check if ace_telemetry table exists
  if [[ $(table_exists "ace_telemetry") -eq 1 ]]; then
    log_success "✓ ace_telemetry table exists"
  else
    log_warning "✗ ace_telemetry table not found"
  fi

  # Check views
  VIEW_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='view';" 2>/dev/null || echo "0")
  log_success "✓ $VIEW_COUNT views created"

  # Final version check
  FINAL_VERSION=$(get_current_version)
  log_info "Final schema version: $FINAL_VERSION"

  log_success "=== Migration Complete ==="
}

# Run main function
main
