#!/bin/bash

##############################################################################
# RuVector Database Restore Script
#
# Purpose: Restore RuVector SQLite database from encrypted backup
# Features:
#   - Restore from timestamped backups
#   - Decrypt backups using encryption key
#   - Verify data integrity (checksums)
#   - Validate schema compatibility
#   - Atomic rollback on failure
#   - Dry-run mode for testing restore timeline
#   - Recovery point objectives (RPO) guidance
#
# Usage:
#   ./scripts/restore-ruvector.sh [--backup-file <path>] [--dry-run] [--force]
#
# Environment Variables:
#   RUVECTOR_DB_PATH: Path to RuVector database (default: docker/trigger-dev/data/ruvector.db)
#   BACKUP_DIR: Directory for backups (default: docker/trigger-dev/data/backups)
#   ENCRYPTION_KEY: Encryption key for backup decryption (required if encrypted)
#   COMPOSE_PROJECT_NAME: Docker project name for isolation (optional)
#
# Exit Codes:
#   0 = Success
#   1 = Backup file not found
#   2 = Restore failed
#   3 = Data integrity check failed
#   4 = Schema validation failed
#   5 = Encryption/decryption failed
##############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Configuration
RUVECTOR_DB_PATH="${RUVECTOR_DB_PATH:-${SCRIPT_DIR}/docker/trigger-dev/data/ruvector.db}"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/docker/trigger-dev/data/backups}"
DB_BACKUP="${DB_BACKUP:-${RUVECTOR_DB_PATH}.backup}"
RESTORE_LOG="${BACKUP_DIR}/restore.log"

# Flags
DRY_RUN=false
FORCE_RESTORE=false
BACKUP_FILE=""
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# Metrics
START_TIME=""
END_TIME=""
RESTORE_DURATION=0
DATA_SIZE_MB=0

# Recovery Point Objectives
RPO_HOURS=24
RTO_MINUTES=15

# Logging functions
log_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] INFO: $*" | tee -a "${RESTORE_LOG}"
}

log_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] ERROR: $*" | tee -a "${RESTORE_LOG}" >&2
}

log_success() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] SUCCESS: $*" | tee -a "${RESTORE_LOG}"
}

log_warn() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] WARN: $*" | tee -a "${RESTORE_LOG}"
}

# Ensure log directory exists
ensure_log_dir() {
    if [ ! -d "${BACKUP_DIR}" ]; then
        mkdir -p "${BACKUP_DIR}" || {
            echo "ERROR: Failed to create backup directory: ${BACKUP_DIR}" >&2
            return 1
        }
    fi
}

# Find latest backup if none specified
find_latest_backup() {
    local latest
    latest=$(find "${BACKUP_DIR}" -name "ruvector.db.backup-*" -type f 2>/dev/null | sort -V | tail -n1)

    if [ -z "${latest}" ]; then
        log_error "No backups found in ${BACKUP_DIR}"
        return 1
    fi

    echo "${latest}"
}

# Decrypt backup if encrypted
decrypt_backup() {
    local backup_file="$1"
    local temp_decrypted="${backup_file}.decrypted"

    # Check if backup is encrypted (has .enc extension)
    if [[ "${backup_file}" == *.enc ]]; then
        if [ -z "${ENCRYPTION_KEY}" ]; then
            log_error "Backup is encrypted but ENCRYPTION_KEY not provided"
            return 5
        fi

        log_info "Decrypting backup: ${backup_file}"

        # Use openssl for decryption (AES-256-CBC)
        if ! openssl enc -aes-256-cbc -d -in "${backup_file}" \
            -K "${ENCRYPTION_KEY}" -P -out "${temp_decrypted}" 2>/dev/null; then
            log_error "Failed to decrypt backup"
            return 5
        fi

        echo "${temp_decrypted}"
    else
        # Not encrypted, use as-is
        echo "${backup_file}"
    fi
}

# Verify backup file exists and is readable
verify_backup_file() {
    local backup_file="$1"

    if [ ! -f "${backup_file}" ]; then
        log_error "Backup file not found: ${backup_file}"
        return 1
    fi

    if [ ! -r "${backup_file}" ]; then
        log_error "Backup file not readable: ${backup_file}"
        return 1
    fi

    local size_bytes=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null)
    DATA_SIZE_MB=$((size_bytes / 1024 / 1024))

    log_info "Backup file verified: ${backup_file} (${DATA_SIZE_MB}MB)"
    return 0
}

# Verify checksum from metadata file
verify_checksum() {
    local backup_file="$1"
    local metadata_file="${backup_file}.metadata"

    if [ ! -f "${metadata_file}" ]; then
        log_warn "No metadata file found: ${metadata_file}"
        return 0
    fi

    log_info "Verifying checksum from metadata"

    local expected_checksum
    expected_checksum=$(grep "checksum=" "${metadata_file}" | cut -d= -f2)

    if [ -z "${expected_checksum}" ]; then
        log_warn "No checksum in metadata file"
        return 0
    fi

    local actual_checksum
    actual_checksum=$(sha256sum "${backup_file}" | awk '{print $1}')

    if [ "${actual_checksum}" != "${expected_checksum}" ]; then
        log_error "Checksum verification failed"
        log_error "Expected: ${expected_checksum}"
        log_error "Actual:   ${actual_checksum}"
        return 3
    fi

    log_success "Checksum verification passed"
    return 0
}

