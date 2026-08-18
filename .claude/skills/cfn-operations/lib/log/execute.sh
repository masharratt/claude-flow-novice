#!/usr/bin/env bash
################################################################################
# CFN Log Operations - Main Entry Point
# Task 4.4: Distributed Logging Standardization
#
# Provides unified interface for logging operations:
# search, aggregate, rotate, monitor, stats, export
#
# Usage:
#   ./execute.sh [COMMAND] [OPTIONS]
#
################################################################################

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Script setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# Source library functions
source "${LIB_DIR}/search.sh" || exit 1
source "${LIB_DIR}/rotate.sh" || exit 1

# Defaults
COMMAND="${1:-help}"
LOG_DIR="${LOG_DIR:-/var/log/cfn}"
DEBUG="${DEBUG:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

################################################################################
# Utility Functions
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

debug() {
    if [ "$DEBUG" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $*" >&2
    fi
}

show_help() {
    cat <<EOF
CFN Log Operations Skill - Distributed Logging Management

Usage: $0 [COMMAND] [OPTIONS]

Commands:
  search      Search logs by correlation ID, agent ID, task ID, or level
  aggregate   Aggregate logs from Docker containers and filesystem
  rotate      Manage log rotation and retention
  monitor     Monitor logs for errors and performance issues
  stats       Generate log statistics
  export      Export logs in various formats
  help        Display this help message

Examples:
  # Search by correlation ID
  $0 search --correlation-id "task:task-001:agent"

  # Find all errors in last 24 hours
  $0 search --level error --since 24h

  # Aggregate all logs
  $0 aggregate --source all --validate

  # Rotate logs with compression
  $0 rotate --compress

  # Monitor logs as daemon
  $0 monitor --daemon

For detailed help on each command, run:
  $0 [COMMAND] --help
EOF
}

################################################################################
# Command Dispatchers
################################################################################

# Search command
cmd_search() {
    shift  # Remove 'search' from arguments
    search_logs "$@"
}

# Aggregate command
cmd_aggregate() {
    shift  # Remove 'aggregate' from arguments

    local source="all"
    local output_dir="${LOG_DIR}/aggregated"
    local since=""
    local deduplicate=false
    local validate=false
    local compress=false
    local correlate_by="correlationId"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --source)
                source="$2"
                shift 2
                ;;
            --output)
                output_dir="$2"
                shift 2
                ;;
            --since)
                since="$2"
                shift 2
                ;;
            --deduplicate)
                deduplicate=true
                shift
                ;;
            --validate)
                validate=true
                shift
                ;;
            --compress)
                compress=true
                shift
                ;;
            --correlate-by)
                correlate_by="$2"
                shift 2
                ;;
            --help)
                echo "Aggregate logs from multiple sources"
                echo "Usage: $0 aggregate [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --source SOURCE        Log source (docker|filesystem|all)"
                echo "  --output DIR           Output directory"
                echo "  --since DURATION       Only recent logs (e.g., 24h, 2h)"
                echo "  --deduplicate          Remove duplicate entries"
                echo "  --validate             Validate JSON structure"
                echo "  --compress             Compress aggregated logs"
                echo "  --correlate-by FIELD   Group by field (correlationId|agentId|taskId)"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Build command for log aggregator
    local cmd="${PROJECT_ROOT}/scripts/log-aggregator.sh"
    if [ ! -x "$cmd" ]; then
        log_error "Log aggregator script not found: $cmd"
        return 1
    fi

    local args="--source $source --output $output_dir"
    [ -n "$since" ] && args="$args --since $since"
    [ "$deduplicate" = true ] && args="$args --deduplicate"
    [ "$validate" = true ] && args="$args --validate"
    [ "$compress" = true ] && args="$args --compress"
    [ "$correlate_by" != "none" ] && args="$args --correlate-by $correlate_by"

    log_info "Aggregating logs: $args"
    $cmd $args || return 1

    log_success "Aggregation complete"
}

# Rotate command
cmd_rotate() {
    shift  # Remove 'rotate' from arguments
    rotate_logs "$@"
}

# Monitor command
cmd_monitor() {
    shift  # Remove 'monitor' from arguments

    local cmd="${PROJECT_ROOT}/scripts/log-monitor.sh"
    if [ ! -x "$cmd" ]; then
        log_error "Log monitor script not found: $cmd"
        return 1
    fi

    log_info "Starting log monitor..."
    $cmd "$@" || return 1
}

