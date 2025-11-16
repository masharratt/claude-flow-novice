#!/bin/bash

##############################################################################
# Unified Backup Cleanup Script
# Part of Task 4.3: Unified Backup & Restore System
# Version: 1.0.0
#
# Features:
# - Automated cleanup based on TTL
# - Configurable TTL per backup type
# - Manual cleanup with filters (agent, date, type)
# - Disk usage monitoring and reporting
# - Compression for old backups (>7 days)
# - Cleanup dry-run mode
# - Integration with SQLite metadata
#
# Usage:
#   ./scripts/backup-cleanup.sh [OPTIONS]
#
# Options:
#   --dry-run                Run in dry-run mode (no actual deletions)
#   --agent-id AGENT        Filter by agent ID
#   --backup-type TYPE      Filter by backup type (pre-edit, checkpoint, manual)
#   --older-than DAYS       Delete backups older than N days
#   --compress              Compress old backups instead of deleting
#   --compress-age DAYS     Compress backups older than N days (default: 7)
#   --force                 Skip confirmation prompts
#   --report                Show disk usage report only
#   --db-path PATH          Path to SQLite database
#   --backup-dir PATH       Path to backup directory
#   --verbose               Verbose output
#   --help                  Show this help message
#
# Examples:
#   # Show disk usage report
#   ./scripts/backup-cleanup.sh --report
#
#   # Delete expired backups (dry-run)
#   ./scripts/backup-cleanup.sh --dry-run
#
#   # Delete backups older than 30 days for specific agent
#   ./scripts/backup-cleanup.sh --agent-id backend-dev-001 --older-than 30
#
#   # Compress backups older than 7 days
#   ./scripts/backup-cleanup.sh --compress
#
##############################################################################

set -euo pipefail

# === Default Configuration ===

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/.backups"
DB_PATH="${PROJECT_ROOT}/claude-assets/skills/cfn-redis-coordination/data/backups.db"
DRY_RUN=false
AGENT_ID=""
BACKUP_TYPE=""
OLDER_THAN_DAYS=""
COMPRESS=false
COMPRESS_AGE_DAYS=7
FORCE=false
REPORT_ONLY=false
VERBOSE=false

# === Color Codes ===

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === Helper Functions ===

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $*"
    fi
}

show_help() {
    cat << EOF
Unified Backup Cleanup Script

Usage:
  ./scripts/backup-cleanup.sh [OPTIONS]

Options:
  --dry-run                Run in dry-run mode (no actual deletions)
  --agent-id AGENT        Filter by agent ID
  --backup-type TYPE      Filter by backup type (pre-edit, checkpoint, manual)
  --older-than DAYS       Delete backups older than N days
  --compress              Compress old backups instead of deleting
  --compress-age DAYS     Compress backups older than N days (default: 7)
  --force                 Skip confirmation prompts
  --report                Show disk usage report only
  --db-path PATH          Path to SQLite database
  --backup-dir PATH       Path to backup directory
  --verbose               Verbose output
  --help                  Show this help message

Examples:
  # Show disk usage report
  ./scripts/backup-cleanup.sh --report

  # Delete expired backups (dry-run)
  ./scripts/backup-cleanup.sh --dry-run

  # Delete backups older than 30 days for specific agent
  ./scripts/backup-cleanup.sh --agent-id backend-dev-001 --older-than 30

  # Compress backups older than 7 days
  ./scripts/backup-cleanup.sh --compress

EOF
}

format_bytes() {
    local bytes="$1"

    if [[ -z "$bytes" ]] || [[ "$bytes" == "null" ]] || [[ "$bytes" -eq 0 ]]; then
        echo "0 B"
        return
    fi

    if [[ "$bytes" -lt 1024 ]]; then
        echo "${bytes} B"
    elif [[ "$bytes" -lt 1048576 ]]; then
        echo "$((bytes / 1024)) KB"
    elif [[ "$bytes" -lt 1073741824 ]]; then
        echo "$((bytes / 1048576)) MB"
    else
        echo "$((bytes / 1073741824)) GB"
    fi
}

# === Database Query Functions ===

