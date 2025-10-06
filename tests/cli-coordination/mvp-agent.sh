#!/bin/bash

# MVP Agent Script - CLI Coordination Test
# Simulates agent execution with progress updates, checkpointing, and signal handling

set -euo pipefail

# Source message bus functions
source "$(dirname "${BASH_SOURCE[0]}")/message-bus.sh"

# Use setsid for process group isolation if available
# This prevents orphaned processes when parent coordinator crashes
if command -v setsid >/dev/null 2>&1; then
    # Check if we're already in a new session
    if [[ "$(ps -o sid= -p $$)" == "$(ps -o pid= -p $$)" ]]; then
        : # Already session leader, continue normally
    else
        # Re-exec with setsid if not already session leader
        exec setsid "$0" "$@"
    fi
fi

# Configuration
AGENT_ID="${1:-agent-1}"
AGENT_TYPE="${2:-coder}"
TASK="${3:-default task}"

# SECURITY: Validate agent_id (alphanumeric, dash, underscore only - no path traversal)
if [[ ! "$AGENT_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "ERROR: Invalid AGENT_ID: must be alphanumeric with dash/underscore only" >&2
    exit 1
fi
if [[ "$AGENT_ID" == *".."* ]] || [[ "$AGENT_ID" == *"/"* ]]; then
    echo "ERROR: Path traversal detected in AGENT_ID" >&2
    exit 1
fi

BASE_DIR="/dev/shm/cfn-mvp"
STATUS_DIR="${BASE_DIR}/status"
CHECKPOINT_DIR="${BASE_DIR}/checkpoints/${AGENT_ID}"
CONTROL_DIR="${BASE_DIR}/control"
LOG_DIR="${BASE_DIR}/logs"

# State variables
PHASE="initialization"
PHASE_HISTORY=("initialization")
PROGRESS=0
CONFIDENCE=0.5
TASKS_COMPLETED=0
CURRENT_TASK="${TASK}"
FILES_MODIFIED=()
FINDINGS=()
RUNNING=true

# Logging
LOG_FILE="${LOG_DIR}/${AGENT_ID}.log"

# Ensure directories exist
mkdir -p "${STATUS_DIR}" "${CHECKPOINT_DIR}" "${CONTROL_DIR}" "${LOG_DIR}"

# SECURITY: Set restrictive permissions (rwx------) on checkpoint directory - owner-only access
chmod 700 "${CHECKPOINT_DIR}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${AGENT_ID}] $*" | tee -a "${LOG_FILE}"
}

# Message handling functions

# Check and process inbox messages
check_messages() {
    local inbox_dir="${MESSAGE_BASE_DIR}/${AGENT_ID}/inbox"

    # Count messages without error if dir doesn't exist
    local msg_count=$(find "${inbox_dir}" -maxdepth 1 -name "*.json" -type f 2>/dev/null | wc -l || echo 0)

    if [ "${msg_count}" -eq 0 ]; then
        return 0
    fi

    log "Processing ${msg_count} messages from inbox"

    # Process each message
    for msg_file in "${inbox_dir}"/*.json; do
        if [ ! -f "${msg_file}" ]; then
            continue
        fi

        # Extract message fields (simple grep-based parsing)
        local msg_id=$(grep -o '"msg_id"[[:space:]]*:[[:space:]]*"[^"]*"' "${msg_file}" | sed 's/.*"msg_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        local from_agent=$(grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' "${msg_file}" | sed 's/.*"from"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        local msg_type=$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "${msg_file}" | sed 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

        log "Received message from ${from_agent}: type=${msg_type}, id=${msg_id}"

        # Process based on message type
        case "${msg_type}" in
            status-update)
                log "Processing status update from ${from_agent}"
                # Extract payload (could be parsed further if needed)
                ;;
            task-delegation)
                log "Received task delegation from ${from_agent}"
                # Could add task to queue here
                ;;
            result)
                log "Received result notification from ${from_agent}"
                FINDINGS+=("Result from ${from_agent}")
                ;;
            *)
                log "Unknown message type: ${msg_type}"
                ;;
        esac

        # Archive processed message (move to processed dir for audit trail)
        local processed_dir="${MESSAGE_BASE_DIR}/${AGENT_ID}/processed"
        mkdir -p "${processed_dir}"
        mv "${msg_file}" "${processed_dir}/"
    done

    return 0
}

# Send status update to coordinator
send_task_update() {
    local coordinator_id="${1:-coordinator}"

    # Build payload JSON manually (avoid jq dependency)
    local payload=$(cat <<EOF
{
  "phase": "${PHASE}",
  "progress": ${PROGRESS},
  "confidence": ${CONFIDENCE},
  "tasks_completed": ${TASKS_COMPLETED}
}
EOF
)

    # Send message via message bus
    if command -v send_message >/dev/null 2>&1; then
        send_message "${AGENT_ID}" "${coordinator_id}" "status-update" "${payload}" 2>/dev/null || {
            log "WARNING: Failed to send status update (coordinator may not be initialized)"
        }
    else
        log "WARNING: send_message function not available"
    fi

    return 0
}

# Get allowed next phases for current phase (Finite State Machine)
get_allowed_next_phases() {
    local current_phase="$1"
    case "${current_phase}" in
        initialization)
            echo "planning resuming"
            ;;
        planning)
            echo "implementation resuming"
            ;;
        implementation)
            echo "testing resuming"
            ;;
        testing)
            echo "validation resuming"
            ;;
        validation)
            echo "complete resuming"
            ;;
        resuming)
            # Resuming can transition to any valid work phase based on history
            echo "planning implementation testing validation complete"
            ;;
        complete)
            echo ""
            ;;
        *)
            log "WARNING: Unknown phase ${current_phase}, no valid transitions"
            echo ""
            ;;
    esac
}

# Validate phase transition
validate_phase_transition() {
    local current_phase="$1"
    local target_phase="$2"
    local allowed_phases="$3"  # Space-separated list

    if [[ " ${allowed_phases} " =~ " ${target_phase} " ]]; then
        return 0
    else
        log "ERROR: Invalid phase transition from ${current_phase} to ${target_phase}"
        return 1
    fi
}

# Update phase with FSM validation
update_phase() {
    local new_phase="$1"
    local allowed_phases=$(get_allowed_next_phases "${PHASE}")

    if validate_phase_transition "${PHASE}" "${new_phase}" "${allowed_phases}"; then
        PHASE_HISTORY+=("${new_phase}")
        PHASE="${new_phase}"
        log "Phase transition: ${PHASE_HISTORY[-2]:-none} → ${PHASE}"
        return 0
    else
        log "ERROR: Blocked invalid phase transition to ${new_phase}"
        return 1
    fi
}

# SECURITY: Sanitize JSON string (escape special characters to prevent injection)
sanitize_json_string() {
    local input="$1"
    # Escape backslashes, double quotes, newlines, tabs
    echo "$input" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g; s/\t/\\t/g'
}

# Generate schema hash for checkpoint format validation
generate_schema_hash() {
    local schema_definition="v1.1:agent_id,timestamp,phase,phase_history,allowed_next_phases,tasks_completed,current_task,confidence,context,can_resume"
    echo -n "${schema_definition}" | sha256sum | cut -d' ' -f1
}

# TTL-based checkpoint cleanup (keep last 5)
cleanup_old_checkpoints() {
    local checkpoint_count=$(find "${CHECKPOINT_DIR}" -name "checkpoint-*.json" 2>/dev/null | wc -l)
    local keep_count=5

    if [ "${checkpoint_count}" -gt "${keep_count}" ]; then
        log "Cleaning up old checkpoints (keeping last ${keep_count})"

        # Sort by timestamp, delete oldest
        find "${CHECKPOINT_DIR}" -name "checkpoint-*.json" -type f -printf '%T@ %p\n' 2>/dev/null | \
            sort -n | \
            head -n -${keep_count} | \
            cut -d' ' -f2- | \
            while read -r old_checkpoint; do
                log "Removing old checkpoint: $(basename "${old_checkpoint}")"
                rm -f "${old_checkpoint}"
            done
    fi
}

# Validate checkpoint integrity before restore
validate_checkpoint() {
    local checkpoint_file="$1"

    # Check file exists
    if [ ! -f "${checkpoint_file}" ]; then
        log "ERROR: Checkpoint file not found: ${checkpoint_file}"
        return 1
    fi

    # Validate JSON syntax (use python if available)
    if command -v python3 >/dev/null 2>&1; then
        if ! python3 -m json.tool "${checkpoint_file}" >/dev/null 2>&1; then
            log "ERROR: Invalid JSON in checkpoint file"
            return 1
        fi
    fi

    # Validate required fields
    local required_fields=("version" "schema_hash" "agent_id" "timestamp" "phase" "can_resume")
    for field in "${required_fields[@]}"; do
        if ! grep -q "\"${field}\"" "${checkpoint_file}"; then
            log "ERROR: Missing required field: ${field}"
            return 1
        fi
    done

    # Validate schema hash
    local stored_hash=$(grep -o '"schema_hash"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"schema_hash"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    local current_hash=$(generate_schema_hash)

    if [ "${stored_hash}" != "${current_hash}" ]; then
        log "WARNING: Schema hash mismatch (stored: ${stored_hash:0:8}..., current: ${current_hash:0:8}...)"
        log "Checkpoint format may be incompatible, proceeding with caution"
    fi

    log "Checkpoint validation passed: ${checkpoint_file}"
    return 0
}

# Write status to JSON file
write_status() {
    local timestamp=$(date +%s)
    local status_file="${STATUS_DIR}/${AGENT_ID}.json"
    local temp_file="${STATUS_DIR}/${AGENT_ID}.tmp"

    # SECURITY: Sanitize CURRENT_TASK before embedding in JSON
    local safe_task=$(sanitize_json_string "${CURRENT_TASK}")

    # SECURITY: Use flock for atomic writes (prevents race conditions)
    (
        flock -x 200
        cat > "${temp_file}" <<EOF
{
  "agent_id": "${AGENT_ID}",
  "type": "${AGENT_TYPE}",
  "phase": "${PHASE}",
  "progress": ${PROGRESS},
  "confidence": ${CONFIDENCE},
  "message": "${safe_task}",
  "timestamp": ${timestamp}
}
EOF
        # Atomic write with restricted permissions
        mv "${temp_file}" "${status_file}"
        chmod 600 "${status_file}"
    ) 200>"${status_file}.lock"
}

# Write checkpoint for crash recovery (v1.1 with FSM)
write_checkpoint() {
    local timestamp=$(date +%s)
    local checkpoint_file="${CHECKPOINT_DIR}/checkpoint-${timestamp}.json"
    local current_link="${CHECKPOINT_DIR}/current.json"
    local temp_file="${CHECKPOINT_DIR}/checkpoint.tmp"

    # OPTIMIZATION: Pre-compute schema hash OUTSIDE critical section
    local schema_hash=$(generate_schema_hash)

    # OPTIMIZATION: Build JSON payload OUTSIDE flock critical section
    # SECURITY: Sanitize CURRENT_TASK before embedding in JSON
    local safe_task=$(sanitize_json_string "${CURRENT_TASK}")

    # Build files_modified array using printf (10x faster than string concatenation)
    local files_json="[]"
    if [ ${#FILES_MODIFIED[@]} -gt 0 ]; then
        local files_items=()
        for file in "${FILES_MODIFIED[@]}"; do
            local safe_file=$(sanitize_json_string "${file}")
            files_items+=("\"${safe_file}\"")
        done
        # Use printf to join with commas (no loop overhead)
        files_json="[$(printf '%s,' "${files_items[@]}" | sed 's/,$//')]"
    fi

    # Build findings array using printf (10x faster than string concatenation)
    local findings_json="[]"
    if [ ${#FINDINGS[@]} -gt 0 ]; then
        local findings_items=()
        for finding in "${FINDINGS[@]}"; do
            local safe_finding=$(sanitize_json_string "${finding}")
            findings_items+=("\"${safe_finding}\"")
        done
        findings_json="[$(printf '%s,' "${findings_items[@]}" | sed 's/,$//')]"
    fi

    # Build phase_history array using printf (10x faster)
    local phase_history_json="[]"
    if [ ${#PHASE_HISTORY[@]} -gt 0 ]; then
        local history_items=()
        for phase in "${PHASE_HISTORY[@]}"; do
            history_items+=("\"${phase}\"")
        done
        phase_history_json="[$(printf '%s,' "${history_items[@]}" | sed 's/,$//')]"
    fi

    # Get allowed next phases and build JSON array using printf
    local allowed_phases=$(get_allowed_next_phases "${PHASE}")
    local allowed_phases_json="[]"
    if [ -n "${allowed_phases}" ]; then
        local allowed_items=()
        for phase in ${allowed_phases}; do
            allowed_items+=("\"${phase}\"")
        done
        allowed_phases_json="[$(printf '%s,' "${allowed_items[@]}" | sed 's/,$//')]"
    fi

    # OPTIMIZATION: MINIMIZE flock critical section to ONLY file operations
    # JSON construction now happens OUTSIDE flock - 10x faster
    (
        flock -x 200

        # Write checkpoint JSON using heredoc (faster than cat)
        cat > "${temp_file}" <<EOF
{
  "version": "1.1",
  "schema_hash": "${schema_hash}",
  "agent_id": "${AGENT_ID}",
  "timestamp": ${timestamp},
  "phase": "${PHASE}",
  "phase_history": ${phase_history_json},
  "allowed_next_phases": ${allowed_phases_json},
  "tasks_completed": ${TASKS_COMPLETED},
  "current_task": "${safe_task}",
  "confidence": ${CONFIDENCE},
  "context": {
    "files_modified": ${files_json},
    "findings": ${findings_json}
  },
  "can_resume": true
}
EOF

        # Atomic write with restricted permissions
        mv "${temp_file}" "${checkpoint_file}"
        chmod 600 "${checkpoint_file}"

        # Update current symlink (fast operation)
        rm -f "${current_link}"
        ln -s "$(basename "${checkpoint_file}")" "${current_link}"

    ) 200>"${checkpoint_file}.lock"

    # OPTIMIZATION: Cleanup OUTSIDE critical section (non-blocking)
    cleanup_old_checkpoints

    log "Checkpoint saved: ${checkpoint_file} (schema: ${schema_hash:0:8}...)"
}

# Restore state from checkpoint (live restore during runtime)
restore_from_checkpoint() {
    local checkpoint_file="${CHECKPOINT_DIR}/current.json"

    # Follow symlink if current.json
    if [ -L "${checkpoint_file}" ]; then
        checkpoint_file="$(readlink -f "${checkpoint_file}")"
    fi

    # Validate checkpoint integrity before restore
    if ! validate_checkpoint "${checkpoint_file}"; then
        log "ERROR: Checkpoint validation failed, restore aborted"
        return 1
    fi

    log "Restoring state from checkpoint: $(basename "${checkpoint_file}")"

    # Check checkpoint version
    local cp_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

    # Parse JSON and extract state variables
    PHASE=$(grep -o '"phase"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    TASKS_COMPLETED=$(grep -o '"tasks_completed"[[:space:]]*:[[:space:]]*[0-9]*' "${checkpoint_file}" | sed 's/.*:[[:space:]]*\([0-9]*\).*/\1/')
    CONFIDENCE=$(grep -o '"confidence"[[:space:]]*:[[:space:]]*[0-9.]*' "${checkpoint_file}" | sed 's/.*:[[:space:]]*\([0-9.]*\).*/\1/')
    CURRENT_TASK=$(grep -o '"current_task"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"current_task"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

    # Extract progress from phase (heuristic)
    case "${PHASE}" in
        initialization) PROGRESS=0 ;;
        planning) PROGRESS=10 ;;
        implementation) PROGRESS=50 ;;
        testing) PROGRESS=75 ;;
        validation) PROGRESS=90 ;;
        complete) PROGRESS=100 ;;
        *) PROGRESS=0 ;;
    esac

    # Restore phase history if available (v1.1+)
    if [[ "${cp_version}" == "1.1" ]]; then
        # Extract phase_history array (simple parsing)
        local history_raw=$(grep -o '"phase_history"[[:space:]]*:[[:space:]]*\[[^]]*\]' "${checkpoint_file}" | sed 's/.*"phase_history"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/')
        if [ -n "${history_raw}" ]; then
            PHASE_HISTORY=()
            # Parse comma-separated quoted strings
            IFS=',' read -ra history_items <<< "${history_raw}"
            for item in "${history_items[@]}"; do
                # Remove quotes and whitespace
                local clean_item=$(echo "$item" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')
                PHASE_HISTORY+=("${clean_item}")
            done
        fi
    else
        # v1.0 checkpoint - build phase_history from current phase
        PHASE_HISTORY=("${PHASE}")
    fi

    # Parse files_modified array
    FILES_MODIFIED=()
    local files_array=$(grep -o '"files_modified"[[:space:]]*:[[:space:]]*\[[^]]*\]' "${checkpoint_file}" | sed 's/.*:\[//;s/\]//')
    if [ -n "${files_array}" ]; then
        IFS=',' read -ra file_entries <<< "${files_array}"
        for entry in "${file_entries[@]}"; do
            local clean_entry=$(echo "${entry}" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')
            if [ -n "${clean_entry}" ]; then
                FILES_MODIFIED+=("${clean_entry}")
            fi
        done
    fi

    # Parse findings array
    FINDINGS=()
    local findings_array=$(grep -o '"findings"[[:space:]]*:[[:space:]]*\[[^]]*\]' "${checkpoint_file}" | sed 's/.*:\[//;s/\]//')
    if [ -n "${findings_array}" ]; then
        IFS=',' read -ra finding_entries <<< "${findings_array}"
        for entry in "${finding_entries[@]}"; do
            local clean_entry=$(echo "${entry}" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')
            if [ -n "${clean_entry}" ]; then
                FINDINGS+=("${clean_entry}")
            fi
        done
    fi

    # Update status file to reflect restored state
    write_status

    log "State restored successfully:"
    log "  Phase: ${PHASE}"
    log "  Phase history: ${PHASE_HISTORY[*]}"
    log "  Tasks completed: ${TASKS_COMPLETED}"
    log "  Confidence: ${CONFIDENCE}"
    log "  Progress: ${PROGRESS}%"
    log "  Files modified: ${#FILES_MODIFIED[@]}"
    log "  Findings: ${#FINDINGS[@]}"

    return 0
}

# Check for control commands
check_control_commands() {
    local cmd_file="${CONTROL_DIR}/${AGENT_ID}.cmd"

    if [ -f "${cmd_file}" ]; then
        local cmd=$(cat "${cmd_file}")
        log "Received command: ${cmd}"

        case "${cmd}" in
            PAUSE)
                log "Received PAUSE command - saving checkpoint before pause"
                prepare_pause
                ;;
            RESUME)
                log "Received RESUME command - work will continue"
                ;;
            CHECKPOINT|checkpoint)
                log "Received CHECKPOINT command"
                write_checkpoint
                ;;
            RESTORE|restore)
                log "Received RESTORE command - restoring from checkpoint"
                restore_from_checkpoint
                ;;
            STOP|shutdown)
                log "Received STOP command"
                RUNNING=false
                ;;
        esac

        # Clear command after processing
        rm -f "${cmd_file}"
    fi
}

