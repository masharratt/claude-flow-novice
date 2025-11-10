#!/usr/bin/env bash

##############################################################################
# CFN Validation Runner Process Instrumentation
# Provides process wrapping, monitoring, and instrumentation for CFN agents
#
# Usage:
#   source wrapped-executor.sh
#   wrap_execution <command> <timeout> <log_prefix>
#
# Example:
#   wrap_execution "npx claude-flow-novice agent coder" 300 "agent-execution"
##############################################################################

set -euo pipefail

# Instrumentation state
declare -A CFN_INSTRUMENT_STATE
CFN_INSTRUMENT_STATE["active"]=false
CFN_INSTRUMENT_STATE["start_time"]=0
CFN_INSTRUMENT_STATE["pid"]=0
CFN_INSTRUMENT_STATE["timeout"]=0
CFN_INSTRUMENT_STATE["log_prefix"]=""

# Default timeouts (seconds)
readonly DEFAULT_TIMEOUT=300        # 5 minutes
readonly MAX_TIMEOUT=3600           # 1 hour
readonly WARNING_TIMEOUT=240        # 4 minutes

# Resource limits
# Note: MAX_MEMORY_MB may be set by task-mode-env-sanitizer.sh (4096)
# Only set if not already defined
: "${MAX_MEMORY_MB:=2048}"
readonly MAX_CPU_PERCENT=80

##############################################################################
# Core Instrumentation Functions
##############################################################################

wrap_execution() {
    local command="$1"
    local timeout="${2:-$DEFAULT_TIMEOUT}"
    local log_prefix="${3:-cfn-execution}"

    # Validate timeout
    if (( timeout > MAX_TIMEOUT )); then
        timeout=$MAX_TIMEOUT
        echo "⚠️ Timeout capped at ${MAX_TIMEOUT}s" >&2
    fi

    # Initialize instrumentation state
    CFN_INSTRUMENT_STATE["active"]=true
    CFN_INSTRUMENT_STATE["start_time"]=$(date +%s)
    CFN_INSTRUMENT_STATE["timeout"]=$timeout
    CFN_INSTRUMENT_STATE["log_prefix"]="$log_prefix"

    echo "🔧 CFN Process Instrumentation v1.0.0" >&2
    echo "   Command: $command" >&2
    echo "   Timeout: ${timeout}s" >&2
    echo "   PID: $$" >&2
    echo "   Start: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2

    # Setup monitoring
    setup_process_monitoring "$timeout" "$log_prefix"

    # Execute with instrumentation
    local result
    result=$(execute_with_monitoring "$command" "$timeout" "$log_prefix")
    local exit_code=$?

    # Cleanup and report
    cleanup_instrumentation "$exit_code"

    return $exit_code
}

setup_process_monitoring() {
    local timeout="$1"
    local log_prefix="$2"

    echo "   Setting up process monitoring..." >&2

    # Start resource monitoring in background
    (
        local monitor_interval=30  # Check every 30 seconds
        local elapsed=0

        while (( elapsed < timeout )); do
            sleep $monitor_interval
            elapsed=$((elapsed + monitor_interval))

            if [[ "${CFN_INSTRUMENT_STATE[active]}" == "true" ]]; then
                check_resource_usage "$log_prefix" "$elapsed"
            else
                break
            fi
        done

        # Timeout warning
        if [[ "${CFN_INSTRUMENT_STATE[active]}" == "true" ]]; then
            echo "⚠️ [$log_prefix] Approaching timeout: ${elapsed}s" >&2
        fi
    ) &

    echo "   Resource monitoring started (interval: 30s)" >&2
}

check_resource_usage() {
    local log_prefix="$1"
    local elapsed="$2"

    # Check memory usage
    if command -v ps >/dev/null 2>&1; then
        local memory_mb=$(ps -o rss= -p $$ 2>/dev/null | awk '{print int($1/1024)}' || echo "0")

        if (( memory_mb > MAX_MEMORY_MB )); then
            echo "⚠️ [$log_prefix] High memory: ${memory_mb}MB (limit: ${MAX_MEMORY_MB}MB)" >&2
        fi
    fi

    # Check CPU usage (basic check)
    if command -v top >/dev/null 2>&1; then
        local cpu_percent=$(top -b -n 1 -p $$ 2>/dev/null | awk 'NR>7 {print $9}' | head -1 || echo "0")

        if (( $(echo "$cpu_percent > $MAX_CPU_PERCENT" | bc -l 2>/dev/null || echo "0") )); then
            echo "⚠️ [$log_prefix] High CPU: ${cpu_percent}%" >&2
        fi
    fi

    # Warning timeout check
    if (( elapsed > WARNING_TIMEOUT )); then
        echo "⏰ [$log_prefix] Long running: ${elapsed}s" >&2
    fi
}

