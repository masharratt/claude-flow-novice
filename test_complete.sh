#!/bin/bash
# Complete Task mode safety test

task_mode_complete() {
    local confidence="$1"
    local status="${2:-COMPLETE}"
    local summary="${3:-Work completed}"
    shift 3 || true
    local deliverables=("$@")

    # Validate confidence range
    if ! awk -v conf="$confidence" 'BEGIN { if (conf < 0 || conf > 1) exit 1 }'; then
        echo "❌ Invalid confidence value: $confidence (must be 0.0-1.0)" >&2
        exit 1
    fi

    # Generate JSON response
    local json_output="{"
    json_output+='"confidence": '"$confidence"','
    json_output+='"status": "'"$status"'",'
    json_output+='"summary": "'"$summary"'",'

    if [[ ${#deliverables[@]} -gt 0 ]]; then
        json_output+='"deliverables": ['
        local first=true
        for deliverable in "${deliverables[@]}"; do
            if [[ "$first" == true ]]; then
                first=false
            else
                json_output+=","
            fi
            json_output+="\"$deliverable\""
        done
        json_output+="],"
    fi

    json_output+='"timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",'
    json_output+='"mode": "task"'
    json_output+="}"

    # Output directly to stdout
    echo "$json_output"
}

# Mode detection functions
detect_execution_mode() {
    if [[ -n "${TASK_ID:-}" && -n "${AGENT_ID:-}" ]]; then
        echo "cli"
        return 0
    fi
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

echo "Testing Task mode safety..."

# Test Task mode detection
echo "Mode: $(detect_execution_mode)"
echo "Task Mode: $(is_task_mode && echo 'YES' || echo 'NO')"
echo "CLI Mode: $(is_cli_mode && echo 'YES' || echo 'NO')"

echo ""

# Test valid completion
echo "Testing valid completion..."
result=$(task_mode_complete 0.85 "COMPLETE" "Work done" "file1.js" "file2.js")
echo "Result: $result"

# Test invalid confidence
echo "Testing invalid confidence..."
invalid_result=$(task_mode_complete 1.5 "COMPLETE" "Test" 2>&1 || echo "ERROR")
echo "Invalid result: $invalid_result"

# Test no deliverables
echo "Testing no deliverables..."
no_deliverables=$(task_mode_complete 0.90 "COMPLETE" "Work done")
echo "No deliverables: $no_deliverables"
