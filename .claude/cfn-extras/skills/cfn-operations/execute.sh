#!/usr/bin/env bash
# Main entry point for cfn-operations skill
# Generated from template - DO NOT EDIT MANUALLY

set -euo pipefail

# Source shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_LIB="$SCRIPT_DIR/../shared/lib"

# shellcheck source=../shared/lib/path-utils.sh
source "$SHARED_LIB/path-utils.sh"

# Skill metadata
SKILL_NAME="cfn-operations"
SKILL_VERSION="1.0.0"
SKILL_DIR="$SCRIPT_DIR"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage information
show_help() {
    cat << EOF
$SKILL_NAME v$SKILL_VERSION

CFN Operations - File and log operations for CFN

USAGE:
    $0 <command> [options]

COMMANDS:
    file        File operations (atomic writes, locking, etc.)
    log         Log operations (search, rotation, stats, etc.)

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    -d, --debug         Enable debug output

EXAMPLES:
    $0 file atomic-write /path/to/file.txt "content"
    $0 log search --correlation-id "task:123:agent"
    $0 log stats --format json

For more information, see: $SKILL_DIR/SKILL.md
EOF
}

# Show version
show_version() {
    echo "$SKILL_NAME version $SKILL_VERSION"
}

# Enable debug mode
enable_debug() {
    set -x
    export DEBUG=true
    echo "Debug mode enabled"
}

# Validate dependencies
check_dependencies() {
    local missing=()

    # Check for jq
    if ! command -v jq >/dev/null 2>&1; then
        missing+=("jq")
    fi

    # Check for sub-command executables
    if [[ ! -x "$SKILL_DIR/lib/file/execute.sh" ]]; then
        missing+=("file/execute.sh")
    fi

    if [[ ! -x "$SKILL_DIR/lib/log/execute.sh" ]]; then
        missing+=("log/execute.sh")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Error: Missing required dependencies:${NC}" >&2
        for dep in "${missing[@]}"; do
            echo "  - $dep" >&2
        done
        return 1
    fi
}

# Initialize skill
initialize() {
    # Source any additional shared utilities

    # Check dependencies
    check_dependencies

    # Run skill-specific initialization
    # No specific initialization needed for cfn-operations
}

# Command handlers
handle_file_command() {
    local file_cmd="$SKILL_DIR/lib/file/execute.sh"
    if [[ -x "$file_cmd" ]]; then
        exec "$file_cmd" "$@"
    else
        echo -e "${RED}Error: File operations not available${NC}" >&2
        exit 1
    fi
}

handle_log_command() {
    local log_cmd="$SKILL_DIR/lib/log/execute.sh"
    if [[ -x "$log_cmd" ]]; then
        exec "$log_cmd" "$@"
    else
        echo -e "${RED}Error: Log operations not available${NC}" >&2
        exit 1
    fi
}

# Main execution
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--version)
                show_version
                exit 0
                ;;
            -d|--debug)
                enable_debug
                shift
                ;;
            *)
                COMMAND="$1"
                shift
                break
                ;;
        esac
    done

    # Initialize skill
    initialize

    # Execute command
    if [[ -z "${COMMAND:-}" ]]; then
        echo -e "${RED}Error: No command specified${NC}" >&2
        echo "Use '$0 --help' for usage information" >&2
        exit 1
    fi

    case "$COMMAND" in
        file)
            handle_file_command "$@"
            ;;
        log)
            handle_log_command "$@"
            ;;
        *)
            echo -e "${RED}Error: Unknown command: $COMMAND${NC}" >&2
            echo "Use '$0 --help' for available commands" >&2
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"