# Stats command
cmd_stats() {
    shift  # Remove 'stats' from arguments

    local log_dir="$LOG_DIR"
    local since=""
    local format="text"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --log-dir)
                log_dir="$2"
                shift 2
                ;;
            --since)
                since="$2"
                shift 2
                ;;
            --format)
                format="$2"
                shift 2
                ;;
            --help)
                echo "Generate log statistics"
                echo "Usage: $0 stats [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --log-dir DIR    Directory to analyze"
                echo "  --since DURATION Time window (e.g., 24h)"
                echo "  --format FORMAT  Output format (text|json)"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    log_info "Analyzing logs in: $log_dir"

    if [ ! -d "$log_dir" ]; then
        log_error "Log directory not found: $log_dir"
        return 1
    fi

    # Count files and entries
    local file_count=$(find "$log_dir" -name "*.log" -type f 2>/dev/null | wc -l)
    local total_size=0
    local log_entries=0
    local by_level=$(jq -s 'group_by(.level) | map({level: .[0].level, count: length})' "$log_dir"/*.log 2>/dev/null || echo "[]")

    # Calculate total size and entries
    while IFS= read -r -d '' log_file; do
        ((total_size += $(stat -c%s "$log_file" 2>/dev/null || echo 0)))
        ((log_entries += $(jq -s 'length' "$log_file" 2>/dev/null || echo 0)))
    done < <(find "$log_dir" -name "*.log" -type f -print0 2>/dev/null)

    # Output statistics
    if [ "$format" = "json" ]; then
        cat <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "logDirectory": "$log_dir",
  "statistics": {
    "fileCount": $file_count,
    "totalEntries": $log_entries,
    "totalSizeBytes": $total_size,
    "totalSizeMB": $(echo "scale=2; $total_size / 1048576" | bc),
    "byLevel": $by_level
  }
}
EOF
    else
        cat <<EOF
Log Statistics
================
Directory:   $log_dir
Files:       $file_count
Total Size:  $(echo "scale=2; $total_size / 1048576" | bc)MB
Total Logs:  $log_entries
EOF
        echo ""
        echo "By Level:"
        echo "$by_level" | jq -r '.[] | "  \(.level): \(.count)"' 2>/dev/null || true
    fi

    log_success "Statistics generated"
}

# Export command
cmd_export() {
    shift  # Remove 'export' from arguments

    local source="$LOG_DIR"
    local format="json"
    local output=""
    local filter=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --source)
                source="$2"
                shift 2
                ;;
            --format)
                format="$2"
                shift 2
                ;;
            --output)
                output="$2"
                shift 2
                ;;
            --filter)
                filter="$2"
                shift 2
                ;;
            --help)
                echo "Export logs in various formats"
                echo "Usage: $0 export [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --source SOURCE   Log source directory"
                echo "  --format FORMAT   Output format (json|csv|tsv)"
                echo "  --output FILE     Output file"
                echo "  --filter PATTERN  Filter expression"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    log_info "Exporting logs from: $source (format: $format)"

    # Build jq filter
    local jq_filter="."
    if [ -n "$filter" ]; then
        jq_filter="select($filter)"
    fi

    # Export based on format
    case "$format" in
        json)
            jq "$jq_filter" "$source"/*.log 2>/dev/null | \
                if [ -n "$output" ]; then
                    tee "$output"
                else
                    cat
                fi
            ;;
        csv)
            jq -r "$jq_filter" "$source"/*.log 2>/dev/null | \
            jq -r '[.timestamp, .level, .message, .source] | @csv' | \
                if [ -n "$output" ]; then
                    tee "$output"
                else
                    cat
                fi
            ;;
        tsv)
            jq -r "$jq_filter" "$source"/*.log 2>/dev/null | \
            jq -r '[.timestamp, .level, .message, .source] | @tsv' | \
                if [ -n "$output" ]; then
                    tee "$output"
                else
                    cat
                fi
            ;;
        *)
            log_error "Unknown export format: $format"
            return 1
            ;;
    esac

    if [ -n "$output" ]; then
        log_success "Exported to: $output"
    fi
}

################################################################################
# Main
################################################################################

case "$COMMAND" in
    search)
        cmd_search "$@"
        ;;
    aggregate)
        cmd_aggregate "$@"
        ;;
    rotate)
        cmd_rotate "$@"
        ;;
    monitor)
        cmd_monitor "$@"
        ;;
    stats)
        cmd_stats "$@"
        ;;
    export)
        cmd_export "$@"
        ;;
    help)
        show_help
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
