#!/usr/bin/env bash
# Edit Safety Main Workflow
# Coordinates backup, edit, and validation with rollback capability
#
# rollback/list/cleanup delegate to lib/backup/restore.sh and
# lib/backup/cleanup.sh, which operate on the real backup directories the
# pre-edit hook writes (<repo_root>/.backups/<agent_id>/<ts>_<hash>/). This is
# the fix for the bug where these subcommands read a /tmp/edit-safety
# backup-registry.json that nothing populated: register_backup() was only
# ever called from safe_edit(), which nothing in the real workflow invokes
# (agents use cfn-invoke-pre-edit.sh / cfn-invoke-post-edit.sh directly,
# which call lib/backup/backup.sh, not this script's "edit" subcommand).

set -euo pipefail

# Script configuration
#
# readlink -f (not plain dirname+pwd) because ~/.claude/skills is a reverse
# symlink into this repo; without resolving the real path first, a script
# invoked via the ~/.claude path would compute the wrong repo root below.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
BACKUP_DIR="$LIB_DIR/backup"
HOOKS_DIR="$LIB_DIR/hooks"
CLI_DIR="$SCRIPT_DIR/cli"

RESTORE_SH="$BACKUP_DIR/restore.sh"
CLEANUP_SH="$BACKUP_DIR/cleanup.sh"

# Same backups-root convention as restore.sh: default to $(pwd)/.backups,
# matching backup.sh's own default, so this script's own "list" (no file
# given) looks in the same place restore.sh would for "list <file>" in the
# same invocation. See restore.sh's header comment for the full rationale.
BACKUPS_ROOT="${CFN_BACKUP_ROOT:-$(pwd)/.backups}"

# Source required components
source "$BACKUP_DIR/backup.sh"

# Function to run post-edit validation
run_post_edit_validation() {
    local file_path="$1"
    local agent_id="$2"

    # Check if post-edit script exists
    if [[ -f "$HOOKS_DIR/post-edit-handler.sh" ]]; then
        # Make sure it's executable
        chmod +x "$HOOKS_DIR/post-edit-handler.sh"

        # Run validation
        "$HOOKS_DIR/post-edit-handler.sh" "$file_path" --agent-id "$agent_id" 2>&1
        return $?
    else
        echo "Post-edit validation script not found" >&2
        return 1
    fi
}

# Function to clean up a single backup dir made during the "edit" subcommand's
# own pre-edit backup (not the reclaim-space workflow; see cleanup.sh for
# that). Kept from the original edit workflow: on a successful edit +
# validation, the pre-edit backup made for that one edit is discarded since
# it is no longer needed.
cleanup_backup() {
    local backup_id="$1"
    local backup_path="$2"

    # Only clean up if backup path exists and is a directory
    if [[ -d "$backup_path" ]]; then
        log_info "Removing backup: $backup_path"
        rm -rf "$backup_path" 2>/dev/null || log_warn "Could not remove backup: $backup_path"
    fi

    # Also try to clean up parent directory if empty
    local parent_dir
    parent_dir=$(dirname "$backup_path")
    if [[ -d "$parent_dir" && -z "$(ls -A "$parent_dir" 2>/dev/null)" ]]; then
        rmdir "$parent_dir" 2>/dev/null || true
    fi
}

# Global variables
EDIT_SAFETY_WORKSPACE="${EDIT_SAFETY_WORKSPACE:-/tmp/edit-safety}"
EDIT_SAFETY_LOG="$EDIT_SAFETY_WORKSPACE/edit-safety.log"
ROLLBACK_MODE="false"

# Initialize workspace (log directory only; backup tracking now lives on
# disk under BACKUPS_ROOT via backup.sh/restore.sh/cleanup.sh, not a
# /tmp registry).
init_workspace() {
    mkdir -p "$EDIT_SAFETY_WORKSPACE"
    touch "$EDIT_SAFETY_LOG"
    log_info "Edit safety workspace initialized at $EDIT_SAFETY_WORKSPACE"
}

# Logging functions. Write to stderr (not just the log file) so that
# rollback/list/cleanup's delegated stdout (e.g. cleanup --json) stays clean
# for the caller to parse.
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $*" | tee -a "$EDIT_SAFETY_LOG" >&2
}

log_warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $*" | tee -a "$EDIT_SAFETY_LOG" >&2
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" | tee -a "$EDIT_SAFETY_LOG" >&2
}

# Validate file exists and is writable
validate_file_access() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        log_error "File does not exist: $file_path"
        return 1
    fi

    if [[ ! -w "$file_path" ]]; then
        log_error "File is not writable: $file_path"
        return 1
    fi

    return 0
}

