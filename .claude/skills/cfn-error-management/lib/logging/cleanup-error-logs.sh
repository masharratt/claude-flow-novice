#!/usr/bin/env bash

##############################################################################
# CFN Error Logging - Cleanup and Management Script
# Version: 1.0.0
#
# Automated cleanup and management for CFN error logs
# Manages log rotation, compression, and retention policies
#
# Usage: ./cleanup-error-logs.sh [--retention-days 7] [--dry-run] [--force]
##############################################################################

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Configuration
LOG_BASE_DIR="/tmp/cfn_error_logs"
DEFAULT_RETENTION_DAYS=7
MAX_TOTAL_SIZE_MB=100
COMPRESS_THRESHOLD_DAYS=1

# Parse arguments
RETENTION_DAYS="$DEFAULT_RETENTION_DAYS"
DRY_RUN=false
FORCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --help|-h)
      cat << EOF
CFN Error Logging - Cleanup Script

Usage: $0 [OPTIONS]

Options:
  --retention-days N    Delete logs older than N days (default: 7)
  --dry-run            Show what would be deleted without actually deleting
  --force              Skip confirmation prompts
  --help, -h           Show this help message

Examples:
  $0                           # Standard cleanup (7-day retention)
  $0 --retention-days 3        # Delete logs older than 3 days
  $0 --dry-run                 # Preview what would be deleted
  $0 --force --retention-days 1 # Force delete logs older than 1 day
EOF
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Logging function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Ensure base directory exists
mkdir -p "$LOG_BASE_DIR"

# Get current disk usage of error logs
get_disk_usage() {
  if command -v du >/dev/null 2>&1; then
    du -sm "$LOG_BASE_DIR" 2>/dev/null | cut -f1 || echo "0"
  else
    echo "0"
  fi
}

# Get total size in MB with detailed breakdown
get_size_breakdown() {
  local total_size=0
  local error_logs=0
  local reports=0
  local compressed=0
  local other=0

  if [ -d "$LOG_BASE_DIR" ]; then
    # Error logs
    if [ -d "$LOG_BASE_DIR/logs" ]; then
      error_logs=$(du -sm "$LOG_BASE_DIR/logs" 2>/dev/null | cut -f1 || echo "0")
    fi

    # Reports
    if [ -d "$LOG_BASE_DIR/reports" ]; then
      reports=$(du -sm "$LOG_BASE_DIR/reports" 2>/dev/null | cut -f1 || echo "0")
    fi

    # Compressed logs
    if [ -d "$LOG_BASE_DIR/compressed" ]; then
      compressed=$(du -sm "$LOG_BASE_DIR/compressed" 2>/dev/null | cut -f1 || echo "0")
    fi

    # Other files
    other=$(du -sm "$LOG_BASE_DIR" 2>/dev/null | cut -f1 || echo "0")
    total_size=$((error_logs + reports + compressed + other))
  fi

  echo "$total_size,$error_logs,$reports,$compressed,$other"
}

# List files to be deleted
list_files_to_delete() {
  local cutoff_date
  cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%s 2>/dev/null || date -v-"$RETENTION_DAYS"d +%s)

  find "$LOG_BASE_DIR" -type f -name "*.json" -o -name "*.md" -o -name "*.txt" | while read -r file; do
    local file_date
    file_date=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null || echo "0")

    if [ "$file_date" -lt "$cutoff_date" ]; then
      echo "$file"
    fi
  done
}

# Compress old logs
compress_old_logs() {
  local cutoff_date
  cutoff_date=$(date -d "$COMPRESS_THRESHOLD_DAYS days ago" +%s 2>/dev/null || date -v-"$COMPRESS_THRESHOLD_DAYS"d +%s)

  mkdir -p "$LOG_BASE_DIR/compressed"

  log "🗜️ Compressing logs older than $COMPRESS_THRESHOLD_DAYS days..."

  local compressed_count=0
  find "$LOG_BASE_DIR" -type f -name "*.json" -not -path "*/compressed/*" | while read -r file; do
    local file_date
    file_date=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null || echo "0")

    if [ "$file_date" -lt "$cutoff_date" ]; then
      local basename
      basename=$(basename "$file" .json)
      local compressed_file="$LOG_BASE_DIR/compressed/${basename}.json.gz"

      if [ ! -f "$compressed_file" ]; then
        if gzip -c "$file" > "$compressed_file" 2>/dev/null; then
          if [ "$DRY_RUN" != true ]; then
            rm -f "$file"
          fi
          compressed_count=$((compressed_count + 1))
          log "  Compressed: $(basename "$file") → $(basename "$compressed_file")"
        fi
      fi
    fi
  done

  if [ "$compressed_count" -gt 0 ]; then
    log "✅ Compressed $compressed_count log files"
  else
    log "ℹ️ No files needed compression"
  fi
}

# Delete empty directories
cleanup_empty_dirs() {
  if [ "$DRY_RUN" != true ]; then
    find "$LOG_BASE_DIR" -type d -empty -delete 2>/dev/null || true
  fi
}

