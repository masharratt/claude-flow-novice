#!/usr/bin/env bash
# CFN Process Instrumentation
# Instruments processes with monitoring and tracking

set -euo pipefail

# Function to instrument process
instrument_process() {
    local process_id="${1:-$$}"
    local agent_id="${2:-unknown}"
    local task_id="${3:-unknown}"

    # Record process start
    echo "INSTRUMENTATION: Process $process_id started for agent $agent_id, task $task_id" >&2

    # Set up monitoring
    export CFN_PROCESS_ID="$process_id"
    export CFN_AGENT_ID="$agent_id"
    export CFN_TASK_ID="$task_id"
    export CFN_START_TIME="$(date +%s)"

    # Create monitoring directory
    local monitor_dir="/tmp/cfn-monitoring-${task_id}"
    mkdir -p "$monitor_dir"

    # Record process info
    cat > "$monitor_dir/${process_id}.json" <<EOF
{
  "process_id": "$process_id",
  "agent_id": "$agent_id",
  "task_id": "$task_id",
  "start_time": $(date +%s),
  "hostname": "$(hostname)",
  "user": "$(whoami)"
}
EOF

    return 0
}

# Main execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    instrument_process "${1:-$$}" "${2:-}" "${3:-}"
fi
