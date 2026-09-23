#!/usr/bin/env bash
set -euo pipefail

# Process Lifecycle Advanced Management Script (Prototype/Demo)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_PATH="${SCRIPT_DIR}/config.json"
REDIS_CHANNEL="process-lifecycle"
LOG_DIR="${HOME}/.cfn/logs/processes"
RUN_DIR="${HOME}/.cfn/run"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create necessary directories with error handling
create_directories() {
    for dir in "$LOG_DIR" "$RUN_DIR"; do
        if ! mkdir -p "$dir" 2>/dev/null; then
            echo "ERROR: Failed to create directory: $dir" >&2
            exit 1
        fi
        
        if [[ ! -w "$dir" ]]; then
            echo "ERROR: Directory is not writable: $dir" >&2
            exit 1
        fi
    done
}

# Ensure directories exist and are writable
create_directories

# Logging function with multiple verbosity levels
log() {
    local level="$1"
    local message="$2"
    local log_file="${LOG_DIR}/${level,,}_${TIMESTAMP}.log"
    local color=""

    case "$level" in
        ERROR)   color="\e[31m" ;; # Red
        WARN)    color="\e[33m" ;; # Yellow
        INFO)    color="\e[34m" ;; # Blue
        DEBUG)   color="\e[37m" ;; # White
        *)       color="\e[0m"  ;; # Default
    esac

    # Log to file and stderr with color
    echo -e "[${color}${level^^}\e[0m] $(date -Iseconds) - $message" | tee -a "$log_file" >&2
}

# Environment configuration and defaults
PROCESS_ID="${PROCESS_ID:-}"
ACTION="${1:-}"
VERBOSE="${VERBOSE:-false}"

# Configuration and validation
load_config() {
    if [[ ! -f "$CONFIG_PATH" ]]; then
        log "ERROR" "Configuration file not found: $CONFIG_PATH"
        exit 1
    fi
    jq -c '.' "$CONFIG_PATH"
}

validate_process() {
    local process_id="$1"
    jq -e --arg process "$process_id" \
        '.processTypes[$process]' "$CONFIG_PATH" > /dev/null 2>&1
}

# PID file management
get_pid_file() {
    echo "${RUN_DIR}/${PROCESS_ID}.pid"
}

is_process_running() {
    local pid_file="$1"
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            # PID file exists but process is dead, clean up
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# Process health checking
check_process_health() {
    local process_id="$1"
    local pid_file=$(get_pid_file)
    
    if ! is_process_running "$pid_file"; then
        echo "STOPPED"
        return 0
    fi
    
    local pid=$(cat "$pid_file")
    local health_status="RUNNING"
    
    # Check CPU usage (simulation)
    local cpu_usage=$(ps -p "$pid" -o %cpu --no-headers 2>/dev/null | tr -d ' ' || echo "0")
    if (( $(echo "$cpu_usage > 90" | bc -l) )); then
        health_status="HIGH_CPU"
    fi
    
    # Check memory usage (simulation)
    local mem_usage=$(ps -p "$pid" -o %mem --no-headers 2>/dev/null | tr -d ' ' || echo "0")
    if (( $(echo "$mem_usage > 80" | bc -l) )); then
        health_status="HIGH_MEM"
    fi
    
    echo "$health_status"
}

# Advanced process management functions
start_process() {
    local process_id="$1"
    local pid_file=$(get_pid_file)

    if ! validate_process "$process_id"; then
        log "ERROR" "Invalid process type: $process_id"
        return 1
    fi

    # Check if already running
    if is_process_running "$pid_file"; then
        log "WARN" "Process $process_id is already running"
        return 0
    fi

    # Dependency validation
    local dependencies=$(jq -r --arg process "$process_id" \
        '.processTypes[$process].dependencies[]' "$CONFIG_PATH" 2>/dev/null || true)

    for dep in $dependencies; do
        local dep_pid_file="${RUN_DIR}/${dep}.pid"
        if ! is_process_running "$dep_pid_file"; then
            log "WARN" "Dependency $dep not running, cannot start $process_id"
            return 1
        fi
    done

    log "INFO" "Starting process: $process_id (DEMO MODE)"

    # Simulate process start with a background task
    case "$process_id" in
        "web-server")
            # Simulate web server with a simple HTTP server
            (
                echo $$ > "$pid_file"
                log "INFO" "Process $process_id started with PID $$"
                # Simulate work
                while true; do
                    sleep 5
                    echo "$(date): $process_id heartbeat" >> "${LOG_DIR}/${process_id}_heartbeat.log"
                done
            ) &
            ;;
        "database")
            # Simulate database process
            (
                echo $$ > "$pid_file"
                log "INFO" "Process $process_id started with PID $$"
                while true; do
                    sleep 3
                    echo "$(date): $process_id processing transactions" >> "${LOG_DIR}/${process_id}_heartbeat.log"
                done
            ) &
            ;;
        "cache-service")
            # Simulate cache service
            (
                echo $$ > "$pid_file"
                log "INFO" "Process $process_id started with PID $$"
                while true; do
                    sleep 2
                    echo "$(date): $process_id cache refresh" >> "${LOG_DIR}/${process_id}_heartbeat.log"
                done
            ) &
            ;;
        *)
            # Generic process simulation
            (
                echo $$ > "$pid_file"
                log "INFO" "Process $process_id started with PID $$"
                while true; do
                    sleep 10
                    echo "$(date): $process_id running" >> "${LOG_DIR}/${process_id}_heartbeat.log"
                done
            ) &
            ;;
    esac

    # Give process time to start
    sleep 1

    # Verify process started
    if is_process_running "$pid_file"; then
        log "INFO" "Process $process_id successfully started"
        
        # Publish Redis event for coordination
        npx redis-cli PUBLISH "$REDIS_CHANNEL" \
            "$(jq -n \
                --arg process "$process_id" \
                --arg action "start" \
                --arg pid "$(cat "$pid_file")" \
                '{process: $process, action: $action, pid: $pid, timestamp: now}')" 2>/dev/null || true
    else
        log "ERROR" "Failed to start process $process_id"
        return 1
    fi
}

