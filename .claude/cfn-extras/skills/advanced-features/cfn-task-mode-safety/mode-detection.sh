#!/bin/bash
# CFN Task Mode Safety - Mode Detection and Enforcement
# Part of ANTI-023 Memory Leak Protection System

set -e

# Mode Detection Script for CFN Loop Safety

CFN_MODE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Mode Detection Function
detect_execution_mode() {
    local mode=""

    # 1. Environment variable check
    if [[ -n "${CFN_MODE:-}" ]]; then
        mode="$CFN_MODE"
        echo "🔍 Mode detected from CFN_MODE: $mode" >&2
        echo "$mode"  # CRITICAL: Echo detected value for regression testing
        return 0
    fi

    # 2. Task ID/Agent ID presence check (CLI mode indicators)
    if [[ -n "${TASK_ID:-}" && -n "${AGENT_ID:-}" ]]; then
        mode="cli"
        echo "🔍 Mode detected from TASK_ID/AGENT_ID: $mode" >&2
        echo "$mode"  # CRITICAL: Echo detected value for regression testing
        return 0
    fi

    # 3. Process inspection (check if spawned by Task() tool)
    if [[ "${PPID:-}" -gt 0 ]]; then
        local parent_cmd=$(ps -o comm= -p "$PPID" 2>/dev/null || echo "unknown")
        if [[ "$parent_cmd" == *"claude"* || "$parent_cmd" == *"Task"* ]]; then
            mode="task"
            echo "🔍 Mode detected from parent process: $mode" >&2
            echo "$mode"  # CRITICAL: Echo detected value for regression testing
            return 0
        fi
    fi

    # 4. Check for script calling context (CLI mode indicators)
    if [[ -n "${__CFN_CLI_SPAWN:-}" ]]; then
        mode="cli"
        echo "🔍 Mode detected from CLI spawn marker: $mode" >&2
        echo "$mode"  # CRITICAL: Echo detected value for regression testing
        return 0
    fi

    # 5. Fallback to task mode for safety
    mode="task"
    echo "🔍 Defaulting to safe mode: $mode" >&2
    echo "$mode"  # CRITICAL: Echo detected value for regression testing
    return 0
}

# Is Task Mode Function
is_task_mode() {
    local mode=$(detect_execution_mode)
    [[ "$mode" == "task" ]]
}

# Is CLI Mode Function
is_cli_mode() {
    local mode=$(detect_execution_mode)
    [[ "$mode" == "cli" ]]
}

# Mode Compliance Enforcement
enforce_mode_compliance() {
    local operation="$1"

    if is_task_mode; then
        echo "❌ TASK MODE DETECTED - Redis coordination forbidden" >&2
        echo "🚨 ANTI-023: '$operation' requires CLI mode, detected Task mode" >&2
        echo "💡 Task mode agents should use direct JSON output" >&2
        echo "💡 Switch to CLI mode: use /cfn-loop-cli instead of /cfn-loop-task" >&2
        return 1
    fi

    if is_cli_mode; then
        echo "✅ CLI mode - '$operation' allowed" >&2
        return 0
    fi

    # Unknown mode, default to safe (Task mode)
    echo "❓ Unknown mode - defaulting to Task mode safety" >&2
    return 1
}

# Safe Redis Operation Wrapper
redis_cli_safe() {
    if ! enforce_mode_compliance "redis_cli"; then
        return 1
    fi

    # CLI mode - Execute Redis command
    redis-cli "$@"
}

# Safe Coordination Operation Wrapper
cfn_coordination_safe() {
    local operation="$1"
    shift

    if ! enforce_mode_compliance "coordination"; then
        # Task mode fallback - use file-based signaling
        cfn_task_fallback "$operation" "$@"
        return $?
    fi

    # CLI mode - Use Redis coordination
    case "$operation" in
        "signal-complete")
            local task_id="$1"
            local agent_id="$2"
            redis_cli_safe LPUSH "swarm:${task_id}:${agent_id}:done" "complete"
            ;;
        "store-confidence")
            local task_id="$1"
            local agent_id="$2"
            local confidence="$3"
            redis_cli_safe SET "swarm:${task_id}:${agent_id}:confidence" "$confidence" EX 3600
            ;;
        "store-result")
            local task_id="$1"
            local agent_id="$2"
            local result="$3"
            redis_cli_safe HSET "swarm:${task_id}:${agent_id}:result" \
                "confidence" "${result:-0.0}" \
                "timestamp" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            ;;
        *)
            echo "❌ Unknown coordination operation: $operation" >&2
            return 1
            ;;
    esac
}

