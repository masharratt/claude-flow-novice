#!/bin/bash
# CFN Validation Runner Instrumentation
# Wraps Bun/Node/Playwright invocations with logging, timeouts, and cleanup

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration defaults
DEFAULT_TIMEOUT="${CFN_VALIDATION_TIMEOUT:-300}"  # 5 minutes
DEFAULT_MEMORY="${CFN_VALIDATION_MEMORY:-2048}"  # 2GB
LOG_DIR="${CFN_VALIDATION_LOG_DIR:-$PROJECT_ROOT/.claude/logs/validation}"
MONITOR_INTERVAL="${CFN_MONITOR_INTERVAL:-30}"  # 30 seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Process monitoring
monitor_process() {
    local pid="$1"
    local timeout="$2"
    local command_name="$3"
    local log_file="$4"

    local elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
        if [[ $elapsed -ge $timeout ]]; then
            log_warning "Process $pid ($command_name) exceeded timeout ${timeout}s, terminating..."

            # Get memory usage before termination
            local memory_usage=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ' || echo "unknown")
            log_error "Memory usage at termination: ${memory_usage}KB"

            # Terminate the process gracefully
            kill -TERM "$pid" 2>/dev/null || true
            sleep 5

            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_error "Force killing process $pid ($command_name)"
                kill -KILL "$pid" 2>/dev/null || true
            fi

            return 124  # Timeout exit code
        fi

        # Log periodic status
        if [[ $((elapsed % MONITOR_INTERVAL)) -eq 0 && $elapsed -gt 0 ]]; then
            local memory_usage=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ' || echo "unknown")
            log_info "Process $pid ($command_name) running: ${elapsed}s elapsed, ${memory_usage}KB memory"
        fi

        sleep 1
        ((elapsed++))
    done

    return 0
}

# Instrumented execution wrapper
execute_instrumented() {
    local command="$1"
    local timeout="${2:-$DEFAULT_TIMEOUT}"
    local memory_limit="${3:-$DEFAULT_MEMORY}"
    shift 3
    local args=("$@")

    # Create log directory
    mkdir -p "$LOG_DIR"

    # Generate unique execution ID
    local execution_id="exec_$(date +%Y%m%d_%H%M%S)_$$"
    local log_file="$LOG_DIR/${execution_id}.log"
    export LOG_FILE="$log_file"

    # Extract command name for logging
    local command_name=$(basename "$command")
    local full_command="$command ${args[*]}"

    # Start execution logging
    log_info "=== Starting Instrumented Execution ==="
    log_info "Execution ID: $execution_id"
    log_info "Command: $full_command"
    log_info "Timeout: ${timeout}s"
    log_info "Memory Limit: ${memory_limit}MB"
    log_info "Working Directory: $(pwd)"
    log_info "Environment: CFN_MODE=${CFN_MODE:-unset}, NODE_OPTIONS=${NODE_OPTIONS:-unset}"

    # Set up resource limits
    local memory_limit_kb=$((memory_limit * 1024))

    # Start the command with resource limits
    local start_time=$(date +%s)
    log_info "Starting process at $(date)"

    # Launch command in background with resource limits
    (
        # Apply memory limit
        ulimit -v "$memory_limit_kb" 2>/dev/null || {
            log_warning "Could not set memory limit via ulimit"
        }

        # Apply Node.js specific memory limit
        if [[ "$command_name" == "node" || "$command_name" == "bun" ]]; then
            export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=$memory_limit"
            log_info "Set NODE_OPTIONS: $NODE_OPTIONS"
        fi

        # Execute the command
        exec "$command" "${args[@]}" 2>&1
    ) &

    local pid=$!
    log_info "Process started with PID: $pid"

    # Start monitoring in background
    monitor_process "$pid" "$timeout" "$command_name" "$log_file" &
    local monitor_pid=$!

    # Wait for command completion
    local exit_code=0
    if wait "$pid" 2>/dev/null; then
        exit_code=$?
        log_success "Process $pid ($command_name) completed successfully"
    else
        exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            log_error "Process $pid ($command_name) timed out after ${timeout}s"
        else
            log_error "Process $pid ($command_name) failed with exit code: $exit_code"
        fi
    fi

    # Stop monitoring
    kill "$monitor_pid" 2>/dev/null || true
    wait "$monitor_pid" 2>/dev/null || true

    # Calculate execution time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Final status logging
    log_info "=== Execution Summary ==="
    log_info "Command: $full_command"
    log_info "Exit Code: $exit_code"
    log_info "Duration: ${duration}s"
    log_info "Memory Limit: ${memory_limit}MB"

    # Log resource usage summary if available
    if command -v ps >/dev/null 2>&1; then
        local final_memory=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ' || echo "unknown")
        log_info "Final Memory: ${final_memory}KB"
    fi

    # Cleanup if process is still running
    if kill -0 "$pid" 2>/dev/null; then
        log_warning "Cleaning up still-running process $pid"
        kill -TERM "$pid" 2>/dev/null || true
        sleep 2
        kill -KILL "$pid" 2>/dev/null || true
    fi

    # Archive log if successful
    if [[ $exit_code -eq 0 ]]; then
        local archive_log="$LOG_DIR/${execution_id}_success.log"
        mv "$log_file" "$archive_log" 2>/dev/null || true
        log_success "Log archived: $archive_log"
    else
        local archive_log="$LOG_DIR/${execution_id}_failed.log"
        mv "$log_file" "$archive_log" 2>/dev/null || true
        log_error "Failed log archived: $archive_log"
    fi

    return $exit_code
}

