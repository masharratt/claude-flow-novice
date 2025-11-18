#!/bin/bash
# Capture container logs to both text files and SQLite database
# Hybrid approach: Human-readable text + powerful SQL queries

set -euo pipefail

CONTAINER_ID=${1:-}
AGENT_ID=${2:-}
LOG_DIR=${3:-}
DB_PATH=${4:-}
TASK_ID=${5:-}

if [[ -z "$CONTAINER_ID" || -z "$AGENT_ID" || -z "$LOG_DIR" || -z "$DB_PATH" ]]; then
    echo "Usage: $0 <container_id> <agent_id> <log_dir> <db_path> [task_id]"
    exit 1
fi

# Default task ID if not provided
TASK_ID=${TASK_ID:-unknown}

# Get script directory for helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source SQLite helpers
source "$SCRIPT_DIR/sqlite-helpers.sh"

# Create log directory
mkdir -p "$LOG_DIR"

# Text file paths (backward compatible)
STDOUT_FILE="$LOG_DIR/${AGENT_ID}-stdout.log"
STDERR_FILE="$LOG_DIR/${AGENT_ID}-stderr.log"
COMBINED_FILE="$LOG_DIR/${AGENT_ID}-combined.log"

# Initialize database if needed
init_logging_db "$DB_PATH"

# Record container spawn event
STARTED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")
log_container_spawn "$DB_PATH" "$TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "$STARTED_AT" "{\"log_dir\": \"$LOG_DIR\"}"

echo "Capturing logs for container $CONTAINER_ID (agent: $AGENT_ID)"
echo "  Text logs: $LOG_DIR"
echo "  SQLite DB: $DB_PATH"

# Capture stdout
docker logs -f "$CONTAINER_ID" 2>/dev/null | while IFS= read -r line; do
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S.%3N")

    # Write to text file
    echo "[$TIMESTAMP] $line" >> "$STDOUT_FILE"
    echo "[$TIMESTAMP] [STDOUT] $line" >> "$COMBINED_FILE"

    # Write to database
    log_to_db "$DB_PATH" "$TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "$TIMESTAMP" "$line" "stdout" || true
done &

STDOUT_PID=$!

# Capture stderr
docker logs -f "$CONTAINER_ID" 2>&1 1>/dev/null | while IFS= read -r line; do
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S.%3N")

    # Write to text file
    echo "[$TIMESTAMP] $line" >> "$STDERR_FILE"
    echo "[$TIMESTAMP] [STDERR] $line" >> "$COMBINED_FILE"

    # Write to database
    log_to_db "$DB_PATH" "$TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "$TIMESTAMP" "$line" "stderr" || true
done &

STDERR_PID=$!

# Wait for container to exit
docker wait "$CONTAINER_ID" >/dev/null 2>&1 || true

# Get exit code
EXIT_CODE=$(docker inspect "$CONTAINER_ID" --format='{{.State.ExitCode}}' 2>/dev/null || echo "255")

# Check if OOM killed
OOM_KILLED=$(docker inspect "$CONTAINER_ID" --format='{{.State.OOMKilled}}' 2>/dev/null || echo "false")
OOM_FLAG=0
[[ "$OOM_KILLED" == "true" ]] && OOM_FLAG=1

# Record exit event
FINISHED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")
log_container_exit "$DB_PATH" "$TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "$EXIT_CODE" "$STARTED_AT" "$FINISHED_AT"

# Log OOM event if applicable
if [[ $OOM_FLAG -eq 1 ]]; then
    log_container_event "$DB_PATH" "$TASK_ID" "$AGENT_ID" "$CONTAINER_ID" "oom" "$EXIT_CODE" "{\"oom_killed\": true}"
fi

# Kill log capture processes
kill $STDOUT_PID $STDERR_PID 2>/dev/null || true

# Create summary file
SUMMARY_FILE="$LOG_DIR/${AGENT_ID}-summary.txt"
cat > "$SUMMARY_FILE" <<EOF
Container Execution Summary
===========================
Agent ID: $AGENT_ID
Container ID: $CONTAINER_ID
Task ID: $TASK_ID

Start Time: $STARTED_AT
End Time: $FINISHED_AT
Exit Code: $EXIT_CODE
OOM Killed: $OOM_KILLED

Log Files:
- STDOUT: $STDOUT_FILE
- STDERR: $STDERR_FILE
- Combined: $COMBINED_FILE

Database: $DB_PATH
EOF

echo "Log capture complete. Exit code: $EXIT_CODE"
exit 0