stop_process() {
    local process_id="$1"
    local pid_file=$(get_pid_file)

    # Check for dependent processes
    local dependent_processes=$(jq -r \
        --arg process "$process_id" \
        '.processTypes | to_entries[] | select(.value.dependencies[] == $process) | .key' \
        "$CONFIG_PATH" 2>/dev/null || true)

    for dep in $dependent_processes; do
        local dep_pid_file="${RUN_DIR}/${dep}.pid"
        if is_process_running "$dep_pid_file"; then
            log "WARN" "Cannot stop $process_id, dependent process $dep is running"
            return 1
        fi
    done

    if ! is_process_running "$pid_file"; then
        log "WARN" "Process $process_id is not running"
        return 0
    fi

    log "INFO" "Stopping process: $process_id"

    local pid=$(cat "$pid_file")
    
    # Graceful shutdown
    if kill -TERM "$pid" 2>/dev/null; then
        # Wait for graceful shutdown
        local count=0
        while is_process_running "$pid_file" && [[ $count -lt 10 ]]; do
            sleep 1
            ((count++))
        done
        
        # Force kill if still running
        if is_process_running "$pid_file"; then
            log "WARN" "Force killing process $process_id"
            kill -KILL "$pid" 2>/dev/null || true
            sleep 1
        fi
    fi

    # Clean up PID file
    rm -f "$pid_file"
    
    log "INFO" "Process $process_id stopped"

    # Publish Redis event for coordination
    npx redis-cli PUBLISH "$REDIS_CHANNEL" \
        "$(jq -n \
            --arg process "$process_id" \
            --arg action "stop" \
            '{process: $process, action: $action, timestamp: now}')" 2>/dev/null || true
}

# Cleanup function for orphaned processes
cleanup_orphaned() {
    log "INFO" "Checking for orphaned processes..."
    
    for pid_file in "${RUN_DIR}"/*.pid; do
        if [[ -f "$pid_file" ]]; then
            local process_name=$(basename "$pid_file" .pid)
            if ! is_process_running "$pid_file"; then
                log "INFO" "Cleaning up orphaned PID file for $process_name"
                rm -f "$pid_file"
            fi
        fi
    done
}

# Main CLI router with enhanced error handling
main() {
    # Cleanup orphaned processes on startup
    cleanup_orphaned

    # Validate inputs
    if [[ -z "$PROCESS_ID" ]]; then
        log "ERROR" "PROCESS_ID must be specified"
        exit 1
    fi

    case "$ACTION" in
        start)
            start_process "$PROCESS_ID"
            ;;
        stop)
            stop_process "$PROCESS_ID"
            ;;
        restart)
            stop_process "$PROCESS_ID"
            sleep 2
            start_process "$PROCESS_ID"
            ;;
        status)
            local status=$(check_process_health "$PROCESS_ID")
            echo "$status"
            ;;
        health)
            local health=$(check_process_health "$PROCESS_ID")
            log "INFO" "Process $PROCESS_ID health: $health"
            echo "$health"
            ;;
        cleanup)
            cleanup_orphaned
            ;;
        *)
            log "ERROR" "Invalid action. Use: start|stop|restart|status|health|cleanup"
            exit 1
            ;;
    esac
}

# Enable verbose mode if requested
$VERBOSE && set -x

# Execute main function
main "$@"