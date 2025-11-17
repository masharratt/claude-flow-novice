#!/usr/bin/env bash
# agent-handoff.sh - Standard agent handoff protocol
#
# Features:
# - Spawn protocol (standard parameters)
# - Completion protocol (exit codes, output format)
# - Heartbeat mechanism (Redis/SQLite)
# - Timeout handling (graceful termination)
#
# Usage:
#   source agent-handoff.sh
#   agent_spawn "agent-type" "task-description" "task-123" 3600
#   agent_heartbeat "agent-456" "task-123"
#   agent_complete "agent-456" "task-123" 0.85 '{"result": "success"}'
#   agent_wait_for_completion "agent-456" "task-123" 300

set -euo pipefail

# Source parameterized query library for SQL injection prevention
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

# Configuration
AGENT_STATE_DB="${AGENT_STATE_DB:-./.claude/agents/state/agent-state.db}"
HEARTBEAT_INTERVAL="${HEARTBEAT_INTERVAL:-30}"
COMPLETION_TIMEOUT="${COMPLETION_TIMEOUT:-300}"
LOG_FILE="${LOG_FILE:-/tmp/agent-handoff.log}"

# Ensure state database directory exists
mkdir -p "$(dirname "$AGENT_STATE_DB")"

# --- Logging Functions ---

log_structured() {
    local level="$1"
    local message="$2"
    shift 2
    local context="$*"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local log_entry
    log_entry=$(cat <<EOF
{"level":"$level","message":"$message","timestamp":"$timestamp"${context:+,"context":$context}}
EOF
    )

    echo "$log_entry" >> "$LOG_FILE"

    if [[ "$level" == "ERROR" ]] || [[ "$level" == "WARN" ]]; then
        echo "$log_entry" >&2
    fi
}

log_info() {
    log_structured "INFO" "$1" "${2:-}"
}

log_warn() {
    log_structured "WARN" "$1" "${2:-}"
}

log_error() {
    log_structured "ERROR" "$1" "${2:-}"
}

log_debug() {
    log_structured "DEBUG" "$1" "${2:-}"
}

# --- Database Initialization ---

