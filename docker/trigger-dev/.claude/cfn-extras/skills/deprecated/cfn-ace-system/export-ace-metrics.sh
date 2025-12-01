#!/bin/bash
# ACE System Metrics Dashboard Export

set -euo pipefail

EXPORT_DIR="${1:?Export directory required}"
TIMEFRAME="${2:-7d}"

# Function to generate JSON metrics
generate_metrics_json() {
    local task_id="$1"

    # A/B Test Results
    local ab_results=$(sqlite3 ace_system.db \
        "SELECT json_group_array(
            json_object(
                'group', CASE WHEN ace_enabled THEN 'ACE' ELSE 'Control' END,
                'avg_first_confidence', AVG(first_confidence),
                'avg_final_confidence', AVG(final_confidence),
                'avg_iterations', AVG(iterations)
            )
        ) FROM ace_effectiveness WHERE timestamp >= datetime('now', '-$TIMEFRAME')")

    # Performance Metrics
    local perf_metrics=$(sqlite3 ace_system.db \
        "SELECT json_group_array(
            json_object(
                'injection_time', AVG(context_injection_time),
                'iteration_time', AVG(iteration_time),
                'time_saved', AVG(iteration_time - context_injection_time)
            )
        ) FROM ace_performance WHERE timestamp >= datetime('now', '-$TIMEFRAME')")

    # Combine metrics
    jq -n \
        --argjson ab_results "$ab_results" \
        --argjson perf_metrics "$perf_metrics" \
        '{
            "ab_test_results": $ab_results,
            "performance_metrics": $perf_metrics,
            "timestamp": now
        }' > "${EXPORT_DIR}/ace_metrics_$(date +%Y%m%d_%H%M%S).json"
}

# Export metrics for each tracked task
for task_id in $(sqlite3 ace_system.db "SELECT DISTINCT task_id FROM ace_effectiveness"); do
    generate_metrics_json "$task_id"
done
