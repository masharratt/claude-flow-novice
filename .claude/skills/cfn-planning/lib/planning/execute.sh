#!/bin/bash

set -euo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

error_exit() {
    log "ERROR: $1"
    exit 1
}

ensure_executable() {
    local script="$1"
    if [[ ! -f "$script" ]]; then
        error_exit "Script not found: $script"
    fi
    chmod +x "$script"
}

handle_epic_decompose() {
    local script="${SCRIPT_DIR}/../epic/decompose-epic.sh"
    ensure_executable "$script"
    log "Executing epic decompose with args: $*"
    "$script" "$@"
}

handle_coordinator_plan() {
    local script="${SCRIPT_DIR}/../coordinator/plan-multi-coordinator-work.sh"
    ensure_executable "$script"
    log "Executing coordinator plan with args: $*"
    "$script" "$@"
}

handle_scope_simplify() {
    local script="${SCRIPT_DIR}/../scope/simplify-scope.sh"
    ensure_executable "$script"
    log "Executing scope simplify with args: $*"
    "$script" "$@"
}

show_usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
  epic-decompose [args]     Decompose epic into smaller tasks
  coordinator-plan [args]   Plan multi-coordinator work
  scope-simplify [args]     Simplify project scope

EOF
}

main() {
    if [[ $# -eq 0 ]]; then
        show_usage
        error_exit "No command provided"
    fi

    local command="$1"
    shift

    case "$command" in
        "epic-decompose")
            handle_epic_decompose "$@"
            ;;
        "coordinator-plan")
            handle_coordinator_plan "$@"
            ;;
        "scope-simplify")
            handle_scope_simplify "$@"
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        *)
            error_exit "Unknown command: $command"
            ;;
    esac
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
main "$@"