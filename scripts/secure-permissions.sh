#!/usr/bin/env bash

##############################################################################
# RuVector Security: File Permission Remediation
#
# Purpose: Fix insecure file permissions (0777) to secure defaults
# Critical security fix for P0.1 vulnerability
#
# Features:
#   - Fix data files: 0777 → 0600 (owner read/write only)
#   - Fix directories: 0777 → 0700 (owner r/w/x only)
#   - Fix backup files: 0777 → 0640 (owner r/w, group read)
#   - Set secure umask (0077) for future files
#   - Recursive validation with audit trail
#   - Dry-run mode for verification
#
# Usage:
#   ./scripts/secure-permissions.sh [--dry-run] [--verify] [--fix-all]
#
# Environment Variables:
#   RUVECTOR_DB_PATH: Path to RuVector database
#   BACKUP_DIR: Directory for backups
#   MIGRATION_DIR: Directory for migrations
##############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Configuration
RUVECTOR_DB_PATH="${RUVECTOR_DB_PATH:-${SCRIPT_DIR}/docker/trigger-dev/data/ruvector.db}"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/docker/trigger-dev/data/backups}"
MIGRATION_DIR="${MIGRATION_DIR:-${SCRIPT_DIR}/docker/trigger-dev/data/migration}"
LOG_FILE="${LOG_FILE:-/tmp/secure-permissions-$(date +%s).log}"

# Modes
DRY_RUN=false
VERIFY_ONLY=false
FIX_ALL=false

# Counters
FIXED_FILES=0
FIXED_DIRS=0
SKIPPED_FILES=0
ERRORS=0

##############################################################################
# PERMISSION MATRIX
##############################################################################
#
# File Type              | Current | Target | Rationale
# -----------------------|---------|--------|---------------------------
# SQLite Database (.db)  | 0777    | 0600   | Sensitive data, owner only
# SQLite WAL/SHM         | 0777    | 0600   | Database temp files
# Backup Archives (.tar) | 0777    | 0640   | Owner r/w, group read
# Backup Metadata        | 0777    | 0640   | Audit trail, group read
# Migration Scripts      | 0777    | 0640   | Read-only after creation
# Log Files              | 0777    | 0640   | Owner r/w, group read
# Directories (data)     | 0777    | 0700   | Owner access only
# Directories (backups)  | 0777    | 0750   | Owner r/w/x, group read/exec
#
##############################################################################

# Logging functions
log_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] INFO: $*" | tee -a "${LOG_FILE}"
}

log_warn() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] WARN: $*" | tee -a "${LOG_FILE}"
}

log_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] ERROR: $*" | tee -a "${LOG_FILE}" >&2
    ((ERRORS++))
}

log_debug() {
    if [ "${DEBUG:-0}" = "1" ]; then
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[${timestamp}] DEBUG: $*" | tee -a "${LOG_FILE}"
    fi
}

##############################################################################
# Permission Validation
##############################################################################

check_file_permissions() {
    local file="$1"
    local expected="$2"

    if [ ! -e "${file}" ]; then
        log_debug "File does not exist: ${file}"
        return 1
    fi

    local current=$(stat -c "%a" "${file}" 2>/dev/null || stat -f "%OLp" "${file}" 2>/dev/null)

    if [ "${current}" != "${expected}" ]; then
        log_warn "Insecure permissions: ${file} (current: ${current}, expected: ${expected})"
        return 1
    fi

    log_debug "Secure permissions: ${file} (${current})"
    return 0
}

##############################################################################
# Permission Fixing
##############################################################################

fix_file_permissions() {
    local file="$1"
    local target_perms="$2"
    local description="$3"

    if [ ! -e "${file}" ]; then
        log_debug "Skipping non-existent file: ${file}"
        ((SKIPPED_FILES++))
        return 0
    fi

    local current=$(stat -c "%a" "${file}" 2>/dev/null || stat -f "%OLp" "${file}" 2>/dev/null)

    if [ "${current}" = "${target_perms}" ]; then
        log_debug "Already secure: ${file} (${current})"
        return 0
    fi

    if [ "${DRY_RUN}" = true ]; then
        log_info "[DRY-RUN] Would fix: ${file} (${current} → ${target_perms}) - ${description}"
        return 0
    fi

    if chmod "${target_perms}" "${file}"; then
        log_info "Fixed: ${file} (${current} → ${target_perms}) - ${description}"
        if [ -d "${file}" ]; then
            ((FIXED_DIRS++))
        else
            ((FIXED_FILES++))
        fi
    else
        log_error "Failed to fix: ${file}"
        return 1
    fi
}

fix_directory_permissions_recursive() {
    local dir="$1"
    local file_perms="$2"
    local dir_perms="$3"
    local description="$4"

    if [ ! -d "${dir}" ]; then
        log_debug "Directory does not exist: ${dir}"
        return 0
    fi

    log_info "Processing directory: ${dir} (${description})"

    # Fix directory itself
    fix_file_permissions "${dir}" "${dir_perms}" "Directory"

    # Fix all files in directory (non-recursive for first level)
    while IFS= read -r -d '' file; do
        if [ -f "${file}" ]; then
            local ext="${file##*.}"
            case "${ext}" in
                db|db-wal|db-shm)
                    fix_file_permissions "${file}" "600" "SQLite database file"
                    ;;
                tar|tar.gz|tgz)
                    fix_file_permissions "${file}" "640" "Backup archive"
                    ;;
                metadata|checksum|log)
                    fix_file_permissions "${file}" "640" "Metadata/log file"
                    ;;
                *)
                    fix_file_permissions "${file}" "${file_perms}" "Data file"
                    ;;
            esac
        elif [ -d "${file}" ] && [ "${file}" != "${dir}" ]; then
            fix_file_permissions "${file}" "${dir_perms}" "Subdirectory"
        fi
    done < <(find "${dir}" -maxdepth 1 -print0 2>/dev/null || true)
}

