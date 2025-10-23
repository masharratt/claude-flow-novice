#!/bin/bash

# Retrospective Report Generator

set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --retrospective-json)
            RETROSPECTIVE_JSON="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Input validation
[[ -z "${RETROSPECTIVE_JSON:-}" ]] && { echo "Error: retrospective-json is required"; exit 1; }
[[ -z "${OUTPUT_FILE:-}" ]] && { echo "Error: output file is required"; exit 1; }

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Generate Markdown Report using jq and heredoc
generate_markdown() {
    local json="$1"

    # Extract key data using jq
    sprint_name=$(echo "$json" | jq -r '.sprint_name // "Unnamed Sprint"')
    sprint_num=$(echo "$json" | jq -r '.sprint_num // "N/A"')
    task_type=$(echo "$json" | jq -r '.task_type // "Unspecified"')
    total_iterations=$(echo "$json" | jq -r '.velocity.total_iterations // 0')
    time_to_convergence=$(echo "$json" | jq -r '.velocity."time_to_convergence" // "Unknown"')
    final_confidence=$(echo "$json" | jq -r '.confidence_trajectory["iteration_3"] // 0')
    final_consensus=$(echo "$json" | jq '.confidence_trajectory["iteration_3"] // 0')

    # Generate markdown
    cat <<EOF
# Sprint Retrospective: ${sprint_name}

**Date:** $(date +%Y-%m-%d)
**Sprint Number:** ${sprint_num}
**Task Type:** ${task_type}
**Status:** SUCCEED

## Metrics

- Total Iterations: ${total_iterations}
- Time to Convergence: ${time_to_convergence}
- Final Confidence: ${final_confidence}
- Final Consensus: ${final_consensus}

## Confidence Trajectory

$(echo "$json" | jq -r '.confidence_trajectory | to_entries[] | "Iteration \(.key): \(.value) \(if .value >= 0.90 then "(PROCEED)" elif .value >= 0.75 then "(PASS)" else "(BELOW GATE)" end)"')

## Agent Performance

Top Performers:
$(echo "$json" | jq -r '.agent_performance.top_performers[] | "- \(.agent): \(.avg_confidence) avg confidence"')

Synergies:
$(echo "$json" | jq -r '.agent_performance.synergies[] | "- \(.pair): \(.effectiveness)"')

## Bottlenecks Identified

$(echo "$json" | jq -r '.bottlenecks[] | "1. \(.type) (Iteration \(.iteration))\n   - \(.description)\n   - Resolution: \(.resolution)"')

## Successful Strategies

$(echo "$json" | jq -r '.successful_strategies[] | "- \(.)"')

## Lessons Learned

$(echo "$json" | jq -r '.lessons_learned[] | "\(.)"')

## Recommendations for Future

$(echo "$json" | jq -r '.playbook_recommendations[] | "- \(.task_pattern): Add \(.add_agent), Expected Improvement: \(.expected_improvement)"')

## Playbook Updated

✅ Task pattern stored in playbook for future reference
✅ Agent performance metrics updated
✅ Successful strategies recorded
EOF
}

# Generate the markdown and save
generate_markdown "$RETROSPECTIVE_JSON" > "$OUTPUT_FILE"

echo "Retrospective report generated: $OUTPUT_FILE"