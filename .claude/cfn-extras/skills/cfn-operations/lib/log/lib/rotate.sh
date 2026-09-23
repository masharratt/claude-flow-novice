#!/usr/bin/env bash
################################################################################
# CFN Log Operations - Rotation and Cleanup Library
# Task 4.4: Distributed Logging Standardization
#
# Provides log rotation, compression, and retention utilities
#
################################################################################

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default paths and settings
LOG_DIR="${LOG_DIR:-/var/log/cfn}"
MAX_SIZE="${MAX_SIZE:-100M}"
MAX_FILES="${MAX_FILES:-10}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESS_LEVEL="${COMPRESS_LEVEL:-6}"

################################################################################
# Logging Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

################################################################################
# Size Conversion Functions
################################################################################

# Convert size string (e.g., 100M, 1G) to bytes
convert_to_bytes() {
    local size="$1"

    if [[ "$size" =~ ^([0-9]+)([KMG])$ ]]; then
        local num="${BASH_REMATCH[1]}"
        local unit="${BASH_REMATCH[2]}"

        case "$unit" in
            K) echo $((num * 1024)) ;;
            M) echo $((num * 1024 * 1024)) ;;
            G) echo $((num * 1024 * 1024 * 1024)) ;;
        esac
    else
        echo "$size"
    fi
}

# Format bytes to human readable
format_bytes() {
    local bytes=$1

    if [ "$bytes" -lt 1024 ]; then
        echo "${bytes}B"
    elif [ "$bytes" -lt $((1024 * 1024)) ]; then
        echo "$((bytes / 1024))KB"
    elif [ "$bytes" -lt $((1024 * 1024 * 1024)) ]; then
        echo "$((bytes / 1024 / 1024))MB"
    else
        echo "$((bytes / 1024 / 1024 / 1024))GB"
    fi
}

################################################################################
# Rotation Functions
################################################################################

# Rotate a single log file
rotate_file() {
    local log_file="$1"
    local max_size_bytes=$(convert_to_bytes "$MAX_SIZE")

    if [ ! -f "$log_file" ]; then
        return 0
    fi

    local current_size=$(stat -c%s "$log_file" 2>/dev/null || echo 0)

    # Check if rotation is needed
    if [ "$current_size" -lt "$max_size_bytes" ]; then
        return 0
    fi

    log_info "Rotating log file: $log_file ($(format_bytes $current_size))"

    local rotated_name="${log_file}.$(date +%Y%m%d-%H%M%S)"

    # Rotate file
    if [ -f "$log_file" ]; then
        mv "$log_file" "$rotated_name" || {
            log_error "Failed to rotate: $log_file"
            return 1
        }

        # Recreate log file
        touch "$log_file" || {
            log_error "Failed to recreate log file: $log_file"
            return 1
        }

        log_success "Rotated: $log_file -> $rotated_name"
    fi

    return 0
}

# Compress a log file
compress_file() {
    local log_file="$1"

    if [ ! -f "$log_file" ]; then
        return 0
    fi

    # Skip if already compressed
    if [[ "$log_file" =~ \.(gz|bz2|xz)$ ]]; then
        return 0
    fi

    log_info "Compressing: $log_file"

    gzip "-$COMPRESS_LEVEL" -f "$log_file" || {
        log_error "Failed to compress: $log_file"
        return 1
    }

    log_success "Compressed: ${log_file}.gz"
    return 0
}

# Clean up old rotated files
cleanup_old_files() {
    local log_dir="$1"
    local retention_days="${2:-30}"

    log_info "Cleaning up logs older than $retention_days days in $log_dir"

    local deleted_count=0

    # Find and delete old logs
    find "$log_dir" -name "*.log*" -type f -mtime "+$retention_days" 2>/dev/null | while IFS= read -r old_file; do
        log_info "Removing: $old_file"
        rm -f "$old_file" || log_error "Failed to remove: $old_file"
        ((deleted_count++))
    done

    log_success "Cleaned up $deleted_count old log files"
    return 0
}

