#!/usr/bin/env bash
set -euo pipefail

# Dependency check script for Process Lifecycle skill

# Required command-line tools
REQUIRED_COMMANDS=("jq" "redis-cli" "node" "npm")

# Check for required commands
check_commands() {
    local missing_commands=()
    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_commands+=("$cmd")
        fi
    done

    if [ ${#missing_commands[@]} -ne 0 ]; then
        echo "Error: Missing required commands: ${missing_commands[*]}"
        return 1
    fi
}

# Check Node.js version
check_nodejs_version() {
    local required_major=18
    local current_version=$(node -v)
    local current_major=$(echo "$current_version" | cut -d. -f1 | tr -d 'v')

    if [ "$current_major" -lt "$required_major" ]; then
        echo "Error: Node.js version $current_version is too low. Requires v$required_major+"
        return 1
    fi
}

# Check Redis connection
check_redis_connection() {
    if ! redis-cli ping > /dev/null 2>&1; then
        echo "Error: Unable to connect to Redis server"
        return 1
    fi
}

# Main dependency check
main() {
    check_commands
    check_nodejs_version
    check_redis_connection

    if [ $? -eq 0 ]; then
        echo "All dependencies for Process Lifecycle skill are satisfied."
        exit 0
    else
        exit 1
    fi
}

main