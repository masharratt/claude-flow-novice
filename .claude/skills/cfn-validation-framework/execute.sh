#!/usr/bin/env bash
# Main entry point for cfn-validation-framework skill
# Provides multi-layer validation for CFN Loop

set -euo pipefail

# Get script directory (absolute path)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="cfn-validation-framework"
SKILL_VERSION="1.0.0"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage information
show_help() {
    cat << EOF
$SKILL_NAME v$SKILL_VERSION

Multi-layer validation for CFN Loop - templates, defense-in-depth, deliverables, instrumentation

USAGE:
    $0 <command> [options]

COMMANDS:
    validate-json        Validate JSON against success criteria schema
    calculate-deliverable-confidence  Calculate confidence score for deliverables
    run-instrumented     Execute commands with validation instrumentation

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    -d, --debug         Enable debug output

EXAMPLES:
    # Validate JSON success criteria
    $0 validate-json --file ./deliverables.json --schema ./schema.json

    # Calculate deliverable confidence
    $0 calculate-deliverable-confidence --deliverables ./artifacts/

    # Run with instrumentation
    $0 run-instrumented --command "npm test" --output-dir ./results/

For more information, see: $SCRIPT_DIR/SKILL.md
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

    command -v jq >/dev/null 2>&1 || missing+=("jq")
    command -v node >/dev/null 2>&1 || missing+=("node")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Error: Missing required dependencies:${NC}" >&2
        for dep in "${missing[@]}"; do
            echo "  - $dep" >&2
        done
        return 1
    fi
}

# Command handlers
handle_validate_json() {
    local file=""
    local schema=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --file)
                file="$2"
                shift 2
                ;;
            --schema)
                schema="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$file" || -z "$schema" ]]; then
        echo -e "${RED}Error: --file and --schema are required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/json/validate-success-criteria.sh" --file "$file" --schema "$schema"
}

handle_calculate_confidence() {
    local deliverables=""
    local output=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --deliverables)
                deliverables="$2"
                shift 2
                ;;
            --output)
                output="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$deliverables" ]]; then
        echo -e "${RED}Error: --deliverables is required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/deliverables/confidence-calculator.sh" --deliverables "$deliverables" ${output:+--output "$output"}
}

handle_run_instrumented() {
    local command=""
    local output_dir=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --command)
                command="$2"
                shift 2
                ;;
            --output-dir)
                output_dir="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$command" ]]; then
        echo -e "${RED}Error: --command is required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/instrumentation/wrapped-executor.sh" --command "$command" ${output_dir:+--output-dir "$output_dir"}
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

    # Check dependencies
    check_dependencies

    # Execute command
    if [[ -z "${COMMAND:-}" ]]; then
        echo -e "${RED}Error: No command specified${NC}" >&2
        echo "Use '$0 --help' for usage information" >&2
        exit 1
    fi

    case "$COMMAND" in
        validate-json)
            handle_validate_json "$@"
            ;;
        calculate-deliverable-confidence)
            handle_calculate_confidence "$@"
            ;;
        run-instrumented)
            handle_run_instrumented "$@"
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