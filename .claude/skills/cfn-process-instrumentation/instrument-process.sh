#!/usr/bin/env bash

##############################################################################
# CFN Process Instrumentation
# Part of ANTI-023 Memory Leak Protection System
#
# Provides process instrumentation, monitoring, and automatic resource limiting
# for CFN Loop agents and orchestration processes.
#
# Usage:
#   source ./instrument-process.sh [--agent-id <id>] [--memory-limit <size>]
#   ./instrument-process.sh --monitor-pid <pid>
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default limits
DEFAULT_MEMORY_LIMIT="2G"
DEFAULT_CPU_LIMIT="80%"
DEFAULT_TIMEOUT="600"

# Process tracking
AGENT_ID="${AGENT_ID:-$(hostname)-$$}"
MONITOR_PID=""
MEMORY_LIMIT="${CFN_MEMORY_LIMIT:-$DEFAULT_MEMORY_LIMIT}"
CPU_LIMIT="${CFN_CPU_LIMIT:-$DEFAULT_CPU_LIMIT}"
TIMEOUT="${CFN_TIMEOUT:-$DEFAULT_TIMEOUT}"

# Telemetry storage
TELEMETRY_DIR="${CFN_TELEMETRY_DIR:-/tmp/cfn-telemetry}"
METRICS_FILE="$TELEMETRY_DIR/metrics_${AGENT_ID}.json"

# Color coding
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[INSTRUMENT]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[INSTRUMENT]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[INSTRUMENT]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[INSTRUMENT]${NC} $1" >&2
}

# Initialize telemetry directory
init_telemetry() {
    mkdir -p "$TELEMETRY_DIR"

    # Create metrics file with initial structure
    cat > "$METRICS_FILE" << EOF
{
  "agent_id": "$AGENT_ID",
  "start_time": "$(date -Iseconds)",
  "process_id": "$$",
  "memory_limit": "$MEMORY_LIMIT",
  "cpu_limit": "$CPU_LIMIT",
  "timeout": "$TIMEOUT",
  "samples": []
}
EOF
}

# Collect process metrics
collect_metrics() {
    local pid="${1:-$$}"
    local timestamp="$(date -Iseconds)"

    # Get process statistics
    local mem_usage=""
    local cpu_usage=""
    local open_files=""
    local threads=""

    if command -v ps >/dev/null 2>&1; then
        mem_usage=$(ps -p "$pid" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
        cpu_usage=$(ps -p "$pid" -o %cpu= 2>/dev/null | tr -d ' ' || echo "0")
    fi

    if command -v lsof >/dev/null 2>&1; then
        open_files=$(lsof -p "$pid" 2>/dev/null | wc -l || echo "0")
    fi

    if [[ -f "/proc/$pid/status" ]]; then
        threads=$(grep "^Threads:" "/proc/$pid/status" | awk '{print $2}' || echo "0")
    fi

    # Create metrics entry
    local metrics_entry=$(cat << EOF
{
  "timestamp": "$timestamp",
  "memory_kb": "$mem_usage",
  "cpu_percent": "$cpu_usage",
  "open_files": "$open_files",
  "threads": "$threads"
}
EOF
    )

    # Update metrics file
    if [[ -f "$METRICS_FILE" ]]; then
        # Use jq to safely append to samples array
        if command -v jq >/dev/null 2>&1; then
            jq --argjson entry "$metrics_entry" '.samples += [$entry]' "$METRICS_FILE" > "$METRICS_FILE.tmp" && \
                mv "$METRICS_FILE.tmp" "$METRICS_FILE"
        else
            # Fallback without jq
            echo "Warning: jq not available, using simple append" >&2
            echo "$metrics_entry" >> "$METRICS_FILE.raw"
        fi
    fi
}

# Check resource limits
check_limits() {
    local pid="${1:-$$}"

    # Memory limit check
    if command -v ps >/dev/null 2>&1; then
        local mem_kb=$(ps -p "$pid" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
        local mem_mb=$((mem_kb / 1024))

        case "$MEMORY_LIMIT" in
            *G|*g)
                local limit_mb=$((${MEMORY_LIMIT%[Gg]*} * 1024))
                ;;
            *M|*m)
                local limit_mb=$((${MEMORY_LIMIT%[Mm]*}))
                ;;
            *)
                local limit_mb=2048  # Default 2GB
                ;;
        esac

        if [[ $mem_mb -gt $limit_mb ]]; then
            log_warning "Memory limit exceeded: ${mem_mb}MB > ${limit_mb}MB"
            return 1
        fi
    fi

    # CPU limit check
    if command -v ps >/dev/null 2>&1; then
        local cpu_percent=$(ps -p "$pid" -o %cpu= 2>/dev/null | tr -d ' ' || echo "0")
        local cpu_limit_num=$((${CPU_LIMIT%\%}))

        if (( $(echo "$cpu_percent > $cpu_limit_num" | bc -l) )); then
            log_warning "CPU limit exceeded: ${cpu_percent}% > ${CPU_LIMIT}"
            return 1
        fi
    fi

    return 0
}