agent_init_db() {
    sqlite3 "$AGENT_STATE_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL,
    pid INTEGER,
    spawned_at TEXT NOT NULL,
    last_heartbeat TEXT,
    completed_at TEXT,
    confidence REAL,
    result TEXT,
    timeout_seconds INTEGER,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_agents_task_id ON agents(task_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_spawned_at ON agents(spawned_at);

CREATE TABLE IF NOT EXISTS heartbeats (
    heartbeat_id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_agent_id ON heartbeats(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp);
SQL

    log_debug "Agent state database initialized" "{\"db\":\"$AGENT_STATE_DB\"}"
}

# Initialize DB on first use
if [[ ! -f "$AGENT_STATE_DB" ]]; then
    agent_init_db
fi

# --- Agent Spawn Protocol ---

# Spawn agent with standard parameters
# Args: $1=agent_type, $2=task_description, $3=task_id, $4=timeout_seconds, $5=metadata (JSON)
# Returns: agent_id
agent_spawn() {
    local agent_type="$1"
    local task_description="$2"
    local task_id="$3"
    local timeout_seconds="${4:-3600}"
    local metadata="${5:-{}}"

    # Generate agent ID
    local agent_id="${agent_type}-$(date +%s)-$$"

    # Validate parameters
    if [[ -z "$agent_type" ]] || [[ -z "$task_description" ]] || [[ -z "$task_id" ]]; then
        log_error "Invalid spawn parameters" "{\"agent_type\":\"$agent_type\",\"task_id\":\"$task_id\"}"
        return 1
    fi

    log_info "Spawning agent" "{\"agent_id\":\"$agent_id\",\"agent_type\":\"$agent_type\",\"task_id\":\"$task_id\"}"

    # Register agent in database - using parameterized query
    local spawned_timestamp
    spawned_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    sqlite_insert "$AGENT_STATE_DB" \
        "INSERT INTO agents (agent_id, agent_type, task_id, status, spawned_at, timeout_seconds, metadata) VALUES (?1, ?2, ?3, 'spawned', ?4, ?5, ?6);" \
        "$agent_id" "$agent_type" "$task_id" "$spawned_timestamp" "$timeout_seconds" "$metadata"

    # Standard agent spawn command (customizable via environment)
    local spawn_cmd="${AGENT_SPAWN_CMD:-cfn-spawn agent}"

    # Spawn agent in background (example - replace with actual spawn mechanism)
    (
        # Set agent context
        export AGENT_ID="$agent_id"
        export TASK_ID="$task_id"
        export AGENT_TYPE="$agent_type"

        # Update status to running - using parameterized query
        sqlite_update "$AGENT_STATE_DB" \
            "UPDATE agents SET status = 'running', pid = ?1 WHERE agent_id = ?2;" \
            "$$" "$agent_id"

        # Start heartbeat in background
        agent_heartbeat_loop "$agent_id" "$task_id" &
        local heartbeat_pid=$!

        # Execute agent task (placeholder - replace with actual agent execution)
        log_info "Agent executing task" "{\"agent_id\":\"$agent_id\",\"task_id\":\"$task_id\"}"

        # Simulate agent work (replace with actual task execution)
        # In real implementation, this would call the agent framework
        # $spawn_cmd --agent-type "$agent_type" --task-id "$task_id" --task "$task_description"

        # For demo purposes, sleep and complete
        sleep 2

        # Kill heartbeat process
        kill "$heartbeat_pid" 2>/dev/null || true

        # Mark completion (normally done by agent itself)
        # agent_complete "$agent_id" "$task_id" 0.90 '{"status": "success"}'

    ) &

    local agent_pid=$!

    # Update PID in database - using parameterized query
    sqlite_update "$AGENT_STATE_DB" \
        "UPDATE agents SET pid = ?1 WHERE agent_id = ?2;" \
        "$agent_pid" "$agent_id"

    log_info "Agent spawned successfully" "{\"agent_id\":\"$agent_id\",\"pid\":$agent_pid}"

    echo "$agent_id"
}

# --- Heartbeat Mechanism ---

# Send single heartbeat for agent
# Args: $1=agent_id, $2=task_id, $3=metadata (JSON, optional)
agent_heartbeat() {
    local agent_id="$1"
    local task_id="$2"
    local metadata="${3:-{}}"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Update last heartbeat in agents table - using parameterized queries
    sqlite_update "$AGENT_STATE_DB" \
        "UPDATE agents SET last_heartbeat = ?1 WHERE agent_id = ?2;" \
        "$timestamp" "$agent_id"
    sqlite_insert "$AGENT_STATE_DB" \
        "INSERT INTO heartbeats (agent_id, task_id, timestamp, metadata) VALUES (?1, ?2, ?3, ?4);" \
        "$agent_id" "$task_id" "$timestamp" "$metadata"

    log_debug "Heartbeat sent" "{\"agent_id\":\"$agent_id\",\"task_id\":\"$task_id\"}"
}

# Continuous heartbeat loop (run in background)
# Args: $1=agent_id, $2=task_id
agent_heartbeat_loop() {
    local agent_id="$1"
    local task_id="$2"

    while true; do
        agent_heartbeat "$agent_id" "$task_id" || break
        sleep "$HEARTBEAT_INTERVAL"

        # Check if agent is still alive - using parameterized query
        local status
        status=$(sqlite_select "$AGENT_STATE_DB" "SELECT status FROM agents WHERE agent_id = ?1;" "$agent_id" || echo "unknown")

        if [[ "$status" == "completed" ]] || [[ "$status" == "failed" ]] || [[ "$status" == "timeout" ]]; then
            log_debug "Heartbeat loop stopping" "{\"agent_id\":\"$agent_id\",\"status\":\"$status\"}"
            break
        fi
    done
}

# --- Completion Protocol ---

# Mark agent as completed
# Args: $1=agent_id, $2=task_id, $3=confidence, $4=result (JSON)
agent_complete() {
    local agent_id="$1"
    local task_id="$2"
    local confidence="$3"
    local result="$4"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Update agent status - using parameterized query
    sqlite_update "$AGENT_STATE_DB" \
        "UPDATE agents SET status = 'completed', completed_at = ?1, confidence = ?2, result = ?3 WHERE agent_id = ?4;" \
        "$timestamp" "$confidence" "$result" "$agent_id"

    log_info "Agent completed" "{\"agent_id\":\"$agent_id\",\"task_id\":\"$task_id\",\"confidence\":$confidence}"

    # Standard completion output format
    cat <<EOF
{
  "agent_id": "$agent_id",
  "task_id": "$task_id",
  "status": "completed",
  "confidence": $confidence,
  "completed_at": "$timestamp",
  "result": $result
}
EOF
}

# Mark agent as failed
# Args: $1=agent_id, $2=task_id, $3=error_message
agent_fail() {
    local agent_id="$1"
    local task_id="$2"
    local error_message="$3"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local error_result
    error_result=$(cat <<EOF
{"error": "$error_message", "failed_at": "$timestamp"}
EOF
    )

    # Update agent status for failure - using parameterized query
    sqlite_update "$AGENT_STATE_DB" \
        "UPDATE agents SET status = 'failed', completed_at = ?1, confidence = 0.0, result = ?2 WHERE agent_id = ?3;" \
        "$timestamp" "$error_result" "$agent_id"

    log_error "Agent failed" "{\"agent_id\":\"$agent_id\",\"task_id\":\"$task_id\",\"error\":\"$error_message\"}"
}

# --- Timeout Handling ---

# Check for agent timeout and handle gracefully
# Args: $1=agent_id
# Returns: 0 if not timeout, 1 if timeout
agent_check_timeout() {
    local agent_id="$1"

    # Get agent data - using parameterized query
    local agent_data
    agent_data=$(sqlite_select "$AGENT_STATE_DB" "SELECT spawned_at, timeout_seconds, status, pid FROM agents WHERE agent_id = ?1;" "$agent_id" | tr '|' ' ')

    read -r spawned_at timeout_seconds status pid <<< "$agent_data"

    # Skip if already completed/failed
    if [[ "$status" == "completed" ]] || [[ "$status" == "failed" ]] || [[ "$status" == "timeout" ]]; then
        return 0
    fi

    # Calculate elapsed time
    local spawned_epoch
    spawned_epoch=$(date -d "$spawned_at" +%s)
    local current_epoch
    current_epoch=$(date +%s)
    local elapsed=$((current_epoch - spawned_epoch))

    if [[ $elapsed -gt $timeout_seconds ]]; then
        log_warn "Agent timeout detected" "{\"agent_id\":\"$agent_id\",\"elapsed\":$elapsed,\"timeout\":$timeout_seconds}"

        # Graceful termination: send SIGTERM
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log_info "Sending SIGTERM to agent" "{\"agent_id\":\"$agent_id\",\"pid\":$pid}"
            kill -TERM "$pid" || true

            # Wait 5 seconds for graceful shutdown
            sleep 5

            # Force kill if still alive
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "Force killing agent" "{\"agent_id\":\"$agent_id\",\"pid\":$pid}"
                kill -KILL "$pid" || true
            fi
        fi

        # Mark as timeout - using parameterized query
        local timeout_timestamp
        timeout_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        local timeout_result
        timeout_result="{\"error\": \"Agent exceeded timeout\", \"elapsed_seconds\": $elapsed}"
        sqlite_update "$AGENT_STATE_DB" \
            "UPDATE agents SET status = 'timeout', completed_at = ?1, result = ?2 WHERE agent_id = ?3;" \
            "$timeout_timestamp" "$timeout_result" "$agent_id"

        return 1
    fi

    return 0
}

# --- Wait for Completion ---

# Wait for agent to complete (with timeout)
# Args: $1=agent_id, $2=task_id, $3=timeout_seconds
# Returns: 0 if completed, 1 if timeout/failed
agent_wait_for_completion() {
    local agent_id="$1"
    local task_id="$2"
    local timeout_seconds="${3:-$COMPLETION_TIMEOUT}"

    log_info "Waiting for agent completion" "{\"agent_id\":\"$agent_id\",\"timeout\":$timeout_seconds}"

    local start_time
    start_time=$(date +%s)

    while true; do
        # Check status - using parameterized query
        local status
        status=$(sqlite_select "$AGENT_STATE_DB" "SELECT status FROM agents WHERE agent_id = ?1;" "$agent_id" || echo "unknown")

        if [[ "$status" == "completed" ]]; then
            log_info "Agent completed successfully" "{\"agent_id\":\"$agent_id\"}"
            return 0
        elif [[ "$status" == "failed" ]] || [[ "$status" == "timeout" ]]; then
            log_error "Agent did not complete successfully" "{\"agent_id\":\"$agent_id\",\"status\":\"$status\"}"
            return 1
        fi

        # Check timeout
        local elapsed
        elapsed=$(($(date +%s) - start_time))
        if [[ $elapsed -gt $timeout_seconds ]]; then
            log_error "Wait timeout exceeded" "{\"agent_id\":\"$agent_id\",\"elapsed\":$elapsed}"
            return 1
        fi

        # Check agent timeout
        agent_check_timeout "$agent_id" || return 1

        # Sleep before next check
        sleep 2
    done
}

# --- Query Functions ---

# Get agent status
# Args: $1=agent_id
# Returns: JSON status
agent_get_status() {
    local agent_id="$1"

    # Get status - using parameterized query (manual JSON mode as sqlite_select doesn't support -json flag)
    local status_json
    status_json=$(sqlite3 -json "$AGENT_STATE_DB" ".parameter init
.parameter set ?1 \"$agent_id\"
SELECT * FROM agents WHERE agent_id = ?1;" | jq '.[0]')

    echo "$status_json"
}

# Get all agents for task
# Args: $1=task_id
# Returns: JSON array
agent_get_by_task() {
    local task_id="$1"

    # Get agents by task - using parameterized query (manual JSON mode)
    local agents_json
    agents_json=$(sqlite3 -json "$AGENT_STATE_DB" ".parameter init
.parameter set ?1 \"$task_id\"
SELECT * FROM agents WHERE task_id = ?1 ORDER BY spawned_at DESC;")

    echo "$agents_json"
}

# Get agent heartbeat history
# Args: $1=agent_id
# Returns: JSON array
agent_get_heartbeats() {
    local agent_id="$1"

    # Get heartbeats - using parameterized query (manual JSON mode)
    local heartbeats_json
    heartbeats_json=$(sqlite3 -json "$AGENT_STATE_DB" ".parameter init
.parameter set ?1 \"$agent_id\"
SELECT * FROM heartbeats WHERE agent_id = ?1 ORDER BY timestamp DESC LIMIT 100;")

    echo "$heartbeats_json"
}

# --- Main Execution (if run directly) ---

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cat <<'EOF'
agent-handoff.sh - Standard agent handoff protocol

USAGE EXAMPLES:

# Spawn agent
agent_id=$(agent_spawn "backend-developer" "Implement API endpoint" "task-123" 3600)

# Send heartbeat
agent_heartbeat "$agent_id" "task-123"

# Wait for completion
agent_wait_for_completion "$agent_id" "task-123" 300

# Get status
agent_get_status "$agent_id"

# Mark as complete (normally done by agent itself)
agent_complete "$agent_id" "task-123" 0.90 '{"deliverables": ["api.ts"]}'

# Get all agents for task
agent_get_by_task "task-123"

CONFIGURATION:
  AGENT_STATE_DB       - SQLite database path (default: ./.claude/agents/state/agent-state.db)
  HEARTBEAT_INTERVAL   - Heartbeat frequency in seconds (default: 30)
  COMPLETION_TIMEOUT   - Default completion timeout (default: 300)
  LOG_FILE            - Structured log file (default: /tmp/agent-handoff.log)
  AGENT_SPAWN_CMD     - Agent spawn command (default: cfn-spawn agent)

BEFORE (Ad-hoc):
  # ❌ No correlation, no heartbeat, no timeout handling
  some-agent "do work" &
  wait $!

AFTER (Standardized):
  # ✅ Full protocol: spawn, heartbeat, timeout, completion
  agent_id=$(agent_spawn "agent-type" "task description" "task-123" 3600)
  agent_wait_for_completion "$agent_id" "task-123" 300
  result=$(agent_get_status "$agent_id")

EOF
fi
