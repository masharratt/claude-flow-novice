#!/usr/bin/env bash

# cfn-planning skill execution script
# Version: 1.0.0

set -euo pipefail

# Skill metadata
SKILL_NAME="cfn-planning"
SKILL_VERSION="1.0.0"
USAGE_DESCRIPTION="Epic decomposition, coordinator planning, and scope management"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    # Check for jq
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    # Check for redis-cli
    if ! command -v redis-cli &> /dev/null; then
        missing_deps+=("redis-cli")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_error "Please install the missing dependencies and try again."
        exit 1
    fi
}

# Show usage information
show_usage() {
    cat << EOF
$SKILL_NAME v$SKILL_VERSION - $USAGE_DESCRIPTION

Usage: $0 <command> [options]

Commands:
  epic-decompose     Decompose epics into manageable tasks
  coordinator-plan   Plan multi-coordinator work
  scope-simplify     Simplify and manage scope

Examples:
  $0 epic-decompose --epic-id EPIC-123 --output-file tasks.json
  $0 coordinator-plan --coordinators 3 --complexity high
  $0 scope-simplify --input-scope scope.json --simplify-level aggressive

For more information on a specific command, use:
  $0 <command> --help
EOF
}

# Command handlers
handle_epic_decompose() {
    log_info "Executing epic decomposition..."
    if [ -f "lib/epic/decompose-epic.sh" ]; then
        bash lib/epic/decompose-epic.sh "$@"
    else
        log_error "Epic decomposition script not found at lib/epic/decompose-epic.sh"
        exit 1
    fi
}

handle_coordinator_plan() {
    log_info "Executing coordinator planning..."
    if [ -f "lib/coordinator/plan-multi-coordinator-work.sh" ]; then
        bash lib/coordinator/plan-multi-coordinator-work.sh "$@"
    else
        log_error "Coordinator planning script not found at lib/coordinator/plan-multi-coordinator-work.sh"
        exit 1
    fi
}

handle_scope_simplify() {
    log_info "Executing scope simplification..."
    if [ -f "lib/scope/simplify-scope.sh" ]; then
        bash lib/scope/simplify-scope.sh "$@"
    else
        log_error "Scope simplification script not found at lib/scope/simplify-scope.sh"
        exit 1
    fi
}

# Main execution logic
main() {
    # Check dependencies first
    check_dependencies
    
    # Check if no arguments provided
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi
    
    # Parse command
    case "$1" in
        "epic-decompose")
            shift
            handle_epic_decompose "$@"
            ;;
        "coordinator-plan")
            shift
            handle_coordinator_plan "$@"
            ;;
        "scope-simplify")
            shift
            handle_scope_simplify "$@"
            ;;
        "--help"|"-h")
            show_usage
            exit 0
            ;;
        "--version"|"-v")
            echo "$SKILL_NAME v$SKILL_VERSION"
            exit 0
            ;;
        *)
            log_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Delegate to lib/planning/execute.sh if it exists
if [ -f "lib/planning/execute.sh" ]; then
    log_info "Delegating to lib/planning/execute.sh for execution..."
    bash lib/planning/execute.sh "$@"
else
    # Execute main function if no delegate script exists
    main "$@"
fi