# Start background monitoring
start_monitoring() {
    local pid="${1:-$$}"
    local interval="${2:-30}"  # Check every 30 seconds

    log_info "Starting process monitoring for PID $pid (interval: ${interval}s)"

    # Start monitoring in background
    (
        while true; do
            if ! kill -0 "$pid" 2>/dev/null; then
                log_info "Process $pid no longer exists, stopping monitoring"
                break
            fi

            collect_metrics "$pid"

            if ! check_limits "$pid"; then
                log_error "Resource limits exceeded, terminating process $pid"
                kill -TERM "$pid" 2>/dev/null || true
                break
            fi

            sleep "$interval"
        done
    ) &

    MONITOR_PID=$!
    echo "$MONITOR_PID"
}

# Stop monitoring
stop_monitoring() {
    if [[ -n "$MONITOR_PID" ]] && kill -0 "$MONITOR_PID" 2>/dev/null; then
        kill "$MONITOR_PID" 2>/dev/null || true
        log_info "Stopped monitoring (PID: $MONITOR_PID)"
    fi
}

# Generate final report
generate_report() {
    local exit_code="${1:-0}"

    if [[ -f "$METRICS_FILE" ]]; then
        # Update with final information
        if command -v jq >/dev/null 2>&1; then
            jq --arg end_time "$(date -Iseconds)" \
               --arg exit_code "$exit_code" \
               '.end_time = $end_time | .exit_code = $exit_code' \
               "$METRICS_FILE" > "$METRICS_FILE.tmp" && \
               mv "$METRICS_FILE.tmp" "$METRICS_FILE"
        fi

        log_success "Process report generated: $METRICS_FILE"

        # Print summary
        if command -v jq >/dev/null 2>&1; then
            local samples=$(jq '.samples | length' "$METRICS_FILE")
            echo "📊 Process Metrics Summary:" >&2
            echo "  Agent ID: $AGENT_ID" >&2
            echo "  Samples: $samples" >&2
            echo "  Exit Code: $exit_code" >&2
        fi
    fi
}

# Monitor existing process
monitor_pid() {
    local pid="$1"

    log_info "Monitoring existing process: PID $pid"

    if ! kill -0 "$pid" 2>/dev/null; then
        log_error "Process $pid does not exist"
        return 1
    fi

    # Start monitoring
    local monitor_pid=$(start_monitoring "$pid")

    # Wait for process to complete
    while kill -0 "$pid" 2>/dev/null; do
        sleep 5
    done

    # Stop monitoring
    stop_monitoring

    log_success "Process monitoring completed for PID $pid"
}

# Main execution
main() {
    local action="${1:-"instrument"}"

    case "$action" in
        "instrument")
            init_telemetry
            local monitor_pid=$(start_monitoring)

            # Set up cleanup traps
            trap 'stop_monitoring; generate_report $?' EXIT
            trap 'stop_monitoring; generate_report 1' INT TERM

            log_success "Process instrumentation started for $AGENT_ID"
            ;;
        "monitor-pid")
            if [[ -z "${2:-}" ]]; then
                log_error "PID required for monitor-pid action"
                exit 1
            fi
            monitor_pid "$2"
            ;;
        "--help"|"-h")
            cat << EOF
CFN Process Instrumentation Script

Usage:
  $0                     # Instrument current process
  $0 monitor-pid <pid>   # Monitor existing process
  $0 --help             # Show this help

Environment Variables:
  AGENT_ID              # Agent identifier (default: hostname-PID)
  CFN_MEMORY_LIMIT      # Memory limit (default: 2G)
  CFN_CPU_LIMIT         # CPU limit (default: 80%)
  CFN_TIMEOUT           # Timeout in seconds (default: 600)
  CFN_TELEMETRY_DIR     # Telemetry storage directory

This script provides process monitoring and resource limit enforcement
for CFN Loop agents and orchestration processes.
EOF
            ;;
        *)
            log_error "Unknown action: $action"
            exit 1
            ;;
    esac
}

# Execute main function if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
else
    # When sourced, automatically instrument current process
    init_telemetry
    local monitor_pid=$(start_monitoring)

    # Set up cleanup traps
    trap 'stop_monitoring; generate_report $?' EXIT
    trap 'stop_monitoring; generate_report 1' INT TERM

    log_info "Process instrumentation enabled for $AGENT_ID"
fi