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

    # Validate critical paths - detect project root dynamically
    local project_root=""
    if [ -n "${CFN_PROJECT_ROOT:-}" ]; then
        project_root="$CFN_PROJECT_ROOT"
    elif [ -d ".claude" ] && [ -f "package.json" ]; then
        project_root="$(pwd)"
    else
        # Try to find project root by searching upward
        project_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(pwd)")"
    fi
    
    if [ ! -d "$project_root/.claude" ]; then
        echo "WARNING: CFN project structure not found at $project_root" >&2
        # Don't fail - continue with sanitization
    fi

    # Set secure permissions
    umask 0077

    return 0
}

# Main execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    sanitize_environment "${1:-}" "${2:-}"
fi
