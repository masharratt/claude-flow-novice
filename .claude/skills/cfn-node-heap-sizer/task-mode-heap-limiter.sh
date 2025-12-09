#!/bin/bash
# CFN Node.js Heap Size Limiter for Task Mode
# Dynamically adjusts NODE_OPTIONS based on execution mode to prevent memory bloat

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Mode-based heap sizes (in MB)
declare -A HEAP_SIZES=(
    ["task"]="2048"        # 2GB for Task mode (conservative)
    ["cli"]="8192"         # 8GB for CLI mode (production)
    ["debug"]="1024"       # 1GB for debugging (minimal)
    ["test"]="3072"        # 3GB for testing (moderate)
)

# Default heap sizes by tool type
declare -A TOOL_HEAPS=(
    ["node"]="2048"
    ["bun"]="3072"
    ["playwright"]="4096"
    ["test"]="1536"
    ["validator"]="1024"
    ["reviewer"]="1024"
    ["tester"]="1024"
)

# Function to detect current execution mode
detect_execution_mode() {
    # Use existing mode detection if available
    if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh" ]]; then
        source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh"
        detect_execution_mode 2>/dev/null && return 0
    fi

    # Fallback detection
    if [[ -n "${CFN_MODE:-}" ]]; then
        echo "$CFN_MODE"
    elif [[ -n "${TASK_ID:-}" && -n "${AGENT_ID:-}" ]]; then
        echo "cli"
    else
        echo "task"  # Safe default
    fi
}

# Function to determine tool type from command line
detect_tool_type() {
    local command="$1"
    local command_name=$(basename "$command")

    case "$command_name" in
        "node"|"bun")
            # Look at script name to determine tool type
            if [[ $# -gt 1 ]]; then
                local script_name=$(basename "$2" | tr '[:upper:]' '[:lower:]')
                case "$script_name" in
                    *"test"*) echo "test" ;;
                    *"validator"*) echo "validator" ;;
                    *"reviewer"*) echo "reviewer" ;;
                    *"tester"*) echo "tester" ;;
                    *) echo "$command_name" ;;
                esac
            else
                echo "$command_name"
            fi
            ;;
        "npx")
            if [[ $# -gt 1 ]]; then
                local tool_name=$(basename "$2" | tr '[:upper:]' '[:lower:]')
                case "$tool_name" in
                    *"playwright"*) echo "playwright" ;;
                    *) echo "npx" ;;
                esac
            else
                echo "npx"
            fi
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Function to calculate appropriate heap size
calculate_heap_size() {
    local mode="$1"
    local tool_type="$2"
    local override_heap="${3:-}"

    # Use override if provided
    if [[ -n "$override_heap" && "$override_heap" =~ ^[0-9]+$ ]]; then
        echo "$override_heap"
        return 0
    fi

    # Use tool-specific heap size if available
    local tool_heap="${TOOL_HEAPS[$tool_type]:-}"
    if [[ -n "$tool_heap" ]]; then
        echo "$tool_heap"
        return 0
    fi

    # Fall back to mode-based heap size
    echo "${HEAP_SIZES[$mode]:-2048}"
}

# Function to configure NODE_OPTIONS
configure_node_options() {
    local mode="$1"
    local tool_type="$2"
    local heap_size="$3"

    echo "🎛️  Configuring Node.js heap size for Task mode..." >&2

    # Base NODE_OPTIONS
    local node_opts="${NODE_OPTIONS:-}"

    # Remove existing heap size settings
    node_opts=$(echo "$node_opts" | sed 's/--max-old-space-size=[0-9]*//g')
    node_opts=$(echo "$node_opts" | sed 's/--max-semi-space-size=[0-9]*//g')

    # Add new heap size
    node_opts="$node_opts --max-old-space-size=$heap_size"

    # Add semi-space size (quarter of heap size)
    local semi_space=$((heap_size / 4))
    node_opts="$node_opts --max-semi-space-size=$semi_space"

    # Add Task mode specific optimizations
    if [[ "$mode" == "task" ]]; then
        node_opts="$node_opts --optimize-for-size"
        node_opts="$node_opts --max-executable-size=512"
        node_opts="$node_opts --gc-interval=100"
    fi

    # Export updated NODE_OPTIONS
    export NODE_OPTIONS="$node_opts"

    echo "✅ NODE_OPTIONS configured: $NODE_OPTIONS" >&2
    echo "   Mode: $mode" >&2
    echo "   Tool: $tool_type" >&2
    echo "   Heap: ${heap_size}MB" >&2
    echo "   Semi-space: ${semi_space}MB" >&2

    # Log configuration
    if [[ -n "${CFN_VALIDATION_LOG_DIR:-}" ]]; then
        local log_file="$CFN_VALIDATION_LOG_DIR/heap-config_$(date +%Y%m%d_%H%M%S).log"
        mkdir -p "$(dirname "$log_file")"
        cat > "$log_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mode": "$mode",
  "tool_type": "$tool_type",
  "heap_size_mb": $heap_size,
  "semi_space_size_mb": $semi_space,
  "node_options": "$NODE_OPTIONS",
  "command": "${BASH_SOURCE[*]}",
  "pid": $$,
  "ppid": ${PPID:-0}
}
EOF
        echo "📝 Heap configuration logged: $log_file" >&2
    fi
}

