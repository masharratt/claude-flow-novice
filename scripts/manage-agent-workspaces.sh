#!/usr/bin/env bash
# Manage Agent Workspaces
# Part of Task 2.1: Persistent Agent Output Workspace (Integration)
#
# Usage:
#   ./scripts/manage-agent-workspaces.sh cleanup --older-than=30d
#   ./scripts/manage-agent-workspaces.sh archive --task-id=<id>
#   ./scripts/manage-agent-workspaces.sh stats

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

WORKSPACE_ROOT="${WORKSPACE_ROOT:-artifacts/agent-workspaces}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-artifacts/workspace-archives}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ARCHIVE_RETENTION_DAYS="${ARCHIVE_RETENTION_DAYS:-90}"
DISK_ALERT_THRESHOLD="${DISK_ALERT_THRESHOLD:-80}"

# ============================================================================
# Logging
# ============================================================================

log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

log_warn() {
    echo "[WARN] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

# ============================================================================
# Utility Functions
# ============================================================================

# Convert human-readable time to days
parse_time_to_days() {
    local time_str="$1"
    local value="${time_str%[a-z]}"
    local unit="${time_str##*[0-9]}"

    case "$unit" in
        d|day|days)
            echo "$value"
            ;;
        w|week|weeks)
            echo "$((value * 7))"
            ;;
        m|month|months)
            echo "$((value * 30))"
            ;;
        *)
            log_error "Invalid time unit: $unit (use d, w, or m)"
            exit 1
            ;;
    esac
}

# Get disk usage percentage
get_disk_usage() {
    local path="$1"
    df -h "$path" | awk 'NR==2 {print $5}' | sed 's/%//'
}

# Get size of directory in human-readable format
get_dir_size() {
    local path="$1"
    if [[ -d "$path" ]]; then
        du -sh "$path" 2>/dev/null | awk '{print $1}'
    else
        echo "0"
    fi
}

# Count files in directory recursively
count_files() {
    local path="$1"
    if [[ -d "$path" ]]; then
        find "$path" -type f 2>/dev/null | wc -l
    else
        echo "0"
    fi
}

# ============================================================================
# Cleanup Operations
# ============================================================================

cleanup_workspaces() {
    local days="${1:-$RETENTION_DAYS}"

    log_info "Starting workspace cleanup (older than ${days} days)"

    if [[ ! -d "$WORKSPACE_ROOT" ]]; then
        log_warn "Workspace root does not exist: $WORKSPACE_ROOT"
        return 0
    fi

    local count=0
    local size_freed=0

    # Find workspaces older than specified days
    while IFS= read -r workspace; do
        # Get workspace size before deletion
        local ws_size
        ws_size=$(du -sb "$workspace" 2>/dev/null | awk '{print $1}')

        # Archive before cleanup (optional, configurable)
        if [[ "${ARCHIVE_BEFORE_CLEANUP:-true}" == "true" ]]; then
            local task_id agent_id
            task_id=$(basename "$(dirname "$workspace")")
            agent_id=$(basename "$workspace")

            log_info "Archiving workspace before cleanup: $task_id/$agent_id"
            archive_workspace "$task_id" "$agent_id" || log_warn "Archive failed for $task_id/$agent_id"
        fi

        # Delete workspace
        rm -rf "$workspace"
        ((count++))
        size_freed=$((size_freed + ws_size))

        log_info "Cleaned workspace: $workspace"
    done < <(find "$WORKSPACE_ROOT" -mindepth 2 -maxdepth 2 -type d -mtime +"$days")

    # Convert bytes to human-readable
    local size_freed_hr
    size_freed_hr=$(numfmt --to=iec-i --suffix=B "$size_freed" 2>/dev/null || echo "${size_freed}B")

    log_info "Cleanup complete: $count workspaces removed, $size_freed_hr freed"

    # Check disk usage and alert if necessary
    check_disk_usage
}

# ============================================================================
# Archive Operations
# ============================================================================

