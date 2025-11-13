#!/bin/bash
# Quick test of mode detection

detect_execution_mode() {
    local mode=""

    # 1. Environment variable check
    if [[ -n "${CFN_MODE:-}" ]]; then
        mode="$CFN_MODE"
        echo "task"
        return 0
    fi

    # 2. Task ID/Agent ID presence check (CLI mode indicators)
    if [[ -n "${TASK_ID:-}" && -n "${AGENT_ID:-}" ]]; then
        echo "cli"
        return 0
    fi

    # 3. Fallback to task mode for safety
    echo "task"
    return 0
}

is_task_mode() {
    local mode=$(detect_execution_mode)
    [[ "$mode" == "task" ]]
}

is_cli_mode() {
    local mode=$(detect_execution_mode)
    [[ "$mode" == "cli" ]]
}

echo "Testing mode detection..."
echo "Mode: $(detect_execution_mode)"
echo "Task Mode: $(is_task_mode && echo 'YES' || echo 'NO')"
echo "CLI Mode: $(is_cli_mode && echo 'YES' || echo 'NO')"
