#!/bin/bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CLI_SCRIPT="${SCRIPT_DIR}/cli/knowledge-base.sh"

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

check_cli_exists() {
    if [[ ! -f "$CLI_SCRIPT" ]]; then
        error_exit "CLI script not found at $CLI_SCRIPT"
    fi
    if [[ ! -x "$CLI_SCRIPT" ]]; then
        chmod +x "$CLI_SCRIPT"
    fi
}

show_help() {
    cat << 'EOF'
CFN Knowledge Base - Main Entry Point

USAGE:
    ./execute.sh <command> [options]

COMMANDS:
    init                    Initialize the knowledge base databases
    query <pattern>         Search for patterns in workflows and playbooks
    store <type> <data>     Store new learnings (workflow or playbook)
    help                    Show this help message

EXAMPLES:
    # Initialize the knowledge base
    ./execute.sh init

    # Search for CloudFormation patterns
    ./execute.sh query "EC2 instance configuration"

    # Store a new workflow
    ./execute.sh store workflow "EC2 Security Group Pattern"

    # Store a new playbook
    ./execute.sh store playbook "VPC Peering Failure Resolution"

    # Show help
    ./execute.sh help

OPTIONS:
    All options are passed through to the underlying CLI script.
    Use './execute.sh help' for more detailed information.

EOF
}

init_databases() {
    echo "Initializing CFN Knowledge Base databases..."
    check_cli_exists
    "$CLI_SCRIPT" init
    echo "Initialization complete."
}

query_patterns() {
    local pattern="$1"
    if [[ -z "$pattern" ]]; then
        error_exit "Query pattern cannot be empty. Usage: ./execute.sh query '<pattern>'"
    fi
    echo "Searching for patterns: $pattern"
    check_cli_exists

    # Try workflow, playbook, and learnings
    echo ""
    echo "=== Workflow Patterns ==="
    "$CLI_SCRIPT" query-workflow --pattern "$pattern" 2>/dev/null || \
        echo "No workflow patterns found."

    echo ""
    echo "=== Playbook Entries ==="
    "$CLI_SCRIPT" query-playbook --search "$pattern" 2>/dev/null || \
        echo "No playbook entries found."

    echo ""
    echo "=== Stored Learnings ==="
    # Simple query to the learnings database
    local learnings_db="${SCRIPT_DIR}/cli/data/learnings.db"
    if [[ -f "$learnings_db" ]]; then
        # Set sqlite3 to use | as separator
        echo "ID   TYPE       TITLE                          TAGS                 CREATED_AT          "
        echo "---  ----       -----                          ----                 -----------         "
        sqlite3 -separator " | " "$learnings_db" \
            "SELECT id, type, title, tags, created_at FROM learnings
             WHERE title LIKE '%$pattern%' OR content LIKE '%$pattern%' OR tags LIKE '%$pattern%';" 2>/dev/null || \
        echo "No learnings found matching: $pattern"
    else
        echo "Learnings database not initialized. Run './execute.sh init' first."
    fi
}

store_learning() {
    local type="$1"
    local data="$2"

    if [[ -z "$type" ]]; then
        error_exit "Type cannot be empty. Usage: ./execute.sh store <workflow|playbook> '<title>' '<content>'"
    fi

    if [[ -z "$data" ]]; then
        error_exit "Data cannot be empty. Usage: ./execute.sh store <workflow|playbook> '<title>' '<content>'"
    fi

    if [[ "$type" != "workflow" && "$type" != "playbook" ]]; then
        error_exit "Type must be 'workflow' or 'playbook'"
    fi

    echo "Storing new $type: $data"
    check_cli_exists

    # Parse data as title and content (simple split at first space)
    local title="$data"
    local content=""

    # For now, just use the data as both title and content
    "$CLI_SCRIPT" store-learning --type "$type" --title "$title" --content "$title"
    echo "Successfully stored $type."
}

main() {
    if [[ $# -eq 0 ]]; then
        show_help
        exit 1
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        "init")
            init_databases
            ;;
        "query")
            if [[ $# -eq 0 ]]; then
                error_exit "Query requires a pattern. Usage: ./execute.sh query '<pattern>'"
            fi
            query_patterns "$1"
            ;;
        "store")
            if [[ $# -lt 2 ]]; then
                error_exit "Store requires type and data. Usage: ./execute.sh store <workflow|playbook> '<data>'"
            fi
            store_learning "$1" "$2"
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            error_exit "Unknown command: $command. Use './execute.sh help' for usage information."
            ;;
    esac
}

main "$@"