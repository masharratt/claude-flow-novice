#!/bin/bash

set -euo pipefail

# Sprint Execution Wrapper Script

# Parse arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --sprint-config)
            SPRINT_CONFIG="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate inputs
[[ -z "${SPRINT_CONFIG:-}" ]] && { echo "Error: Sprint configuration is required"; exit 1; }
[[ -z "${MODE:-}" ]] && MODE="standard"

# Function to validate deliverables
validate_deliverables() {
    local config="$1"
    local deliverables
    
    # Extract deliverables from config
    deliverables=$(echo "$config" | jq -r '.deliverables[]')
    
    # Check if deliverables exist
    for file in $deliverables; do
        if [[ ! -f "$file" ]]; then
            echo "❌ Deliverable missing: $file"
            return 1
        fi
    done
    
    echo "✅ All deliverables present"
    return 0
}

# Main execution
main() {
    # Validate sprint configuration
    echo "Executing sprint with mode: $MODE"
    
    # Validate deliverables
    if validate_deliverables "$SPRINT_CONFIG"; then
        echo "PROCEED"
        exit 0
    else
        echo "ITERATE"
        exit 1
    fi
}

main
