#!/bin/bash
# Extended ACE System Anti-Pattern Effectiveness Analysis

set -euo pipefail

analyze_ab_test_results() {
    local task_id="${1:?Task ID required}"

    # Retrieve A/B test results from Redis
    local ab_results=$(redis-cli KEYS "ace:ab_test:${task_id}:*")

    # SQLite query to calculate metrics
    sqlite3 ace_system.db <<EOF
    WITH ab_test_data AS (
        SELECT
            json_extract(data, '$.agent_id') as agent_id,
            json_extract(data, '$.ace_enabled') as ace_enabled,
            json_extract(data, '$.first_confidence') as first_confidence,
            json_extract(data, '$.final_confidence') as final_confidence,
            json_extract(data, '$.iterations') as iterations
        FROM ace_effectiveness
        WHERE task_id = '$task_id'
    )
    SELECT
        CASE WHEN ace_enabled THEN 'ACE' ELSE 'Control' END AS group_name,
        AVG(first_confidence) AS avg_first_confidence,
        AVG(final_confidence) AS avg_final_confidence,
        AVG(iterations) AS avg_iterations,
        COUNT(*) AS sample_size
    FROM ab_test_data
    GROUP BY group_name;
EOF
}

calculate_roi() {
    local task_id="${1:?Task ID required}"

    sqlite3 ace_system.db <<EOF
    WITH timing_data AS (
        SELECT
            json_extract(data, '$.context_injection_time') as injection_time,
            json_extract(data, '$.iteration_time') as iteration_time
        FROM ace_performance
        WHERE task_id = '$task_id'
    )
    SELECT
        AVG(injection_time) as avg_injection_time,
        AVG(iteration_time) as avg_iteration_time,
        AVG(iteration_time - injection_time) as time_saved
    FROM timing_data;
EOF
}

# Main execution
analyze_ab_test_results "$@"
calculate_roi "$@"