# Simulate agent work phases
simulate_work() {
    case "${PHASE}" in
        initialization)
            log "Initializing agent..."
            sleep 1
            update_phase "planning"
            PROGRESS=10
            CONFIDENCE=0.6
            CURRENT_TASK="Planning implementation"
            ;;

        planning)
            log "Planning implementation..."
            sleep 1
            update_phase "implementation"
            PROGRESS=25
            CONFIDENCE=0.65
            CURRENT_TASK="Implementing ${TASK}"
            TASKS_COMPLETED=$((TASKS_COMPLETED + 1))
            ;;

        resuming)
            # After SIGCONT, use phase_history to determine next phase
            log "Resuming from pause - continuing work"

            # Get last non-resuming phase from history
            local last_work_phase=""
            for ((i=${#PHASE_HISTORY[@]}-2; i>=0; i--)); do
                if [ "${PHASE_HISTORY[$i]}" != "resuming" ]; then
                    last_work_phase="${PHASE_HISTORY[$i]}"
                    break
                fi
            done

            # Determine target phase based on last work phase
            local target_phase=""
            case "${last_work_phase}" in
                initialization|planning)
                    target_phase="planning"
                    ;;
                implementation)
                    target_phase="implementation"
                    ;;
                testing)
                    target_phase="testing"
                    ;;
                validation)
                    target_phase="validation"
                    ;;
                complete)
                    target_phase="complete"
                    ;;
                *)
                    log "WARNING: Unknown last phase ${last_work_phase}, defaulting to planning"
                    target_phase="planning"
                    ;;
            esac

            if update_phase "${target_phase}"; then
                log "Restored phase: ${PHASE} (from history: ${last_work_phase})"
            else
                log "ERROR: Failed to restore phase, staying in resuming state"
            fi
            ;;

        implementation)
            log "Implementing features..."
            # Simulate multiple implementation steps
            local steps=5
            for i in $(seq 1 ${steps}); do
                sleep 0.5
                PROGRESS=$((25 + (i * 10)))

                # SECURITY: Validate numeric input before awk calculation
                if [[ "$i" =~ ^[0-9]+$ ]]; then
                    CONFIDENCE=$(awk "BEGIN {print 0.65 + (${i} * 0.04)}")
                else
                    CONFIDENCE=0.65
                fi

                CURRENT_TASK="Implementing step ${i}/${steps}"
                FILES_MODIFIED+=("file_${i}.ts")
                write_status
                check_control_commands

                if [ "${RUNNING}" = "false" ]; then
                    return
                fi
            done

            update_phase "testing"
            PROGRESS=75
            CONFIDENCE=0.80
            CURRENT_TASK="Running tests"
            TASKS_COMPLETED=$((TASKS_COMPLETED + 1))
            ;;

        testing)
            log "Running tests..."
            sleep 1
            update_phase "validation"
            PROGRESS=90
            CONFIDENCE=0.85
            CURRENT_TASK="Validating implementation"
            FINDINGS+=("All tests passing")
            TASKS_COMPLETED=$((TASKS_COMPLETED + 1))
            ;;

        validation)
            log "Validating work..."
            sleep 1
            update_phase "complete"
            PROGRESS=100
            CONFIDENCE=0.90
            CURRENT_TASK="Task completed successfully"
            FINDINGS+=("Code review clean")
            TASKS_COMPLETED=$((TASKS_COMPLETED + 1))
            ;;

        complete)
            log "Agent work complete"
            RUNNING=false
            ;;
    esac
}

