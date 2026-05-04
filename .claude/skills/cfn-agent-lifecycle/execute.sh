#!/usr/bin/env bash
# Main entry point for cfn-agent-lifecycle skill
# Provides unified agent management from selection through completion

set -euo pipefail

# Get script directory (absolute path)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="cfn-agent-lifecycle"
SKILL_VERSION="2.0.0"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage information
show_help() {
    cat << EOF
$SKILL_NAME v$SKILL_VERSION

Unified agent management from selection through completion - spawning, execution, output processing

USAGE:
    $0 <command> [options]

COMMANDS:
    select-agents       Select agents for a task with fallback support
    spawn-agent         Spawn agents with dependency validation
    execute-agent       Execute agent tasks
    lifecycle-hook      Track agent lifecycle events (spawn/update/complete)
    classify-task       Classify task into categories

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    -d, --debug         Enable debug output

EXAMPLES:
    # Select agents for a task
    $0 select-agents "Implement JWT authentication"

    # Spawn agents
    $0 spawn-agent --task "Implement user authentication" --agents coder,security-specialist

    # Track lifecycle
    $0 lifecycle-hook spawn --agent-id agent-123 --agent-type backend-developer

For more information, see: $SCRIPT_DIR/SKILL.md
EOF
}

# Show version
show_version() {
    echo "$SKILL_NAME version $SKILL_VERSION"
}

# Enable debug mode
enable_debug() {
    set -x
    export DEBUG=true
    echo "Debug mode enabled"
}

# Validate dependencies
check_dependencies() {
    local missing=()

    command -v jq >/dev/null 2>&1 || missing+=("jq")
    command -v node >/dev/null 2>&1 || missing+=("node")
    command -v sqlite3 >/dev/null 2>&1 || missing+=("sqlite3")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Error: Missing required dependencies:${NC}" >&2
        for dep in "${missing[@]}"; do
            echo "  - $dep" >&2
        done
        return 1
    fi
}

# Command handlers
handle_select_agents() {
    local task=""
    local use_typescript="false"
    local output_format="json"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --task)
                task="$2"
                shift 2
                ;;
            --typescript)
                use_typescript="true"
                shift
                ;;
            --output-format)
                output_format="$2"
                shift 2
                ;;
            *)
                # If no flag, treat as task description
                if [[ -z "$task" ]]; then
                    task="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$task" ]]; then
        echo -e "${RED}Error: Task description is required${NC}" >&2
        return 1
    fi

    if [[ "$use_typescript" == "true" ]]; then
        exec "$SCRIPT_DIR/lib/selection/dist/cli.cjs" "$task" --output-format "$output_format"
    else
        exec "$SCRIPT_DIR/lib/selection/select-agents-with-fallback.sh" "$task"
    fi
}

handle_spawn_agent() {
    local task=""
    local agents=""
    local agent_id=""
    local provider=""
    local dry_run="false"
    local category=""
    local role=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --task)
                task="$2"
                shift 2
                ;;
            --agents)
                agents="$2"
                shift 2
                ;;
            --agent-id)
                agent_id="$2"
                shift 2
                ;;
            --provider)
                provider="$2"
                shift 2
                ;;
            --dry-run)
                dry_run="true"
                shift
                ;;
            --category)
                category="$2"
                shift 2
                ;;
            --role)
                role="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$task" || -z "$agents" ]]; then
        echo -e "${RED}Error: --task and --agents are required${NC}" >&2
        return 1
    fi

    exec env \
        TASK_CATEGORY="${category:-${TASK_CATEGORY:-default}}" \
        AGENT_ROLE="${role:-${AGENT_ROLE:-loop3}}" \
        "$SCRIPT_DIR/lib/spawning/spawn-agent.sh" \
        --task "$task" \
        --agents "$agents" \
        ${agent_id:+--agent-id "$agent_id"} \
        ${provider:+--provider "$provider"} \
        ${dry_run:+--dry-run}
}

handle_execute_agent() {
    local agent_id=""
    local command=""
    local work_dir=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent-id)
                agent_id="$2"
                shift 2
                ;;
            --command)
                command="$2"
                shift 2
                ;;
            --work-dir)
                work_dir="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$agent_id" || -z "$command" ]]; then
        echo -e "${RED}Error: --agent-id and --command are required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/spawning/execute-agent.sh" \
        --agent-id "$agent_id" \
        --command "$command" \
        ${work_dir:+--work-dir "$work_dir"}
}

handle_lifecycle_hook() {
    local action=""
    local agent_id=""
    local agent_type=""
    local confidence=""
    local acl_level=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            spawn|update|complete)
                action="$1"
                shift
                ;;
            --agent-id)
                agent_id="$2"
                shift 2
                ;;
            --agent-type)
                agent_type="$2"
                shift 2
                ;;
            --confidence)
                confidence="$2"
                shift 2
                ;;
            --acl-level)
                acl_level="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$action" || -z "$agent_id" ]]; then
        echo -e "${RED}Error: Action and agent-id are required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/audit/execute-lifecycle-hook.sh" \
        "$action" \
        --agent-id "$agent_id" \
        ${agent_type:+--agent-type "$agent_type"} \
        ${confidence:+--confidence "$confidence"} \
        ${acl_level:+--acl-level "$acl_level"}
}

handle_classify_task() {
    local task=""
    local output_format="text"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --task)
                task="$2"
                shift 2
                ;;
            --output-format)
                output_format="$2"
                shift 2
                ;;
            *)
                # If no flag, treat as task description
                if [[ -z "$task" ]]; then
                    task="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$task" ]]; then
        echo -e "${RED}Error: Task description is required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/selection/task-classifier.sh" \
        --task "$task" \
        --output-format "$output_format"
}


# Main execution
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--version)
                show_version
                exit 0
                ;;
            -d|--debug)
                enable_debug
                shift
                ;;
            *)
                COMMAND="$1"
                shift
                break
                ;;
        esac
    done

    # Check dependencies
    check_dependencies

    # Execute command
    if [[ -z "${COMMAND:-}" ]]; then
        echo -e "${RED}Error: No command specified${NC}" >&2
        echo "Use '$0 --help' for usage information" >&2
        exit 1
    fi

    case "$COMMAND" in
        select-agents)
            handle_select_agents "$@"
            ;;
        spawn-agent)
            handle_spawn_agent "$@"
            ;;
        execute-agent)
            handle_execute_agent "$@"
            ;;
        lifecycle-hook)
            handle_lifecycle_hook "$@"
            ;;
        classify-task)
            handle_classify_task "$@"
            ;;
        *)
            echo -e "${RED}Error: Unknown command: $COMMAND${NC}" >&2
            echo "Use '$0 --help' for available commands" >&2
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"