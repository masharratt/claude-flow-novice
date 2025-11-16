#!/usr/bin/env bash
set -euo pipefail

# Process Lifecycle Advanced Management Script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_PATH="${SCRIPT_DIR}/config.json"
REDIS_CHANNEL="process-lifecycle"
LOG_DIR="/var/log/claude-flow/processes"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create log directory
mkdir -p "$LOG_DIR"

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

# Advanced process management functions
start_process() {
    local process_id="$1"

    if ! validate_process "$process_id"; then
        log "ERROR" "Invalid process type: $process_id"
        return 1
    fi

    # Dependency validation
    local dependencies=$(jq -r --arg process "$process_id" \
        '.processTypes[$process].dependencies[]' "$CONFIG_PATH")

    for dep in $dependencies; do
        if ! systemctl is-active "$dep" &>/dev/null; then
            log "WARN" "Dependency $dep not running, cannot start $process_id"
            return 1
        fi
    done

    log "INFO" "Starting process: $process_id"

    # Placeholder for actual process start
    # Would be replaced with actual process management logic
    npx redis-cli PUBLISH "$REDIS_CHANNEL" \
        "$(jq -n \
            --arg process "$process_id" \
            --arg action "start" \
            '{process: $process, action: $action, timestamp: now}')"
}

stop_process() {
    local process_id="$1"

    # Check for dependent processes
    local dependent_processes=$(jq -r \
        --arg process "$process_id" \
        '.processTypes | to_entries[] | select(.value.dependencies[] == $process) | .key' \
        "$CONFIG_PATH")

    for dep in $dependent_processes; do
        if systemctl is-active "$dep" &>/dev/null; then
            log "WARN" "Cannot stop $process_id, dependent process $dep is running"
            return 1
        fi
    done

    log "INFO" "Stopping process: $process_id"

    npx redis-cli PUBLISH "$REDIS_CHANNEL" \
        "$(jq -n \
            --arg process "$process_id" \
            --arg action "stop" \
            '{process: $process, action: $action, timestamp: now}')"
}

# Main CLI router with enhanced error handling
main() {
    # Validate inputs
    if [[ -z "$PROCESS_ID" ]]; then
        log "ERROR" "PROCESS_ID must be specified"
        exit 1
    }

    case "$ACTION" in
        start)
            start_process "$PROCESS_ID"
            ;;
        stop)
            stop_process "$PROCESS_ID"
            ;;
        restart)
            stop_process "$PROCESS_ID"
            start_process "$PROCESS_ID"
            ;;
        status)
            systemctl is-active "$PROCESS_ID" &>/dev/null &&
                echo "RUNNING" ||
                echo "STOPPED"
            ;;
        *)
            log "ERROR" "Invalid action. Use: start|stop|restart|status"
            exit 1
            ;;
    esac
}

# Enable verbose mode if requested
$VERBOSE && set -x

# Execute main function
main "$@"