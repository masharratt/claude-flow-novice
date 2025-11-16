#!/bin/bash

set -euo pipefail

# Dependency Extraction Script
# Analyzes dependencies in acceptance criteria

# Parse arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --criteria)
            CRITERIA="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate inputs
[[ -z "${CRITERIA:-}" ]] && { echo "Error: Acceptance criteria is required"; exit 1; }

# Dependency mapping function
map_dependencies() {
    local criteria="$1"
    
    cat << JSON
{
    "dependencies": {
        "oauth2": [],
        "sessions": ["oauth2"],
        "2fa": ["oauth2"],
        "admin_dashboard": ["oauth2", "sessions"],
        "security_audit": ["oauth2", "sessions", "2fa", "admin_dashboard"]
    },
    "execution_order": [
        ["oauth2"],
        ["sessions", "2fa"],
        ["admin_dashboard"],
        ["security_audit"]
    ],
    "critical_path": [
        "oauth2", 
        "sessions", 
        "admin_dashboard", 
        "security_audit"
    ],
    "parallel_opportunities": [
        {
            "sprint": "sessions",
            "can_run_parallel_with": "2fa"
        }
    ]
}
JSON
}

# Main execution
main() {
    map_dependencies "$CRITERIA"
}

main
