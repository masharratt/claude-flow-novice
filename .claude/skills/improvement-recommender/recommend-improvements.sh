#!/bin/bash

# Improvement Recommendation Script

set -euo pipefail

# Parse input arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --task-type)
            TASK_TYPE="$2"
            shift 2
            ;;
        --bottlenecks)
            BOTTLENECKS="$2"
            shift 2
            ;;
        --iterations)
            ITERATIONS="$2"
            shift 2
            ;;
        --estimated)
            ESTIMATED_ITERATIONS="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Input validation
[[ -z "${TASK_TYPE:-}" ]] && { echo "Error: task-type is required"; exit 1; }
[[ -z "${BOTTLENECKS:-}" ]] && { echo "Error: bottlenecks is required"; exit 1; }
[[ -z "${ITERATIONS:-}" ]] && { echo "Error: iterations is required"; exit 1; }
[[ -z "${ESTIMATED_ITERATIONS:-}" ]] && { echo "Error: estimated iterations is required"; exit 1; }

# Convert comma-separated lists to arrays
IFS=',' read -r -a BOTTLENECK_LIST <<< "$BOTTLENECKS"

# Improvement recommendation function
recommend_improvements() {
    local task_type="$1"
    local bottlenecks=("${!2}")
    local iterations="$3"
    local estimated_iterations="$4"

    # Calculate iteration efficiency
    local efficiency=$(echo "scale=2; $estimated_iterations / $iterations" | bc)

    # Generate JSON output with improvement recommendations
    jq -n \
        --arg task_type "$task_type" \
        --argjson iterations "$iterations" \
        --arg estimated_iterations "$estimated_iterations" \
        --arg efficiency "$efficiency" \
        --arg bottlenecks "$(printf '%s,' "${bottlenecks[@]}")" \
        '{
            "task_type": $task_type,
            "actual_iterations": $iterations,
            "estimated_iterations": $estimated_iterations,
            "iteration_efficiency": $efficiency,
            "improvements": [
                {
                    "category": "agent_selection",
                    "suggestion": "Refine agent selection based on task complexity",
                    "expected_benefit": "Reduce iterations by adding specialized agents",
                    "confidence": 0.85,
                    "impacted_bottlenecks": $bottlenecks
                },
                {
                    "category": "feedback_processing",
                    "suggestion": "Create standardized feedback templates",
                    "expected_benefit": "Faster issue resolution",
                    "confidence": 0.75,
                    "impacted_bottlenecks": $bottlenecks
                },
                {
                    "category": "iteration_optimization",
                    "suggestion": "Implement dynamic iteration scaling",
                    "expected_benefit": "More precise iteration planning",
                    "confidence": 0.80,
                    "current_efficiency": $efficiency
                }
            ]
        }'
}

# Run improvement recommendation and output JSON
recommend_improvements "$TASK_TYPE" BOTTLENECK_LIST[@] "$ITERATIONS" "$ESTIMATED_ITERATIONS"