archive_workspace() {
    local task_id="${1:-}"
    local agent_id="${2:-}"

    if [[ -z "$task_id" ]]; then
        log_error "Task ID required for archive operation"
        exit 1
    fi

    # Create archive root if it doesn't exist
    mkdir -p "$ARCHIVE_ROOT"

    if [[ -n "$agent_id" ]]; then
        # Archive specific agent workspace
        local workspace_path="$WORKSPACE_ROOT/$task_id/$agent_id"

        if [[ ! -d "$workspace_path" ]]; then
            log_warn "Workspace not found: $workspace_path"
            return 1
        fi

        local archive_file="$ARCHIVE_ROOT/${task_id}_${agent_id}_$(date +%Y%m%d_%H%M%S).tar.gz"

        log_info "Archiving workspace: $task_id/$agent_id"
        tar -czf "$archive_file" -C "$WORKSPACE_ROOT/$task_id" "$agent_id"

        log_info "Archive created: $archive_file ($(get_dir_size "$archive_file"))"
    else
        # Archive entire task (all agent workspaces)
        local task_path="$WORKSPACE_ROOT/$task_id"

        if [[ ! -d "$task_path" ]]; then
            log_warn "Task workspace not found: $task_path"
            return 1
        fi

        local archive_file="$ARCHIVE_ROOT/${task_id}_$(date +%Y%m%d_%H%M%S).tar.gz"

        log_info "Archiving task: $task_id"
        tar -czf "$archive_file" -C "$WORKSPACE_ROOT" "$task_id"

        log_info "Archive created: $archive_file ($(get_dir_size "$archive_file"))"
    fi
}

# ============================================================================
# Archive Cleanup
# ============================================================================

cleanup_archives() {
    local days="${1:-$ARCHIVE_RETENTION_DAYS}"

    log_info "Starting archive cleanup (older than ${days} days)"

    if [[ ! -d "$ARCHIVE_ROOT" ]]; then
        log_warn "Archive root does not exist: $ARCHIVE_ROOT"
        return 0
    fi

    local count=0
    local size_freed=0

    # Find archives older than specified days
    while IFS= read -r archive; do
        local archive_size
        archive_size=$(stat -f%z "$archive" 2>/dev/null || stat -c%s "$archive" 2>/dev/null)

        rm -f "$archive"
        ((count++))
        size_freed=$((size_freed + archive_size))

        log_info "Deleted archive: $archive"
    done < <(find "$ARCHIVE_ROOT" -name "*.tar.gz" -type f -mtime +"$days")

    # Convert bytes to human-readable
    local size_freed_hr
    size_freed_hr=$(numfmt --to=iec-i --suffix=B "$size_freed" 2>/dev/null || echo "${size_freed}B")

    log_info "Archive cleanup complete: $count archives removed, $size_freed_hr freed"
}

# ============================================================================
# Statistics
# ============================================================================

