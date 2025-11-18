#!/bin/bash
# SQLite Helper Functions for CFN Docker Logging
# Provides reusable functions for database operations

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Initialize database with schema
init_logging_db() {
    local db_path=$1

    if [[ ! -f "$db_path" ]]; then
        # Create database directory if needed
        mkdir -p "$(dirname "$db_path")"

        # Initialize schema
        sqlite3 "$db_path" < "$SCRIPT_DIR/schema.sql"
        echo "Initialized logging database: $db_path"
    fi
}

# Insert log line
log_to_db() {
    local db_path=$1
    local task_id=$2
    local agent_id=$3
    local container_id=$4
    local timestamp=$5
    local log_line=$6
    local stream=$7

    # Escape single quotes in log line
    log_line="${log_line//\'/\'\'}"

    sqlite3 "$db_path" <<SQL
INSERT INTO container_logs (task_id, agent_id, container_id, timestamp, log_line, stream)
VALUES ('$task_id', '$agent_id', '$container_id', '$timestamp', '$log_line', '$stream');
SQL
}

# Log container event
log_container_event() {
    local db_path=$1
    local task_id=$2
    local agent_id=$3
    local container_id=$4
    local event_type=$5
    local exit_code=${6:-NULL}
    local metadata=${7:-null}

    # Escape metadata if provided
    if [[ "$metadata" != "null" ]]; then
        metadata="${metadata//\'/\'\'}"
        metadata="'$metadata'"
    fi

    sqlite3 "$db_path" <<SQL
INSERT INTO container_events (task_id, agent_id, container_id, event_type, exit_code, metadata)
VALUES ('$task_id', '$agent_id', '$container_id', '$event_type', $exit_code, $metadata);
SQL
}

# Log container spawn with timestamp
log_container_spawn() {
    local db_path=$1
    local task_id=$2
    local agent_id=$3
    local container_id=$4
    local started_at=$5
    local metadata=${6:-null}

    if [[ "$metadata" != "null" ]]; then
        metadata="${metadata//\'/\'\'}"
        metadata="'$metadata'"
    fi

    sqlite3 "$db_path" <<SQL
INSERT INTO container_events (task_id, agent_id, container_id, event_type, started_at, metadata)
VALUES ('$task_id', '$agent_id', '$container_id', 'spawn', '$started_at', $metadata);
SQL
}

# Log container exit with duration
log_container_exit() {
    local db_path=$1
    local task_id=$2
    local agent_id=$3
    local container_id=$4
    local exit_code=$5
    local started_at=$6
    local finished_at=$7

    # Calculate duration in seconds
    local start_ts=$(date -d "$started_at" +%s 2>/dev/null || echo 0)
    local finish_ts=$(date -d "$finished_at" +%s 2>/dev/null || echo 0)
    local duration=$((finish_ts - start_ts))

    sqlite3 "$db_path" <<SQL
INSERT INTO container_events (task_id, agent_id, container_id, event_type, exit_code, started_at, finished_at, duration_seconds)
VALUES ('$task_id', '$agent_id', '$container_id', 'exit', $exit_code, '$started_at', '$finished_at', $duration);
SQL
}

# Log coordination event
log_coordination_event() {
    local db_path=$1
    local task_id=$2
    local agent_id=$3
    local event_type=$4
    local key=$5
    local value=${6:-}
    local timestamp=$7

    # Escape values
    value="${value//\'/\'\'}"

    sqlite3 "$db_path" <<SQL
INSERT INTO coordination_events (task_id, agent_id, event_type, key, value, timestamp)
VALUES ('$task_id', '$agent_id', '$event_type', '$key', '$value', '$timestamp');
SQL
}

# Log gate check result
log_gate_check() {
    local db_path=$1
    local task_id=$2
    local iteration=$3
    local pass_rate=$4
    local threshold=$5
    local passed=$6
    local agent_count=${7:-0}
    local timestamp=$8

    sqlite3 "$db_path" <<SQL
INSERT INTO gate_checks (task_id, iteration, pass_rate, threshold, passed, agent_count, timestamp)
VALUES ('$task_id', $iteration, $pass_rate, $threshold, $passed, $agent_count, '$timestamp');
SQL
}

# Log validator consensus
log_validator_consensus() {
    local db_path=$1
    local task_id=$2
    local iteration=$3
    local validator_id=$4
    local score=$5
    local feedback=$6
    local timestamp=$7

    # Escape feedback
    feedback="${feedback//\'/\'\'}"

    sqlite3 "$db_path" <<SQL
INSERT INTO validator_consensus (task_id, iteration, validator_id, score, feedback, timestamp)
VALUES ('$task_id', $iteration, '$validator_id', $score, '$feedback', '$timestamp');
SQL
}

# Log product owner decision
log_product_owner_decision() {
    local db_path=$1
    local task_id=$2
    local iteration=$3
    local decision=$4
    local rationale=$5
    local deliverables_validated=${6:-0}
    local timestamp=$7

    # Escape rationale
    rationale="${rationale//\'/\'\'}"

    sqlite3 "$db_path" <<SQL
INSERT INTO product_owner_decisions (task_id, iteration, decision, rationale, deliverables_validated, timestamp)
VALUES ('$task_id', $iteration, '$decision', '$rationale', $deliverables_validated, '$timestamp');
SQL
}

# Log performance metric
log_performance_metric() {
    local db_path=$1
    local task_id=$2
    local metric_name=$3
    local metric_value=$4
    local unit=${5:-}
    local timestamp=$6

    sqlite3 "$db_path" <<SQL
INSERT INTO performance_metrics (task_id, metric_name, metric_value, unit, timestamp)
VALUES ('$task_id', '$metric_name', $metric_value, '$unit', '$timestamp');
SQL
}

# Query helper: Get latest event for container
get_latest_container_event() {
    local db_path=$1
    local container_id=$2

    sqlite3 -separator '|' "$db_path" <<SQL
SELECT event_type, exit_code, created_at
FROM container_events
WHERE container_id = '$container_id'
ORDER BY created_at DESC
LIMIT 1;
SQL
}

# Query helper: Get task summary
get_task_summary() {
    local db_path=$1
    local task_id=$2

    sqlite3 -header -column "$db_path" <<SQL
SELECT
    COUNT(DISTINCT agent_id) as total_agents,
    COUNT(DISTINCT container_id) as total_containers,
    SUM(CASE WHEN event_type = 'exit' AND exit_code = 0 THEN 1 ELSE 0 END) as successful_exits,
    SUM(CASE WHEN event_type = 'exit' AND exit_code != 0 THEN 1 ELSE 0 END) as failed_exits,
    AVG(CASE WHEN duration_seconds IS NOT NULL THEN duration_seconds END) as avg_duration
FROM container_events
WHERE task_id = '$task_id';
SQL
}

# Export functions if sourced
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    export -f init_logging_db
    export -f log_to_db
    export -f log_container_event
    export -f log_container_spawn
    export -f log_container_exit
    export -f log_coordination_event
    export -f log_gate_check
    export -f log_validator_consensus
    export -f log_product_owner_decision
    export -f log_performance_metric
    export -f get_latest_container_event
    export -f get_task_summary
fi
