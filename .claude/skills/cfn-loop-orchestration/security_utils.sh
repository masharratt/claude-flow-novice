#!/usr/bin/env bash

##############################################################################
# Security Utilities for CFN Loop Orchestration
# Provides input sanitization and validation functions
##############################################################################

# Validate and sanitize input for agent IDs, task IDs, iteration numbers
# Allowed characters: alphanumeric, dash, underscore
# Maximum length: 64 characters
function sanitize_input() {
    local input="$1"
    local max_length="${2:-64}"
    local pattern="^[a-zA-Z0-9_-]+$"

    # Check if input is empty
    if [ -z "$input" ]; then
        echo "Error: Input cannot be empty" >&2
        return 1
    fi

    # Check input length
    if [ ${#input} -gt "$max_length" ]; then
        echo "Error: Input exceeds maximum length of $max_length characters" >&2
        return 1
    fi

    # Validate against allowed pattern
    if [[ ! "$input" =~ $pattern ]]; then
        echo "Error: Invalid characters in input. Only alphanumeric, dash, and underscore allowed" >&2
        return 1
    fi

    # If all checks pass, echo the sanitized input
    echo "$input"
}

# Validate context JSON (optional JSON structure validation)
function validate_json_context() {
    local context="$1"

    # If context is empty, return success
    if [ -z "$context" ]; then
        return 0
    fi

    # Use jq to validate JSON structure, silently discard output
    if ! echo "$context" | jq -e . >/dev/null 2>&1; then
        echo "Error: Invalid JSON context" >&2
        return 1
    fi

    return 0
}

# Safe Redis key generator
function generate_safe_redis_key() {
    local prefix="$1"
    local task_id="$2"
    local suffix="${3:-}"

    # Sanitize all input components
    local safe_prefix
    local safe_task_id
    local safe_suffix

    safe_prefix=$(sanitize_input "$prefix" 32) || return 1
    safe_task_id=$(sanitize_input "$task_id" 64) || return 1

    # Suffix is optional, but if provided, must be sanitized
    if [ -n "$suffix" ]; then
        safe_suffix=$(sanitize_input "$suffix" 32) || return 1
        echo "swarm:${safe_prefix}:${safe_task_id}:${safe_suffix}"
    else
        echo "swarm:${safe_prefix}:${safe_task_id}"
    fi
}

# Validation function for agent lists
function validate_agent_list() {
    local agents="$1"

    # Check if empty
    if [ -z "$agents" ]; then
        echo "Error: Agent list cannot be empty" >&2
        return 1
    fi

    # Split agents and validate each
    IFS=',' read -ra AGENT_ARRAY <<< "$agents"
    for agent in "${AGENT_ARRAY[@]}"; do
        if ! sanitize_input "$agent" 64 >/dev/null; then
            echo "Error: Invalid agent ID: $agent" >&2
            return 1
        fi
    done

    return 0
}