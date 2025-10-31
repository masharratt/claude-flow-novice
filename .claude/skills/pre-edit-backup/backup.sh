#!/bin/bash

# Pre-Edit Backup Script
# Creates timestamped backup with SHA-256 hash and JSON metadata
#
# Usage: backup.sh FILE_PATH AGENT_ID
#
# Arguments:
#   FILE_PATH  - Absolute path to file to backup
#   AGENT_ID   - Unique identifier for the agent creating the backup
#
# Returns:
#   Backup directory path on success
#   Exit code 1 on failure
#
# Example:
#   ./.claude/skills/pre-edit-backup/backup.sh "/path/to/file.txt" "backend-dev-1"

set -euo pipefail

# === Input Validation ===

FILE_PATH="$1"
AGENT_ID="$2"

if [[ -z "$FILE_PATH" ]]; then
    echo "Error: No file path provided" >&2
    echo "Usage: backup.sh FILE_PATH AGENT_ID" >&2
    exit 1
fi

if [[ -z "$AGENT_ID" ]]; then
    echo "Error: No agent ID provided" >&2
    echo "Usage: backup.sh FILE_PATH AGENT_ID" >&2
    exit 1
fi

if [[ ! -f "$FILE_PATH" ]]; then
    echo "Error: File does not exist: $FILE_PATH" >&2
    exit 1
fi

# === Configuration ===

BACKUP_BASE_DIR=".backups"
DEFAULT_TTL=86400  # 24 hours in seconds

# === Tool Availability Checks ===

# Check for sha256sum (with fallback to shasum on macOS)
if command -v sha256sum &>/dev/null; then
    HASH_TOOL="sha256sum"
elif command -v shasum &>/dev/null; then
    HASH_TOOL="shasum -a 256"
else
    echo "Error: Neither sha256sum nor shasum found. Cannot generate file hash." >&2
    exit 1
fi

# Check for jq (graceful degradation)
if ! command -v jq &>/dev/null; then
    echo "Warning: jq not found. Metadata will be created using basic shell." >&2
    USE_JQ=false
else
    USE_JQ=true
fi

# === Generate Backup Metadata ===

TIMESTAMP=$(date +%s%3N 2>/dev/null || date +%s)  # Milliseconds if supported, else seconds
FILE_HASH=$($HASH_TOOL "$FILE_PATH" | cut -d' ' -f1)

# === Create Backup Directory ===

BACKUP_DIR="${BACKUP_BASE_DIR}/${AGENT_ID}/${TIMESTAMP}_${FILE_HASH}"

if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
    echo "Error: Failed to create backup directory: $BACKUP_DIR" >&2
    exit 1
fi

# Set secure permissions (owner read/write/execute only)
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

# === Copy Original File ===

if ! cp "$FILE_PATH" "${BACKUP_DIR}/original_file" 2>/dev/null; then
    echo "Error: Failed to copy file to backup directory" >&2
    rm -rf "$BACKUP_DIR"
    exit 1
fi

# === Generate Metadata ===

METADATA_FILE="${BACKUP_DIR}/backup_metadata.json"

if [[ "$USE_JQ" == true ]]; then
    # Use jq for structured JSON generation
    jq -n \
        --arg agent_id "$AGENT_ID" \
        --arg original_path "$FILE_PATH" \
        --arg timestamp "$TIMESTAMP" \
        --arg file_hash "$FILE_HASH" \
        --arg ttl "$DEFAULT_TTL" \
        '{
            agent_id: $agent_id,
            original_path: $original_path,
            backup_timestamp: ($timestamp | tonumber),
            file_hash: $file_hash,
            backup_ttl: ($ttl | tonumber),
            backup_status: "active"
        }' > "$METADATA_FILE"
else
    # Fallback: Manual JSON generation
    cat > "$METADATA_FILE" <<EOF
{
    "agent_id": "$AGENT_ID",
    "original_path": "$FILE_PATH",
    "backup_timestamp": $TIMESTAMP,
    "file_hash": "$FILE_HASH",
    "backup_ttl": $DEFAULT_TTL,
    "backup_status": "active"
}
EOF
fi

# === Return Backup Path ===

echo "$BACKUP_DIR"
exit 0
