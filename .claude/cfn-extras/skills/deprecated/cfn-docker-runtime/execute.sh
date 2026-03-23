#!/usr/bin/env bash
# Main entry point for cfn-docker-runtime skill
# Provides Docker container orchestration for CFN Loop

set -euo pipefail

# Get script directory (absolute path)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="cfn-docker-runtime"
SKILL_VERSION="1.0.0"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage information
show_help() {
    cat << EOF
$SKILL_NAME v$SKILL_VERSION

Docker container orchestration for CFN Loop - spawning, coordination, logging, wave execution

USAGE:
    $0 <command> [options]

COMMANDS:
    spawn-agent         Spawn a container-based agent
    collect-logs        Collect and store container logs
    orchestrate         Orchestrate Docker-mode loop execution
    execute-wave        Execute wave-based parallel execution
    build-docker        Build Docker images for agents
    enable-logging      Enable hybrid logging for containers

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    -d, --debug         Enable debug output

EXAMPLES:
    # Spawn a container agent
    $0 spawn-agent --agent-type backend-developer --task-id task-123

    # Execute a wave of agents
    $0 execute-wave --wave-id wave-1 --agents "backend-developer,tester"

    # Collect logs from containers
    $0 collect-logs --agent-id agent-456 --output-dir ./logs/

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

    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v jq >/dev/null 2>&1 || missing+=("jq")
    command -v redis-cli >/dev/null 2>&1 || missing+=("redis-cli")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Error: Missing required dependencies:${NC}" >&2
        for dep in "${missing[@]}"; do
            echo "  - $dep" >&2
        done
        return 1
    fi
}

# Command handlers
handle_spawn_agent() {
    local agent_type=""
    local task_id=""
    local agent_id=""
    local provider=""
    local image=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent-type)
                agent_type="$2"
                shift 2
                ;;
            --task-id)
                task_id="$2"
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
            --image)
                image="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$agent_type" ]]; then
        echo -e "${RED}Error: --agent-type is required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/spawning/spawn-agent.sh" \
        ${agent_type:+--agent-type "$agent_type"} \
        ${task_id:+--task-id "$task_id"} \
        ${agent_id:+--agent-id "$agent_id"} \
        ${provider:+--provider "$provider"} \
        ${image:+--image "$image"}
}

handle_enable_logging() {
    local redis_host="localhost"
    local redis_port="6379"
    local log_level="info"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --redis-host)
                redis_host="$2"
                shift 2
                ;;
            --redis-port)
                redis_port="$2"
                shift 2
                ;;
            --log-level)
                log_level="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    exec "$SCRIPT_DIR/lib/logging/enable-logging.sh" \
        --redis-host "$redis_host" \
        --redis-port "$redis_port" \
        --log-level "$log_level"
}

handle_collect_logs() {
    local agent_id=""
    local output_dir=""
    local follow="false"
    local container_name=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent-id)
                agent_id="$2"
                shift 2
                ;;
            --output-dir)
                output_dir="$2"
                shift 2
                ;;
            --follow)
                follow="true"
                shift
                ;;
            --container-name)
                container_name="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    exec "$SCRIPT_DIR/lib/logging/capture-container-logs.sh" \
        ${agent_id:+--agent-id "$agent_id"} \
        ${output_dir:+--output-dir "$output_dir"} \
        ${follow:+--follow} \
        ${container_name:+--container-name "$container_name"}
}

handle_orchestrate() {
    local mode="standard"
    local task_id=""
    agents=()
    redis_host="localhost"
    redis_port="6379"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode)
                mode="$2"
                shift 2
                ;;
            --task-id)
                task_id="$2"
                shift 2
                ;;
            --agents)
                IFS=',' read -ra agents <<< "$2"
                shift 2
                ;;
            --redis-host)
                redis_host="$2"
                shift 2
                ;;
            --redis-port)
                redis_port="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    exec "$SCRIPT_DIR/lib/orchestration/orchestrate.sh" \
        --mode "$mode" \
        ${task_id:+--task-id "$task_id"} \
        ${agents:+--agents "${agents[*]}"} \
        --redis-host "$redis_host" \
        --redis-port "$redis_port"
}

handle_execute_wave() {
    local wave_id=""
    local agents=""
    local parallel="true"
    local timeout="300"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --wave-id)
                wave_id="$2"
                shift 2
                ;;
            --agents)
                agents="$2"
                shift 2
                ;;
            --parallel)
                parallel="$2"
                shift 2
                ;;
            --timeout)
                timeout="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    if [[ -z "$wave_id" || -z "$agents" ]]; then
        echo -e "${RED}Error: --wave-id and --agents are required${NC}" >&2
        return 1
    fi

    exec "$SCRIPT_DIR/lib/waves/spawn-wave.sh" \
        --wave-id "$wave_id" \
        --agents "$agents" \
        --parallel "$parallel" \
        --timeout "$timeout"
}

handle_build_docker() {
    local dockerfile=""
    local tag=""
    local context="."

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dockerfile)
                dockerfile="$2"
                shift 2
                ;;
            --tag)
                tag="$2"
                shift 2
                ;;
            --context)
                context="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                return 1
                ;;
        esac
    done

    exec "$SCRIPT_DIR/lib/build/build.sh" \
        ${dockerfile:+--dockerfile "$dockerfile"} \
        ${tag:+--tag "$tag"} \
        ${context:+--context "$context"}
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
        spawn-agent)
            handle_spawn_agent "$@"
            ;;
        enable-logging)
            handle_enable_logging "$@"
            ;;
        collect-logs)
            handle_collect_logs "$@"
            ;;
        orchestrate)
            handle_orchestrate "$@"
            ;;
        execute-wave)
            handle_execute_wave "$@"
            ;;
        build-docker)
            handle_build_docker "$@"
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