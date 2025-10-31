#!/bin/bash

# Pre-Edit Restore Script
# Restores file from backup and updates metadata
#
# Usage: restore.sh BACKUP_DIR [--list FILE_PATH AGENT_ID]
#
# Arguments:
#   BACKUP_DIR  - Path to backup directory containing backup_metadata.json
#   --list      - List available backups for a file (requires FILE_PATH and AGENT_ID)
#
# Returns:
#   Exit code 0 on success
#   Exit code 1 on failure
#
# Example:
#   ./.claude/skills/pre-edit-backup/restore.sh ".backups/backend-dev-1/1698764800000_abc123"
#   ./.claude/skills/pre-edit-backup/restore.sh --list "/path/to/file.txt" "backend-dev-1"

set -euo pipefail

# === Handle --list Mode ===

if [[ "${1:-}" == "--list" ]]; then
    FILE_PATH="$2"
    AGENT_ID="$3"

    if [[ -z "$FILE_PATH" ]] || [[ -z "$AGENT_ID" ]]; then
        echo "Error: --list requires FILE_PATH and AGENT_ID" >&2
        exit 1
    fi

    BACKUP_BASE_DIR=".backups"
    AGENT_BACKUP_DIR="${BACKUP_BASE_DIR}/${AGENT_ID}"

    if [[ ! -d "$AGENT_BACKUP_DIR" ]]; then
        echo "No backups found for agent: $AGENT_ID" >&2
        exit 1
    fi

    echo "Available backups for $FILE_PATH (agent: $AGENT_ID):"
    echo "---"

    FOUND_BACKUPS=0
    for backup_dir in "$AGENT_BACKUP_DIR"/*; do
        if [[ -f "${backup_dir}/backup_metadata.json" ]]; then
            ORIGINAL=$(jq -r '.original_path' "${backup_dir}/backup_metadata.json" 2>/dev/null || echo "")
            if [[ "$ORIGINAL" == "$FILE_PATH" ]]; then
                TIMESTAMP=$(jq -r '.backup_timestamp' "${backup_dir}/backup_metadata.json" 2>/dev/null || echo "unknown")
                STATUS=$(jq -r '.backup_status' "${backup_dir}/backup_metadata.json" 2>/dev/null || echo "unknown")
                echo "Backup: $(basename "$backup_dir")"
                echo "  Timestamp: $TIMESTAMP"
                echo "  Status: $STATUS"
                echo "  Path: $backup_dir"
                echo "---"
                FOUND_BACKUPS=$((FOUND_BACKUPS + 1))
            fi
        fi
    done

    if [[ $FOUND_BACKUPS -eq 0 ]]; then
        echo "No backups found for this file."
        exit 1
    fi

    exit 0
fi

# === Restore Mode ===

BACKUP_DIR="$1"

if [[ -z "$BACKUP_DIR" ]]; then
    echo "Error: No backup directory provided" >&2
    echo "Usage: restore.sh BACKUP_DIR" >&2
    exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "Error: Backup directory does not exist: $BACKUP_DIR" >&2
    exit 1
fi

METADATA_FILE="${BACKUP_DIR}/backup_metadata.json"
BACKUP_FILE="${BACKUP_DIR}/original_file"

if [[ ! -f "$METADATA_FILE" ]]; then
    echo "Error: Backup metadata not found: $METADATA_FILE" >&2
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Error: Backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

# Check for jq availability
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required for restore operations" >&2
    exit 1
fi

# Extract original path
ORIGINAL_PATH=$(jq -r '.original_path' "$METADATA_FILE" 2>/dev/null)

if [[ -z "$ORIGINAL_PATH" ]] || [[ "$ORIGINAL_PATH" == "null" ]]; then
    echo "Error: Failed to read original path from metadata" >&2
    exit 1
fi

# Restore file
if ! cp "$BACKUP_FILE" "$ORIGINAL_PATH" 2>/dev/null; then
    echo "Error: Failed to restore file to: $ORIGINAL_PATH" >&2
    exit 1
fi

# Update backup status
TEMP_FILE=$(mktemp)
if jq '.backup_status = "restored"' "$METADATA_FILE" > "$TEMP_FILE" 2>/dev/null; then
    mv "$TEMP_FILE" "$METADATA_FILE"
else
    echo "Warning: Failed to update backup status in metadata" >&2
    rm -f "$TEMP_FILE"
fi

echo "File restored from backup: ${BACKUP_DIR}"
echo "Restored to: ${ORIGINAL_PATH}"
exit 0
