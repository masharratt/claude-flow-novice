#!/bin/bash

set -euo pipefail

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_SPRINT_ID="1"
LOG_FILE="${SCRIPT_DIR}/logs/execution.log"
PID_FILE="${SCRIPT_DIR}/.execution.pid"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    cleanup
    exit 1
}

# Cleanup function
cleanup() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Terminating process $pid"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2
            kill -KILL "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
    
    # Clean up any orphaned processes
    pkill -f "execute-sprint-task.sh" 2>/dev/null || true
    pkill -f "plan-sprint.sh" 2>/dev/null || true
}

# Trap signals for cleanup
trap cleanup EXIT INT TERM

# Check if required scripts exist
check_dependencies() {
    local required_scripts=("plan-sprint.sh" "execute-sprint-task.sh" "save-checkpoint.sh")
    for script in "${required_scripts[@]}"; do
        if [[ ! -f "${SCRIPT_DIR}/${script}" ]]; then
            error_exit "Required script ${script} not found in ${SCRIPT_DIR}"
        fi
        if [[ ! -x "${SCRIPT_DIR}/${script}" ]]; then
            chmod +x "${SCRIPT_DIR}/${script}"
        fi
    done
}

# Load epic JSON
load_epic() {
    local epic_file="$1"
    if [[ ! -f "$epic_file" ]]; then
        error_exit "Epic file not found: $epic_file"
    fi
    
    # Validate JSON
    if ! jq empty "$epic_file" 2>/dev/null; then
        error_exit "Invalid JSON in epic file: $epic_file"
    fi
    
    log "Loaded epic from: $epic_file"
    echo "$epic_file"
}

# Plan sprint
plan_sprint() {
    local epic_file="$1"
    local sprint_id="$2"
    
    log "Planning sprint $sprint_id..."
    if ! "${SCRIPT_DIR}/plan-sprint.sh" "$epic_file" "$sprint_id"; then
        error_exit "Sprint planning failed"
    fi
    log "Sprint planning completed successfully"
}

# Execute sprint task
execute_task() {
    local task_id="$1"
    local agent_id="$2"
    
    log "Executing task $task_id with agent $agent_id..."
    if ! "${SCRIPT_DIR}/execute-sprint-task.sh" "$task_id" "$agent_id"; then
        error_exit "Task execution failed"
    fi
    log "Task execution completed successfully"
}

# Create checkpoint
create_checkpoint() {
    local checkpoint_name="$1"
    
    log "Creating checkpoint: $checkpoint_name..."
    if ! "${SCRIPT_DIR}/save-checkpoint.sh" "$checkpoint_name"; then
        error_exit "Checkpoint creation failed"
    fi
    log "Checkpoint created successfully"
}

# Show help
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Main execution script for cfn-sprint-execution skill.

OPTIONS:
    -e, --epic FILE         Path to epic JSON file (required)
    -s, --sprint ID         Sprint ID (default: 1)
    -a, --action ACTION     Action to perform: plan, execute, checkpoint, or all
    -t, --task ID           Task ID (required for execute action)
    -g, --agent ID          Agent ID (required for execute action)
    -c, --checkpoint NAME   Checkpoint name (required for checkpoint action)
    -h, --help              Show this help message

ACTIONS:
    plan                    Plan the sprint
    execute                 Execute a specific task
    checkpoint              Create a checkpoint
    all                     Run complete workflow (plan -> execute -> checkpoint)

EXAMPLES:
    $0 -e epic.json -a all
    $0 -e epic.json -s 2 -a plan
    $0 -e epic.json -a execute -t task-123 -g agent-456
    $0 -e epic.json -a checkpoint -c milestone-1

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--epic)
                EPIC_FILE="$2"
                shift 2
                ;;
            -s|--sprint)
                SPRINT_ID="$2"
                shift 2
                ;;
            -a|--action)
                ACTION="$2"
                shift 2
                ;;
            -t|--task)
                TASK_ID="$2"
                shift 2
                ;;
            -g|--agent)
                AGENT_ID="$2"
                shift 2
                ;;
            -c|--checkpoint)
                CHECKPOINT_NAME="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error_exit "Unknown option: $1"
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [[ -z "${EPIC_FILE:-}" ]]; then
        error_exit "Epic file is required. Use -e or --epic option."
    fi
    
    if [[ -z "${ACTION:-}" ]]; then
        error_exit "Action is required. Use -a or --action option."
    fi
    
    case "$ACTION" in
        plan|execute|checkpoint|all)
            ;;
        *)
            error_exit "Invalid action: $ACTION. Must be plan, execute, checkpoint, or all."
            ;;
    esac
    
    if [[ "$ACTION" == "execute" || "$ACTION" == "all" ]]; then
        if [[ -z "${TASK_ID:-}" ]]; then
            error_exit "Task ID is required for execute action. Use -t or --task option."
        fi
        if [[ -z "${AGENT_ID:-}" ]]; then
            error_exit "Agent ID is required for execute action. Use -g or --agent option."
        fi
    fi
    
    if [[ "$ACTION" == "checkpoint" || "$ACTION" == "all" ]]; then
        if [[ -z "${CHECKPOINT_NAME:-}" ]]; then
            CHECKPOINT_NAME="checkpoint-$(date +%Y%m%d-%H%M%S)"
            log "No checkpoint name provided, using: $CHECKPOINT_NAME"
        fi
    fi
    
    SPRINT_ID="${SPRINT_ID:-$DEFAULT_SPRINT_ID}"
}

# Main execution function
main() {
    log "Starting cfn-sprint-execution workflow..."
    log "PID: $$"
    echo "$$" > "$PID_FILE"
    
    # Check dependencies
    check_dependencies
    
    # Load epic
    EPIC_FILE=$(load_epic "$EPIC_FILE")
    
    # Execute based on action
    case "$ACTION" in
        plan)
            plan_sprint "$EPIC_FILE" "$SPRINT_ID"
            ;;
        execute)
            execute_task "$TASK_ID" "$AGENT_ID"
            ;;
        checkpoint)
            create_checkpoint "$CHECKPOINT_NAME"
            ;;
        all)
            plan_sprint "$EPIC_FILE" "$SPRINT_ID"
            execute_task "$TASK_ID" "$AGENT_ID"
            create_checkpoint "$CHECKPOINT_NAME"
            ;;
    esac
    
    log "Workflow completed successfully"
}

# Parse and validate arguments
parse_args "$@"
validate_args

# Run main function
main