# Signal handlers
cleanup() {
    log "Cleaning up agent..."
    write_checkpoint
    write_status

    # Cleanup message bus
    cleanup_message_bus "${AGENT_ID}" 2>/dev/null || {
        log "WARNING: Failed to cleanup message bus"
    }

    log "Agent ${AGENT_ID} terminated gracefully"
    exit 0
}

# SIGCONT handler - resume work after SIGSTOP
handle_sigcont() {
    log "Received SIGCONT - restoring state from checkpoint"

    # CRITICAL FIX: Restore COMPLETE state from checkpoint before resuming
    # This prevents state corruption from partial updates during pause
    local checkpoint_file="${CHECKPOINT_DIR}/current.json"

    # Follow symlink if current.json
    if [ -L "${checkpoint_file}" ]; then
        checkpoint_file="$(readlink -f "${checkpoint_file}")"
    fi

    # Validate checkpoint exists
    if [ ! -f "${checkpoint_file}" ]; then
        log "ERROR: No checkpoint found to restore on resume, creating fresh checkpoint"
        write_checkpoint
        checkpoint_file="${CHECKPOINT_DIR}/current.json"
        if [ -L "${checkpoint_file}" ]; then
            checkpoint_file="$(readlink -f "${checkpoint_file}")"
        fi
    fi

    # Validate checkpoint integrity
    if ! validate_checkpoint "${checkpoint_file}"; then
        log "ERROR: Checkpoint validation failed on resume, continuing with current state"
    else
        # Restore ALL state variables from checkpoint (CRITICAL)
        local cp_phase=$(grep -o '"phase"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        local cp_tasks=$(grep -o '"tasks_completed"[[:space:]]*:[[:space:]]*[0-9]*' "${checkpoint_file}" | sed 's/.*:[[:space:]]*\([0-9]*\).*/\1/')
        local cp_confidence=$(grep -o '"confidence"[[:space:]]*:[[:space:]]*[0-9.]*' "${checkpoint_file}" | sed 's/.*:[[:space:]]*\([0-9.]*\).*/\1/')
        local cp_task=$(grep -o '"current_task"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"current_task"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

        # Restore phase history (v1.1+)
        local cp_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        if [[ "${cp_version}" == "1.1" ]]; then
            local history_raw=$(grep -o '"phase_history"[[:space:]]*:[[:space:]]*\[[^]]*\]' "${checkpoint_file}" | sed 's/.*"phase_history"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/')
            if [ -n "${history_raw}" ]; then
                PHASE_HISTORY=()
                IFS=',' read -ra history_items <<< "${history_raw}"
                for item in "${history_items[@]}"; do
                    local clean_item=$(echo "$item" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')
                    PHASE_HISTORY+=("${clean_item}")
                done
            fi
        fi

        # Restore FILES_MODIFIED array (CRITICAL - prevents array corruption)
        FILES_MODIFIED=()
        local files_array=$(grep -o '"files_modified"[[:space:]]*:[[:space:]]*\[[^]]*\]' "${checkpoint_file}" | sed 's/.*:\[//;s/\]//')
        if [ -n "${files_array}" ]; then
            IFS=',' read -ra file_entries <<< "${files_array}"
            for entry in "${file_entries[@]}"; do
                local clean_entry=$(echo "${entry}" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')
                if [ -n "${clean_entry}" ]; then
                    FILES_MODIFIED+=("${clean_entry}")
                fi
            done
        fi

        # Restore FINDINGS array (CRITICAL - prevents array corruption)
        FINDINGS=()
        local findings_array=$(grep -o '"findings"[[:space:]]*:[[:space:]]*\[[^]]*\]' "${checkpoint_file}" | sed 's/.*:\[//;s/\]//')
        if [ -n "${findings_array}" ]; then
            IFS=',' read -ra finding_entries <<< "${findings_array}"
            for entry in "${finding_entries[@]}"; do
                local clean_entry=$(echo "${entry}" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')
                if [ -n "${clean_entry}" ]; then
                    FINDINGS+=("${clean_entry}")
                fi
            done
        fi

        # Restore progress from phase mapping
        case "${cp_phase}" in
            initialization) PROGRESS=0 ;;
            planning) PROGRESS=10 ;;
            implementation) PROGRESS=50 ;;
            testing) PROGRESS=75 ;;
            validation) PROGRESS=90 ;;
            complete) PROGRESS=100 ;;
            *) PROGRESS=0 ;;
        esac

        # Apply restored values atomically
        PHASE="${cp_phase}"
        TASKS_COMPLETED="${cp_tasks}"
        CONFIDENCE="${cp_confidence}"
        CURRENT_TASK="${cp_task}"

        log "State restored from checkpoint: phase=${PHASE}, tasks=${TASKS_COMPLETED}, confidence=${CONFIDENCE}, progress=${PROGRESS}, files=${#FILES_MODIFIED[@]}, findings=${#FINDINGS[@]}"
    fi

    # Transition to resuming phase with FSM validation
    update_phase "resuming"

    # Update status to running with restored values
    local status_file="${STATUS_DIR}/${AGENT_ID}.json"
    if [ -f "${status_file}" ]; then
        # Use flock for atomic status update
        (
            flock -x 200
            local temp_file="${STATUS_DIR}/${AGENT_ID}.tmp"
            local timestamp=$(date +%s)

            # Use restored values
            local safe_task=$(sanitize_json_string "${CURRENT_TASK}")
            cat > "${temp_file}" <<EOF
{
  "agent_id": "${AGENT_ID}",
  "type": "${AGENT_TYPE}",
  "phase": "${PHASE}",
  "progress": ${PROGRESS},
  "confidence": ${CONFIDENCE},
  "message": "${safe_task}",
  "timestamp": ${timestamp},
  "status": "running"
}
EOF
            mv "${temp_file}" "${status_file}"
            chmod 600 "${status_file}"
        ) 200>"${status_file}.lock"
    fi

    log "Status updated to running - resuming work loop with restored state"
}

# SIGSTOP is sent externally - we can't trap it, but we can prepare
# Save checkpoint before manual SIGSTOP via control command
prepare_pause() {
    log "Preparing for pause - freezing state atomically"

    # CRITICAL FIX: Atomic state freeze to prevent partial checkpoint during pause
    # Write checkpoint first (has its own flock protection)
    write_checkpoint
    log "Checkpoint saved before pause"

    # Update status to paused AFTER checkpoint is safely written
    local status_file="${STATUS_DIR}/${AGENT_ID}.json"
    if [ -f "${status_file}" ]; then
        (
            flock -x 200
            local temp_file="${STATUS_DIR}/${AGENT_ID}.tmp"
            local timestamp=$(date +%s)
            local safe_task=$(sanitize_json_string "${CURRENT_TASK}")

            cat > "${temp_file}" <<EOF
{
  "agent_id": "${AGENT_ID}",
  "type": "${AGENT_TYPE}",
  "phase": "${PHASE}",
  "progress": ${PROGRESS},
  "confidence": ${CONFIDENCE},
  "message": "${safe_task}",
  "timestamp": ${timestamp},
  "status": "paused"
}
EOF
            mv "${temp_file}" "${status_file}"
            chmod 600 "${status_file}"
        ) 200>"${status_file}.lock"
    fi

    log "State frozen successfully - ready for SIGSTOP"
}