# Show cleanup summary
show_summary() {
  local before_size="$1"
  local after_size="$2"
  local files_deleted="$3"

  local size_saved=$((before_size - after_size))

  echo ""
  echo "📊 Cleanup Summary:"
  echo "  Files deleted: $files_deleted"
  echo "  Space saved: ${size_saved}MB"
  echo "  Current usage: ${after_size}MB"

  if [ "$after_size" -gt "$MAX_TOTAL_SIZE_MB" ]; then
    echo "  ⚠️  Warning: Error logs still exceed recommended size (${MAX_TOTAL_SIZE_MB}MB)"
    echo "  Consider running with --retention-days $(($RETENTION_DAYS - 1)) to reduce further"
  fi
}

# Main cleanup function
run_cleanup() {
  log "🧹 Starting CFN error log cleanup (retention: $RETENTION_DAYS days)"

  # Get initial size
  local size_breakdown
  size_breakdown=$(get_size_breakdown)
  local before_size
  before_size=$(echo "$size_breakdown" | cut -d, -f1)

  log "📊 Current disk usage: ${before_size}MB"

  if [ "$before_size" -eq 0 ]; then
    log "ℹ️ No error logs found to clean up"
    return 0
  fi

  # Show size breakdown
  local error_logs reports compressed other
  IFS=, read -r error_logs reports compressed other <<< "$size_breakdown"

  log "📁 Size breakdown:"
  if [ "$error_logs" -gt 0 ]; then
    log "  Error logs: ${error_logs}MB"
  fi
  if [ "$reports" -gt 0 ]; then
    log "  Reports: ${reports}MB"
  fi
  if [ "$compressed" -gt 0 ]; then
    log "  Compressed: ${compressed}MB"
  fi
  if [ "$other" -gt 0 ]; then
    log "  Other: ${other}MB"
  fi

  # Compress old logs first
  compress_old_logs

  # List files to delete
  local files_to_delete
  files_to_delete=$(list_files_to_delete)

  if [ -z "$files_to_delete" ]; then
    log "ℹ️ No files older than $RETENTION_DAYS days found"

    # Show final size after compression
    local final_size
    final_size=$(get_disk_usage)

    if [ "$before_size" -ne "$final_size" ]; then
      show_summary "$before_size" "$final_size" "0"
    fi

    cleanup_empty_dirs
    return 0
  fi

  local file_count
  file_count=$(echo "$files_to_delete" | wc -l)

  log "📋 Found $file_count files older than $RETENTION_DAYS days:"

  if [ "$DRY_RUN" = true ]; then
    echo "$files_to_delete" | head -10 | while read -r file; do
      log "  Would delete: $(basename "$file") ($(du -sh "$file" 2>/dev/null | cut -f1 || echo "unknown"))"
    done

    if [ "$file_count" -gt 10 ]; then
      log "  ... and $((file_count - 10)) more files"
    fi

    log "🔍 DRY RUN - No files were actually deleted"
  else
    # Show sample of files to be deleted
    echo "$files_to_delete" | head -5 | while read -r file; do
      log "  Deleting: $(basename "$file") ($(du -sh "$file" 2>/dev/null | cut -f1 || echo "unknown"))"
    done

    if [ "$file_count" -gt 5 ]; then
      log "  ... and $((file_count - 5)) more files"
    fi

    # Confirmation prompt (unless forced)
    if [ "$FORCE" != true ]; then
      echo ""
      read -p "Delete these $file_count files? [y/N] " -n 1 -r
      echo ""

      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "❌ Cancelled by user"
        return 0
      fi
    fi

    # Delete files
    local deleted_count=0
    echo "$files_to_delete" | while read -r file; do
      if rm -f "$file" 2>/dev/null; then
        deleted_count=$((deleted_count + 1))
      fi
    done

    log "✅ Deleted $deleted_count files"
  fi

  # Clean up empty directories
  cleanup_empty_dirs

  # Get final size
  local after_size
  after_size=$(get_disk_usage)

  show_summary "$before_size" "$after_size" "$file_count"

  log "✅ Cleanup completed"
}

# Check if running as root (warn about permission issues)
if [ "$EUID" -eq 0 ]; then
  log "⚠️ Running as root - this may affect log ownership"
fi

# Check disk space before cleanup
local available_space
available_space=$(df "$LOG_BASE_DIR" 2>/dev/null | awk 'NR==2{print int($4/1024)}' || echo "0")

if [ "$available_space" -lt 50 ]; then
  log "⚠️ Low disk space (${available_space}MB available) - forcing cleanup"
  FORCE=true
fi

# Run cleanup
run_cleanup

# Log cleanup completion to system log if possible
if command -v logger >/dev/null 2>&1; then
  logger -t "cfn-error-logging" "Cleanup completed: retention=${RETENTION_DAYS}d, deleted=${file_count:-0} files"
fi