# Enforce maximum number of rotated files
enforce_max_files() {
    local log_file="$1"
    local max_files="${2:-10}"
    local log_dir=$(dirname "$log_file")
    local log_name=$(basename "$log_file")

    # Find all rotated versions of this file
    local rotated_files=($(find "$log_dir" -name "${log_name}.*" -type f 2>/dev/null | sort -r))

    # Keep only max_files rotated versions
    local to_delete=$((${#rotated_files[@]} - max_files + 1))

    if [ "$to_delete" -gt 0 ]; then
        for ((i = 0; i < to_delete; i++)); do
            local file_to_delete="${rotated_files[$((max_files + i))]}"
            log_info "Removing excess rotated file: $file_to_delete"
            rm -f "$file_to_delete" || log_error "Failed to remove: $file_to_delete"
        done

        log_success "Enforced max files limit: kept $max_files rotated files"
    fi

    return 0
}

################################################################################
# Directory Rotation Functions
################################################################################

# Rotate all logs in a directory
rotate_directory() {
    local log_dir="$1"
    local recursive="${2:-false}"

    if [ ! -d "$log_dir" ]; then
        log_error "Directory not found: $log_dir"
        return 1
    fi

    log_info "Rotating logs in: $log_dir"

    local rotated_count=0
    local find_cmd="find $log_dir -name '*.log' -type f"

    if [ "$recursive" = true ]; then
        # Recursive search
        while IFS= read -r -d '' log_file; do
            if rotate_file "$log_file"; then
                ((rotated_count++))
            fi
        done < <(find "$log_dir" -name "*.log" -type f -print0 2>/dev/null)
    else
        # Non-recursive search
        while IFS= read -r -d '' log_file; do
            if rotate_file "$log_file"; then
                ((rotated_count++))
            fi
        done < <(find "$log_dir" -maxdepth 1 -name "*.log" -type f -print0 2>/dev/null)
    fi

    log_success "Rotated $rotated_count log files"
    return 0
}

# Compress all rotated logs in a directory
compress_directory() {
    local log_dir="$1"

    if [ ! -d "$log_dir" ]; then
        log_error "Directory not found: $log_dir"
        return 1
    fi

    log_info "Compressing logs in: $log_dir"

    local compressed_count=0

    # Find and compress rotated files (with timestamp in name)
    find "$log_dir" -name "*.log.*[0-9]*" -type f ! -name "*.gz" ! -name "*.bz2" ! -name "*.xz" 2>/dev/null | while IFS= read -r log_file; do
        if compress_file "$log_file"; then
            ((compressed_count++))
        fi
    done

    log_success "Compressed $compressed_count log files"
    return 0
}

################################################################################
# Maintenance Functions
################################################################################

# Perform full maintenance (rotate, compress, cleanup)
full_maintenance() {
    local log_dir="$1"
    local max_size="${2:-100M}"
    local max_files="${3:-10}"
    local retention_days="${4:-30}"
    local compress="${5:-true}"

    log_info "Starting full log maintenance on: $log_dir"

    # Update globals
    MAX_SIZE="$max_size"
    MAX_FILES="$max_files"
    RETENTION_DAYS="$retention_days"

    # 1. Rotate active logs
    rotate_directory "$log_dir" true || log_warn "Rotation completed with warnings"

    # 2. Compress rotated logs
    if [ "$compress" = true ]; then
        compress_directory "$log_dir" || log_warn "Compression completed with warnings"
    fi

    # 3. Enforce max files limit
    find "$log_dir" -name "*.log" -type f 2>/dev/null | while IFS= read -r log_file; do
        enforce_max_files "$log_file" "$MAX_FILES" || true
    done

    # 4. Cleanup old files
    cleanup_old_files "$log_dir" "$retention_days" || log_warn "Cleanup completed with warnings"

    # 5. Report statistics
    local total_size=0
    while IFS= read -r -d '' log_file; do
        ((total_size += $(stat -c%s "$log_file" 2>/dev/null || echo 0)))
    done < <(find "$log_dir" -name "*.log*" -type f -print0 2>/dev/null)

    log_success "Maintenance complete. Total log size: $(format_bytes $total_size)"
    return 0
}

################################################################################
# Main Rotation Command
################################################################################

rotate_logs() {
    local log_dir="$LOG_DIR"
    local max_size="100M"
    local max_files="10"
    local retention_days="30"
    local compress=false
    local force=false
    local dry_run=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --log-dir)
                log_dir="$2"
                shift 2
                ;;
            --max-size)
                max_size="$2"
                shift 2
                ;;
            --max-files)
                max_files="$2"
                shift 2
                ;;
            --retention-days)
                retention_days="$2"
                shift 2
                ;;
            --compress)
                compress=true
                shift
                ;;
            --force)
                force=true
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --help)
                echo "Manage log rotation and retention"
                echo "Usage: rotate_logs [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --log-dir DIR          Directory to rotate"
                echo "  --max-size SIZE        Maximum file size (e.g., 100M)"
                echo "  --max-files COUNT      Maximum rotated files to keep"
                echo "  --retention-days DAYS  Retention period"
                echo "  --compress             Compress rotated logs"
                echo "  --force                Force rotation"
                echo "  --dry-run              Simulate without taking action"
                return 0
                ;;
            *)
                log_error "Unknown option: $1"
                return 1
                ;;
        esac
    done

    # Validate directory
    if [ ! -d "$log_dir" ]; then
        log_error "Log directory not found: $log_dir"
        return 1
    fi

    if [ "$dry_run" = true ]; then
        log_info "DRY RUN MODE - No changes will be made"
    fi

    # Perform maintenance
    if [ "$dry_run" = true ]; then
        log_info "Would perform maintenance on: $log_dir"
        log_info "  Max size: $max_size"
        log_info "  Max files: $max_files"
        log_info "  Retention: $retention_days days"
        log_info "  Compression: $compress"
    else
        full_maintenance "$log_dir" "$max_size" "$max_files" "$retention_days" "$compress"
    fi

    return 0
}

# Export functions
export -f log_info
export -f log_error
export -f log_success
export -f log_warn
export -f convert_to_bytes
export -f format_bytes
export -f rotate_file
export -f compress_file
export -f cleanup_old_files
export -f enforce_max_files
export -f rotate_directory
export -f compress_directory
export -f full_maintenance
export -f rotate_logs
