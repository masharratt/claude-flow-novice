#!/usr/bin/env bash
# Artifact Registry TTL-based Cleanup Script
# Version: 1.0.0
# Purpose: Automatically archive/delete expired artifacts based on retention policy
#
# Usage:
#   ./artifact-cleanup.sh [OPTIONS]
#
# Options:
#   --dry-run           Show what would be cleaned up without making changes
#   --policy <policy>   Only clean specific retention policy (ephemeral, standard, custom)
#   --archive-days <N>  Days before archived artifacts are deleted (default: 90)
#   --db-path <path>    Path to SQLite database (default: ./artifacts/database/registry.db)
#   --log-file <path>   Path to log file (default: ./artifacts/logs/cleanup.log)
#   --verbose           Enable verbose logging
#   --help              Show this help message
#
# Exit Codes:
#   0 - Success
#   1 - General error
#   2 - Database error
#   3 - Validation error

set -euo pipefail

# ============================================================================
# Configuration and Defaults
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default configuration
DRY_RUN=false
POLICY_FILTER=""
ARCHIVE_DAYS=90
DB_PATH="${PROJECT_ROOT}/artifacts/database/registry.db"
LOG_FILE="${PROJECT_ROOT}/artifacts/logs/cleanup.log"
VERBOSE=false

# Counters
ARTIFACTS_ARCHIVED=0
ARTIFACTS_DELETED=0
ERRORS=0

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"

    echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
}

log_warn() {
    log "WARN" "$@"
}

log_error() {
    log "ERROR" "$@"
    ((ERRORS++)) || true
}

log_debug() {
    if [[ "$VERBOSE" == "true" ]]; then
        log "DEBUG" "$@"
    fi
}

# ============================================================================
# Utility Functions
# ============================================================================

show_help() {
    grep '^#' "$0" | grep -v '#!/usr/bin/env' | sed 's/^# //; s/^#//'
    exit 0
}

ensure_directory() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        log_debug "Created directory: $dir"
    fi
}

validate_database() {
    if [[ ! -f "$DB_PATH" ]]; then
        log_error "Database not found: $DB_PATH"
        exit 2
    fi

    # Test database connectivity
    if ! sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM artifacts;" &>/dev/null; then
        log_error "Failed to query database or artifacts table does not exist"
        exit 2
    fi

    log_debug "Database validated: $DB_PATH"
}

# ============================================================================
# Cleanup Functions
# ============================================================================

find_expired_artifacts() {
    local policy_clause=""
    if [[ -n "$POLICY_FILTER" ]]; then
        policy_clause="AND retention_policy = '$POLICY_FILTER'"
    fi

    sqlite3 "$DB_PATH" <<EOF
SELECT id, name, type, storage_location, retention_policy,
       created_at, expires_at, CAST((julianday('now') - julianday(expires_at)) AS INTEGER) as days_expired
FROM artifacts
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND datetime('now') >= expires_at
  $policy_clause
ORDER BY created_at ASC;
EOF
}

archive_artifact() {
    local artifact_id="$1"
    local artifact_name="$2"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would archive: $artifact_name (ID: $artifact_id)"
        ((ARTIFACTS_ARCHIVED++)) || true
        return 0
    fi

    local result
    result=$(sqlite3 "$DB_PATH" <<EOF
UPDATE artifacts
SET status = 'archived',
    archived_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = '$artifact_id';
SELECT changes();
EOF
)

    if [[ "$result" == "1" ]]; then
        log_info "Archived: $artifact_name (ID: $artifact_id)"
        ((ARTIFACTS_ARCHIVED++)) || true
        return 0
    else
        log_error "Failed to archive: $artifact_name (ID: $artifact_id)"
        return 1
    fi
}

find_archived_for_deletion() {
    local policy_clause=""
    if [[ -n "$POLICY_FILTER" ]]; then
        policy_clause="AND retention_policy = '$POLICY_FILTER'"
    fi

    sqlite3 "$DB_PATH" <<EOF
SELECT id, name, type, storage_location, retention_policy,
       archived_at, CAST((julianday('now') - julianday(archived_at)) AS INTEGER) as days_archived
FROM artifacts
WHERE status = 'archived'
  AND archived_at IS NOT NULL
  AND datetime('now') >= datetime(archived_at, '+$ARCHIVE_DAYS days')
  $policy_clause
ORDER BY archived_at ASC;
EOF
}

delete_artifact() {
    local artifact_id="$1"
    local artifact_name="$2"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would delete: $artifact_name (ID: $artifact_id)"
        ((ARTIFACTS_DELETED++)) || true
        return 0
    fi

    local result
    result=$(sqlite3 "$DB_PATH" <<EOF
UPDATE artifacts
SET status = 'deleted',
    deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = '$artifact_id';
SELECT changes();
EOF
)

    if [[ "$result" == "1" ]]; then
        log_info "Deleted: $artifact_name (ID: $artifact_id)"
        ((ARTIFACTS_DELETED++)) || true
        return 0
    else
        log_error "Failed to delete: $artifact_name (ID: $artifact_id)"
        return 1
    fi
}