# Validate SQLite database integrity
validate_database() {
    local db_file="$1"

    if [ ! -f "${db_file}" ]; then
        log_error "Database file not found: ${db_file}"
        return 1
    fi

    log_info "Validating SQLite database integrity"

    # Run SQLite integrity check
    local integrity_result
    if ! integrity_result=$(sqlite3 "${db_file}" "PRAGMA integrity_check;" 2>&1); then
        log_error "Failed to run integrity check"
        return 4
    fi

    if [ "${integrity_result}" != "ok" ]; then
        log_error "Database integrity check failed: ${integrity_result}"
        return 4
    fi

    log_success "Database integrity check passed"
    return 0
}

# Validate database schema compatibility
validate_schema() {
    local db_file="$1"

    log_info "Validating database schema"

    # Check for required tables
    local required_tables=("collections" "vectors")
    for table in "${required_tables[@]}"; do
        local table_exists
        table_exists=$(sqlite3 "${db_file}" "SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'" 2>/dev/null)

        if [ -z "${table_exists}" ]; then
            log_error "Required table not found: ${table}"
            return 4
        fi
    done

    log_success "Schema validation passed"
    return 0
}

# Backup current database before restore
backup_current_db() {
    if [ ! -f "${RUVECTOR_DB_PATH}" ]; then
        log_info "No current database to backup"
        return 0
    fi

    log_info "Backing up current database for rollback"

    if [ "${DRY_RUN}" = "true" ]; then
        log_info "[DRY-RUN] Would copy ${RUVECTOR_DB_PATH} to ${DB_BACKUP}"
        return 0
    fi

    if ! cp "${RUVECTOR_DB_PATH}" "${DB_BACKUP}"; then
        log_error "Failed to backup current database"
        return 2
    fi

    log_success "Current database backed up for rollback"
    return 0
}

# Perform the restore
perform_restore() {
    local source_file="$1"
    local target_file="${RUVECTOR_DB_PATH}"

    log_info "=== Starting RuVector Restore ==="
    log_info "Source: ${source_file}"
    log_info "Target: ${target_file}"
    log_info "RPO: ${RPO_HOURS}h | RTO: ${RTO_MINUTES}min"

    if [ "${DRY_RUN}" = "true" ]; then
        log_info "[DRY-RUN] Would restore from ${source_file}"
        log_info "[DRY-RUN] Restore duration (estimated): ~${RTO_MINUTES} minutes"
        log_info "[DRY-RUN] Data size: ${DATA_SIZE_MB}MB"
        return 0
    fi

    # Ensure target directory exists
    local target_dir
    target_dir=$(dirname "${target_file}")
    if [ ! -d "${target_dir}" ]; then
        mkdir -p "${target_dir}" || {
            log_error "Failed to create target directory: ${target_dir}"
            return 2
        }
    fi

    START_TIME=$(date +%s)
    log_info "Starting restore at $(date '+%Y-%m-%d %H:%M:%S')"

    # Perform restore (atomic copy)
    if ! cp "${source_file}" "${target_file}"; then
        log_error "Failed to restore database file"
        # Rollback to previous backup
        if [ -f "${DB_BACKUP}" ]; then
            log_info "Rolling back to previous database"
            cp "${DB_BACKUP}" "${target_file}"
        fi
        return 2
    fi

    END_TIME=$(date +%s)
    RESTORE_DURATION=$((END_TIME - START_TIME))

    log_success "Database restored successfully"
    log_info "Restore duration: ${RESTORE_DURATION}s"
    return 0
}

# Verify restored database
verify_restored_db() {
    local db_file="$1"

    log_info "Verifying restored database"

    # Validate file exists
    if [ ! -f "${db_file}" ]; then
        log_error "Restored database file not found"
        return 1
    fi

    # Check file size
    local size_bytes
    size_bytes=$(stat -f%z "${db_file}" 2>/dev/null || stat -c%s "${db_file}" 2>/dev/null)
    local size_mb=$((size_bytes / 1024 / 1024))
    log_info "Restored database size: ${size_mb}MB"

    # Validate database
    if ! validate_database "${db_file}"; then
        log_error "Restored database validation failed"
        return 1
    fi

    # Validate schema
    if ! validate_schema "${db_file}"; then
        log_error "Restored database schema validation failed"
        return 1
    fi

    log_success "Restored database verification passed"
    return 0
}

