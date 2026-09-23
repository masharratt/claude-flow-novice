#!/usr/bin/env bash
# CFN Utilities - Main entry point
# Sources all utility libraries and provides function execution
# Usage: ./.claude/skills/cfn-utilities/execute.sh <function> <args>

set -euo pipefail

# Get script directory (absolute path)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source all utility libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/errors.sh"
source "$SCRIPT_DIR/lib/retry.sh"
source "$SCRIPT_DIR/lib/file-ops.sh"

# If script is executed directly (not sourced), run the requested function
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    if [ $# -eq 0 ]; then
        echo "Usage: $0 <function> [args...]" >&2
        echo "" >&2
        echo "Available functions:" >&2
        echo "  Logging: log_json, log_info, log_warn, log_error, log_debug" >&2
        echo "  Errors: error_exit, error_handle, is_error_code" >&2
        echo "  Retry: retry_with_backoff, retry_fixed, retry_until_timeout" >&2
        echo "  File Ops: atomic_write, acquire_lock, release_lock, with_lock, is_locked" >&2
        exit 2
    fi

    # Execute the requested function with its arguments
    "$@"
fi
