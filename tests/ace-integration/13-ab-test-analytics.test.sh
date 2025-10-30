#!/bin/bash
# ACE System A/B Test Analytics Tests

set -euo pipefail

# Setup test database
setup_test_db() {
    sqlite3 test_ace_system.db << EOF
    CREATE TABLE ace_effectiveness (
        task_id TEXT, agent_id TEXT, ace_enabled BOOLEAN,
        first_confidence REAL, final_confidence REAL, iterations INTEGER
    );
    INSERT INTO ace_effectiveness VALUES 
        ('test1', 'agent1', TRUE, 0.6, 0.9, 2),
        ('test1', 'agent2', FALSE, 0.4, 0.7, 3),
        ('test2', 'agent3', TRUE, 0.7, 0.95, 1),
        ('test2', 'agent4', FALSE, 0.3, 0.6, 4);
EOF
}

test_ab_test_results() {
    local results=$(sqlite3 test_ace_system.db <<EOF
    WITH ab_test_data AS (
        SELECT
            CASE WHEN ace_enabled THEN 'ACE' ELSE 'Control' END AS group_name,
            AVG(first_confidence) AS avg_first_confidence,
            AVG(final_confidence) AS avg_final_confidence,
            AVG(iterations) AS avg_iterations
        FROM ace_effectiveness
        GROUP BY group_name
    )
    SELECT * FROM ab_test_data;
EOF
)

    [[ "$results" == *"ACE|0.65|0.925|1.5"* ]] || {
        echo "AB Test Results Calculation Failed"
        return 1
    }
}

test_confidence_improvement() {
    local results=$(sqlite3 test_ace_system.db <<EOF
    SELECT 
        AVG(final_confidence - first_confidence) as confidence_gain
    FROM ace_effectiveness 
    WHERE ace_enabled = TRUE;
EOF
)

    (( $(echo "$results > 0.25" | bc -l) )) || {
        echo "Confidence Improvement Test Failed"
        return 1
    }
}

test_iteration_reduction() {
    local results=$(sqlite3 test_ace_system.db <<EOF
    SELECT 
        AVG(CASE WHEN ace_enabled THEN iterations ELSE 0 END) as ace_avg_iterations,
        AVG(CASE WHEN NOT ace_enabled THEN iterations ELSE 0 END) as control_avg_iterations
    FROM ace_effectiveness;
EOF
)

    [[ "$results" == *"1.5|3.5"* ]] || {
        echo "Iteration Reduction Test Failed"
        return 1
    }
}

test_track_ab_test() {
    source .claude/skills/cfn-ace-system/track-ab-test.sh "test_task" "test_agent" "true" 0.85 "ml" 50

    local result=$(redis-cli HGET "ace:ab_test:test_task:test_agent" enabled)
    [[ "$result" == "true" ]] || {
        echo "A/B Test Tracking Failed"
        return 1
    }
}

test_export_metrics() {
    mkdir -p /tmp/metrics
    .claude/skills/cfn-ace-system/export-ace-metrics.sh "/tmp/metrics" "7d"

    [[ -f /tmp/metrics/ace_metrics_*.json ]] || {
        echo "Metrics Export Failed"
        return 1
    }
}

# Main test execution
main() {
    setup_test_db

    local tests=(
        test_ab_test_results
        test_confidence_improvement
        test_iteration_reduction
        test_track_ab_test
        test_export_metrics
    )

    local passed=0
    local failed=0

    for test in "${tests[@]}"; do
        if $test; then
            ((passed++))
        else
            ((failed++))
        fi
    done

    echo "Tests Passed: $passed, Failed: $failed"
    [[ $failed -eq 0 ]]
}

main
