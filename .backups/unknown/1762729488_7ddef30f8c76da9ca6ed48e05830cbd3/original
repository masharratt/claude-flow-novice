#!/usr/bin/env bash

##############################################################################
# CFN Task Mode Environment Sanitizer
# Prevents memory leaks and environment contamination in CFN Loop execution
#
# Usage:
#   source task-mode-env-sanitizer.sh
#   sanitize_task_mode_environment <mode>
#
# Modes:
#   cli - CLI mode execution (production)
#   task - Task mode execution (debugging)
##############################################################################

set -euo pipefail

# Global state tracking
declare -A CFN_SANITIZER_STATE
CFN_SANITIZER_STATE["initialized"]=false
CFN_SANITIZER_STATE["mode"]=""
CFN_SANITIZER_STATE["start_time"]=$(date +%s)

# Memory leak prevention thresholds
readonly MAX_AGENT_PROCESSES=50
readonly MAX_MEMORY_MB=4096
readonly MAX_RUNTIME_SECONDS=3600  # 1 hour

##############################################################################
# Core Sanitization Functions
##############################################################################

sanitize_task_mode_environment() {
    local mode="${1:-task}"

    # Initialize sanitizer state
    CFN_SANITIZER_STATE["mode"]="$mode"
    CFN_SANITIZER_STATE["initialized"]=true

    echo "🧹 CFN Environment Sanitizer v1.0.0" >&2
    echo "   Mode: $mode" >&2
    echo "   PID: $$" >&2
    echo "   Start: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2

    # Apply mode-specific sanitization
    case "$mode" in
        "cli")
            sanitize_cli_environment
            ;;
        "task")
            sanitize_task_environment
            ;;
        *)
            echo "⚠️ Unknown mode: $mode, applying default sanitization" >&2
            sanitize_default_environment
            ;;
    esac

    # Setup monitoring and cleanup hooks
    setup_environment_monitoring
    setup_cleanup_hooks

    echo "✅ Environment sanitization complete" >&2
}

sanitize_cli_environment() {
    echo "   Applying CLI mode sanitization..." >&2

    # Clear any previous agent state
    unset AGENT_ID 2>/dev/null || true
    unset TASK_ID 2>/dev/null || true
    unset SWARM_ID 2>/dev/null || true

    # Optimize for production CLI execution
    export CFN_MODE="cli"
    export CFN_SANITIZER_ACTIVE=true

    # Set conservative resource limits
    ulimit -u $MAX_AGENT_PROCESSES 2>/dev/null || true
    ulimit -v $((MAX_MEMORY_MB * 1024)) 2>/dev/null || true

    # Disable debug features in production
    export CFN_DEBUG=false
    export CFN_VERBOSE=false
}

sanitize_task_environment() {
    echo "   Applying Task mode sanitization..." >&2

    # Task mode allows more debugging
    export CFN_MODE="task"
    export CFN_SANITIZER_ACTIVE=true

    # More permissive limits for debugging
    ulimit -u $((MAX_AGENT_PROCESSES * 2)) 2>/dev/null || true
    ulimit -v $((MAX_MEMORY_MB * 1024 * 2)) 2>/dev/null || true

    # Enable debug features for task mode
    export CFN_DEBUG=${CFN_DEBUG:-true}
    export CFN_VERBOSE=${CFN_VERBOSE:-true}
}

sanitize_default_environment() {
    echo "   Applying default sanitization..." >&2

    # Basic sanitization for unknown modes
    export CFN_MODE="unknown"
    export CFN_SANITIZER_ACTIVE=true

    # Conservative limits
    ulimit -u $MAX_AGENT_PROCESSES 2>/dev/null || true
}

##############################################################################
# Environment Monitoring
##############################################################################

setup_environment_monitoring() {
    # Start background monitoring if available
    if command -v timeout >/dev/null 2>&1; then
        (
            sleep $MAX_RUNTIME_SECONDS
            if [[ "${CFN_SANITIZER_STATE[initialized]}" == "true" ]]; then
                echo "⚠️ CFN Environment timeout reached, forcing cleanup" >&2
                force_environment_cleanup
            fi
        ) &
        echo "   Started runtime monitoring (${MAX_RUNTIME_SECONDS}s)" >&2
    fi
}

