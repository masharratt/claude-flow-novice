#!/usr/bin/env bash

set -euo pipefail

# Sprint Planner Script
# Generates detailed sprint plan from epic JSON

# Parse arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --sprint-id)
            SPRINT_ID="$2"
            shift 2
            ;;
        --epic-json)
            EPIC_JSON="$2"
            shift 2
            ;;
        --task-type)
            TASK_TYPE="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate inputs
[[ -z "${SPRINT_ID:-}" ]] && { echo "Error: Sprint ID is required"; exit 1; }
[[ -z "${EPIC_JSON:-}" ]] && { echo "Error: Epic JSON is required"; exit 1; }

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Please install jq to continue."
    exit 1
fi

# Extract sprint details from epic JSON
extract_sprint_details() {
    local json="$1"
    local sprint_id="$2"
    
    # Find the sprint matching the sprint ID
    local sprint_data
    sprint_data=$(echo "$json" | jq --arg sid "$sprint_id" '.sprints[] | select(.id == $sid)') || {
        echo "Error: Failed to parse epic JSON"
        exit 1
    }
    
    # Check if sprint was found
    if [[ -z "$sprint_data" || "$sprint_data" == "null" ]]; then
        echo "Error: Sprint with ID '$sprint_id' not found in epic JSON"
        exit 1
    fi
    
    # Extract and format the sprint details
    echo "$sprint_data" | jq '{
        sprint_id: .id,
        sprint_name: .name,
        epic_name: .epic_name,
        deliverables: .deliverables,
        in_scope: .in_scope,
        out_of_scope: .out_of_scope,
        acceptance_criteria: .acceptance_criteria,
        agents: .agents,
        estimated_iterations: .estimated_iterations,
        max_iterations: .max_iterations,
        complexity: .complexity,
        context_injection: .context_injection
    }'
}

# Main execution
main() {
    extract_sprint_details "$EPIC_JSON" "$SPRINT_ID"
}

main