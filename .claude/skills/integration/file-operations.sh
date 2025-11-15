#!/usr/bin/env bash
# file-operations.sh - Standard file operation patterns
#
# Features:
# - Atomic writes (temp → final)
# - Content hashing (SHA256)
# - Backup/restore (with metadata)
# - Validation hooks (pre/post)
#
# Usage:
#   source file-operations.sh
#   file_write_atomic "/path/to/file" "content" "task-123" "agent-456"
#   file_backup "/path/to/file" "task-123" "agent-456"
#   file_restore "/path/to/file" "backup-id"
#   file_validate "/path/to/file" "expected-hash"

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./.backups}"
TEMP_DIR="${TEMP_DIR:-/tmp/file-ops}"
LOG_FILE="${LOG_FILE:-/tmp/file-operations.log}"

# Ensure directories exist
mkdir -p "$BACKUP_DIR" "$TEMP_DIR"

# --- Logging Functions ---

log_structured() {
    local level="$1"
    local message="$2"
    shift 2
    local context="$*"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local log_entry
    log_entry=$(cat <<EOF
{"level":"$level","message":"$message","timestamp":"$timestamp"${context:+,"context":$context}}
EOF
    )

    echo "$log_entry" >> "$LOG_FILE"

    # Also output to stderr for visibility
    if [[ "$level" == "ERROR" ]] || [[ "$level" == "WARN" ]]; then
        echo "$log_entry" >&2
    fi
}

log_info() {
    log_structured "INFO" "$1" "${2:-}"
}

log_warn() {
    log_structured "WARN" "$1" "${2:-}"
}

log_error() {
    log_structured "ERROR" "$1" "${2:-}"
}

log_debug() {
    log_structured "DEBUG" "$1" "${2:-}"
}

# --- Content Hashing ---

# Generate SHA256 hash of file content
# Args: $1=file_path
# Returns: hex hash string
file_hash() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        log_error "Cannot hash non-existent file" "{\"file\":\"$file_path\"}"
        return 1
    fi

    local hash
    hash=$(sha256sum "$file_path" | awk '{print $1}')

    log_debug "File hash generated" "{\"file\":\"$file_path\",\"hash\":\"$hash\"}"
    echo "$hash"
}

# Verify file hash matches expected value
# Args: $1=file_path, $2=expected_hash
# Returns: 0 if match, 1 if mismatch
file_verify_hash() {
    local file_path="$1"
    local expected_hash="$2"

    local actual_hash
    actual_hash=$(file_hash "$file_path")

    if [[ "$actual_hash" != "$expected_hash" ]]; then
        log_error "Hash mismatch" "{\"file\":\"$file_path\",\"expected\":\"$expected_hash\",\"actual\":\"$actual_hash\"}"
        return 1
    fi

    log_info "Hash verification passed" "{\"file\":\"$file_path\",\"hash\":\"$actual_hash\"}"
    return 0
}

# --- Atomic File Operations ---

# Atomic file write: write to temp, then move to final location
# Args: $1=file_path, $2=content, $3=task_id, $4=agent_id
# Returns: content hash
file_write_atomic() {
    local file_path="$1"
    local content="$2"
    local task_id="${3:-unknown}"
    local agent_id="${4:-unknown}"

    local file_dir
    file_dir=$(dirname "$file_path")

    local file_name
    file_name=$(basename "$file_path")

    # Create directory if it doesn't exist
    mkdir -p "$file_dir"

    # Generate temp file with correlation ID
    local temp_file
    temp_file="${TEMP_DIR}/${task_id}-${agent_id}-${file_name}.tmp"

    # Pre-write hook (if exists)
    if [[ -n "${FILE_OP_PRE_WRITE_HOOK:-}" ]] && [[ -x "$FILE_OP_PRE_WRITE_HOOK" ]]; then
        log_debug "Executing pre-write hook" "{\"hook\":\"$FILE_OP_PRE_WRITE_HOOK\"}"
        "$FILE_OP_PRE_WRITE_HOOK" "$file_path" "$task_id" "$agent_id" || {
            log_error "Pre-write hook failed" "{\"hook\":\"$FILE_OP_PRE_WRITE_HOOK\"}"
            return 1
        }
    fi

    # Write to temp file
    echo "$content" > "$temp_file"

    # Generate hash
    local content_hash
    content_hash=$(file_hash "$temp_file")

    # Atomic move
    mv "$temp_file" "$file_path"

    log_info "Atomic write completed" "{\"file\":\"$file_path\",\"hash\":\"$content_hash\",\"task_id\":\"$task_id\",\"agent_id\":\"$agent_id\"}"

    # Post-write hook (if exists)
    if [[ -n "${FILE_OP_POST_WRITE_HOOK:-}" ]] && [[ -x "$FILE_OP_POST_WRITE_HOOK" ]]; then
        log_debug "Executing post-write hook" "{\"hook\":\"$FILE_OP_POST_WRITE_HOOK\"}"
        "$FILE_OP_POST_WRITE_HOOK" "$file_path" "$task_id" "$agent_id" || {
            log_warn "Post-write hook failed" "{\"hook\":\"$FILE_OP_POST_WRITE_HOOK\"}"
            # Don't fail the operation, just warn
        }
    fi

    echo "$content_hash"
}

