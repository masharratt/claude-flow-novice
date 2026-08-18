#!/usr/bin/env bash

##############################################################################
# RuVector Database Backup Script
#
# Purpose: Create timestamped backups of RuVector SQLite database
# Features:
#   - Full backup with timestamp
#   - 7-day retention policy (auto-delete older backups)
#   - Backup verification (checksums and size validation)
#   - Comprehensive error handling and logging
#   - Docker compose project isolation via COMPOSE_PROJECT_NAME
#
# Usage:
#   ./scripts/backup-ruvector.sh [--verify-only] [--dry-run]
#
# Environment Variables:
#   RUVECTOR_DB_PATH: Path to RuVector database
#   BACKUP_DIR: Directory for backups
#   RETENTION_DAYS: Days to keep backups
#   COMPOSE_PROJECT_NAME: Docker project name for isolation
##############################################################################

set -e

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Configuration
RUVECTOR_DB_PATH="${RUVECTOR_DB_PATH:-${SCRIPT_DIR}/docker/trigger-dev/data/ruvector.db}"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/docker/trigger-dev/data/backups}"
MIGRATION_DIR="${MIGRATION_DIR:-${SCRIPT_DIR}/docker/trigger-dev/data/migration}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_LOG="${BACKUP_DIR}/backup.log"

# Flags
VERIFY_ONLY=false
DRY_RUN=false

# Logging functions
log_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] INFO: $*" | tee -a "${BACKUP_LOG}"
}

log_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] ERROR: $*" | tee -a "${BACKUP_LOG}" >&2
}

log_debug() {
    if [ "${DEBUG:-0}" = "1" ]; then
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[${timestamp}] DEBUG: $*" | tee -a "${BACKUP_LOG}"
    fi
}

# Utility functions
validate_directory() {
    local dir="$1"
    local dir_name="$2"

    if [ ! -d "${dir}" ]; then
        log_info "Creating ${dir_name}: ${dir}"
        mkdir -p "${dir}" || {
            log_error "Failed to create ${dir_name}: ${dir}"
            return 1
        }
    fi
}

validate_source_db() {
    if [ ! -f "${RUVECTOR_DB_PATH}" ]; then
        log_error "Database file not found: ${RUVECTOR_DB_PATH}"
        log_info "Creating placeholder database for first-time setup"
        touch "${RUVECTOR_DB_PATH}"
    fi
}

calculate_checksum() {
    local file="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "${file}" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${file}" | awk '{print $1}'
    else
        log_error "No checksum utility found"
        return 1
    fi
}

verify_backup() {
    local backup_file="$1"
    local metadata_file="${backup_file}.metadata"

    if [ ! -f "${backup_file}" ]; then
        log_error "Backup file not found: ${backup_file}"
        return 1
    fi

    # Check file exists and is not empty
    local file_size=$(stat -c%s "${backup_file}" 2>/dev/null || echo 0)
    if [ "${file_size}" -eq 0 ]; then
        log_error "Backup file is empty: ${backup_file}"
        return 1
    fi

    log_info "Backup file size: ${file_size} bytes"

    # Verify checksum if metadata exists
    if [ -f "${metadata_file}" ]; then
        local stored_checksum=$(grep "^checksum=" "${metadata_file}" | cut -d= -f2)
        local actual_checksum=$(calculate_checksum "${backup_file}")

        if [ "${stored_checksum}" != "${actual_checksum}" ]; then
            log_error "Checksum mismatch for backup: ${backup_file}"
            return 1
        fi

        log_info "Checksum verification passed"
    fi

    return 0
}

create_metadata() {
    local backup_file="$1"
    local metadata_file="${backup_file}.metadata"

    local checksum=$(calculate_checksum "${backup_file}")
    local file_size=$(stat -c%s "${backup_file}" 2>/dev/null || echo 0)
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local compose_project="${COMPOSE_PROJECT_NAME:-default}"

    cat > "${metadata_file}" <<EOF
backup_timestamp=${timestamp}
source_db=${RUVECTOR_DB_PATH}
checksum=${checksum}
file_size=${file_size}
retention_days=${RETENTION_DAYS}
compose_project=${compose_project}
EOF

    log_info "Metadata written to: ${metadata_file}"
}

cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days"

    local cutoff_date=$(date -d "${RETENTION_DAYS} days ago" '+%Y%m%d' 2>/dev/null || date -j -v-${RETENTION_DAYS}d '+%Y%m%d' 2>/dev/null)

    if [ -z "${cutoff_date}" ]; then
        log_error "Failed to calculate cutoff date"
        return 1
    fi

    local deleted_count=0

    # Find and delete old backups
    if [ -d "${BACKUP_DIR}" ]; then
        find "${BACKUP_DIR}" -name "ruvector.db.backup-*" -type f 2>/dev/null | while read -r backup_file; do
            local backup_date=$(basename "${backup_file}" | sed 's/ruvector\.db\.backup-//' | cut -d'-' -f1)

            if [ "${backup_date}" -lt "${cutoff_date}" ]; then
                if [ "${DRY_RUN}" = "true" ]; then
                    log_info "[DRY-RUN] Would delete: ${backup_file}"
                else
                    log_info "Deleting old backup: ${backup_file}"
                    rm -f "${backup_file}" "${backup_file}.metadata"
                    deleted_count=$((deleted_count + 1))
                fi
            fi
        done
    fi

    log_info "Old backup cleanup completed"
}

perform_backup() {
    log_info "=== RuVector Backup Start ==="
    log_info "Source database: ${RUVECTOR_DB_PATH}"
    log_info "Backup directory: ${BACKUP_DIR}"
    log_info "Retention: ${RETENTION_DAYS} days"

    # Validate directories
    validate_directory "${BACKUP_DIR}" "backup directory" || return 1
    validate_directory "${MIGRATION_DIR}" "migration directory" || return 1

    # Validate source database
    validate_source_db || return 1

    # Generate backup filename with timestamp
    local timestamp=$(date '+%Y%m%d-%H%M%S')
    local backup_file="${BACKUP_DIR}/ruvector.db.backup-${timestamp}"

    log_info "Creating backup: ${backup_file}"

    if [ "${DRY_RUN}" = "true" ]; then
        log_info "[DRY-RUN] Would copy ${RUVECTOR_DB_PATH} to ${backup_file}"
    else
        # Copy database file
        if ! cp "${RUVECTOR_DB_PATH}" "${backup_file}"; then
            log_error "Failed to copy database file"
            return 1
        fi

        log_info "Backup created successfully"

        # Create metadata
        create_metadata "${backup_file}" || return 1

        # Verify backup
        verify_backup "${backup_file}" || return 1

        # Cleanup old backups
        cleanup_old_backups || return 1
    fi

    log_info "=== RuVector Backup Complete ==="
    echo "${backup_file}"
    return 0
}

show_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
    --verify-only   Only verify the last backup without creating new one
    --dry-run       Show what would be done without actually doing it
    -h, --help      Show this help message

Environment Variables:
    RUVECTOR_DB_PATH      Database path
    BACKUP_DIR            Backup directory
    RETENTION_DAYS        Days to retain (default: 7)
    COMPOSE_PROJECT_NAME  Project isolation (optional)
    DEBUG                 Enable debug logging (DEBUG=1)

Examples:
    # Create backup
    ./scripts/backup-ruvector.sh

    # Dry-run without modifications
    ./scripts/backup-ruvector.sh --dry-run

    # Verify last backup
    ./scripts/backup-ruvector.sh --verify-only

    # Custom retention
    RETENTION_DAYS=30 ./scripts/backup-ruvector.sh
EOF
}

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --verify-only)
            VERIFY_ONLY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
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

# Main execution
if [ "${VERIFY_ONLY}" = "true" ]; then
    log_info "Verifying last backup..."
    latest_backup=$(find "${BACKUP_DIR}" -name "ruvector.db.backup-*" -type f 2>/dev/null | sort -V | tail -n1)

    if [ -z "${latest_backup}" ]; then
        log_error "No backups found"
        exit 1
    fi

    log_info "Verifying: ${latest_backup}"
    verify_backup "${latest_backup}" || exit 1
    log_info "Last backup verified successfully"
else
    perform_backup || exit 1
fi

exit 0