# Execute safe edit workflow
safe_edit() {
    local file_path="$1"
    local edit_command="$2"
    local agent_id="${3:-$(date +%s)-$$}"

    log_info "Starting safe edit workflow for: $file_path"
    log_info "Edit command: $edit_command"
    log_info "Agent ID: $agent_id"

    # Validate file access
    if ! validate_file_access "$file_path"; then
        return 1
    fi

    # Create pre-edit backup
    log_info "Creating pre-edit backup..."
    local backup_output
    if ! backup_output=$(create_backup "$file_path" "$agent_id" 2>&1); then
        log_error "Failed to create backup: $backup_output"
        return 1
    fi

    # Parse backup output to get backup path (first line is the path)
    local backup_path
    backup_path=$(echo "$backup_output" | head -n1 | tr -d '\r\n')

    # Generate backup ID from timestamp and hash
    local backup_id
    backup_id=$(basename "$backup_path" | cut -d'_' -f1-2)

    if [[ -z "$backup_id" || -z "$backup_path" ]]; then
        log_error "Could not parse backup information"
        return 1
    fi

    # Execute edit command
    log_info "Executing edit command..."
    local edit_result=0
    if ! eval "$edit_command"; then
        edit_result=$?
        log_error "Edit command failed with exit code: $edit_result"

        # Rollback on edit failure
        log_warn "Rolling back due to edit failure..."
        rollback_file "$file_path" "$backup_path"

        return $edit_result
    fi

    # Run post-edit validation
    log_info "Running post-edit validation..."
    local validation_output
    local validation_result=0

    # Run validation
    if validation_output=$(run_post_edit_validation "$file_path" "$agent_id" 2>&1); then
        validation_result=0
    else
        validation_result=$?
    fi

    # Handle validation result
    if [[ $validation_result -ne 0 ]]; then
        log_warn "Post-edit validation failed: $validation_output"

        # Check if we should rollback
        if should_rollback "$validation_output"; then
            log_warn "Rolling back due to validation failure..."
            rollback_file "$file_path" "$backup_path"
            return 1
        else
            log_warn "Validation failed but proceeding with changes"
        fi
    else
        log_info "Post-edit validation passed"
    fi

    # Clean up backup on success
    log_info "Cleaning up backup..."
    cleanup_backup "$backup_id" "$backup_path"

    log_info "Safe edit workflow completed successfully"
    return 0
}

# Rollback file from backup (used internally by safe_edit's own
# failure-path revert; operates on a known backup_path directly, no
# registry lookup involved).
rollback_file() {
    local file_path="$1"
    local backup_path="$2"

    if [[ ! -f "$backup_path" ]]; then
        log_error "Backup file not found: $backup_path"
        return 1
    fi

    log_info "Rolling back $file_path from $backup_path"

    if cp "$backup_path" "$file_path"; then
        log_info "Rollback completed successfully"
        return 0
    else
        log_error "Rollback failed"
        return 1
    fi
}

# Determine if rollback should occur based on validation output
should_rollback() {
    local validation_output="$1"

    # If validation script wasn't found, don't rollback by default
    if echo "$validation_output" | grep -q "Post-edit validation script not found"; then
        log_info "Validation script not available, proceeding without rollback"
        return 1
    fi

    # Check for critical errors that require rollback
    if echo "$validation_output" | grep -qi "critical\|error\|failed"; then
        # Check for auto-resolution availability
        if echo "$validation_output" | grep -qi "auto-resolve.*available"; then
            log_info "Auto-resolution available, not rolling back"
            return 1
        fi

        # Check for file not found errors (likely validation infrastructure issue)
        if echo "$validation_output" | grep -qi "file not found\|script not found"; then
            log_info "Validation infrastructure issue detected, proceeding without rollback"
            return 1
        fi

        # Default to rollback on critical errors
        return 0
    fi

    return 1
}

# List backups for a single file. Delegates to restore.sh --list, which
# already resolves matching backups newest-first with the real backups root.
list_file_backups() {
    local file_path="$1"
    local agent_id="$2"

    if [[ -n "$agent_id" ]]; then
        "$RESTORE_SH" --list "$file_path" --agent-id "$agent_id"
    else
        "$RESTORE_SH" --list "$file_path"
    fi
}