# Check data availability (sample query)
check_data_availability() {
    local db_file="$1"

    log_info "Checking data availability"

    # Get collection count
    local collection_count
    collection_count=$(sqlite3 "${db_file}" "SELECT COUNT(*) FROM collections" 2>/dev/null || echo "0")
    log_info "Collections in restored database: ${collection_count}"

    # Get vector count
    local vector_count
    vector_count=$(sqlite3 "${db_file}" "SELECT COUNT(*) FROM vectors" 2>/dev/null || echo "0")
    log_info "Vectors in restored database: ${vector_count}"

    if [ "${collection_count}" -eq 0 ]; then
        log_warn "No collections found in restored database"
    fi

    log_success "Data availability check complete"
    return 0
}

# Cleanup temporary files
cleanup_temp_files() {
    if [ -f "${RUVECTOR_DB_PATH}.decrypted" ]; then
        rm -f "${RUVECTOR_DB_PATH}.decrypted"
        log_info "Cleaned up temporary decrypted file"
    fi
}

# Show usage information
show_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
    --backup-file <path>   Restore from specific backup file (default: latest)
    --dry-run              Simulate restore without making changes
    --force                Skip confirmation and restore immediately
    -h, --help             Show this help message

Environment Variables:
    RUVECTOR_DB_PATH       Database path (default: docker/trigger-dev/data/ruvector.db)
    BACKUP_DIR             Backup directory (default: docker/trigger-dev/data/backups)
    ENCRYPTION_KEY         Encryption key for encrypted backups
    COMPOSE_PROJECT_NAME   Project isolation (optional)
    DEBUG                  Enable debug logging

Recovery Point Objectives (RPO/RTO):
    RPO (Recovery Point Objective): ${RPO_HOURS} hours
    - Maximum acceptable data loss
    - Daily backups recommended

    RTO (Recovery Time Objective): ~${RTO_MINUTES} minutes
    - Maximum acceptable downtime
    - Restore timing depends on database size

Data Availability:
    - Restore process: ~${RTO_MINUTES} minutes for typical deployments
    - Verification: ~2-3 minutes
    - Total downtime: ~${RTO_MINUTES}-20 minutes
    - Data is immediately available after restore completion

Examples:
    # Restore from latest backup
    ./scripts/restore-ruvector.sh

    # Dry-run to verify restore would work
    ./scripts/restore-ruvector.sh --dry-run

    # Restore from specific backup
    ./scripts/restore-ruvector.sh --backup-file /path/to/backup.db

    # Force restore without confirmation
    ./scripts/restore-ruvector.sh --force

    # Restore encrypted backup
    ENCRYPTION_KEY=your-key ./scripts/restore-ruvector.sh --backup-file backup.db.enc
EOF
}

# Confirm restore with user
confirm_restore() {
    if [ "${FORCE_RESTORE}" = "true" ]; then
        return 0
    fi

    echo ""
    echo "WARNING: This will restore the database from backup"
    echo "Current database will be backed up before restore"
    echo ""
    read -p "Continue with restore? (yes/no): " confirm

    if [ "${confirm}" != "yes" ]; then
        log_info "Restore cancelled by user"
        return 1
    fi

    return 0
}

# Parse arguments
parse_arguments() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --backup-file)
                BACKUP_FILE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE_RESTORE=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    ensure_log_dir

    log_info "=== RuVector Database Restore Process Started ==="
    log_info "Database path: ${RUVECTOR_DB_PATH}"
    log_info "Backup directory: ${BACKUP_DIR}"

    # Find backup file
    if [ -z "${BACKUP_FILE}" ]; then
        if ! BACKUP_FILE=$(find_latest_backup); then
            return 1
        fi
    fi

    log_info "Using backup: ${BACKUP_FILE}"

    # Verify backup file
    if ! verify_backup_file "${BACKUP_FILE}"; then
        return 1
    fi

    # Decrypt if necessary
    local source_file
    if ! source_file=$(decrypt_backup "${BACKUP_FILE}"); then
        return 5
    fi

    # Verify checksum
    if ! verify_checksum "${BACKUP_FILE}"; then
        return 3
    fi

    # Validate database before restore
    if ! validate_database "${source_file}"; then
        return 4
    fi

    # Validate schema
    if ! validate_schema "${source_file}"; then
        return 4
    fi

    # Confirm restore
    if ! confirm_restore; then
        return 1
    fi

    # Backup current database
    if ! backup_current_db; then
        return 2
    fi

    # Perform restore
    if ! perform_restore "${source_file}"; then
        return 2
    fi

    # Verify restored database
    if ! verify_restored_db "${RUVECTOR_DB_PATH}"; then
        log_error "Restored database verification failed"
        if [ -f "${DB_BACKUP}" ]; then
            log_info "Rolling back to previous database"
            cp "${DB_BACKUP}" "${RUVECTOR_DB_PATH}"
        fi
        return 2
    fi

    # Check data availability
    if ! check_data_availability "${RUVECTOR_DB_PATH}"; then
        return 1
    fi

    # Cleanup
    cleanup_temp_files

    log_info "=== RuVector Restore Complete ==="
    log_success "Database successfully restored and verified"
    log_info "Restore duration: ${RESTORE_DURATION}s"
    log_info "Data size: ${DATA_SIZE_MB}MB"

    return 0
}

# Execute main
parse_arguments "$@"
main
exit $?