# --- Backup and Restore ---

# Backup file with metadata
# Args: $1=file_path, $2=task_id, $3=agent_id
# Returns: backup_id
file_backup() {
    local file_path="$1"
    local task_id="${2:-unknown}"
    local agent_id="${3:-unknown}"

    if [[ ! -f "$file_path" ]]; then
        log_error "Cannot backup non-existent file" "{\"file\":\"$file_path\"}"
        return 1
    fi

    # Generate backup ID
    local timestamp
    timestamp=$(date +%s)
    local backup_id="${task_id}-${agent_id}-${timestamp}"

    local file_hash_val
    file_hash_val=$(file_hash "$file_path")

    # Create backup directory structure
    local backup_path="${BACKUP_DIR}/${task_id}/${backup_id}"
    mkdir -p "$backup_path"

    # Copy file
    local file_name
    file_name=$(basename "$file_path")
    cp "$file_path" "${backup_path}/${file_name}"

    # Create metadata file
    cat > "${backup_path}/metadata.json" <<EOF
{
  "backup_id": "$backup_id",
  "task_id": "$task_id",
  "agent_id": "$agent_id",
  "original_path": "$file_path",
  "file_name": "$file_name",
  "content_hash": "$file_hash_val",
  "backup_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "file_size": $(stat -c%s "$file_path")
}
EOF

    log_info "File backed up" "{\"file\":\"$file_path\",\"backup_id\":\"$backup_id\",\"hash\":\"$file_hash_val\"}"

    echo "$backup_id"
}

