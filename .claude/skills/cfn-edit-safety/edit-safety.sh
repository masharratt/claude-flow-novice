#!/bin/bash
# Edit Safety Main Workflow
# Coordinates backup, edit, and validation with rollback capability

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
BACKUP_DIR="$LIB_DIR/backup"
HOOKS_DIR="$LIB_DIR/hooks"
CLI_DIR="$SCRIPT_DIR/cli"

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

# Function to clean up backup
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
BACKUP_REGISTRY="$EDIT_SAFETY_WORKSPACE/backup-registry.json"
ROLLBACK_MODE="false"

# Initialize workspace
init_workspace() {
    mkdir -p "$EDIT_SAFETY_WORKSPACE"

    # Initialize backup registry
    if [[ ! -f "$BACKUP_REGISTRY" ]]; then
        echo "{}" > "$BACKUP_REGISTRY"
    fi

    # Initialize log
    touch "$EDIT_SAFETY_LOG"
    log_info "Edit safety workspace initialized at $EDIT_SAFETY_WORKSPACE"
}

# Logging functions
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $*" | tee -a "$EDIT_SAFETY_LOG"
}

log_warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $*" | tee -a "$EDIT_SAFETY_LOG"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" | tee -a "$EDIT_SAFETY_LOG"
}

# Register backup for tracking
register_backup() {
    local file_path="$1"
    local backup_id="$2"
    local backup_path="$3"

    local temp_registry
    temp_registry=$(jq --arg file "$file_path" \
                      --arg id "$backup_id" \
                      --arg path "$backup_path" \
                      --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                      '. + {($file): {id: $id, path: $path, timestamp: $timestamp}}' \
                      "$BACKUP_REGISTRY")

    echo "$temp_registry" > "$BACKUP_REGISTRY"
    log_info "Registered backup: $file_path -> $backup_path"
}

# Get backup info from registry
get_backup_info() {
    local file_path="$1"
    jq -r ".\"$file_path\" // empty" "$BACKUP_REGISTRY"
}

# Remove backup from registry
unregister_backup() {
    local file_path="$1"
    local temp_registry
    temp_registry=$(jq --arg file "$file_path" 'del(.[$file])' "$BACKUP_REGISTRY")
    echo "$temp_registry" > "$BACKUP_REGISTRY"
    log_info "Unregistered backup for: $file_path"
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

    # Register backup
    register_backup "$file_path" "$backup_id" "$backup_path"

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
    unregister_backup "$file_path"

    log_info "Safe edit workflow completed successfully"
    return 0
}

# Rollback file from backup
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

# List all registered backups
list_backups() {
    echo "Registered Backups:"
    jq -r 'to_entries[] | "- \(.key): \(.value.id) at \(.value.path) (\(.value.timestamp))"' "$BACKUP_REGISTRY"
}

# Cleanup function
cleanup() {
    log_info "Performing cleanup..."

    # Clean up old backups (older than 7 days)
    find "$EDIT_SAFETY_WORKSPACE" -name "backup-*.tar.gz" -mtime +7 -delete 2>/dev/null || true

    log_info "Cleanup completed"
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
                echo "Usage: $0 rollback <file_path>"
                exit 1
            fi
            local backup_info
            backup_info=$(get_backup_info "$1")
            if [[ -n "$backup_info" ]]; then
                local backup_path
                backup_path=$(echo "$backup_info" | jq -r '.path')
                rollback_file "$1" "$backup_path"
            else
                echo "No backup found for: $1"
                exit 1
            fi
            ;;
        "list")
            list_backups
            ;;
        "cleanup")
            cleanup
            ;;
        *)
            cat << EOF
Edit Safety - Unified Edit Safety Workflow

USAGE:
    $0 edit <file_path> <edit_command> [agent_id]
        Execute a safe edit with backup and validation

    $0 rollback <file_path>
        Rollback a file to its last backup

    $0 list
        List all registered backups

    $0 cleanup
        Clean up old backups and temporary files

EXAMPLES:
    # Safe edit with automatic backup and validation
    $0 edit /path/to/file.txt "sed -i 's/old/new/g' file.txt"

    # Safe edit with custom agent ID
    $0 edit /path/to/file.py "cp new.py file.py" "agent-123"

    # Rollback a failed edit
    $0 rollback /path/to/file.txt

    # List all backups
    $0 list

ENVIRONMENT:
    EDIT_SAFETY_WORKSPACE    Workspace directory (default: /tmp/edit-safety)

EOF
            exit 1
            ;;
    esac
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi