#!/bin/bash
# MVP Coordinator - Sprint 1.1 Core CLI Framework
# Manages agent lifecycle, status monitoring, and IPC coordination

set -euo pipefail

# Configuration
CFN_SHM_BASE="/dev/shm/cfn-mvp"
CONTROL_DIR="$CFN_SHM_BASE/control"
STATUS_DIR="$CFN_SHM_BASE/status"
CHECKPOINT_DIR="$CFN_SHM_BASE/checkpoints"
MESSAGES_DIR="$CFN_SHM_BASE/messages"
LOGS_DIR="$CFN_SHM_BASE/logs"
PIDS_FILE="$CFN_SHM_BASE/agent-pids.txt"
POLL_INTERVAL_MS=100

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# SECURITY: Validate agent_id (alphanumeric, dash, underscore only - no path traversal)
validate_agent_id() {
    local id="$1"
    if [[ ! "$id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid agent_id: must be alphanumeric with dash/underscore only"
        return 1
    fi
    if [[ "$id" == *".."* ]] || [[ "$id" == *"/"* ]]; then
        log_error "Path traversal detected in agent_id"
        return 1
    fi
    return 0
}

# SECURITY: Sanitize JSON string (escape special characters to prevent injection)
sanitize_json_string() {
    local input="$1"
    # Escape backslashes, double quotes, newlines, tabs
    echo "$input" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g; s/\t/\\t/g'
}

# Initialize /dev/shm structure
cmd_init() {
    log_info "Initializing CFN MVP coordinator structure..."

    # Check /dev/shm quota (require at least 10MB free)
    local shm_available=$(df /dev/shm | awk 'NR==2 {print $4}')
    local min_required=10240  # 10MB in KB

    if [[ -n "$shm_available" ]] && [[ "$shm_available" -lt "$min_required" ]]; then
        log_error "/dev/shm has insufficient space: ${shm_available}KB available, ${min_required}KB required"
        log_error "Please free up space in /dev/shm or increase quota"
        return 1
    fi

    # Remove existing structure if present
    if [[ -d "$CFN_SHM_BASE" ]]; then
        log_warn "Removing existing CFN MVP structure"
        rm -rf "$CFN_SHM_BASE"
    fi

    # Create directory structure
    mkdir -p "$CONTROL_DIR" "$STATUS_DIR" "$CHECKPOINT_DIR" "$MESSAGES_DIR" "$LOGS_DIR"

    # SECURITY: Set restrictive permissions (rwx------) on all directories - owner-only access
    chmod 700 "$CFN_SHM_BASE" "$CONTROL_DIR" "$STATUS_DIR" "$CHECKPOINT_DIR" "$MESSAGES_DIR" "$LOGS_DIR"

    # Initialize PID tracking file with restricted permissions
    touch "$PIDS_FILE"
    chmod 600 "$PIDS_FILE"

    log_success "CFN MVP structure initialized at $CFN_SHM_BASE with secure permissions (chmod 700)"
    echo "Structure:"
    tree -L 2 "$CFN_SHM_BASE" 2>/dev/null || find "$CFN_SHM_BASE" -type d | sed 's|[^/]*/| |g'
}

# Spawn an agent as background process
cmd_spawn() {
    local agent_id="$1"
    local agent_type="$2"
    local task_description="$3"

    if [[ -z "$agent_id" ]] || [[ -z "$agent_type" ]] || [[ -z "$task_description" ]]; then
        log_error "Usage: spawn <agent-id> <agent-type> <task-description>"
        return 1
    fi

    # SECURITY: Validate agent_id for path traversal and invalid characters
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    # SECURITY: Sanitize task_description for JSON injection
    local safe_task=$(sanitize_json_string "$task_description")

    log_info "Spawning agent: $agent_id (type: $agent_type)"

    # Create agent status file
    local status_file="$STATUS_DIR/${agent_id}.json"
    cat > "$status_file" <<EOF
{
  "agent_id": "$agent_id",
  "type": "$agent_type",
  "status": "initializing",
  "pid": null,
  "task": "$safe_task",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "last_heartbeat": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "confidence": 0.0,
  "progress": 0
}
EOF

    # SECURITY: Set restrictive permissions on status file (rw-------)
    chmod 600 "$status_file"

    # Create agent log file
    local log_file="$LOGS_DIR/${agent_id}.log"
    touch "$log_file"
    chmod 600 "$log_file"

    # Determine script directory for mvp-agent.sh path resolution
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local agent_script="$script_dir/mvp-agent.sh"
    local message_bus_script="$script_dir/message-bus.sh"

    # Verify mvp-agent.sh exists
    if [[ ! -f "$agent_script" ]]; then
        log_error "Agent script not found: $agent_script"
        return 1
    fi

    # Initialize message bus for agent
    if [[ -f "$message_bus_script" ]]; then
        "$message_bus_script" init "$agent_id"
    fi

    # Spawn actual mvp-agent.sh as background process (pass sanitized task)
    "$agent_script" "$agent_id" "$agent_type" "$safe_task" &
    local agent_pid=$!

    # SECURITY: Record PID with file locking to prevent race conditions
    (
        flock -x 200
        echo "$agent_id:$agent_pid" >> "$PIDS_FILE"
    ) 200>"$PIDS_FILE.lock"

    log_success "Agent $agent_id spawned with PID $agent_pid"

    # Wait for status file to be updated by agent
    sleep 0.2
}

# Show status of all agents
cmd_status() {
    log_info "Agent Status Summary:"
    echo ""

    if [[ ! -f "$PIDS_FILE" ]] || [[ ! -s "$PIDS_FILE" ]]; then
        log_warn "No agents currently running"
        return 0
    fi

    printf "%-12s %-10s %-8s %-12s %-10s %-8s\n" "AGENT_ID" "TYPE" "PID" "STATUS" "CONFIDENCE" "PROGRESS"
    printf "%.75s\n" "$(printf '=%.0s' {1..75})"

    while IFS=: read -r agent_id agent_pid; do
        # SECURITY: Validate agent_id from PIDS_FILE before use
        if ! validate_agent_id "$agent_id"; then
            log_warn "Invalid agent_id in PIDS_FILE: $agent_id"
            continue
        fi

        local status_file="$STATUS_DIR/${agent_id}.json"

        if [[ -f "$status_file" ]]; then
            local type=$(jq -r '.type' "$status_file" 2>/dev/null || echo "unknown")
            local status=$(jq -r '.status' "$status_file" 2>/dev/null || echo "unknown")
            local pid=$(jq -r '.pid' "$status_file" 2>/dev/null || echo "N/A")
            local confidence=$(jq -r '.confidence' "$status_file" 2>/dev/null || echo "0.0")
            local progress=$(jq -r '.progress' "$status_file" 2>/dev/null || echo "0")

            # Check if process is still alive
            if ! kill -0 "$agent_pid" 2>/dev/null; then
                status="${RED}dead${NC}"
            fi

            printf "%-12s %-10s %-8s %-12s %-10s %-7s%%\n" \
                "$agent_id" "$type" "$pid" "$status" "$confidence" "$progress"
        else
            log_warn "Status file missing for $agent_id (PID: $agent_pid)"
        fi
    done < "$PIDS_FILE"

    echo ""
}

# Pause an agent (SIGSTOP)
cmd_pause() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Usage: pause <agent-id>"
        return 1
    fi

    # SECURITY: Validate agent_id before use
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local agent_pid=$(grep "^${agent_id}:" "$PIDS_FILE" 2>/dev/null | cut -d: -f2)

    if [[ -z "$agent_pid" ]]; then
        log_error "Agent $agent_id not found in PID tracking"
        return 1
    fi

    # Validate agent is running before pause
    if ! kill -0 "$agent_pid" 2>/dev/null; then
        log_error "Agent $agent_id (PID: $agent_pid) is not running - cannot pause"
        return 1
    fi

    # Check if already paused
    local state=$(ps -o state= -p "$agent_pid" 2>/dev/null | tr -d ' ')
    if [[ "$state" == "T" ]]; then
        log_warn "Agent $agent_id (PID: $agent_pid) is already paused"
        return 0
    fi

    log_info "Pausing agent $agent_id (PID: $agent_pid)"
    kill -STOP "$agent_pid"

    # Update status file with paused state and timestamp
    local status_file="$STATUS_DIR/${agent_id}.json"
    if [[ -f "$status_file" ]]; then
        local paused_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        jq --arg paused_at "$paused_at" '.status = "paused" | .paused_at = $paused_at' \
            "$status_file" > "${status_file}.tmp" && mv "${status_file}.tmp" "$status_file"
        chmod 600 "$status_file"
    fi

    log_success "Agent $agent_id paused successfully"
}

# Resume an agent (SIGCONT)
cmd_resume() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Usage: resume <agent-id>"
        return 1
    fi

    # SECURITY: Validate agent_id before use
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local agent_pid=$(grep "^${agent_id}:" "$PIDS_FILE" 2>/dev/null | cut -d: -f2)

    if [[ -z "$agent_pid" ]]; then
        log_error "Agent $agent_id not found in PID tracking"
        return 1
    fi

    # Validate agent is running before resume
    if ! kill -0 "$agent_pid" 2>/dev/null; then
        log_error "Agent $agent_id (PID: $agent_pid) is not running - cannot resume"
        return 1
    fi

    # Check if already running (not paused)
    local state=$(ps -o state= -p "$agent_pid" 2>/dev/null | tr -d ' ')
    if [[ "$state" != "T" ]]; then
        log_warn "Agent $agent_id (PID: $agent_pid) is already running (not paused)"
        return 0
    fi

    log_info "Resuming agent $agent_id (PID: $agent_pid)"
    kill -CONT "$agent_pid"

    # Update status file - restore to running state and clear paused_at
    local status_file="$STATUS_DIR/${agent_id}.json"
    if [[ -f "$status_file" ]]; then
        local resumed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        jq --arg resumed_at "$resumed_at" '.status = "running" | .resumed_at = $resumed_at | del(.paused_at)' \
            "$status_file" > "${status_file}.tmp" && mv "${status_file}.tmp" "$status_file"
        chmod 600 "$status_file"
    fi

    log_success "Agent $agent_id resumed successfully"
}

# Trigger checkpoint for an agent
cmd_checkpoint() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Usage: checkpoint <agent-id>"
        return 1
    fi

    # SECURITY: Validate agent_id before use
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local cmd_file="$CONTROL_DIR/${agent_id}.cmd"
    echo "checkpoint" > "$cmd_file"

    # SECURITY: Set restrictive permissions on control file (rw-------)
    chmod 600 "$cmd_file"

    log_success "Checkpoint command sent to agent $agent_id"
}

# List available checkpoints for an agent
cmd_list_checkpoints() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Usage: list-checkpoints <agent-id>"
        return 1
    fi

    # SECURITY: Validate agent_id before use
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local agent_checkpoint_dir="$CHECKPOINT_DIR/${agent_id}"

    if [[ ! -d "$agent_checkpoint_dir" ]]; then
        log_warn "No checkpoint directory for agent $agent_id"
        return 0
    fi

    log_info "Checkpoints for agent $agent_id:"
    echo ""

    # Find all checkpoint files, sort by modification time
    if compgen -G "$agent_checkpoint_dir/checkpoint-*.json" > /dev/null; then
        printf "%-30s %-12s %-20s %-10s\n" "CHECKPOINT FILE" "SIZE" "TIMESTAMP" "PHASE"
        printf "%.75s\n" "$(printf '=%.0s' {1..75})"

        find "$agent_checkpoint_dir" -name "checkpoint-*.json" -type f -printf '%T@ %p %s\n' | \
            sort -rn | \
            while IFS=' ' read -r mtime filepath size; do
                local filename=$(basename "$filepath")
                local timestamp_epoch=$(echo "$filename" | sed 's/checkpoint-\([0-9]*\)\.json/\1/')
                local timestamp_human=$(date -d "@${timestamp_epoch}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "N/A")
                local phase=$(grep -o '"phase"[[:space:]]*:[[:space:]]*"[^"]*"' "$filepath" 2>/dev/null | sed 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "unknown")

                # Highlight current checkpoint
                if [[ -L "$agent_checkpoint_dir/current.json" ]]; then
                    local current_target=$(readlink "$agent_checkpoint_dir/current.json")
                    if [[ "$current_target" == "$filename" ]]; then
                        filename="${GREEN}${filename} (current)${NC}"
                    fi
                fi

                printf "%-30s %-12s %-20s %-10s\n" "$filename" "${size}B" "$timestamp_human" "$phase"
            done
    else
        log_warn "No checkpoints found for agent $agent_id"
    fi

    echo ""
}

# Restore agent from specific checkpoint
cmd_restore() {
    local agent_id="$1"
    local checkpoint_file="${2:-current.json}"

    if [[ -z "$agent_id" ]]; then
        log_error "Usage: restore <agent-id> [checkpoint-file]"
        return 1
    fi

    # SECURITY: Validate agent_id before use
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local agent_checkpoint_dir="$CHECKPOINT_DIR/${agent_id}"
    local target_checkpoint="$agent_checkpoint_dir/$checkpoint_file"

    # Validate checkpoint file exists
    if [[ ! -f "$target_checkpoint" ]] && [[ ! -L "$target_checkpoint" ]]; then
        log_error "Checkpoint file not found: $checkpoint_file"
        return 1
    fi

    # Follow symlink if needed
    if [[ -L "$target_checkpoint" ]]; then
        target_checkpoint="$(readlink -f "$target_checkpoint")"
    fi

    log_info "Restoring agent $agent_id from checkpoint: $(basename "$target_checkpoint")"

    # Validate checkpoint integrity
    if command -v python3 >/dev/null 2>&1; then
        if ! python3 -m json.tool "$target_checkpoint" >/dev/null 2>&1; then
            log_error "Invalid JSON in checkpoint file"
            return 1
        fi
    fi

    # Extract checkpoint metadata
    local phase=$(grep -o '"phase"[[:space:]]*:[[:space:]]*"[^"]*"' "$target_checkpoint" | sed 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    local tasks_completed=$(grep -o '"tasks_completed"[[:space:]]*:[[:space:]]*[0-9]*' "$target_checkpoint" | sed 's/.*:[[:space:]]*\([0-9]*\).*/\1/')
    local confidence=$(grep -o '"confidence"[[:space:]]*:[[:space:]]*[0-9.]*' "$target_checkpoint" | sed 's/.*:[[:space:]]*\([0-9.]*\).*/\1/')

    log_success "Checkpoint metadata:"
    echo "  Phase: $phase"
    echo "  Tasks completed: $tasks_completed"
    echo "  Confidence: $confidence"
    echo ""

    # Update current.json symlink
    local current_link="$agent_checkpoint_dir/current.json"
    rm -f "$current_link"
    ln -s "$(basename "$target_checkpoint")" "$current_link"

    log_success "Restored agent $agent_id to checkpoint: $(basename "$target_checkpoint")"

    # Check if agent is currently running and send RESTORE command
    local agent_pid=$(grep "^${agent_id}:" "$PIDS_FILE" 2>/dev/null | cut -d: -f2)

    if [[ -n "$agent_pid" ]] && kill -0 "$agent_pid" 2>/dev/null; then
        log_info "Agent $agent_id is running (PID: $agent_pid) - triggering live restore"

        local cmd_file="$CONTROL_DIR/${agent_id}.cmd"
        echo "RESTORE" > "$cmd_file"
        chmod 600 "$cmd_file"

        log_success "Live restore command sent to agent $agent_id"
        log_info "Agent will restore state from checkpoint during next control check"
    else
        log_info "Agent $agent_id is not running - will restore from checkpoint on next start"
    fi
}

# Shutdown all agents and cleanup
cmd_shutdown() {
    log_info "Initiating coordinator shutdown..."

    if [[ ! -f "$PIDS_FILE" ]] || [[ ! -s "$PIDS_FILE" ]]; then
        log_warn "No agents to shutdown"
    else
        # Send shutdown command to all agents
        while IFS=: read -r agent_id agent_pid; do
            # SECURITY: Validate agent_id from PIDS_FILE before use
            if ! validate_agent_id "$agent_id"; then
                log_warn "Skipping invalid agent_id: $agent_id"
                continue
            fi

            log_info "Sending shutdown to agent $agent_id (PID: $agent_pid)"

            local cmd_file="$CONTROL_DIR/${agent_id}.cmd"
            echo "shutdown" > "$cmd_file"
            chmod 600 "$cmd_file"

            # Wait briefly for graceful shutdown
            sleep 0.5

            # Force kill if still alive
            if kill -0 "$agent_pid" 2>/dev/null; then
                log_warn "Force killing agent $agent_id (PID: $agent_pid)"
                kill -9 "$agent_pid" 2>/dev/null || true
            fi

            # Cleanup message bus for agent
            local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            local message_bus_script="$script_dir/message-bus.sh"
            if [[ -f "$message_bus_script" ]]; then
                "$message_bus_script" cleanup "$agent_id"
            fi
        done < "$PIDS_FILE"
    fi

    # Cleanup /dev/shm structure
    log_info "Cleaning up CFN MVP structure..."
    rm -rf "$CFN_SHM_BASE"

    log_success "Coordinator shutdown complete"
}

# Main command dispatcher
main() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        init)
            cmd_init "$@"
            ;;
        spawn)
            cmd_spawn "$@"
            ;;
        status)
            cmd_status "$@"
            ;;
        pause)
            cmd_pause "$@"
            ;;
        resume)
            cmd_resume "$@"
            ;;
        checkpoint)
            cmd_checkpoint "$@"
            ;;
        list-checkpoints)
            cmd_list_checkpoints "$@"
            ;;
        restore)
            cmd_restore "$@"
            ;;
        shutdown)
            cmd_shutdown "$@"
            ;;
        help|--help|-h)
            cat <<EOF
CFN MVP Coordinator - Sprint 1.2 State Management

Usage:
  $0 <command> [arguments]

Commands:
  init                                       Setup /dev/shm/cfn-mvp structure
  spawn <agent-id> <type> <task>            Spawn agent as background process
  status                                     Show all agent statuses
  pause <agent-id>                           Pause agent (SIGSTOP)
  resume <agent-id>                          Resume agent (SIGCONT)
  checkpoint <agent-id>                      Trigger checkpoint
  list-checkpoints <agent-id>                List available checkpoints
  restore <agent-id> [checkpoint-file]       Restore from specific checkpoint
  shutdown                                   Cleanup all agents and structure

Examples:
  $0 init
  $0 spawn agent-1 coder "Implement authentication"
  $0 status
  $0 checkpoint agent-1
  $0 list-checkpoints agent-1
  $0 restore agent-1 checkpoint-1738713600.json
  $0 shutdown
EOF
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
