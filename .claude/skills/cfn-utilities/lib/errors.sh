#!/usr/bin/env bash
# Error handling utilities for CFN system
# Compatible with TypeScript errors.ts conventions

# Source logging if not already loaded
if ! declare -f log_error >/dev/null 2>&1; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$SCRIPT_DIR/logging.sh"
fi

# Log error and exit with specified code
# Usage: error_exit "message" exit_code '{"context":"json"}'
error_exit() {
    local message="${1:-Unknown error}"
    local exit_code="${2:-1}"
    local context="${3:-{}}"

    log_error "$message" "$context"
    exit "$exit_code"
}

# Handle error without exiting (just log and return error code)
# Usage: error_handle "message" '{"context":"json"}' || return 1
error_handle() {
    local message="${1:-Unknown error}"
    local context="${2:-{}}"

    log_error "$message" "$context"
    return 1
}

# Check if exit code matches expected value
# Usage: some_command; EXITCODE=$?; if is_error_code $EXITCODE 7; then echo "Connection failed"; fi
is_error_code() {
    local actual_code="${1:?Exit code required}"
    local expected_code="${2:-1}"

    [ "$actual_code" -eq "$expected_code" ]
}

# Capture error context from last failed command
# Usage: get_error_context
get_error_context() {
    local exit_code=$?
    local line_number="${BASH_LINENO[0]}"
    local function_name="${FUNCNAME[1]}"

    echo "{\"exit_code\":$exit_code,\"line\":$line_number,\"function\":\"$function_name\"}"
}

# Standard exit codes (compatible with TypeScript errors.ts)
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_USAGE_ERROR=2
readonly EXIT_TIMEOUT=130
readonly EXIT_INTERRUPT=143
