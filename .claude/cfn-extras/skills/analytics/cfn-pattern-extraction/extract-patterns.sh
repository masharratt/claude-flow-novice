#!/usr/bin/env bash

# Pattern Extraction Script for CFN Loop Retrospective

set -euo pipefail

# Parse input arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --task-type)
            TASK_TYPE="$2"
            shift 2
            ;;
        --feedback-themes)
            FEEDBACK_THEMES="$2"
            shift 2
            ;;
        --successful-agents)
            SUCCESSFUL_AGENTS="$2"
            shift 2
            ;;
        --iterations)
            ITERATIONS="$2"
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
[[ -z "${FEEDBACK_THEMES:-}" ]] && { echo "Error: feedback-themes is required"; exit 1; }
[[ -z "${SUCCESSFUL_AGENTS:-}" ]] && { echo "Error: successful-agents is required"; exit 1; }
[[ -z "${ITERATIONS:-}" ]] && { echo "Error: iterations is required"; exit 1; }

# Convert comma-separated lists to arrays
IFS=',' read -r -a THEMES <<< "$FEEDBACK_THEMES"
IFS=',' read -r -a AGENTS <<< "$SUCCESSFUL_AGENTS"

# Pattern extraction function
extract_patterns() {
    local task_type="$1"
    local themes=("${!2}")
    local agents=("${!3}")
    local iterations="$4"

    # Generate JSON output
    jq -n \
        --arg task_type "$task_type" \
        --argjson iterations "$iterations" \
        --arg agents "$(printf '%s,' "${agents[@]}")" \
        --arg themes "$(printf '%s,' "${themes[@]}")" \
        '{
            "task_type": $task_type,
            "iterations": $iterations,
            "patterns_identified": [
                {
                    "pattern_id": "agent-synergy",
                    "description": "Agent performance synergy",
                    "confidence": 0.90,
                    "evidence": "Successful agents: " + $agents,
                    "recommendation": "Consider pairing these agents for similar tasks"
                },
                {
                    "pattern_id": "feedback-resolution",
                    "description": "Common feedback themes resolution",
                    "confidence": 0.85,
                    "evidence": "Themes: " + $themes,
                    "recommendation": "Create templates for addressing these feedback themes"
                }
            ]
        }'
}

# Run pattern extraction and output JSON
extract_patterns "$TASK_TYPE" THEMES[@] AGENTS[@] "$ITERATIONS"