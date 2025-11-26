#!/bin/bash

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

# Extract sprint details from epic JSON
extract_sprint_details() {
    local json="$1"
    local sprint_id="$2"
    
    # In a real implementation, we'd use jq for robust parsing
    # This is a simplified placeholder
    cat << JSON
{
    "sprint_id": "$sprint_id",
    "sprint_name": "OAuth2 Integration",
    "epic_name": "Authentication System",
    "deliverables": [
        "src/auth/oauth2.ts",
        "tests/auth/oauth2.test.ts"
    ],
    "in_scope": [
        "OAuth2 provider configuration",
        "Login endpoints",
        "Token exchange logic",
        "Basic error handling"
    ],
    "out_of_scope": [
        "Session management (Sprint 2)",
        "2FA (Sprint 3)",
        "Admin dashboard (Sprint 4)"
    ],
    "acceptance_criteria": [
        "Users can login with Google",
        "Users can login with GitHub",
        "Token exchange works correctly",
        "Basic tests pass"
    ],
    "agents": {
        "loop3": ["backend-dev", "security-specialist"],
        "loop2": ["reviewer", "tester", "security-auditor"]
    },
    "estimated_iterations": 3,
    "max_iterations": 5,
    "complexity": "medium",
    "context_injection": "Sprint $sprint_id of 5: OAuth2 Integration. Focus ONLY on OAuth2 provider config and token exchange. DO NOT implement sessions, 2FA, or admin features - those are future sprints. Create src/auth/oauth2.ts and tests/auth/oauth2.test.ts."
}
JSON
}

# Main execution
main() {
    extract_sprint_details "$EPIC_JSON" "$SPRINT_ID"
}

main