get_disk_usage_stats() {
    sqlite3 "$DB_PATH" <<EOF
.mode json
SELECT
    COUNT(*) as total_backups,
    SUM(CASE WHEN deleted_at IS NULL AND expires_at > datetime('now') THEN 1 ELSE 0 END) as active_backups,
    SUM(CASE WHEN deleted_at IS NULL AND expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired_backups,
    SUM(file_size) as total_size_bytes,
    SUM(CASE WHEN is_compressed = 1 THEN file_size ELSE 0 END) as compressed_size_bytes,
    AVG(CASE WHEN is_compressed = 1 THEN compression_ratio ELSE NULL END) as avg_compression_ratio
FROM backups
WHERE deleted_at IS NULL;
EOF
}

get_backups_by_type() {
    sqlite3 "$DB_PATH" <<EOF
.mode json
SELECT
    backup_type,
    COUNT(*) as count,
    SUM(file_size) as total_size
FROM backups
WHERE deleted_at IS NULL
GROUP BY backup_type;
EOF
}

get_backups_by_agent() {
    sqlite3 "$DB_PATH" <<EOF
.mode json
SELECT
    agent_id,
    COUNT(*) as count,
    SUM(file_size) as total_size
FROM backups
WHERE deleted_at IS NULL
GROUP BY agent_id
ORDER BY total_size DESC
LIMIT 10;
EOF
}

get_expired_backups() {
    local where_clauses="deleted_at IS NULL AND expires_at <= datetime('now')"

    if [[ -n "$AGENT_ID" ]]; then
        where_clauses="$where_clauses AND agent_id = '$AGENT_ID'"
    fi

    if [[ -n "$BACKUP_TYPE" ]]; then
        where_clauses="$where_clauses AND backup_type = '$BACKUP_TYPE'"
    fi

    if [[ -n "$OLDER_THAN_DAYS" ]]; then
        where_clauses="$where_clauses AND created_at < datetime('now', '-$OLDER_THAN_DAYS days')"
    fi

    sqlite3 "$DB_PATH" <<EOF
.mode json
SELECT id, agent_id, file_path, backup_path, file_size, backup_type, created_at
FROM backups
WHERE $where_clauses;
EOF
}

get_compressible_backups() {
    local compress_age="${COMPRESS_AGE_DAYS:-7}"
    local where_clauses="deleted_at IS NULL AND is_compressed = 0 AND created_at < datetime('now', '-$compress_age days')"

    if [[ -n "$AGENT_ID" ]]; then
        where_clauses="$where_clauses AND agent_id = '$AGENT_ID'"
    fi

    if [[ -n "$BACKUP_TYPE" ]]; then
        where_clauses="$where_clauses AND backup_type = '$BACKUP_TYPE'"
    fi

    sqlite3 "$DB_PATH" <<EOF
.mode json
SELECT id, agent_id, file_path, backup_path, file_size, backup_type, created_at
FROM backups
WHERE $where_clauses;
EOF
}

mark_backup_deleted() {
    local backup_id="$1"

    sqlite3 "$DB_PATH" <<EOF
UPDATE backups SET deleted_at = datetime('now') WHERE id = '$backup_id';
EOF
}

mark_backup_compressed() {
    local backup_id="$1"
    local original_size="$2"
    local compressed_size="$3"
    local compression_ratio=$(echo "scale=4; $compressed_size / $original_size" | bc)

    sqlite3 "$DB_PATH" <<EOF
UPDATE backups
SET is_compressed = 1,
    compressed_at = datetime('now'),
    compression_ratio = $compression_ratio,
    backup_size = $compressed_size
WHERE id = '$backup_id';
EOF
}

# === Cleanup Functions ===

show_disk_usage_report() {
    log_info "Generating disk usage report..."
    echo ""

    # Overall statistics
    local stats
    stats=$(get_disk_usage_stats)

    local total_backups=$(echo "$stats" | jq -r '.[0].total_backups // 0')
    local active_backups=$(echo "$stats" | jq -r '.[0].active_backups // 0')
    local expired_backups=$(echo "$stats" | jq -r '.[0].expired_backups // 0')
    local total_size=$(echo "$stats" | jq -r '.[0].total_size_bytes // 0')
    local compressed_size=$(echo "$stats" | jq -r '.[0].compressed_size_bytes // 0')
    local avg_compression=$(echo "$stats" | jq -r '.[0].avg_compression_ratio // 0')

    echo "==================================================================="
    echo "  BACKUP DISK USAGE REPORT"
    echo "==================================================================="
    echo ""
    echo "Overall Statistics:"
    echo "  Total Backups:       $total_backups"
    echo "  Active Backups:      $active_backups"
    echo "  Expired Backups:     $expired_backups"
    echo "  Total Size:          $(format_bytes "$total_size")"
    echo "  Compressed Size:     $(format_bytes "$compressed_size")"
    echo "  Avg Compression:     $(printf "%.2f%%" "$(echo "$avg_compression * 100" | bc)")"
    echo ""

    # By type
    local by_type
    by_type=$(get_backups_by_type)

    echo "Backups by Type:"
    echo "$by_type" | jq -r '.[] | "  \(.backup_type): \(.count) backups, \(.total_size) bytes"'
    echo ""

    # By agent (top 10)
    local by_agent
    by_agent=$(get_backups_by_agent)

    echo "Top 10 Agents by Size:"
    echo "$by_agent" | jq -r '.[] | "  \(.agent_id): \(.count) backups, \(.total_size) bytes"'
    echo ""

    # Disk usage of backup directory
    if [[ -d "$BACKUP_DIR" ]]; then
        local disk_usage
        disk_usage=$(du -sb "$BACKUP_DIR" 2>/dev/null | cut -f1)
        echo "Backup Directory:"
        echo "  Path:                $BACKUP_DIR"
        echo "  Disk Usage:          $(format_bytes "$disk_usage")"
        echo ""
    fi

    echo "==================================================================="
}

compress_backup() {
    local backup_path="$1"
    local backup_id="$2"

    if [[ ! -f "$backup_path" ]]; then
        log_warning "Backup file not found: $backup_path"
        return 1
    fi

    local original_size
    original_size=$(stat -f%z "$backup_path" 2>/dev/null || stat -c%s "$backup_path" 2>/dev/null)

    local compressed_path="${backup_path}.gz"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would compress: $backup_path"
        return 0
    fi

    # Compress file
    if gzip -c "$backup_path" > "$compressed_path" 2>/dev/null; then
        local compressed_size
        compressed_size=$(stat -f%z "$compressed_path" 2>/dev/null || stat -c%s "$compressed_path" 2>/dev/null)

        # Remove original
        rm "$backup_path"

        # Update database
        mark_backup_compressed "$backup_id" "$original_size" "$compressed_size"

        local savings=$((original_size - compressed_size))
        local savings_pct=$(echo "scale=2; ($savings * 100) / $original_size" | bc)

        log_success "Compressed: $backup_path (saved $(format_bytes "$savings"), ${savings_pct}%)"
        return 0
    else
        log_error "Compression failed: $backup_path"
        rm -f "$compressed_path"
        return 1
    fi
}

delete_backup() {
    local backup_path="$1"
    local backup_id="$2"

    if [[ ! -f "$backup_path" ]] && [[ ! -f "${backup_path}.gz" ]]; then
        log_verbose "Backup file not found: $backup_path"
        # Still mark as deleted in database
        if [[ "$DRY_RUN" == "false" ]]; then
            mark_backup_deleted "$backup_id"
        fi
        return 0
    fi

    local file_to_delete="$backup_path"
    if [[ -f "${backup_path}.gz" ]]; then
        file_to_delete="${backup_path}.gz"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would delete: $file_to_delete"
        return 0
    fi

    # Delete file
    if rm "$file_to_delete" 2>/dev/null; then
        # Delete parent directory if empty
        local parent_dir
        parent_dir=$(dirname "$file_to_delete")
        if [[ -d "$parent_dir" ]] && [[ -z "$(ls -A "$parent_dir")" ]]; then
            rmdir "$parent_dir" 2>/dev/null || true
        fi

        # Mark as deleted in database
        mark_backup_deleted "$backup_id"

        log_verbose "Deleted: $file_to_delete"
        return 0
    else
        log_error "Deletion failed: $file_to_delete"
        return 1
    fi
}

cleanup_expired_backups() {
    log_info "Finding expired backups..."

    local expired_backups
    expired_backups=$(get_expired_backups)

    local count
    count=$(echo "$expired_backups" | jq 'length')

    if [[ "$count" -eq 0 ]]; then
        log_success "No expired backups found"
        return 0
    fi

    log_warning "Found $count expired backups"

    # Calculate total size
    local total_size=0
    while IFS= read -r backup; do
        local size
        size=$(echo "$backup" | jq -r '.file_size')
        total_size=$((total_size + size))
    done < <(echo "$expired_backups" | jq -c '.[]')

    log_info "Total size to clean: $(format_bytes "$total_size")"

    # Confirm deletion unless forced
    if [[ "$FORCE" == "false" ]] && [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        read -p "Proceed with deletion? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Cleanup cancelled"
            return 0
        fi
    fi

    # Delete backups
    local deleted_count=0
    local failed_count=0

    while IFS= read -r backup; do
        local backup_id
        backup_id=$(echo "$backup" | jq -r '.id')
        local backup_path
        backup_path=$(echo "$backup" | jq -r '.backup_path')

        if delete_backup "$backup_path" "$backup_id"; then
            ((deleted_count++)) || true
        else
            ((failed_count++)) || true
        fi
    done < <(echo "$expired_backups" | jq -c '.[]')

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would delete $count backups ($(format_bytes "$total_size"))"
    else
        log_success "Deleted $deleted_count backups, $failed_count failed"
    fi
}

compress_old_backups() {
    log_info "Finding backups to compress (older than $COMPRESS_AGE_DAYS days)..."

    local compressible_backups
    compressible_backups=$(get_compressible_backups)

    local count
    count=$(echo "$compressible_backups" | jq 'length')

    if [[ "$count" -eq 0 ]]; then
        log_success "No backups to compress"
        return 0
    fi

    log_info "Found $count backups to compress"

    # Compress backups
    local compressed_count=0
    local failed_count=0
    local total_savings=0

    while IFS= read -r backup; do
        local backup_id
        backup_id=$(echo "$backup" | jq -r '.id')
        local backup_path
        backup_path=$(echo "$backup" | jq -r '.backup_path')

        if compress_backup "$backup_path" "$backup_id"; then
            ((compressed_count++)) || true
        else
            ((failed_count++)) || true
        fi
    done < <(echo "$compressible_backups" | jq -c '.[]')

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would compress $count backups"
    else
        log_success "Compressed $compressed_count backups, $failed_count failed"
    fi
}

# === Parse Arguments ===

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --backup-type)
            BACKUP_TYPE="$2"
            shift 2
            ;;
        --older-than)
            OLDER_THAN_DAYS="$2"
            shift 2
            ;;
        --compress)
            COMPRESS=true
            shift
            ;;
        --compress-age)
            COMPRESS_AGE_DAYS="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --report)
            REPORT_ONLY=true
            shift
            ;;
        --db-path)
            DB_PATH="$2"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# === Validation ===

if [[ ! -f "$DB_PATH" ]]; then
    log_error "Database not found: $DB_PATH"
    exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
    log_warning "Backup directory not found: $BACKUP_DIR"
fi

# Check for required tools
if ! command -v sqlite3 &> /dev/null; then
    log_error "sqlite3 is required but not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    exit 1
fi

if [[ "$COMPRESS" == "true" ]] && ! command -v gzip &> /dev/null; then
    log_error "gzip is required for compression but not installed"
    exit 1
fi

# === Main Execution ===

log_info "Backup Cleanup Script"
log_info "Database: $DB_PATH"
log_info "Backup Directory: $BACKUP_DIR"

if [[ "$DRY_RUN" == "true" ]]; then
    log_warning "Running in DRY-RUN mode (no changes will be made)"
fi

echo ""

# Report only mode
if [[ "$REPORT_ONLY" == "true" ]]; then
    show_disk_usage_report
    exit 0
fi

# Compression mode
if [[ "$COMPRESS" == "true" ]]; then
    compress_old_backups
    exit 0
fi

# Default: cleanup expired backups
cleanup_expired_backups

log_success "Cleanup completed"
