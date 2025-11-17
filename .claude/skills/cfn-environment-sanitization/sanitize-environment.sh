#!/usr/bin/env bash
# CFN Environment Sanitization
# Sanitizes environment variables and ensures secure execution context

set -euo pipefail

# Function to sanitize environment
sanitize_environment() {
    local agent_id="${1:-unknown}"
    local task_id="${2:-unknown}"

    # Remove sensitive environment variables
    unset AWS_SECRET_ACCESS_KEY || true
    unset OPENAI_API_KEY || true
    unset ANTHROPIC_API_KEY || true
    unset DATABASE_PASSWORD || true

    # Set safe defaults
    export NODE_ENV="${NODE_ENV:-production}"
    export CFN_AGENT_ID="$agent_id"
    export CFN_TASK_ID="$task_id"

    # Validate critical paths
    if [ ! -d "/home/user/claude-flow-novice" ]; then
        echo "ERROR: Project root not found" >&2
        return 1
    fi

    # Set secure permissions
    umask 0077

    return 0
}

# Main execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    sanitize_environment "${1:-}" "${2:-}"
fi
