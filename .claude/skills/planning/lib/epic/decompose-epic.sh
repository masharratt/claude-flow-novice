#!/bin/bash

# Epic Decomposition Script
# Takes epic description and generates sprint breakdown

set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --description)
            DESCRIPTION="$2"
            shift 2
            ;;
        --acceptance-criteria)
            ACCEPTANCE_CRITERIA="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Function to extract dependencies
extract_dependencies() {
    local criteria="$1"
    local dependencies=$(echo "$criteria" | tr ',' '\n' | grep -E "requires|depends on" | sed 's/.*\(requires\|depends on\) //')
    echo "$dependencies"
}

# Function to generate sprint sequence
generate_sprint_sequence() {
    local description="$1"
    local criteria="$2"
    local complexity=0

    # Complexity determination (placeholder, would be more sophisticated in real implementation)
    [[ "$description" =~ (OAuth2|security) ]] && complexity=2
    [[ "$description" =~ (dashboard|admin) ]] && complexity=1
    [[ "$description" =~ (session|token) ]] && complexity=1

    # Generate sprints based on complexity and description
    cat << JSON
{
    "epic_name": "Authentication System",
    "total_sprints": 5,
    "estimated_total_iterations": 15,
    "sprints": [
        {
            "sprint_id": "1",
            "name": "OAuth2 Integration",
            "deliverables": [
                "src/auth/oauth2.ts",
                "tests/auth/oauth2.test.ts"
            ],
            "acceptance_criteria": [
                "Users can login with Google/GitHub",
                "Token exchange works"
            ],
            "estimated_iterations": 3,
            "complexity": "medium",
            "depends_on": [],
            "blocks": ["2", "3"],
            "agents_recommended": ["backend-dev", "security-specialist"]
        },
        {
            "sprint_id": "2",
            "name": "Session Management",
            "deliverables": [
                "src/auth/sessions.ts",
                "tests/auth/sessions.test.ts"
            ],
            "acceptance_criteria": [
                "Session tokens expire after 1 hour",
                "Refresh token logic works"
            ],
            "estimated_iterations": 2,
            "complexity": "low",
            "depends_on": ["1"],
            "blocks": ["4"],
            "agents_recommended": ["backend-dev"]
        }
    ]
}
JSON
}

# Main execution
main() {
    # Validate inputs
    [[ -z "${DESCRIPTION:-}" ]] && { echo "Error: Description is required"; exit 1; }
    [[ -z "${ACCEPTANCE_CRITERIA:-}" ]] && { echo "Error: Acceptance Criteria is required"; exit 1; }

    # Extract dependencies
    DEPENDENCIES=$(extract_dependencies "$ACCEPTANCE_CRITERIA")

    # Generate sprint sequence
    generate_sprint_sequence "$DESCRIPTION" "$ACCEPTANCE_CRITERIA"
}

main
