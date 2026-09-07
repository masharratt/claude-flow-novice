#!/usr/bin/env bash

# CFN Loop Execution Monitoring Script
# Version: 1.0.0
# Purpose: Real-time monitoring and metrics collection for CFN Loop orchestration

set -euo pipefail

# Logging and output configuration
LOG_DIR="/tmp/cfn-loop-monitoring"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
METRICS_FILE="${LOG_DIR}/metrics_${TIMESTAMP}.json"

# Dependency checks
command -v redis-cli >/dev/null 2>&1 || {
    echo "Error: redis-cli is required but not installed." >&2
    exit 1
}

# Configuration and argument parsing
TASK_ID=""
EXPORT_PATH=""
INTERVAL=5  # Default monitoring interval (seconds)
TIMEOUT=3600  # Default timeout (1 hour)

usage() {
    echo "Usage: $0 --task-id <task_id> [--export <export_path>] [--interval <seconds>] [--timeout <seconds>]"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --export)
            EXPORT_PATH="$2"
            shift 2
            ;;
        --interval)
            INTERVAL="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        *)
            usage
            ;;
    esac
done

[[ -z "$TASK_ID" ]] && { echo "Error: task-id is required"; usage; }

# Create log directory
mkdir -p "$LOG_DIR"

# Monitoring function
monitor_cfn_loop() {
    local start_time=$(date +%s)
    local metrics=()
    local current_iteration=1
    local total_iterations=0
    local gate_check_passed=false
    local consensus_achieved=false

    # Initialize metrics JSON structure
    local metrics_json=$(jq -n \
        --arg task_id "$TASK_ID" \
        --arg start_time "$(date -Iseconds)" \
        '{
            task_id: $task_id,
            start_time: $start_time,
            iterations: [],
            performance: {},
            status: "in_progress"
        }')

    echo "Starting monitoring for CFN Loop Task ID: $TASK_ID"
    echo "Monitoring interval: $INTERVAL seconds"
    echo "Timeout: $TIMEOUT seconds"

    while true; do
        # Track iteration metrics
        local iteration_start=$(date +%s)

        # Check Loop 3 completion
        local loop3_agents=$(redis-cli smembers "cfn_loop:${TASK_ID}:loop3_agents")
        local loop3_completed=$(redis-cli scard "cfn_loop:${TASK_ID}:loop3_completed")
        local loop3_total=$(echo "$loop3_agents" | wc -l)

        # Check Gate Check
        local gate_confidence=$(redis-cli get "cfn_loop:${TASK_ID}:gate_confidence")
        if [[ -n "$gate_confidence" && $(echo "$gate_confidence >= 0.75" | bc) -eq 1 ]]; then
            gate_check_passed=true
            echo "✅ Gate Check Passed (Confidence: $gate_confidence)"
        fi

        # Check Loop 2 Consensus
        local consensus_score=$(redis-cli get "cfn_loop:${TASK_ID}:consensus_score")
        if [[ -n "$consensus_score" && $(echo "$consensus_score >= 0.90" | bc) -eq 1 ]]; then
            consensus_achieved=true
            echo "✅ Consensus Achieved (Score: $consensus_score)"
        fi

        # Collect performance metrics
        local iteration_end=$(date +%s)
        local iteration_duration=$((iteration_end - iteration_start))

        # Update metrics JSON
        metrics_json=$(echo "$metrics_json" | jq --arg iteration "$current_iteration" \
            --arg duration "$iteration_duration" \
            --arg loop3_completed "$loop3_completed" \
            --arg loop3_total "$loop3_total" \
            '.iterations += [{
                number: $iteration,
                duration: $duration,
                loop3_completed: $loop3_completed,
                loop3_total: $loop3_total
            }]')

        # Exit conditions
        if [[ "$gate_check_passed" == "true" && "$consensus_achieved" == "true" ]]; then
            metrics_json=$(echo "$metrics_json" | jq '.status = "success"')
            break
        fi

        # Check for timeout
        local current_time=$(date +%s)
        local total_runtime=$((current_time - start_time))
        if [[ $total_runtime -ge $TIMEOUT ]]; then
            metrics_json=$(echo "$metrics_json" | jq '.status = "timeout"')
            echo "❌ Monitoring timed out after $TIMEOUT seconds"
            break
        fi

        current_iteration=$((current_iteration + 1))
        sleep "$INTERVAL"
    done

    # Export metrics if export path provided
    if [[ -n "$EXPORT_PATH" ]]; then
        echo "$metrics_json" > "$EXPORT_PATH"
        echo "Metrics exported to $EXPORT_PATH"
    fi

    # Final status report
    local status=$(echo "$metrics_json" | jq -r '.status')
    echo "CFN Loop Execution Monitoring Complete. Status: $status"
}

# Execute monitoring
monitor_cfn_loop