# ============================================================================
# Main Cleanup Logic
# ============================================================================

cleanup_expired_artifacts() {
    log_info "=== Starting Artifact Cleanup ==="
    log_info "Configuration:"
    log_info "  - Database: $DB_PATH"
    log_info "  - Dry Run: $DRY_RUN"
    log_info "  - Policy Filter: ${POLICY_FILTER:-all}"
    log_info "  - Archive Days: $ARCHIVE_DAYS"

    # Step 1: Archive expired active artifacts
    log_info "--- Step 1: Finding expired active artifacts ---"
    local expired_artifacts
    expired_artifacts=$(find_expired_artifacts)

    if [[ -z "$expired_artifacts" ]]; then
        log_info "No expired artifacts found for archival"
    else
        local count
        count=$(echo "$expired_artifacts" | wc -l)
        log_info "Found $count expired artifact(s) to archive"

        while IFS='|' read -r id name type storage policy created expires days_expired; do
            log_debug "Processing: $name (Type: $type, Policy: $policy, Expired: ${days_expired}d ago)"
            archive_artifact "$id" "$name" || true
        done <<< "$expired_artifacts"
    fi

    # Step 2: Delete old archived artifacts
    log_info "--- Step 2: Finding old archived artifacts ---"
    local archived_artifacts
    archived_artifacts=$(find_archived_for_deletion)

    if [[ -z "$archived_artifacts" ]]; then
        log_info "No archived artifacts ready for deletion"
    else
        local count
        count=$(echo "$archived_artifacts" | wc -l)
        log_info "Found $count archived artifact(s) ready for deletion"

        while IFS='|' read -r id name type storage policy archived days_archived; do
            log_debug "Processing: $name (Type: $type, Policy: $policy, Archived: ${days_archived}d ago)"
            delete_artifact "$id" "$name" || true
        done <<< "$archived_artifacts"
    fi

    # Summary
    log_info "=== Cleanup Summary ==="
    log_info "  - Artifacts Archived: $ARTIFACTS_ARCHIVED"
    log_info "  - Artifacts Deleted: $ARTIFACTS_DELETED"
    log_info "  - Errors: $ERRORS"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "  - Mode: DRY RUN (no changes made)"
    fi

    if [[ $ERRORS -gt 0 ]]; then
        exit 1
    fi
}

get_cleanup_statistics() {
    log_info "=== Artifact Registry Statistics ==="

    local stats
    stats=$(sqlite3 -header -column "$DB_PATH" <<EOF
SELECT
    retention_policy,
    COUNT(*) as total,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
    SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deleted,
    SUM(CASE WHEN cleanup_eligible = 1 THEN 1 ELSE 0 END) as cleanup_eligible,
    ROUND(COALESCE(SUM(size_bytes), 0) / 1024.0 / 1024.0, 2) as size_mb
FROM artifacts
GROUP BY retention_policy
ORDER BY retention_policy;
EOF
)

    echo "$stats" | tee -a "$LOG_FILE"
}

# ============================================================================
# Argument Parsing
# ============================================================================

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --policy)
                POLICY_FILTER="$2"
                shift 2
                ;;
            --archive-days)
                ARCHIVE_DAYS="$2"
                shift 2
                ;;
            --db-path)
                DB_PATH="$2"
                shift 2
                ;;
            --log-file)
                LOG_FILE="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                show_help
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 3
                ;;
        esac
    done

    # Validate policy filter if provided
    if [[ -n "$POLICY_FILTER" ]]; then
        case "$POLICY_FILTER" in
            ephemeral|standard|permanent|custom)
                ;;
            *)
                log_error "Invalid retention policy: $POLICY_FILTER"
                log_error "Valid values: ephemeral, standard, permanent, custom"
                exit 3
                ;;
        esac
    fi

    # Validate archive days
    if ! [[ "$ARCHIVE_DAYS" =~ ^[0-9]+$ ]] || [[ "$ARCHIVE_DAYS" -lt 0 ]]; then
        log_error "Invalid archive days: $ARCHIVE_DAYS (must be non-negative integer)"
        exit 3
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    parse_arguments "$@"

    # Ensure log directory exists
    ensure_directory "$(dirname "$LOG_FILE")"

    log_info "Artifact Cleanup Script - Version 1.0.0"
    log_info "Starting at $(date '+%Y-%m-%d %H:%M:%S')"

    # Validate database
    validate_database

    # Show statistics before cleanup
    get_cleanup_statistics

    # Perform cleanup
    cleanup_expired_artifacts

    # Show statistics after cleanup
    get_cleanup_statistics

    log_info "Cleanup completed at $(date '+%Y-%m-%d %H:%M:%S')"
    exit 0
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
