#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/pre-edit-hook.js
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################


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
BACKUP_SCRIPT="${SCRIPT_DIR}/../skills/cfn-edit-safety/lib/backup/backup.sh"

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
    echo "Error: Backup script not found: $BACKUP_SCRIPT" >&2
    exit 1
fi

# Execute backup and capture output.
#
# stdout and stderr MUST stay separate. backup.sh writes the backup path to
# stdout and a "Backup created" banner to stderr; merging them with 2>&1 folded
# the banner into the value callers assign to BACKUP_PATH, per the documented
# contract in ~/.claude/CLAUDE.md section 1:
#     BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$AGENT_ID")
# Command substitution preserves interior newlines, so BACKUP_PATH came back as
# two lines naming no directory and every rollback built from it failed.
BACKUP_STDERR=$(mktemp "${TMPDIR:-/tmp}/cfn-pre-edit-stderr-XXXXXX")
trap 'rm -f "$BACKUP_STDERR"' EXIT

# The agent id is passed as --agent-id, matching backup.sh's CLI. It used to be
# passed as a bare second positional, which backup.sh's argument loop shifts
# past as unknown, silently leaving agent_id="unknown" for every backup.
if ! BACKUP_DIR=$("$BACKUP_SCRIPT" "$FILE_PATH" --agent-id "$AGENT_ID" 2>"$BACKUP_STDERR"); then
    echo "Error: Backup failed: $(tr '\n' ' ' < "$BACKUP_STDERR")" >&2
    exit 1
fi

# A backup that did not produce a usable directory is a failed backup, even if
# the helper exited 0. Fail loudly rather than hand back an unusable path.
if [[ -z "$BACKUP_DIR" ]] || [[ ! -d "$BACKUP_DIR" ]]; then
    echo "Error: Backup did not produce a usable directory: '$BACKUP_DIR'" >&2
    echo "$(tr '\n' ' ' < "$BACKUP_STDERR")" >&2
    exit 1
fi

# Return backup directory path (stdout carries the path and nothing else)
echo "$BACKUP_DIR"
exit 0
