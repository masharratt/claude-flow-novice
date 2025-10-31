#!/bin/bash
#
# Revert File Utility
# High-level revert interface for agents to use instead of git operations
#
# Usage:
#   ./.claude/skills/pre-edit-backup/revert-file.sh <file_path> [--agent-id <id>] [--interactive]
#
# Examples:
#   # Revert to most recent backup (auto-select)
#   ./.claude/skills/pre-edit-backup/revert-file.sh src/file.ts --agent-id "coder-1"
#
#   # Interactive mode (shows list of backups)
#   ./.claude/skills/pre-edit-backup/revert-file.sh src/file.ts --agent-id "coder-1" --interactive
#
#   # List available backups without reverting
#   ./.claude/skills/pre-edit-backup/revert-file.sh src/file.ts --agent-id "coder-1" --list-only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_BASE_DIR=".backups"

# Parse arguments
FILE_PATH=""
AGENT_ID="${AGENT_ID:-unknown}"
INTERACTIVE=false
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --interactive)
            INTERACTIVE=true
            shift
            ;;
        --list-only)
            LIST_ONLY=true
            shift
            ;;
        *)
            FILE_PATH="$1"
            shift
            ;;
    esac
done

# Validate inputs
if [ -z "$FILE_PATH" ]; then
    echo "Error: File path required"
    echo "Usage: $0 <file_path> [--agent-id <id>] [--interactive] [--list-only]"
    exit 1
fi

# Normalize file path
FILE_PATH=$(realpath "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")

# Find backups for this file
AGENT_BACKUP_DIR="$BACKUP_BASE_DIR/$AGENT_ID"

if [ ! -d "$AGENT_BACKUP_DIR" ]; then
    echo "❌ No backups found for agent: $AGENT_ID"
    exit 1
fi

# Search for backups matching this file
MATCHING_BACKUPS=()
while IFS= read -r backup_dir; do
    metadata_file="$backup_dir/backup_metadata.json"

    if [ -f "$metadata_file" ]; then
        original_path=$(jq -r '.original_path' "$metadata_file" 2>/dev/null || echo "")

        # Normalize original path for comparison
        original_path=$(realpath "$original_path" 2>/dev/null || echo "$original_path")

        if [ "$original_path" = "$FILE_PATH" ]; then
            MATCHING_BACKUPS+=("$backup_dir")
        fi
    fi
done < <(find "$AGENT_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r)

# Check if any backups found
if [ ${#MATCHING_BACKUPS[@]} -eq 0 ]; then
    echo "❌ No backups found for file: $FILE_PATH"
    exit 1
fi

# List backups function
list_backups() {
    echo "Available backups for: $FILE_PATH"
    echo "----------------------------------------"

    local index=1
    for backup_dir in "${MATCHING_BACKUPS[@]}"; do
        metadata_file="$backup_dir/backup_metadata.json"

        timestamp=$(jq -r '.backup_timestamp' "$metadata_file")
        status=$(jq -r '.backup_status' "$metadata_file")

        # Convert timestamp to readable date
        if command -v date >/dev/null 2>&1; then
            # Handle millisecond timestamps
            timestamp_seconds=$((timestamp / 1000))
            date_str=$(date -d "@$timestamp_seconds" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r "$timestamp_seconds" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "Unknown")
        else
            date_str="$timestamp"
        fi

        echo "[$index] $date_str (Status: $status)"
        echo "    Path: $backup_dir"

        ((index++))
    done
    echo "----------------------------------------"
}

# List-only mode
if [ "$LIST_ONLY" = true ]; then
    list_backups
    exit 0
fi

# Interactive mode
if [ "$INTERACTIVE" = true ]; then
    list_backups
    echo ""
    echo -n "Select backup to restore [1-${#MATCHING_BACKUPS[@]}] (or 0 to cancel): "
    read -r selection

    if [ "$selection" = "0" ]; then
        echo "❌ Revert cancelled"
        exit 0
    fi

    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#MATCHING_BACKUPS[@]} ]; then
        echo "❌ Invalid selection: $selection"
        exit 1
    fi

    SELECTED_BACKUP="${MATCHING_BACKUPS[$((selection - 1))]}"
else
    # Auto-select most recent backup (first in sorted list)
    SELECTED_BACKUP="${MATCHING_BACKUPS[0]}"

    metadata_file="$SELECTED_BACKUP/backup_metadata.json"
    timestamp=$(jq -r '.backup_timestamp' "$metadata_file")
    timestamp_seconds=$((timestamp / 1000))
    date_str=$(date -d "@$timestamp_seconds" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r "$timestamp_seconds" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "timestamp: $timestamp")

    echo "🔄 Auto-selecting most recent backup: $date_str"
fi

# Restore using restore.sh
echo "🔄 Restoring file from backup..."
"$SCRIPT_DIR/restore.sh" "$SELECTED_BACKUP"

if [ $? -eq 0 ]; then
    echo "✅ File successfully reverted to backup"
    echo "   Backup: $SELECTED_BACKUP"
    exit 0
else
    echo "❌ Failed to revert file"
    exit 1
fi
