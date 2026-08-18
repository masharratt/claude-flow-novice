#!/usr/bin/env bash

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
    local project_root
    project_root=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
    local cli_path="${project_root}/dist/src/planning/dependency-extractor/cli.js"

    if [[ -f "$cli_path" ]] && command -v node &>/dev/null; then
        node "$cli_path" --criteria "$criteria"
        return
    fi

    cat << JSON
{
    "dependencies": {
        "task-1": []
    },
    "execution_order": [["task-1"]],
    "critical_path": ["task-1"],
    "parallel_opportunities": []
}
JSON
}

# Main execution
main() {
    map_dependencies "$CRITERIA"
}

main