# Function to validate heap size
validate_heap_configuration() {
    local current_heap="${NODE_OPTIONS:-}"

    if echo "$current_heap" | grep -q "max-old-space-size"; then
        local heap_value=$(echo "$current_heap" | grep -o "max-old-space-size=[0-9]*" | cut -d= -f2)
        local mode=$(detect_execution_mode)
        local max_heap="${HEAP_SIZES[$mode]:-2048}"

        if [[ "$heap_value" -gt "$max_heap" ]]; then
            echo "⚠️  Heap size ($heap_value MB) exceeds recommended maximum for $mode mode ($max_heap MB)" >&2
            return 1
        else
            echo "✅ Heap size ($heap_value MB) within recommended limits for $mode mode" >&2
            return 0
        fi
    else
        echo "⚠️  No heap size configured in NODE_OPTIONS" >&2
        return 1
    fi
}

# Main heap limiting function
limit_node_heap() {
    local command="$1"
    local heap_override="${2:-}"

    # Detect execution mode
    local mode=$(detect_execution_mode)

    # Detect tool type
    local tool_type=$(detect_tool_type "$command" "${@:2}")

    # Calculate appropriate heap size
    local heap_size=$(calculate_heap_size "$mode" "$tool_type" "$heap_override")

    # Configure NODE_OPTIONS
    configure_node_options "$mode" "$tool_type" "$heap_size"

    echo "🎯 Node.js heap size limited to ${heap_size}MB for $tool_type in $mode mode" >&2
}

# Function to execute command with heap limiting
exec_with_heap_limit() {
    local command="$1"
    local heap_override="${2:-}"
    shift 2
    local args=("$@")

    # Apply heap limiting
    limit_node_heap "$command" "$heap_override"

    # Execute command
    echo "🚀 Executing: $command ${args[*]}" >&2
    echo "   NODE_OPTIONS: $NODE_OPTIONS" >&2

    # Use wrapped executor if available
    if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh" ]]; then
        source "$PROJECT_ROOT/.claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh"
        execute_instrumented "$command" 300 2048 "${args[@]}"
    else
        "$command" "${args[@]}"
    fi
}

# Show usage
show_usage() {
    cat <<'EOF'
CFN Node.js Heap Size Limiter for Task Mode

USAGE:
    source "$(dirname "${BASH_SOURCE[0]}")/task-mode-heap-limiter.sh"

    # Configuration
    limit_node_heap <command> [heap_override_mb]    # Limit heap size for command
    configure_node_options <mode> <tool_type> <size>  # Configure NODE_OPTIONS
    validate_heap_configuration                   # Validate current configuration

    # Execution
    exec_with_heap_limit <command> [heap_override] [args...]

ENVIRONMENT VARIABLES:
    NODE_OPTIONS          # Modified to include heap size limits
    CFN_MODE             # Detected or set execution mode
    CFN_VALIDATION_LOG_DIR  # Directory for heap configuration logs

HEAP SIZES BY MODE:
    task:    2048 MB (conservative)
    cli:     8192 MB (production)
    debug:   1024 MB (minimal)
    test:    3072 MB (moderate)

HEAP SIZES BY TOOL TYPE:
    node:        2048 MB
    bun:         3072 MB
    playwright:  4096 MB
    test:        1536 MB
    validator:   1024 MB
    reviewer:    1024 MB
    tester:      1024 MB

EXAMPLES:
    # Limit heap for Node.js execution
    limit_node_heap "node" 1024
    node script.js

    # Execute with automatic heap limiting
    exec_with_heap_limit "bun" "build.ts"

    # Custom heap size
    exec_with_heap_limit "node" "4096" "heavy-script.js"

    # Configure manually
    configure_node_options "task" "validator" 1024

    # Validate current configuration
    validate_heap_configuration

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
            "limit")
                shift
                limit_node_heap "$@"
                ;;
            "configure")
                shift
                configure_node_options "$@"
                ;;
            "validate")
                validate_heap_configuration
                ;;
            "exec")
                shift
                exec_with_heap_limit "$@"
                ;;
            *)
                echo "Unknown command: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    else
        echo "CFN Node.js Heap Size Limiter for Task Mode" >&2
        echo "Current mode: $(detect_execution_mode)" >&2
        echo "Current NODE_OPTIONS: ${NODE_OPTIONS:-unset}" >&2
        echo "Use --help for usage information" >&2
    fi
fi