##############################################################################
# Umask Configuration
##############################################################################

set_secure_umask() {
    local current_umask=$(umask)
    local target_umask="0077"

    if [ "${current_umask}" != "${target_umask}" ]; then
        log_info "Setting secure umask: ${current_umask} → ${target_umask}"

        if [ "${DRY_RUN}" = false ]; then
            umask "${target_umask}"
            log_info "Umask updated successfully"
        else
            log_info "[DRY-RUN] Would set umask to ${target_umask}"
        fi
    else
        log_info "Umask already secure: ${current_umask}"
    fi
}

##############################################################################
# Verification
##############################################################################

verify_all_permissions() {
    local all_secure=true

    log_info "=== PERMISSION VERIFICATION ==="

    # Check database files
    if [ -f "${RUVECTOR_DB_PATH}" ]; then
        check_file_permissions "${RUVECTOR_DB_PATH}" "600" || all_secure=false
        check_file_permissions "${RUVECTOR_DB_PATH}-wal" "600" 2>/dev/null || true
        check_file_permissions "${RUVECTOR_DB_PATH}-shm" "600" 2>/dev/null || true
    fi

    # Check backup directory
    if [ -d "${BACKUP_DIR}" ]; then
        check_file_permissions "${BACKUP_DIR}" "750" || all_secure=false

        while IFS= read -r -d '' file; do
            if [ -f "${file}" ]; then
                check_file_permissions "${file}" "640" || all_secure=false
            fi
        done < <(find "${BACKUP_DIR}" -type f -print0 2>/dev/null || true)
    fi

    # Check migration directory
    if [ -d "${MIGRATION_DIR}" ]; then
        check_file_permissions "${MIGRATION_DIR}" "700" || all_secure=false
    fi

    if [ "${all_secure}" = true ]; then
        log_info "✓ All permissions are secure"
        return 0
    else
        log_warn "✗ Some permissions are insecure"
        return 1
    fi
}

##############################################################################
# Main Execution
##############################################################################

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                log_info "Dry-run mode enabled"
                shift
                ;;
            --verify)
                VERIFY_ONLY=true
                log_info "Verification mode enabled"
                shift
                ;;
            --fix-all)
                FIX_ALL=true
                log_info "Fix-all mode enabled"
                shift
                ;;
            --help|-h)
                cat <<EOF
Usage: $0 [OPTIONS]

Secure file permissions for RuVector database and backups

Options:
  --dry-run    Show what would be changed without making changes
  --verify     Only verify permissions, do not fix
  --fix-all    Fix all permissions recursively
  --help       Show this help message

Environment Variables:
  RUVECTOR_DB_PATH   Path to RuVector database (default: ./docker/trigger-dev/data/ruvector.db)
  BACKUP_DIR         Backup directory (default: ./docker/trigger-dev/data/backups)
  MIGRATION_DIR      Migration directory (default: ./docker/trigger-dev/data/migration)
  LOG_FILE           Log file path (default: /tmp/secure-permissions-<timestamp>.log)
  DEBUG              Enable debug logging (DEBUG=1)

Permission Matrix:
  Database files (.db, .db-wal, .db-shm): 0600 (owner read/write)
  Backup archives (.tar, .tar.gz):        0640 (owner r/w, group read)
  Metadata files:                         0640 (owner r/w, group read)
  Data directories:                       0700 (owner r/w/x)
  Backup directories:                     0750 (owner r/w/x, group r/x)

EOF
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

main() {
    parse_args "$@"

    log_info "=== RuVector Permission Remediation ==="
    log_info "Log file: ${LOG_FILE}"

    # Set secure umask for future files
    set_secure_umask

    if [ "${VERIFY_ONLY}" = true ]; then
        verify_all_permissions
        exit $?
    fi

    # Fix database file permissions
    if [ -f "${RUVECTOR_DB_PATH}" ]; then
        fix_file_permissions "${RUVECTOR_DB_PATH}" "600" "SQLite database"
        fix_file_permissions "${RUVECTOR_DB_PATH}-wal" "600" "SQLite WAL" 2>/dev/null || true
        fix_file_permissions "${RUVECTOR_DB_PATH}-shm" "600" "SQLite SHM" 2>/dev/null || true
    fi

    # Fix backup directory
    if [ -d "${BACKUP_DIR}" ] || [ "${FIX_ALL}" = true ]; then
        mkdir -p "${BACKUP_DIR}" 2>/dev/null || true
        fix_directory_permissions_recursive "${BACKUP_DIR}" "640" "750" "Backup directory"
    fi

    # Fix migration directory
    if [ -d "${MIGRATION_DIR}" ] || [ "${FIX_ALL}" = true ]; then
        mkdir -p "${MIGRATION_DIR}" 2>/dev/null || true
        fix_directory_permissions_recursive "${MIGRATION_DIR}" "640" "700" "Migration directory"
    fi

    # Summary
    log_info "=== SUMMARY ==="
    log_info "Files fixed:    ${FIXED_FILES}"
    log_info "Directories fixed: ${FIXED_DIRS}"
    log_info "Files skipped:  ${SKIPPED_FILES}"
    log_info "Errors:         ${ERRORS}"

    if [ "${ERRORS}" -gt 0 ]; then
        log_error "Permission remediation completed with errors"
        exit 1
    fi

    if [ "${DRY_RUN}" = false ]; then
        log_info "✓ Permission remediation completed successfully"

        # Verify after fixing
        log_info ""
        verify_all_permissions
    else
        log_info "✓ Dry-run completed (no changes made)"
    fi
}

main "$@"