# Task Mode Fallback Implementation
cfn_task_fallback() {
    local operation="$1"
    shift

    local task_id="${TASK_ID:-unknown}"
    local agent_id="${AGENT_ID:-unknown}"
    local timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    mkdir -p "./.claude/task-signals"

    case "$operation" in
        "signal-complete")
            local signal_file="./.claude/task-signals/${task_id}_${agent_id}_complete.json"
            cat > "$signal_file" <<EOF
{
  "signal": "complete",
  "task_id": "$task_id",
  "agent_id": "$agent_id",
  "timestamp": "$timestamp",
  "mode": "task"
}
EOF
            echo "📝 Task mode completion signal saved: $signal_file" >&2
            ;;
        "store-confidence")
            local confidence="$1"
            local confidence_file="./.claude/task-signals/${task_id}_${agent_id}_confidence.json"
            cat > "$confidence_file" <<EOF
{
  "signal": "confidence",
  "task_id": "$task_id",
  "agent_id": "$agent_id",
  "confidence": $confidence,
  "timestamp": "$timestamp",
  "mode": "task"
}
EOF
            echo "📝 Task mode confidence saved: $confidence_file" >&2
            ;;
        *)
            echo "❌ Unknown fallback operation: $operation" >&2
            return 1
            ;;
    esac
}

# Task Mode Completion Protocol
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
    json_output+'"mode": "task"'
    json_output+="}"

    # Output directly to stdout for Main Chat
    echo "$json_output"
}

# Task Mode Audit Logging
task_mode_audit() {
    local event="$1"
    local task_id="${TASK_ID:-unknown}"
    local agent_id="${AGENT_ID:-unknown}"
    local data="$2"

    local audit_file="./.claude/audit/task-mode/${task_id}_${agent_id}_$(date +%Y%m%d_%H%M%S).json"
    mkdir -p "$(dirname "$audit_file")"

    cat > "$audit_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "event": "$event",
  "task_id": "$task_id",
  "agent_id": "$agent_id",
  "data": $data,
  "mode": "task"
}
EOF

    echo "📝 Task mode audit logged: $audit_file" >&2
}

# Show Usage
show_usage() {
    cat <<'EOF'
CFN Task Mode Safety - Mode Detection and Enforcement

USAGE:
    source "$(dirname "${BASH_SOURCE[0]}")/mode-detection.sh"

    # Mode Detection
    detect_execution_mode          # Detect current execution mode
    is_task_mode                  # Check if running in Task mode
    is_cli_mode                   # Check if running in CLI mode

    # Enforcement
    enforce_mode_compliance "operation"  # Enforce mode compliance

    # Safe Operations
    redis_cli_safe "command" [args...]   # Safe Redis CLI wrapper
    cfn_coordination_safe "operation" [args...]  # Safe coordination

    # Task Mode Specific
    task_mode_complete <confidence> <status> <summary> [deliverables...]
    task_mode_audit <event> <json_data>

EXAMPLES:
    # Check mode compliance before Redis operations
    if is_cli_mode; then
        redis_cli_safe LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
    else
        task_mode_complete 0.85 "COMPLETE" "Work done" "file1.js" "file2.js"
    fi

    # Safe coordination usage
    cfn_coordination_safe "signal-complete" "$TASK_ID" "$AGENT_ID"
    cfn_coordination_safe "store-confidence" "$TASK_ID" "$AGENT_ID" 0.85

EOF
}

# Main execution block
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ "$1" == "--help" || "$1" == "-h" ]]; then
        show_usage
        exit 0
    fi

    # Execute single operation if provided
    if [[ $# -gt 0 ]]; then
        case "$1" in
            "detect")
                detect_execution_mode
                ;;
            "is-task")
                is_task_mode; exit $?
                ;;
            "is-cli")
                is_cli_mode; exit $?
                ;;
            "compliance")
                enforce_mode_compliance "$2"
                ;;
            *)
                echo "Unknown operation: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    else
        echo "CFN Task Mode Safety System" >&2
        echo "Mode: $(detect_execution_mode)" >&2
        echo "Task Mode: $(is_task_mode && echo "YES" || echo "NO")" >&2
        echo "CLI Mode: $(is_cli_mode && echo "YES" || echo "NO")" >&2
    fi
fi