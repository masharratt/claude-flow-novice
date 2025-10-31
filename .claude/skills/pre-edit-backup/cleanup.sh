#!/bin/bash

# Pre-Edit Backup Cleanup Script
# Removes expired backups based on TTL configuration
# Runs as background process or cron-style with flock for concurrency control
#
# Usage: cleanup.sh [--dry-run] [--log-file FILE]
#
# Options:
#   --dry-run    - Show what would be deleted without actually deleting
#   --log-file   - Path to log file (default: none, outputs to stdout)
#
# Returns:
#   Exit code 0 on success
#   Exit code 1 if cleanup already in progress
#
# Example:
#   ./.claude/skills/pre-edit-backup/cleanup.sh
#   ./.claude/skills/pre-edit-backup/cleanup.sh --dry-run
#   ./.claude/skills/pre-edit-backup/cleanup.sh --log-file /tmp/backup-cleanup.log

set -euo pipefail

# === Configuration ===

BACKUP_BASE_DIR=".backups"
CURRENT_TIME=$(date +%s)
DRY_RUN=false
LOG_FILE=""

# === Parse Options ===

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --log-file)
            LOG_FILE="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown option: $1" >&2
            echo "Usage: cleanup.sh [--dry-run] [--log-file FILE]" >&2
            exit 1
            ;;
    esac
done

# === Logging Function ===

log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_line="[$timestamp] $message"

    if [[ -n "$LOG_FILE" ]]; then
        echo "$log_line" >> "$LOG_FILE"
    else
        echo "$log_line"
    fi
}

# === Prevent Concurrent Cleanup ===

if [[ ! -d "$BACKUP_BASE_DIR" ]]; then
    log "Backup directory does not exist: $BACKUP_BASE_DIR"
    exit 0
fi

LOCKFILE="${BACKUP_BASE_DIR}/cleanup.lock"

# Ensure lock file directory exists
mkdir -p "$(dirname "$LOCKFILE")" 2>/dev/null || true

# Acquire lock (non-blocking)
exec 9>"$LOCKFILE"
if ! flock -n 9; then
    log "Cleanup already in progress (lock held)"
    exit 1
fi

log "Cleanup started (dry-run: $DRY_RUN)"

# === Cleanup Logic ===

REMOVED_COUNT=0
SKIPPED_COUNT=0
ERROR_COUNT=0

# Check for jq availability
if ! command -v jq &>/dev/null; then
    log "Error: jq is required for cleanup operations"
    exit 1
fi

# Iterate through agent directories
for agent_dir in "$BACKUP_BASE_DIR"/*; do
    # Skip if not a directory or if it's the lockfile
    [[ -d "$agent_dir" ]] || continue
    [[ "$(basename "$agent_dir")" == "cleanup.lock" ]] && continue

    # Iterate through backup directories for this agent
    for backup_dir in "$agent_dir"/*; do
        [[ -d "$backup_dir" ]] || continue

        metadata_file="${backup_dir}/backup_metadata.json"

        if [[ ! -f "$metadata_file" ]]; then
            log "Warning: Metadata missing for backup: ${backup_dir}"
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            continue
        fi

        # Extract backup timestamp and TTL
        backup_timestamp=$(jq -r '.backup_timestamp' "$metadata_file" 2>/dev/null || echo "")
        backup_ttl=$(jq -r '.backup_ttl' "$metadata_file" 2>/dev/null || echo "")

        if [[ -z "$backup_timestamp" ]] || [[ "$backup_timestamp" == "null" ]] || \
           [[ -z "$backup_ttl" ]] || [[ "$backup_ttl" == "null" ]]; then
            log "Warning: Invalid metadata in: ${metadata_file}"
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            continue
        fi

        # Convert milliseconds to seconds if needed (timestamp > 10 digits = milliseconds)
        if [[ ${#backup_timestamp} -gt 10 ]]; then
            backup_timestamp=$((backup_timestamp / 1000))
        fi

        # Check if backup has expired
        age=$((CURRENT_TIME - backup_timestamp))
        if (( age > backup_ttl )); then
            if [[ "$DRY_RUN" == true ]]; then
                log "Would remove expired backup (age: ${age}s, ttl: ${backup_ttl}s): ${backup_dir}"
                REMOVED_COUNT=$((REMOVED_COUNT + 1))
            else
                if rm -rf "$backup_dir" 2>/dev/null; then
                    log "Removed expired backup (age: ${age}s, ttl: ${backup_ttl}s): ${backup_dir}"
                    REMOVED_COUNT=$((REMOVED_COUNT + 1))
                else
                    log "Error: Failed to remove backup: ${backup_dir}"
                    ERROR_COUNT=$((ERROR_COUNT + 1))
                fi
            fi
        fi
    done
done

# === Summary ===

log "Cleanup completed: removed=$REMOVED_COUNT, skipped=$SKIPPED_COUNT, errors=$ERROR_COUNT"

exit 0