execute_with_monitoring() {
    local command="$1"
    local timeout="$2"
    local log_prefix="$3"

    echo "   Executing: $command" >&2

    # Store command PID for monitoring
    local child_pid

    # Execute command with timeout
    if command -v timeout >/dev/null 2>&1; then
        # Use system timeout if available
        timeout "$timeout" bash -c "$command" &
        child_pid=$!
        CFN_INSTRUMENT_STATE["pid"]=$child_pid

        echo "   Process PID: $child_pid" >&2

        # Wait for completion with monitoring
        local wait_result=0
        while kill -0 $child_pid 2>/dev/null; do
            sleep 5

            # Check if we're approaching timeout
            local elapsed=$(($(date +%s) - CFN_INSTRUMENT_STATE[start_time]))
            if (( elapsed > timeout - 10 )); then
                echo "⚠️ [$log_prefix] Approaching hard timeout, preparing graceful shutdown" >&2
            fi
        done

        wait $child_pid
        wait_result=$?

    else
        # Fallback without system timeout
        echo "   Running without system timeout (not available)" >&2
        bash -c "$command" &
        child_pid=$!
        CFN_INSTRUMENT_STATE["pid"]=$child_pid

        # Basic wait (less safe)
        wait $child_pid
        wait_result=$?
    fi

    return $wait_result
}

cleanup_instrumentation() {
    local exit_code="$1"
    local elapsed=$(($(date +%s) - CFN_INSTRUMENT_STATE[start_time]))

    echo "🧹 Process instrumentation cleanup" >&2
    echo "   Exit code: $exit_code" >&2
    echo "   Duration: ${elapsed}s" >&2

    # Kill any remaining background processes
    if [[ -n "${CFN_INSTRUMENT_STATE[pid]:-}" ]] && kill -0 "${CFN_INSTRUMENT_STATE[pid]}" 2>/dev/null; then
        echo "   Terminating child process: ${CFN_INSTRUMENT_STATE[pid]}" >&2
        kill -TERM "${CFN_INSTRUMENT_STATE[pid]}" 2>/dev/null || true
        sleep 2
        kill -KILL "${CFN_INSTRUMENT_STATE[pid]}" 2>/dev/null || true
    fi

    # Clear state
    CFN_INSTRUMENT_STATE["active"]=false
    CFN_INSTRUMENT_STATE["pid"]=0

    echo "✅ Instrumentation cleanup complete" >&2
}

##############################################################################
# Utility Functions
##############################################################################

get_instrumentation_status() {
    if [[ "${CFN_INSTRUMENT_STATE[active]}" == "true" ]]; then
        local elapsed=$(($(date +%s) - CFN_INSTRUMENT_STATE[start_time]))
        echo "CFN Instrumentation Status: ACTIVE"
        echo "  PID: $$"
        echo "  Child PID: ${CFN_INSTRUMENT_STATE[pid]}"
        echo "  Elapsed: ${elapsed}s"
        echo "  Timeout: ${CFN_INSTRUMENT_STATE[timeout]}s"
        echo "  Log Prefix: ${CFN_INSTRUMENT_STATE[log_prefix]}"
    else
        echo "CFN Instrumentation Status: INACTIVE"
    fi
}

force_kill_execution() {
    local signal="${1:-TERM}"

    if [[ "${CFN_INSTRUMENT_STATE[active]}" == "true" ]] && [[ -n "${CFN_INSTRUMENT_STATE[pid]:-}" ]]; then
        echo "🚨 Force killing execution: ${CFN_INSTRUMENT_STATE[pid]} (signal: $signal)" >&2
        kill -"$signal" "${CFN_INSTRUMENT_STATE[pid]}" 2>/dev/null || true

        if [[ "$signal" == "TERM" ]]; then
            sleep 2
            if kill -0 "${CFN_INSTRUMENT_STATE[pid]}" 2>/dev/null; then
                kill -KILL "${CFN_INSTRUMENT_STATE[pid]}" 2>/dev/null || true
            fi
        fi
    fi
}

##############################################################################
# Signal Handlers
##############################################################################

setup_signal_handlers() {
    trap 'handle_instrumentation_signal INT' INT
    trap 'handle_instrumentation_signal TERM' TERM
    trap 'handle_instrumentation_signal HUP' HUP
}

handle_instrumentation_signal() {
    local signal="$1"
    echo "🛑 Instrumentation received signal: $signal" >&2

    if [[ "${CFN_INSTRUMENT_STATE[active]}" == "true" ]]; then
        force_kill_execution TERM
        cleanup_instrumentation 130
    fi

    exit 130
}

##############################################################################
# Auto-initialization
##############################################################################

# If script is sourced, make instrumentation available
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    echo "🔧 CFN Process Instrumentation loaded" >&2
    echo "   Use: wrap_execution <command> <timeout> <log_prefix>" >&2
    setup_signal_handlers
fi

# If script is executed directly, show usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "CFN Process Instrumentation v1.0.0"
    echo ""
    echo "Usage:"
    echo "  source wrapped-executor.sh"
    echo "  wrap_execution \"command\" timeout log_prefix"
    echo ""
    echo "Example:"
    echo "  wrap_execution \"npx claude-flow-novice agent coder\" 300 \"agent-execution\""
    echo ""

    # Test run if arguments provided
    if [[ $# -gt 0 ]]; then
        wrap_execution "$@"
    fi
fi