# Restore file from backup
# Args: $1=file_path, $2=backup_id
# Returns: 0 on success
file_restore() {
    local file_path="$1"
    local backup_id="$2"

    # Find backup (search all task directories)
    local backup_path
    backup_path=$(find "$BACKUP_DIR" -type d -name "$backup_id" | head -1)

    if [[ -z "$backup_path" ]]; then
        log_error "Backup not found" "{\"backup_id\":\"$backup_id\"}"
        return 1
    fi

    local metadata_file="${backup_path}/metadata.json"
    if [[ ! -f "$metadata_file" ]]; then
        log_error "Backup metadata missing" "{\"backup_id\":\"$backup_id\"}"
        return 1
    fi

    # Extract metadata
    local file_name
    file_name=$(jq -r '.file_name' "$metadata_file")

    local expected_hash
    expected_hash=$(jq -r '.content_hash' "$metadata_file")

    local backup_file="${backup_path}/${file_name}"

    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file missing" "{\"backup_id\":\"$backup_id\",\"file\":\"$backup_file\"}"
        return 1
    fi

    # Verify backup integrity
    if ! file_verify_hash "$backup_file" "$expected_hash"; then
        log_error "Backup integrity check failed" "{\"backup_id\":\"$backup_id\"}"
        return 1
    fi

    # Restore file (atomic)
    local temp_file="${TEMP_DIR}/restore-${backup_id}.tmp"
    cp "$backup_file" "$temp_file"
    mv "$temp_file" "$file_path"

    log_info "File restored from backup" "{\"file\":\"$file_path\",\"backup_id\":\"$backup_id\"}"

    return 0
}

# List backups for a file or task
# Args: $1=task_id
# Returns: JSON array of backups
file_list_backups() {
    local task_id="$1"

    local task_backup_dir="${BACKUP_DIR}/${task_id}"

    if [[ ! -d "$task_backup_dir" ]]; then
        echo "[]"
        return 0
    fi

    local backups=()

    for backup_dir in "$task_backup_dir"/*; do
        if [[ -f "${backup_dir}/metadata.json" ]]; then
            backups+=("$(cat "${backup_dir}/metadata.json")")
        fi
    done

    # Combine into JSON array
    if [[ ${#backups[@]} -eq 0 ]]; then
        echo "[]"
    else
        printf '%s\n' "${backups[@]}" | jq -s '.'
    fi
}

# --- Validation ---

# Validate file exists and optionally check hash
# Args: $1=file_path, $2=expected_hash (optional)
# Returns: 0 if valid
file_validate() {
    local file_path="$1"
    local expected_hash="${2:-}"

    if [[ ! -f "$file_path" ]]; then
        log_error "File validation failed: file not found" "{\"file\":\"$file_path\"}"
        return 1
    fi

    # Check readability
    if [[ ! -r "$file_path" ]]; then
        log_error "File validation failed: not readable" "{\"file\":\"$file_path\"}"
        return 1
    fi

    # Check hash if provided
    if [[ -n "$expected_hash" ]]; then
        if ! file_verify_hash "$file_path" "$expected_hash"; then
            return 1
        fi
    fi

    log_info "File validation passed" "{\"file\":\"$file_path\"}"
    return 0
}

# --- Cleanup ---

# Clean up old backups (older than N days)
# Args: $1=retention_days (default: 7)
# Returns: count of deleted backups
file_cleanup_backups() {
    local retention_days="${1:-7}"

    log_info "Starting backup cleanup" "{\"retention_days\":$retention_days}"

    local deleted_count=0

    # Find backup directories older than retention period
    while IFS= read -r -d '' backup_dir; do
        local metadata_file="${backup_dir}/metadata.json"

        if [[ -f "$metadata_file" ]]; then
            local backup_timestamp
            backup_timestamp=$(jq -r '.backup_timestamp' "$metadata_file")

            local backup_age_seconds
            backup_age_seconds=$(( $(date +%s) - $(date -d "$backup_timestamp" +%s) ))

            local retention_seconds=$((retention_days * 86400))

            if [[ $backup_age_seconds -gt $retention_seconds ]]; then
                local backup_id
                backup_id=$(jq -r '.backup_id' "$metadata_file")

                rm -rf "$backup_dir"
                log_info "Deleted old backup" "{\"backup_id\":\"$backup_id\",\"age_days\":$((backup_age_seconds / 86400))}"
                ((deleted_count++))
            fi
        fi
    done < <(find "$BACKUP_DIR" -type d -name "*-*-*" -print0)

    log_info "Backup cleanup completed" "{\"deleted_count\":$deleted_count}"

    echo "$deleted_count"
}

# --- Main Execution (if run directly) ---

# Example usage if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cat <<'EOF'
file-operations.sh - Standard file operation patterns

USAGE EXAMPLES:

# Atomic write
file_write_atomic "/tmp/test.txt" "Hello, World!" "task-123" "agent-456"

# Backup
backup_id=$(file_backup "/tmp/test.txt" "task-123" "agent-456")

# Restore
file_restore "/tmp/test.txt" "$backup_id"

# Validate
file_validate "/tmp/test.txt"

# List backups
file_list_backups "task-123"

# Cleanup old backups (older than 7 days)
file_cleanup_backups 7

HOOKS:
Set environment variables to enable pre/post-write hooks:

  export FILE_OP_PRE_WRITE_HOOK="/path/to/pre-write.sh"
  export FILE_OP_POST_WRITE_HOOK="/path/to/post-write.sh"

CONFIGURATION:
  BACKUP_DIR   - Backup storage directory (default: ./.backups)
  TEMP_DIR     - Temporary file directory (default: /tmp/file-ops)
  LOG_FILE     - Structured log file (default: /tmp/file-operations.log)

BEFORE (Ad-hoc):
  echo "content" > /tmp/file.txt  # ❌ No atomicity, no backup, no verification

AFTER (Standardized):
  file_write_atomic "/tmp/file.txt" "content" "task-123" "agent-456"  # ✅ Atomic, logged, hash verified
  backup_id=$(file_backup "/tmp/file.txt" "task-123" "agent-456")     # ✅ Recoverable

EOF
fi