trap cleanup SIGTERM SIGINT
trap handle_sigcont SIGCONT

# Main execution loop
main() {
    log "Agent ${AGENT_ID} (${AGENT_TYPE}) started"
    log "Task: ${TASK}"

    # Initialize message bus for this agent
    init_message_bus "${AGENT_ID}" 2>/dev/null || {
        log "WARNING: Failed to initialize message bus"
    }

    # Check for existing checkpoint to restore from
    local checkpoint_file="${CHECKPOINT_DIR}/current.json"
    if [ -f "${checkpoint_file}" ] || [ -L "${checkpoint_file}" ]; then
        log "Restoring from checkpoint..."

        # Follow symlink if current.json
        if [ -L "${checkpoint_file}" ]; then
            checkpoint_file="$(readlink -f "${checkpoint_file}")"
        fi

        # Validate checkpoint before restore
        if validate_checkpoint "${checkpoint_file}"; then
            # Check checkpoint version
            local cp_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

            # Parse JSON without jq (simple grep/sed approach)
            PHASE=$(grep -o '"phase"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
            TASKS_COMPLETED=$(grep -o '"tasks_completed"[[:space:]]*:[[:space:]]*[0-9]*' "${checkpoint_file}" | sed 's/.*:[[:space:]]*\([0-9]*\).*/\1/')
            CONFIDENCE=$(grep -o '"confidence"[[:space:]]*:[[:space:]]*[0-9.]*' "${checkpoint_file}" | sed 's/.*:[[:space:]]*\([0-9.]*\).*/\1/')
            CURRENT_TASK=$(grep -o '"current_task"[[:space:]]*:[[:space:]]*"[^"]*"' "${checkpoint_file}" | sed 's/.*"current_task"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

            # Restore phase_history if available (v1.1+)
            if [[ "${cp_version}" == "1.1" ]]; then
                # Extract phase_history array (simple parsing)
                local history_raw=$(grep -o '"phase_history"[[:space:]]*:[[:space:]]*\[[^]]*\]' "${checkpoint_file}" | sed 's/.*"phase_history"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/')
                if [ -n "${history_raw}" ]; then
                    PHASE_HISTORY=()
                    # Parse comma-separated quoted strings
                    IFS=',' read -ra history_items <<< "${history_raw}"
                    for item in "${history_items[@]}"; do
                        # Remove quotes and whitespace
                        local clean_item=$(echo "$item" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')
                        PHASE_HISTORY+=("${clean_item}")
                    done
                fi
                log "Restored: phase=${PHASE}, tasks=${TASKS_COMPLETED}, confidence=${CONFIDENCE}, history=[${PHASE_HISTORY[*]}]"
            else
                # v1.0 checkpoint - build phase_history from current phase
                PHASE_HISTORY=("${PHASE}")
                log "WARNING: v1.0 checkpoint detected, building phase_history from current phase"
                log "Restored: phase=${PHASE}, tasks=${TASKS_COMPLETED}, confidence=${CONFIDENCE}"
            fi
        else
            log "ERROR: Checkpoint validation failed, starting fresh"
        fi
    fi

    # Periodic checkpoint counter
    local checkpoint_counter=0

    while [ "${RUNNING}" = "true" ]; do
        # Check for incoming messages
        check_messages

        # Simulate work
        simulate_work

        # Write status update
        write_status

        # Send status update via message bus (every 3 cycles)
        if [ $((checkpoint_counter % 3)) -eq 0 ]; then
            send_task_update
        fi

        # Check for control commands
        check_control_commands

        # Periodic checkpoint every 5 cycles
        checkpoint_counter=$((checkpoint_counter + 1))
        if [ $((checkpoint_counter % 5)) -eq 0 ]; then
            write_checkpoint
        fi

        # Status reporting interval
        sleep 1
    done

    # Final checkpoint and status
    write_checkpoint
    write_status

    log "Agent ${AGENT_ID} completed successfully"
    exit 0
}

# Run main
main
