#!/bin/bash
# CFN Task Mode Environment Sanitizer
# Sanitizes and enforces Task-mode environment variables to prevent mode confusion

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Environment sanitization rules
sanitize_task_mode_environment() {
    local mode="${1:-auto}"

    echo "🧹 Sanitizing Task-mode environment..." >&2

    # 1. Force CFN_MODE=task for Task mode
    if [[ "$mode" == "task" || "$mode" == "auto" ]]; then
        export CFN_MODE="task"
        echo "✅ CFN_MODE forced to: $CFN_MODE" >&2
    fi

    # 2. Clear inherited CLI-mode variables that could cause mode confusion
    local inherited_vars=(
        "TASK_ID"
        "AGENT_ID"
        "LOOP3_AGENTS"
        "LOOP2_VALIDATORS"
        "PRODUCT_OWNER_ID"
        "COORDINATOR_ID"
        "__CFN_CLI_SPAWN"
        "CFN_CLI_CONTEXT"
    )

    for var in "${inherited_vars[@]}"; do
        if [[ -n "${!var:-}" ]]; then
            echo "🗑️  Clearing inherited variable: $var (was: ${!var})" >&2
            unset "$var"
        fi
    done

    # 3. Set Task-mode specific environment
    export __CFN_TASK_MODE="1"
    export __CFN_MODE_ENFORCED="1"

    # 4. Right-size Node.js heap for Task mode (prevent 16GB default)
    if [[ -z "${NODE_OPTIONS:-}" ]]; then
        export NODE_OPTIONS="--max-old-space-size=2048"
    else
        # Replace any larger heap size with Task-mode appropriate size
        if echo "$NODE_OPTIONS" | grep -q "max-old-space-size"; then
            export NODE_OPTIONS=$(echo "$NODE_OPTIONS" | sed 's/--max-old-space-size=[0-9]*/--max-old-space-size=2048/g')
        else
            export NODE_OPTIONS="$NODE_OPTIONS --max-old-space-size=2048"
        fi
    fi
    echo "✅ NODE_OPTIONS set for Task mode: $NODE_OPTIONS" >&2

    # 5. Configure Task-mode specific settings
    export CFN_MEMORY_LIMIT="2048"  # MB
    export CFN_TIMEOUT="300"       # 5 minutes
    export CFN_COORDINATION="file"  # Use file-based coordination

    echo "🎯 Task-mode environment sanitized and locked" >&2
}

# Validate environment is in Task mode
validate_task_mode_environment() {
    local errors=0

    echo "🔍 Validating Task-mode environment..." >&2

    # Check CFN_MODE
    if [[ "${CFN_MODE:-}" != "task" ]]; then
        echo "❌ CFN_MODE should be 'task', got: ${CFN_MODE:-unset}" >&2
        ((errors++))
    fi

    # Check Task-mode markers
    if [[ "${__CFN_TASK_MODE:-}" != "1" ]]; then
        echo "❌ __CFN_TASK_MODE not set" >&2
        ((errors++))
    fi

    # Check for prohibited CLI variables
    local prohibited_vars=(
        "TASK_ID"
        "AGENT_ID"
        "LOOP3_AGENTS"
        "__CFN_CLI_SPAWN"
    )

    for var in "${prohibited_vars[@]}"; do
        if [[ -n "${!var:-}" ]]; then
            echo "❌ Prohibited CLI variable found: $var=${!var}" >&2
            ((errors++))
        fi
    done

    # Check Node heap size
    if echo "$NODE_OPTIONS" | grep -q "max-old-space-size"; then
        local heap_size=$(echo "$NODE_OPTIONS" | grep -o "max-old-space-size=[0-9]*" | cut -d= -f2)
        if [[ "$heap_size" -gt 4096 ]]; then
            echo "❌ Node heap size too large for Task mode: ${heap_size}MB" >&2
            ((errors++))
        fi
    else
        echo "⚠️  No Node heap size specified (should be set to 2048MB)" >&2
    fi

    if [[ $errors -eq 0 ]]; then
        echo "✅ Task-mode environment validation passed" >&2
        return 0
    else
        echo "❌ Task-mode environment validation failed ($errors errors)" >&2
        return 1
    fi
}

# Execute command in sanitized Task-mode environment
exec_task_mode_sanitized() {
    local command="$1"
    shift

    echo "🚀 Executing in sanitized Task-mode environment: $command" >&2

    # Sanitize environment
    sanitize_task_mode_environment "task"

    # Validate environment
    if ! validate_task_mode_environment; then
        echo "❌ Environment validation failed, aborting execution" >&2
        return 1
    fi

    # Execute command with timeout
    local timeout="${CFN_TIMEOUT:-300}"
    echo "⏱️  Timeout set to ${timeout}s" >&2

    if timeout "$timeout" "$command" "$@"; then
        echo "✅ Command completed successfully" >&2
        return 0
    else
        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            echo "⏰ Command timed out after ${timeout}s" >&2
        else
            echo "❌ Command failed with exit code: $exit_code" >&2
        fi
        return $exit_code
    fi
}

# Show usage
show_usage() {
    cat <<'EOF'
CFN Task Mode Environment Sanitizer

USAGE:
    source "$(dirname "${BASH_SOURCE[0]}")/task-mode-env-sanitizer.sh"

    # Environment Sanitization
    sanitize_task_mode_environment [mode]     # Sanitize environment (auto|task|cli)
    validate_task_mode_environment             # Validate current environment

    # Command Execution
    exec_task_mode_sanitized <command> [args...]  # Execute command in sanitized environment

EXAMPLES:
    # Sanitize current shell
    sanitize_task_mode_environment task

    # Execute validator with sanitized environment
    exec_task_mode_sanitized node validate-code.js

    # Run with environment validation
    if validate_task_mode_environment; then
        echo "Environment is safe for Task mode"
    fi

ENVIRONMENT VARIABLES:
    CFN_MODE               # Forced to 'task' for Task mode
    __CFN_TASK_MODE        # Set to '1' in Task mode
    NODE_OPTIONS           # Limited to 2048MB heap in Task mode
    CFN_MEMORY_LIMIT       # Memory limit in MB (default: 2048)
    CFN_TIMEOUT            # Command timeout in seconds (default: 300)
    CFN_COORDINATION       # Coordination method: 'file' for Task mode

EOF
}

# Main execution block
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ "$1" == "--help" || "$1" == "-h" ]]; then
        show_usage
        exit 0
    fi

    # Execute operation if provided
    if [[ $# -gt 0 ]]; then
        case "$1" in
            "sanitize")
                sanitize_task_mode_environment "${2:-auto}"
                ;;
            "validate")
                validate_task_mode_environment
                ;;
            "exec")
                shift
                exec_task_mode_sanitized "$@"
                ;;
            *)
                echo "Unknown operation: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    else
        echo "CFN Task Mode Environment Sanitizer" >&2
        echo "Current mode: ${CFN_MODE:-unset}" >&2
        echo "Node options: ${NODE_OPTIONS:-unset}" >&2
        echo "Use --help for usage information" >&2
    fi
fi