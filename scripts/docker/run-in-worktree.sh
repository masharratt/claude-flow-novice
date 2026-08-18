#!/usr/bin/env bash
# Docker Multi-Worktree Wrapper
# Enables running docker-compose in multiple git worktrees simultaneously
# without port/container/volume conflicts

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default port bases (can be overridden via environment)
DEFAULT_REDIS_PORT=6379
DEFAULT_POSTGRES_PORT=5432
DEFAULT_ORCHESTRATOR_PORT=3001  # Aligned with docker-compose.production.yml
DEFAULT_REDIS_COORDINATOR_PORT=6380
DEFAULT_PROMETHEUS_PORT=9090
DEFAULT_GRAFANA_PORT=3002  # Aligned with docker-compose.production.yml
DEFAULT_REDIS_EXPORTER_PORT=9121
DEFAULT_NGINX_HTTP_PORT=80
DEFAULT_NGINX_HTTPS_PORT=443
DEFAULT_LOKI_PORT=3100
DEFAULT_MCP_PLAYWRIGHT_PORT=8081
DEFAULT_MCP_REDIS_TOOLS_PORT=8082
DEFAULT_MCP_N8N_PORT=8083
DEFAULT_MCP_SECURITY_SCANNER_PORT=8084

# Port range allocation per worktree (100 port blocks)
PORT_BLOCK_SIZE=100

# ============================================================================
# Functions
# ============================================================================

log_info() {
    echo "[INFO] $*" >&2
}

log_warn() {
    echo "[WARN] $*" >&2
}

log_error() {
    echo "[ERROR] $*" >&2
}

show_usage() {
    cat <<EOF
Usage: $0 [OPTIONS] [docker-compose args]

Wrapper script for running docker-compose in multiple git worktrees simultaneously.
Auto-detects worktree/branch and configures unique ports, containers, and volumes.

OPTIONS:
    -h, --help              Show this help message
    -p, --project-name NAME Override auto-detected project name
    -o, --port-offset NUM   Override auto-calculated port offset
    -v, --verbose           Enable verbose output
    -d, --dry-run           Show configuration without executing
    -f, --file FILE         Docker Compose file to use (default: docker-compose.yml)

EXAMPLES:
    # Start services in current worktree
    $0 up -d

    # View logs
    $0 logs -f redis

    # Stop services
    $0 down

    # Stop and remove volumes
    $0 down -v

    # Use production compose file
    $0 -f docker-compose.production.yml up -d

    # Custom project name
    $0 --project-name my-feature up -d

ENVIRONMENT VARIABLES:
    CFN_WORKTREE_PORT_OFFSET    Override port offset calculation
    CFN_WORKTREE_PROJECT_NAME   Override project name
    COMPOSE_FILE                Docker Compose file (default: docker-compose.yml)

EOF
}

# Generate a numeric hash from a string (0-999)
hash_string() {
    local str="$1"
    local hash
    hash=$(echo -n "$str" | md5sum | tr -d ' -' | head -c 8)
    echo $((0x${hash} % 1000))
}

# Sanitize branch name for use in Docker project name
sanitize_branch_name() {
    local branch="$1"
    # Convert to lowercase, replace invalid chars with dash, remove leading/trailing dashes
    echo "$branch" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/^-*//;s/-*$//' | sed 's/--*/-/g'
}

# Detect current git branch/worktree
detect_branch() {
    if git rev-parse --is-inside-work-tree &>/dev/null; then
        git branch --show-current || git rev-parse --short HEAD
    else
        echo "default"
    fi
}

# Calculate port offset based on branch name
calculate_port_offset() {
    local branch="$1"
    local hash

    # Special case: main/master branches get offset 0
    if [[ "$branch" =~ ^(main|master)$ ]]; then
        echo 0
        return
    fi

    # Hash the branch name and multiply by port block size
    hash=$(hash_string "$branch")
    echo $((hash * PORT_BLOCK_SIZE / 1000))
}

# Export environment variables for docker-compose
export_docker_env() {
    local project_name="$1"
    local port_offset="$2"

    # Project name (affects container names, network names, volume names)
    export COMPOSE_PROJECT_NAME="${project_name}"

    # Port mappings (base + offset)
    export CFN_REDIS_PORT=$((DEFAULT_REDIS_PORT + port_offset))
    export CFN_POSTGRES_PORT=$((DEFAULT_POSTGRES_PORT + port_offset))
    export CFN_ORCHESTRATOR_PORT=$((DEFAULT_ORCHESTRATOR_PORT + port_offset))
    export CFN_REDIS_COORDINATOR_PORT=$((DEFAULT_REDIS_COORDINATOR_PORT + port_offset))
    export CFN_PROMETHEUS_PORT=$((DEFAULT_PROMETHEUS_PORT + port_offset))
    export CFN_GRAFANA_PORT=$((DEFAULT_GRAFANA_PORT + port_offset))
    export CFN_REDIS_EXPORTER_PORT=$((DEFAULT_REDIS_EXPORTER_PORT + port_offset))
    export CFN_NGINX_HTTP_PORT=$((DEFAULT_NGINX_HTTP_PORT + port_offset))
    export CFN_NGINX_HTTPS_PORT=$((DEFAULT_NGINX_HTTPS_PORT + port_offset))
    export CFN_LOKI_PORT=$((DEFAULT_LOKI_PORT + port_offset))
    export CFN_MCP_PLAYWRIGHT_PORT=$((DEFAULT_MCP_PLAYWRIGHT_PORT + port_offset))
    export CFN_MCP_REDIS_TOOLS_PORT=$((DEFAULT_MCP_REDIS_TOOLS_PORT + port_offset))
    export CFN_MCP_N8N_PORT=$((DEFAULT_MCP_N8N_PORT + port_offset))
    export CFN_MCP_SECURITY_SCANNER_PORT=$((DEFAULT_MCP_SECURITY_SCANNER_PORT + port_offset))

    # Additional metadata
    export CFN_WORKTREE_BRANCH="${DETECTED_BRANCH}"
    export CFN_WORKTREE_PORT_OFFSET="${port_offset}"
}