# List every backup under BACKUPS_ROOT (optionally scoped to one agent), for
# the no-file-given form of the "list" subcommand. restore.sh deliberately
# does not support this mode itself (its --list contract requires a file
# path), so this stays a thin listing here rather than growing a second
# implementation of restore/cleanup logic.
list_all_backups() {
    local agent_filter="$1"
    local search_root="$BACKUPS_ROOT"
    if [[ -n "$agent_filter" ]]; then
        search_root="$BACKUPS_ROOT/$agent_filter"
    fi

    if [[ ! -d "$search_root" ]]; then
        echo "No backups found under: $search_root" >&2
        return 2
    fi

    local -a entries=()
    local meta d raw ts
    while IFS= read -r -d '' meta; do
        d="$(dirname -- "$meta")"
        raw="$(jq -r '.timestamp // "0"' "$meta" 2>/dev/null || echo 0)"
        if [[ "$raw" =~ ^[0-9]{13}$ ]]; then
            ts=$(( raw / 1000 ))
        elif [[ "$raw" =~ ^[0-9]+$ ]]; then
            ts="$raw"
        else
            ts=0
        fi
        entries+=("$ts"$'\t'"$d")
    done < <(find "$search_root" -type f -name 'metadata.json' -print0 2>/dev/null)

    if [[ ${#entries[@]} -eq 0 ]]; then
        echo "No backups found under: $search_root" >&2
        return 2
    fi

    local line dir id created agent orig
    while IFS= read -r line; do
        dir="${line#*$'\t'}"
        id="$(basename -- "$dir")"
        created="$(jq -r '.created_at // "unknown"' "$dir/metadata.json" 2>/dev/null || echo unknown)"
        agent="$(jq -r '.agent_id // "unknown"' "$dir/metadata.json" 2>/dev/null || echo unknown)"
        orig="$(jq -r '.original_file // "unknown"' "$dir/metadata.json" 2>/dev/null || echo unknown)"
        printf '%s\tcreated_at=%s\tagent_id=%s\toriginal_file=%s\n' "$id" "$created" "$agent" "$orig"
    done < <(printf '%s\n' "${entries[@]}" | sort -t "$(printf '\t')" -k1,1nr)

    return 0
}

# "list" subcommand entry point: a bare file path (no leading --) scopes the
# listing to that file via restore.sh; no file path lists everything.
list_cmd() {
    local file_path="" agent_id=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --agent-id)
                if [[ $# -lt 2 ]]; then
                    echo "Error: --agent-id requires a value" >&2
                    return 1
                fi
                agent_id="$2"
                shift 2
                ;;
            --*)
                echo "Error: unknown flag for list: $1" >&2
                return 1
                ;;
            *)
                file_path="$1"
                shift
                ;;
        esac
    done

    if [[ -n "$file_path" ]]; then
        list_file_backups "$file_path" "$agent_id"
    else
        list_all_backups "$agent_id"
    fi
}

# Main CLI handler
main() {
    init_workspace

    local command="${1:-}"
    shift || true

    case "$command" in
        "edit")
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 edit <file_path> <edit_command> [agent_id]"
                exit 1
            fi
            safe_edit "$@"
            ;;
        "rollback")
            if [[ $# -lt 1 ]]; then
                echo "Usage: $0 rollback <file_path> [--agent-id ID] [--dry-run] [--force]"
                exit 1
            fi
            "$RESTORE_SH" --file "$@"
            ;;
        "list")
            list_cmd "$@"
            ;;
        "cleanup")
            "$CLEANUP_SH" "$@"
            ;;
        *)
            cat << EOF
Edit Safety - Unified Edit Safety Workflow

USAGE:
    $0 edit <file_path> <edit_command> [agent_id]
        Execute a safe edit with backup and validation

    $0 rollback <file_path> [--agent-id ID] [--dry-run] [--force]
        Restore a file from its newest matching backup
        (delegates to lib/backup/restore.sh --file)

    $0 list [file_path] [--agent-id ID]
        List backups for one file (newest first), or every backup under
        the backups root when no file_path is given
        (delegates to lib/backup/restore.sh --list for the single-file form)

    $0 cleanup [--older-than DAYS] [--keep-latest N] [--agent-id ID]
               [--apply] [--prune-orphans] [--json]
        Report (default) or reclaim (--apply) space from old backups
        (delegates to lib/backup/cleanup.sh)

EXAMPLES:
    # Safe edit with automatic backup and validation
    $0 edit /path/to/file.txt "sed -i 's/old/new/g' file.txt"

    # Safe edit with custom agent ID
    $0 edit /path/to/file.py "cp new.py file.py" "agent-123"

    # Rollback a file to its newest backup
    $0 rollback /path/to/file.txt

    # List backups for one file
    $0 list /path/to/file.txt

    # List every backup on record
    $0 list

    # See what cleanup would remove (dry run, the default)
    $0 cleanup

    # Actually reclaim space
    $0 cleanup --apply

ENVIRONMENT:
    EDIT_SAFETY_WORKSPACE    Log directory (default: /tmp/edit-safety)
    CFN_BACKUP_ROOT          Override the backups root (default: <repo_root>/.backups)

EOF
            exit 1
            ;;
    esac
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