setup_cleanup_hooks() {
    # Setup cleanup trap for graceful shutdown
    trap 'environment_cleanup_on_exit' EXIT
    trap 'environment_cleanup_on_signal INT' INT
    trap 'environment_cleanup_on_signal TERM' TERM
    trap 'environment_cleanup_on_signal HUP' HUP
}

environment_cleanup_on_exit() {
    echo "🧹 CFN Environment cleanup on exit" >&2

    # Calculate runtime
    local end_time=$(date +%s)
    local runtime=$((end_time - CFN_SANITIZER_STATE["start_time"]))
    echo "   Runtime: ${runtime}s" >&2

    # Mode-specific cleanup
    case "${CFN_SANITIZER_STATE[mode]}" in
        "cli")
            cleanup_cli_environment
            ;;
        "task")
            cleanup_task_environment
            ;;
    esac

    # Clear sanitizer state
    CFN_SANITIZER_STATE["initialized"]=false
    echo "✅ Environment cleanup complete" >&2
}

environment_cleanup_on_signal() {
    local signal="$1"
    echo "🧹 CFN Environment cleanup on signal: $signal" >&2
    environment_cleanup_on_exit
    exit 130
}

cleanup_cli_environment() {
    echo "   CLI mode cleanup..." >&2

    # Clean up any lingering agent processes
    if command -v pgrep >/dev/null 2>&1; then
        local agent_pids=$(pgrep -f "claude-flow-novice.*agent" 2>/dev/null || true)
        if [[ -n "$agent_pids" ]]; then
            echo "   Warning: Found agent processes: $agent_pids" >&2
        fi
    fi
}

cleanup_task_environment() {
    echo "   Task mode cleanup..." >&2
    # Task mode cleanup - more permissive
}

force_environment_cleanup() {
    echo "🚨 Force cleanup triggered!" >&2

    # Kill any remaining processes in this process group
    if [[ -n "${CFN_PROCESS_GROUP:-}" ]]; then
        kill -TERM -$CFN_PROCESS_GROUP 2>/dev/null || true
        sleep 2
        kill -KILL -$CFN_PROCESS_GROUP 2>/dev/null || true
    fi

    # Force exit
    exit 1
}

##############################################################################
# Utility Functions
##############################################################################

check_environment_health() {
    local mode="${1:-${CFN_SANITIZER_STATE[mode]}}"

    if [[ "${CFN_SANITIZER_STATE[initialized]}" != "true" ]]; then
        echo "❌ Environment sanitizer not initialized" >&2
        return 1
    fi

    # Check memory usage
    if command -v ps >/dev/null 2>&1; then
        local memory_mb=$(ps -o rss= -p $$ 2>/dev/null | awk '{print $1/1024}' || echo "0")
        if (( $(echo "$memory_mb > $MAX_MEMORY_MB" | bc -l 2>/dev/null || echo "0") )); then
            echo "⚠️ High memory usage: ${memory_mb}MB" >&2
        fi
    fi

    # Check process count
    if command -v ps >/dev/null 2>&1; then
        local process_count=$(ps -eo pid=,ppid= | grep -c "^[[:space:]]*$$[[:space:]]" || echo "0")
        if (( process_count > MAX_AGENT_PROCESSES )); then
            echo "⚠️ High process count: $process_count" >&2
        fi
    fi

    echo "✅ Environment health check passed" >&2
    return 0
}

get_sanitizer_info() {
    echo "CFN Environment Sanitizer Info:"
    echo "  Initialized: ${CFN_SANITIZER_STATE[initialized]}"
    echo "  Mode: ${CFN_SANITIZER_STATE[mode]}"
    echo "  Start Time: ${CFN_SANITIZER_STATE[start_time]}"
    echo "  PID: $$"
    echo "  Runtime: $(($(date +%s) - CFN_SANITIZER_STATE[start_time]))s"
}

##############################################################################
# Auto-initialization for safety
##############################################################################

# If script is sourced (not executed), make sanitizer available
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    echo "🔧 CFN Environment Sanitizer loaded" >&2
    echo "   Use: sanitize_task_mode_environment <mode>" >&2
fi

# If script is executed directly, run with default mode
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    sanitize_task_mode_environment "${1:-task}"
fi