# Display configuration
show_config() {
    log_info "Docker Multi-Worktree Configuration"
    log_info "====================================="
    log_info "Branch/Worktree:      ${DETECTED_BRANCH}"
    log_info "Project Name:         ${COMPOSE_PROJECT_NAME}"
    log_info "Port Offset:          ${CFN_WORKTREE_PORT_OFFSET}"
    log_info "Compose File:         ${COMPOSE_FILE}"
    log_info ""
    log_info "Port Mappings:"
    log_info "  Redis:              ${CFN_REDIS_PORT}"
    log_info "  PostgreSQL:         ${CFN_POSTGRES_PORT}"
    log_info "  Orchestrator:       ${CFN_ORCHESTRATOR_PORT}"
    log_info "  Redis Coordinator:  ${CFN_REDIS_COORDINATOR_PORT}"
    log_info "  Prometheus:         ${CFN_PROMETHEUS_PORT}"
    log_info "  Grafana:            ${CFN_GRAFANA_PORT}"
    log_info "  Redis Exporter:     ${CFN_REDIS_EXPORTER_PORT}"
    log_info "  Nginx HTTP:         ${CFN_NGINX_HTTP_PORT}"
    log_info "  Nginx HTTPS:        ${CFN_NGINX_HTTPS_PORT}"
    log_info "  Loki:               ${CFN_LOKI_PORT}"
    log_info "  MCP Playwright:     ${CFN_MCP_PLAYWRIGHT_PORT}"
    log_info "  MCP Redis Tools:    ${CFN_MCP_REDIS_TOOLS_PORT}"
    log_info "  MCP N8N:            ${CFN_MCP_N8N_PORT}"
    log_info "  MCP Security:       ${CFN_MCP_SECURITY_SCANNER_PORT}"
    log_info ""
}

# ============================================================================
# Main Script
# ============================================================================

# Parse arguments
VERBOSE=false
DRY_RUN=false
CUSTOM_PROJECT_NAME=""
CUSTOM_PORT_OFFSET=""
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DOCKER_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            show_usage
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -p|--project-name)
            CUSTOM_PROJECT_NAME="$2"
            shift 2
            ;;
        -o|--port-offset)
            if ! [[ "$2" =~ ^[0-9]+$ ]]; then
                log_error "Invalid --port-offset value: '$2'. Must be a positive integer."
                exit 1
            fi
            CUSTOM_PORT_OFFSET="$2"
            shift 2
            ;;
        -f|--file)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        *)
            DOCKER_ARGS+=("$1")
            shift
            ;;
    esac
done

# Detect branch/worktree
DETECTED_BRANCH=$(detect_branch)
[[ "$VERBOSE" == true ]] && log_info "Detected branch: ${DETECTED_BRANCH}"

# Determine project name
if [[ -n "$CUSTOM_PROJECT_NAME" ]]; then
    PROJECT_NAME="$CUSTOM_PROJECT_NAME"
elif [[ -n "${CFN_WORKTREE_PROJECT_NAME:-}" ]]; then
    PROJECT_NAME="$CFN_WORKTREE_PROJECT_NAME"
else
    SANITIZED_BRANCH=$(sanitize_branch_name "$DETECTED_BRANCH")
    PROJECT_NAME="cfn-${SANITIZED_BRANCH}"
fi

# Determine port offset
if [[ -n "$CUSTOM_PORT_OFFSET" ]]; then
    PORT_OFFSET="$CUSTOM_PORT_OFFSET"
elif [[ -n "${CFN_WORKTREE_PORT_OFFSET:-}" ]]; then
    PORT_OFFSET="$CFN_WORKTREE_PORT_OFFSET"
else
    PORT_OFFSET=$(calculate_port_offset "$DETECTED_BRANCH")
fi

# Export environment variables
export_docker_env "$PROJECT_NAME" "$PORT_OFFSET"

# Export compose file
export COMPOSE_FILE

# Show configuration
if [[ "$VERBOSE" == true ]] || [[ "$DRY_RUN" == true ]]; then
    show_config
fi

# Exit if dry-run
if [[ "$DRY_RUN" == true ]]; then
    log_info "Dry-run mode: would execute: docker-compose ${DOCKER_ARGS[*]}"
    exit 0
fi

# Change to project root
cd "$PROJECT_ROOT"

# Validate docker-compose is available
if ! command -v docker-compose &>/dev/null; then
    log_error "docker-compose command not found. Please install docker-compose first."
    log_error "See: https://docs.docker.com/compose/install/"
    exit 1
fi

# Execute docker-compose with all environment variables
[[ "$VERBOSE" == true ]] && log_info "Executing: docker-compose ${DOCKER_ARGS[*]}"
exec docker-compose "${DOCKER_ARGS[@]}"
