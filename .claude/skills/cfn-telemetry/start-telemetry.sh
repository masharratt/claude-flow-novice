#!/bin/bash

# Start Telemetry Collection for CFN Stabilization System
# This script initializes and starts telemetry monitoring for agent execution

set -euo pipefail

# Required parameters
TASK_ID="${1:-}"
AGENT_ID="${2:-}"

# Validate required parameters
if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ]; then
    echo "Usage: $0 <task-id> <agent-id>"
    exit 1
fi

# Get telemetry directory from environment or use default
TELEMETRY_DIR="${CFN_TELEMETRY_DIR:-/tmp/cfn-telemetry}"
mkdir -p "$TELEMETRY_DIR"

# Get current timestamp
TIMESTAMP=$(date -Iseconds)

# Initialize telemetry session
TELEMETRY_FILE="$TELEMETRY_DIR/${TASK_ID}_${AGENT_ID}_telemetry.json"

# Create initial telemetry record
cat > "$TELEMETRY_FILE" << TELEMETRY_EOF
{
    "task_id": "$TASK_ID",
    "agent_id": "$AGENT_ID",
    "session_start": "$TIMESTAMP",
    "status": "active",
    "memory_usage": 0,
    "cpu_usage": 0,
    "disk_usage": 0,
    "file_count": 0,
    "metrics": [],
    "events": []
}
TELEMETRY_EOF

# Start background telemetry collection
BACKGROUND_PID=$$
echo "$BACKGROUND_PID" > "$TELEMETRY_DIR/${TASK_ID}_${AGENT_ID}_pid.txt"

# Initialize metrics collection
echo "Starting telemetry collection for task $TASK_ID, agent $AGENT_ID"

# Set up monitoring intervals (every 5 seconds)
INTERVAL=5

# Background telemetry monitoring function
collect_telemetry() {
    local start_time=$(date +%s)

    while true; do
        current_time=$(date +%s)
        elapsed_time=$((current_time - start_time))

        # Collect system metrics
        memory_usage=$(free -m | grep Mem | awk '{print $3}')
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
        disk_usage=$(df /tmp | tail -1 | awk '{print $5}' | tr -d '%')
        file_count=$(find "$TELEMETRY_DIR" -name "*.json" -type f 2>/dev/null | wc -l)

        # Create metric record
        metric_record='{
            "timestamp": "'$(date -Iseconds)'",
            "elapsed_seconds": '"$elapsed_time"',
            "memory_usage": '"$memory_usage"',
            "cpu_usage": '"$cpu_usage"',
            "disk_usage": '"$disk_usage"',
            "file_count": '"$file_count"'
        }'

        # Append to telemetry file
        jq --argjson metric "$metric_record" '.metrics += [$metric]' "$TELEMETRY_FILE" > "$TELEMETRY_FILE.tmp" 2>/dev/null || true
        mv "$TELEMETRY_FILE.tmp" "$TELEMETRY_FILE" 2>/dev/null || true

        # Sleep for interval
        sleep $INTERVAL
    done
}

# Start telemetry collection in background
collect_tlemetry &
TELEMETRY_COLLECTOR_PID=$!

# Save collector PID
echo "$TELEMETRY_COLLECTOR_PID" > "$TELEMETRY_DIR/${TASK_ID}_${AGENT_ID}_collector_pid.txt"

# Log telemetry start event
echo "Telemetry collection started for $TASK_ID:$AGENT_ID (PID: $TELEMETRY_COLLECTOR_PID)"

# Keep script running while telemetry is active
while kill -0 "$TELEMETRY_COLLECTOR_PID" 2>/dev/null; do
    sleep 1
done

# Cleanup when telemetry stops
TELEMETRY_STOP_TIME=$(date -Iseconds)
jq --arg stop_time "$TELEMETRY_STOP_TIME" '.session_stop = $stop_time | .status = "stopped"' "$TELEMETRY_FILE" > "$TELEMETRY_FILE.tmp" 2>/dev/null || true
mv "$TELEMETRY_FILE.tmp" "$TELEMETRY_FILE" 2>/dev/null || true

# Remove PID files
rm -f "$TELEMETRY_DIR/${TASK_ID}_${AGENT_ID}_pid.txt"
rm -f "$TELEMETRY_DIR/${TASK_ID}_${AGENT_ID}_collector_pid.txt"

echo "Telemetry collection stopped for $TASK_ID:$AGENT_ID"