show_stats() {
    log_info "Agent Workspace Statistics"
    echo ""

    # Workspace statistics
    if [[ -d "$WORKSPACE_ROOT" ]]; then
        local total_tasks total_workspaces total_files total_size
        total_tasks=$(find "$WORKSPACE_ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        total_workspaces=$(find "$WORKSPACE_ROOT" -mindepth 2 -maxdepth 2 -type d 2>/dev/null | wc -l)
        total_files=$(count_files "$WORKSPACE_ROOT")
        total_size=$(get_dir_size "$WORKSPACE_ROOT")

        echo "Active Workspaces:"
        echo "  Tasks:      $total_tasks"
        echo "  Agents:     $total_workspaces"
        echo "  Files:      $total_files"
        echo "  Total Size: $total_size"
        echo ""

        # Workspaces by age
        local count_7d count_30d count_90d
        count_7d=$(find "$WORKSPACE_ROOT" -mindepth 2 -maxdepth 2 -type d -mtime -7 2>/dev/null | wc -l)
        count_30d=$(find "$WORKSPACE_ROOT" -mindepth 2 -maxdepth 2 -type d -mtime -30 2>/dev/null | wc -l)
        count_90d=$(find "$WORKSPACE_ROOT" -mindepth 2 -maxdepth 2 -type d -mtime -90 2>/dev/null | wc -l)

        echo "Workspaces by Age:"
        echo "  < 7 days:   $count_7d"
        echo "  < 30 days:  $count_30d"
        echo "  < 90 days:  $count_90d"
        echo ""
    else
        echo "Active Workspaces: None (directory does not exist)"
        echo ""
    fi

    # Archive statistics
    if [[ -d "$ARCHIVE_ROOT" ]]; then
        local archive_count archive_size
        archive_count=$(find "$ARCHIVE_ROOT" -name "*.tar.gz" -type f 2>/dev/null | wc -l)
        archive_size=$(get_dir_size "$ARCHIVE_ROOT")

        echo "Archives:"
        echo "  Count:      $archive_count"
        echo "  Total Size: $archive_size"
        echo ""
    else
        echo "Archives: None (directory does not exist)"
        echo ""
    fi

    # Disk usage
    local disk_usage
    disk_usage=$(get_disk_usage "$(pwd)")
    echo "Disk Usage: ${disk_usage}%"

    if [[ "$disk_usage" -ge "$DISK_ALERT_THRESHOLD" ]]; then
        log_warn "Disk usage is at ${disk_usage}% (threshold: ${DISK_ALERT_THRESHOLD}%)"
    fi
}

# ============================================================================
# Disk Monitoring
# ============================================================================

check_disk_usage() {
    local disk_usage
    disk_usage=$(get_disk_usage "$(pwd)")

    if [[ "$disk_usage" -ge "$DISK_ALERT_THRESHOLD" ]]; then
        log_warn "ALERT: Disk usage is at ${disk_usage}% (threshold: ${DISK_ALERT_THRESHOLD}%)"
        log_warn "Consider running cleanup or increasing disk space"
    fi
}

# ============================================================================
# Main Command Handler
# ============================================================================

main() {
    local command="${1:-help}"

    case "$command" in
        cleanup)
            shift
            local days="$RETENTION_DAYS"

            # Parse options
            for arg in "$@"; do
                case "$arg" in
                    --older-than=*)
                        days=$(parse_time_to_days "${arg#*=}")
                        ;;
                    *)
                        log_error "Unknown option: $arg"
                        exit 1
                        ;;
                esac
            done

            cleanup_workspaces "$days"
            ;;

        archive)
            shift
            local task_id="" agent_id=""

            # Parse options
            for arg in "$@"; do
                case "$arg" in
                    --task-id=*)
                        task_id="${arg#*=}"
                        ;;
                    --agent-id=*)
                        agent_id="${arg#*=}"
                        ;;
                    *)
                        log_error "Unknown option: $arg"
                        exit 1
                        ;;
                esac
            done

            archive_workspace "$task_id" "$agent_id"
            ;;

        cleanup-archives)
            shift
            local days="$ARCHIVE_RETENTION_DAYS"

            # Parse options
            for arg in "$@"; do
                case "$arg" in
                    --older-than=*)
                        days=$(parse_time_to_days "${arg#*=}")
                        ;;
                    *)
                        log_error "Unknown option: $arg"
                        exit 1
                        ;;
                esac
            done

            cleanup_archives "$days"
            ;;

        stats)
            show_stats
            ;;

        help|--help|-h)
            cat <<EOF
Agent Workspace Management Script

Usage:
  $0 <command> [options]

Commands:
  cleanup              Clean up old workspaces
  archive              Archive a workspace
  cleanup-archives     Clean up old archives
  stats                Show workspace statistics
  help                 Show this help message

Options:
  --older-than=<time>  Time threshold (e.g., 30d, 2w, 3m)
  --task-id=<id>       Task ID for archive operation
  --agent-id=<id>      Agent ID for archive operation (optional)

Environment Variables:
  WORKSPACE_ROOT              Workspace directory (default: artifacts/agent-workspaces)
  ARCHIVE_ROOT                Archive directory (default: artifacts/workspace-archives)
  RETENTION_DAYS              Workspace retention in days (default: 30)
  ARCHIVE_RETENTION_DAYS      Archive retention in days (default: 90)
  DISK_ALERT_THRESHOLD        Disk usage alert threshold % (default: 80)
  ARCHIVE_BEFORE_CLEANUP      Archive before cleanup (default: true)

Examples:
  # Clean up workspaces older than 30 days
  $0 cleanup --older-than=30d

  # Archive a specific task
  $0 archive --task-id=task-123

  # Archive a specific agent workspace
  $0 archive --task-id=task-123 --agent-id=agent-456

  # Show statistics
  $0 stats

  # Clean up archives older than 90 days
  $0 cleanup-archives --older-than=90d
EOF
            ;;

        *)
            log_error "Unknown command: $command"
            log_error "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main
main "$@"
