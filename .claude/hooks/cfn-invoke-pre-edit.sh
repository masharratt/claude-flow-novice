#!/bin/bash

# Pre-Edit Backup Hook Wrapper
# Creates backup before file modifications in agent workflows
#
# Usage: .claude/hooks/cfn-invoke-pre-edit.sh FILE_PATH --agent-id AGENT_ID
#
# Arguments:
#   FILE_PATH   - Absolute path to file about to be edited
#   --agent-id  - Unique identifier for the agent performing the edit
#
# Returns:
#   Backup directory path on success
#   Exit code 1 on failure
#
# Example:
#   BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "/path/to/file.txt" --agent-id "backend-dev-1")

set -euo pipefail

# === Parse Arguments ===

FILE_PATH=""
AGENT_ID=""

# First positional argument is file path
if [[ -n "${1:-}" ]] && [[ "$1" != --* ]]; then
    FILE_PATH="$1"
    shift
fi

# Parse remaining named arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --agent-id)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --agent-id requires a value" >&2
                exit 1
            fi
            AGENT_ID="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            echo "Usage: cfn-invoke-pre-edit.sh FILE_PATH --agent-id AGENT_ID" >&2
            exit 1
            ;;
    esac
done

# === Validate Inputs ===

if [[ -z "$FILE_PATH" ]]; then
    echo "Error: No file path provided" >&2
    echo "Usage: cfn-invoke-pre-edit.sh FILE_PATH --agent-id AGENT_ID" >&2
    exit 1
fi

if [[ -z "$AGENT_ID" ]]; then
    echo "Error: No agent ID provided" >&2
    echo "Usage: cfn-invoke-pre-edit.sh FILE_PATH --agent-id AGENT_ID" >&2
    exit 1
fi

if [[ ! -f "$FILE_PATH" ]]; then
    echo "Error: File does not exist: $FILE_PATH" >&2
    exit 1
fi

# === Execute Pre-Edit Backup ===

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/../skills/pre-edit-backup/backup.sh"

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
    echo "Error: Backup script not found: $BACKUP_SCRIPT" >&2
    exit 1
fi

# Execute backup and capture output
if ! BACKUP_DIR=$("$BACKUP_SCRIPT" "$FILE_PATH" "$AGENT_ID" 2>&1); then
    echo "Error: Backup failed: $BACKUP_DIR" >&2
    exit 1
fi

# Return backup directory path
echo "$BACKUP_DIR"
exit 0