# Specific wrappers for common tools
execute_node() {
    local timeout="${1:-$DEFAULT_TIMEOUT}"
    shift
    log_info "Executing Node.js with instrumentation"
    execute_instrumented "node" "$timeout" "$DEFAULT_MEMORY" "$@"
}

execute_bun() {
    local timeout="${1:-$DEFAULT_TIMEOUT}"
    shift
    log_info "Executing Bun with instrumentation"
    execute_instrumented "bun" "$timeout" "$DEFAULT_MEMORY" "$@"
}

execute_playwright() {
    local timeout="${1:-$DEFAULT_TIMEOUT}"
    shift
    # Playwright may need more memory
    local playwright_memory="${CFN_PLAYWRIGHT_MEMORY:-4096}"
    log_info "Executing Playwright with instrumentation"
    execute_instrumented "npx" "$timeout" "$playwright_memory" "playwright" "$@"
}

execute_npx() {
    local timeout="${1:-$DEFAULT_TIMEOUT}"
    shift
    log_info "Executing NPX with instrumentation"
    execute_instrumented "npx" "$timeout" "$DEFAULT_MEMORY" "$@"
}

# Cleanup old logs
cleanup_logs() {
    local max_days="${CFN_LOG_RETENTION_DAYS:-7}"
    log_info "Cleaning up logs older than $max_days days"

    find "$LOG_DIR" -name "*.log" -type f -mtime "+$max_days" -delete 2>/dev/null || true
    log_info "Log cleanup completed"
}

# Show usage
show_usage() {
    cat <<'EOF'
CFN Validation Runner Instrumentation

USAGE:
    source "$(dirname "${BASH_SOURCE[0]}")/wrapped-executor.sh"

    # Generic Execution
    execute_instrumented <command> [timeout] [memory_limit] [args...]

    # Tool-Specific Wrappers
    execute_node [timeout] [args...]           # Execute Node.js
    execute_bun [timeout] [args...]            # Execute Bun
    execute_playwright [timeout] [args...]     # Execute Playwright
    execute_npx [timeout] [args...]            # Execute NPX

    # Maintenance
    cleanup_logs                               # Clean up old logs

ENVIRONMENT VARIABLES:
    CFN_VALIDATION_TIMEOUT      # Default timeout in seconds (default: 300)
    CFN_VALIDATION_MEMORY       # Default memory limit in MB (default: 2048)
    CFN_VALIDATION_LOG_DIR      # Log directory (default: ./.claude/logs/validation)
    CFN_MONITOR_INTERVAL        # Monitoring interval in seconds (default: 30)
    CFN_PLAYWRIGHT_MEMORY       # Playwright memory limit in MB (default: 4096)
    CFN_LOG_RETENTION_DAYS      # Log retention in days (default: 7)

EXAMPLES:
    # Execute Node.js script with default settings
    execute_node validate.js

    # Execute Bun with custom timeout
    execute_bun 600 build.ts

    # Execute Playwright with longer timeout
    execute_playwright 900 test.spec.js

    # Generic execution with custom memory limit
    execute_instrumented custom-tool 300 4096 --arg1 --arg2

OUTPUT:
    All executions generate detailed logs in ./.claude/logs/validation/
    Logs include: start time, end time, memory usage, exit codes, timeouts

EOF
}

# Main execution block
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ "$1" == "--help" || "$1" == "-h" ]]; then
        show_usage
        exit 0
    fi

    # Execute operation if provided
    if [[ $# -gt 0 ]]; then
        case "$1" in
            "node")
                shift
                execute_node "$@"
                ;;
            "bun")
                shift
                execute_bun "$@"
                ;;
            "playwright")
                shift
                execute_playwright "$@"
                ;;
            "npx")
                shift
                execute_npx "$@"
                ;;
            "cleanup")
                cleanup_logs
                ;;
            *)
                echo "Unknown command: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    else
        echo "CFN Validation Runner Instrumentation" >&2
        echo "Use --help for usage information" >&2
    fi
fi