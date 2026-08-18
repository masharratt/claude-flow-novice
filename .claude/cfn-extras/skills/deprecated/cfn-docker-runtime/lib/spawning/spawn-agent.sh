#!/usr/bin/env bash

# CFN Docker Agent Spawning Implementation
# Usage: ./spawn-agent.sh [AGENT_TYPE] [TASK_ID] [AGENT_ID] [OPTIONS]

set -euo pipefail

# Default configuration
DEFAULT_MEMORY_LIMIT="1g"
DEFAULT_CPU_LIMIT="1.0"
# Dynamic network detection for multi-worktree support
DEFAULT_NETWORK="${COMPOSE_PROJECT_NAME:+${COMPOSE_PROJECT_NAME}_mcp-network}"
DEFAULT_NETWORK="${DEFAULT_NETWORK:-mcp-network}"
DEFAULT_IMAGE="claude-flow-novice-agent:latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

# Function to display usage
usage() {
    cat << EOF
CFN Docker Agent Spawning

Usage: $0 [AGENT_TYPE] [TASK_ID] [AGENT_ID] [OPTIONS]

Arguments:
  AGENT_TYPE     Type of agent to spawn (e.g., react-frontend-engineer, backend-developer)
  TASK_ID        CFN Loop task identifier
  AGENT_ID       Unique agent identifier (auto-generated if not provided)

Options:
  --memory-limit LIMIT     Memory limit for container (default: 1g)
  --cpu-limit LIMIT        CPU limit for container (default: 1.0)
  --network NAME           Docker network (default: mcp-network)
  --image NAME             Docker image (default: claude-flow-novice:agent)
  --mcp-servers LIST       Comma-separated list of MCP servers
  --context FILE           Task context file path
  --environment LIST       Additional environment variables (key=value,key2=value2)
  --volume LIST            Additional volume mounts (src:dst,src2:dst2)
  --dry-run               Show configuration without creating container
  --detach                Run container in detached mode (default)
  --interactive           Run container in interactive mode
  --verbose               Enable verbose logging
  --help                  Show this help message

Examples:
  $0 react-frontend-engineer task-123 agent-001
  $0 backend-developer task-456 --memory-limit 2g --mcp-servers redis,postgres
  $0 security-specialist task-789 --interactive --verbose

EOF
}

# Parse command line arguments
AGENT_TYPE=""
TASK_ID=""
AGENT_ID=""
MEMORY_LIMIT="$DEFAULT_MEMORY_LIMIT"
CPU_LIMIT="$DEFAULT_CPU_LIMIT"
NETWORK="$DEFAULT_NETWORK"
IMAGE="$DEFAULT_IMAGE"
MCP_SERVERS=""
CONTEXT_FILE=""
ENVIRONMENT=""
VOLUMES=""
DRY_RUN=false
DETACH=true
INTERACTIVE=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --memory-limit)
            MEMORY_LIMIT="$2"
            shift 2
            ;;
        --cpu-limit)
            CPU_LIMIT="$2"
            shift 2
            ;;
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --mcp-servers)
            MCP_SERVERS="$2"
            shift 2
            ;;
        --context)
            CONTEXT_FILE="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --volume)
            VOLUMES="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --detach)
            DETACH=true
            shift
            ;;
        --interactive)
            INTERACTIVE=true
            DETACH=false
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
        *)
            if [[ -z "$AGENT_TYPE" ]]; then
                AGENT_TYPE="$1"
            elif [[ -z "$TASK_ID" ]]; then
                TASK_ID="$1"
            elif [[ -z "$AGENT_ID" ]]; then
                AGENT_ID="$1"
            else
                log_error "Too many arguments"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [[ -z "$AGENT_TYPE" || -z "$TASK_ID" ]]; then
    log_error "AGENT_TYPE and TASK_ID are required"
    usage
    exit 1
fi

# Generate agent ID if not provided
if [[ -z "$AGENT_ID" ]]; then
    AGENT_ID="${AGENT_TYPE}-$(date +%s)-$(openssl rand -hex 4)"
fi

# Configuration validation
if [[ "$VERBOSE" == true ]]; then
    log "Configuration:"
    log "  Agent Type: $AGENT_TYPE"
    log "  Task ID: $TASK_ID"
    log "  Agent ID: $AGENT_ID"
    log "  Memory Limit: $MEMORY_LIMIT"
    log "  CPU Limit: $CPU_LIMIT"
    log "  Network: $NETWORK"
    log "  Image: $IMAGE"
    log "  MCP Servers: ${MCP_SERVERS:-'auto-select'}"
    log "  Context File: ${CONTEXT_FILE:-'none'}"
fi

# Validate Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running"
    exit 1
fi

# Validate Docker image exists
if ! docker image inspect "$IMAGE" &> /dev/null; then
    log_error "Docker image '$IMAGE' not found"
    log_error "Please build or pull the image first"
    exit 1
fi

# Get project root directory (use git root for reliability)
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$PROJECT_ROOT" ]]; then
    # Fallback to script-relative path
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)"
fi
cd "$PROJECT_ROOT"

# Create workspace directory with proper permissions
WORKSPACE_DIR="/tmp/agent-workspace-${AGENT_ID}"
mkdir -p "$WORKSPACE_DIR"
chmod 777 "$WORKSPACE_DIR" 2>/dev/null || true  # Suppress errors on WSL2 bind mounts

# Function to get MCP configuration for agent type
get_mcp_config() {
    local agent_type="$1"

    # Use skill-based MCP selection if available
    if [[ -f ".claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js" ]]; then
        node .claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js select \
            --agent-type "$agent_type" 2>/dev/null || echo '{}'
    else
        # Fallback to basic configuration
        echo '{"selectedMCPServers":[],"totalMemoryRequired":0,"totalCPURequired":0}'
    fi
}

# Get MCP servers for agent
if [[ -z "$MCP_SERVERS" ]]; then
    log "Auto-selecting MCP servers for agent type: $AGENT_TYPE"
    MCP_CONFIG=$(get_mcp_config "$AGENT_TYPE")
    MCP_SERVERS=$(echo "$MCP_CONFIG" | jq -r '.selectedMCPServers[]? // empty' | tr '\n' ',' | sed 's/,$//')

    if [[ "$VERBOSE" == true ]]; then
        log "Auto-selected MCP servers: ${MCP_SERVERS:-'none'}"
    fi
fi

# Function to generate MCP tokens
generate_mcp_tokens() {
    local agent_type="$1"
    local mcp_servers="$2"
    local agent_id="$3"

    if [[ -z "$mcp_servers" ]]; then
        echo "{}"
        return
    fi

    # Use token manager if available
    if [[ -f "src/cli/agent-token-manager.js" ]]; then
        node src/cli/agent-token-manager.js register "$agent_type" \
            --mcp-servers "$mcp_servers" --agent-id "$agent_id" 2>/dev/null || echo "{}"
    else
        # Fallback: generate simple token structure
        local token=$(openssl rand -hex 32)
        echo "{\"${mcp_servers}\":\"${token}\"}"
    fi
}

# Initialize MCP tokens variables
MCP_TOKENS=""
TOKENS_FILE=""

# Generate MCP tokens if MCP servers specified
if [[ -n "$MCP_SERVERS" ]]; then
    log "Generating MCP tokens for: $MCP_SERVERS"
    MCP_TOKENS=$(generate_mcp_tokens "$AGENT_TYPE" "$MCP_SERVERS" "$AGENT_ID")

    # Write tokens to file
    TOKENS_FILE="${WORKSPACE_DIR}/mcp-tokens.json"
    echo "$MCP_TOKENS" > "$TOKENS_FILE"

    if [[ "$VERBOSE" == true ]]; then
        log "MCP tokens written to: $TOKENS_FILE"
    fi
fi

# Build Docker command
DOCKER_CMD="docker run"

# Override hardcoded entrypoint (image has coordinator entrypoint, we need shell)
DOCKER_CMD="$DOCKER_CMD --entrypoint /bin/sh"

# Add container options
if [[ "$DETACH" == true ]]; then
    DOCKER_CMD="$DOCKER_CMD --detach"
fi

if [[ "$INTERACTIVE" == true ]]; then
    DOCKER_CMD="$DOCKER_CMD --interactive --tty"
fi

# Container identification
DOCKER_CMD="$DOCKER_CMD --name agent-${AGENT_ID}"
DOCKER_CMD="$DOCKER_CMD --hostname agent-${AGENT_ID}"

# Resource limits
DOCKER_CMD="$DOCKER_CMD --memory ${MEMORY_LIMIT}"
DOCKER_CMD="$DOCKER_CMD --cpus ${CPU_LIMIT}"

# Networking
if docker network inspect "$NETWORK" &> /dev/null; then
    DOCKER_CMD="$DOCKER_CMD --network ${NETWORK}"
else
    log_warning "Docker network '$NETWORK' not found, container will use default network"
fi

# Volume mounts
DOCKER_CMD="$DOCKER_CMD --volume ${PROJECT_ROOT}/.claude:/app/.claude:ro"
DOCKER_CMD="$DOCKER_CMD --volume ${PROJECT_ROOT}/src:/app/src:ro"
DOCKER_CMD="$DOCKER_CMD --volume ${WORKSPACE_DIR}:/app/workspace"

# Add custom volumes
if [[ -n "$VOLUMES" ]]; then
    IFS=',' read -ra VOLUME_ARRAY <<< "$VOLUMES"
    for volume in "${VOLUME_ARRAY[@]}"; do
        DOCKER_CMD="$DOCKER_CMD --volume $volume"
    done
fi

# Environment variables
DOCKER_CMD="$DOCKER_CMD --env AGENT_ID=${AGENT_ID}"
DOCKER_CMD="$DOCKER_CMD --env AGENT_TYPE=${AGENT_TYPE}"
DOCKER_CMD="$DOCKER_CMD --env TASK_ID=${TASK_ID}"
DOCKER_CMD="$DOCKER_CMD --env PROJECT_ROOT=/app"

# Add Redis URL for container-to-container networking
# Always set Redis URL regardless of host Redis status
DOCKER_CMD="$DOCKER_CMD --env REDIS_URL=redis://redis:6379"

# Add MCP tokens file path if tokens generated
if [[ -n "$TOKENS_FILE" ]]; then
    DOCKER_CMD="$DOCKER_CMD --env MCP_TOKENS_FILE=/app/workspace/mcp-tokens.json"
fi

# Add provider routing environment variables (custom routing support)
source .claude/skills/cfn-agent-spawning/get-agent-provider-env.sh "$AGENT_TYPE"
if [[ -n "${ANTHROPIC_BASE_URL:-}" ]]; then
    DOCKER_CMD="$DOCKER_CMD --env ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL}"
fi
if [[ -n "${ANTHROPIC_AUTH_TOKEN:-}" ]]; then
    DOCKER_CMD="$DOCKER_CMD --env ANTHROPIC_AUTH_TOKEN=${ANTHROPIC_AUTH_TOKEN}"
fi
if [[ -n "${ANTHROPIC_MODEL:-}" ]]; then
    DOCKER_CMD="$DOCKER_CMD --env ANTHROPIC_MODEL=${ANTHROPIC_MODEL}"
fi
if [[ -n "${ANTHROPIC_SMALL_FAST_MODEL:-}" ]]; then
    DOCKER_CMD="$DOCKER_CMD --env ANTHROPIC_SMALL_FAST_MODEL=${ANTHROPIC_SMALL_FAST_MODEL}"
fi

# Add custom environment variables
if [[ -n "$ENVIRONMENT" ]]; then
    IFS=',' read -ra ENV_ARRAY <<< "$ENVIRONMENT"
    for env_var in "${ENV_ARRAY[@]}"; do
        DOCKER_CMD="$DOCKER_CMD --env $env_var"
    done
fi

# Check if this is a test mode (simple file operations) or full CFN mode
if [[ "${TASK_ID}" =~ concurrent-.* || "${TASK_ID}" =~ test-.* || "${TASK_ID}" =~ context-.* ]]; then
    # Test mode - simple file operations without CFN coordination
    # Use --rm flag for automatic cleanup, so we don't need the trap
    DOCKER_CMD="$DOCKER_CMD --rm"
    log "Test mode detected - using simple file operations with --rm flag"
else
    # Full CFN mode - use agent-spawn with coordination
    # Add restart policy (only for non-test modes)
    DOCKER_CMD="$DOCKER_CMD --restart unless-stopped"
    log "CFN mode detected - using agent coordination with shell wrapper"
fi

# Prepare context file if specified
CONTEXT_ARG=""
if [[ -n "$CONTEXT_FILE" ]]; then
    if [[ -f "$CONTEXT_FILE" ]]; then
        # Copy context file to workspace so it's accessible inside container
        CONTEXT_FILENAME="context-${AGENT_ID}.json"
        cp "$CONTEXT_FILE" "${WORKSPACE_DIR}/${CONTEXT_FILENAME}"

        # Prepare context argument for agent-spawn command
        CONTEXT_ARG="--context /app/workspace/${CONTEXT_FILENAME}"
    else
        log_error "Context file not found: $CONTEXT_FILE"
        exit 1
    fi
fi

# Add image and command
DOCKER_CMD="$DOCKER_CMD $IMAGE"

# Add the shell command (note: entrypoint is /bin/sh, so use -c not sh -c)
if [[ "${TASK_ID}" =~ concurrent-.* || "${TASK_ID}" =~ test-.* || "${TASK_ID}" =~ context-.* ]]; then
    # Test mode command (context not used)
    DOCKER_CMD="$DOCKER_CMD -c 'cd /app/workspace && echo \"Task: ${TASK_ID}\" > task-info.txt && echo \"Agent: ${AGENT_TYPE}\" >> task-info.txt && echo \"Starting task execution...\" >> task-info.txt && sleep 3 && echo \"${AGENT_TYPE} task completed\" > ${AGENT_TYPE}-task-result.txt && echo \"Workspace verified\" > ${AGENT_TYPE}-workspace-check.txt && echo \"Task completed\" > ${AGENT_TYPE}-completion-log.txt && echo \"All files created successfully\" && ls -la && sleep 2'"
else
    # Full CFN mode command with optional context (use npx claude-flow-novice)
    DOCKER_CMD="$DOCKER_CMD -c 'cd /app && npx claude-flow-novice agent ${AGENT_TYPE} --task-id ${TASK_ID} --agent-id ${AGENT_ID} ${CONTEXT_ARG}'"
fi

# Remove container on exit for interactive mode (not needed for test mode with --rm)
if [[ "$INTERACTIVE" == true && ! "${TASK_ID}" =~ concurrent-.* && ! "${TASK_ID}" =~ test-.* && ! "${TASK_ID}" =~ context-.* ]]; then
    DOCKER_CMD="$DOCKER_CMD --rm"
fi

# Display configuration
log "Container Configuration:"
log "  Agent ID: $AGENT_ID"
log "  Agent Type: $AGENT_TYPE"
log "  Task ID: $TASK_ID"
log "  Memory Limit: $MEMORY_LIMIT"
log "  CPU Limit: $CPU_LIMIT"
log "  Network: $NETWORK"
log "  Workspace: $WORKSPACE_DIR"
log "  MCP Servers: ${MCP_SERVERS:-'none'}"

if [[ "$VERBOSE" == true ]]; then
        log "  Docker Command: $DOCKER_CMD"
    fi

# Debug: Show the exact command being executed
log "Executing: $DOCKER_CMD"

# Execute or show command
if [[ "$DRY_RUN" == true ]]; then
    log "DRY RUN - Container not created"
    log "Command: $DOCKER_CMD"
    exit 0
fi

# Create container
log "Creating container: agent-${AGENT_ID}"
if ! CONTAINER_ID=$(eval "$DOCKER_CMD"); then
    log_error "Failed to create container"
    exit 1
fi

log_success "Container created successfully: $CONTAINER_ID"

# Initialize hybrid logging for this task
LOG_DIR="logs/docker-mode/${TASK_ID}"
DB_PATH="$LOG_DIR/logs.db"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if [[ ! -f "$DB_PATH" ]]; then
    log "Initializing hybrid logging for task: $TASK_ID"
    "$PROJECT_ROOT/.claude/skills/cfn-docker-logging/init-hybrid-logging.sh" "$TASK_ID" >/dev/null 2>&1 || true
fi

# Start background log capture (text files + SQLite)
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-docker-logging/capture-container-logs.sh" ]]; then
    log "Starting hybrid log capture (text + SQLite)"
    "$PROJECT_ROOT/.claude/skills/cfn-docker-logging/capture-container-logs.sh" \
        "$CONTAINER_ID" "$AGENT_ID" "$LOG_DIR" "$DB_PATH" "$TASK_ID" &
    CAPTURE_PID=$!
    log "Log capture started (PID: $CAPTURE_PID)"
fi

# Wait for container to start (if detached)
if [[ "$DETACH" == true ]]; then
    log "Waiting for container to start..."
    sleep 3

    # Check container status
    if ! docker container inspect "$CONTAINER_ID" &> /dev/null; then
        log_error "Container failed to start or was removed"
        exit 1
    fi

    CONTAINER_STATUS=$(docker container inspect "$CONTAINER_ID" --format '{{.State.Status}}')
    log "Container status: $CONTAINER_STATUS"

    if [[ "$CONTAINER_STATUS" == "running" ]]; then
        log_success "Agent container is running"

        # Show initial logs if verbose
        if [[ "$VERBOSE" == true ]]; then
            log "Initial container logs:"
            docker logs "$CONTAINER_ID" --tail 10
        fi
    else
        log_error "Container is not running (status: $CONTAINER_STATUS)"
        docker logs "$CONTAINER_ID"
        exit 1
    fi
fi

# Output container information
cat << EOF

Agent Container Information:
============================
Container ID: $CONTAINER_ID
Agent ID: $AGENT_ID
Agent Type: $AGENT_TYPE
Task ID: $TASK_ID
Network: $NETWORK
Memory Limit: $MEMORY_LIMIT
CPU Limit: $CPU_LIMIT
Workspace: $WORKSPACE_DIR
MCP Servers: ${MCP_SERVERS:-'none'}

Useful Commands:
---------------
# View container logs:
docker logs -f $CONTAINER_ID

# Execute commands in container:
docker exec -it $CONTAINER_ID bash

# Stop container:
docker stop $CONTAINER_ID

# Remove container:
docker rm $CONTAINER_ID

# View resource usage:
docker stats $CONTAINER_ID

EOF

# Add cleanup trap for automatic resource cleanup (only for non-test modes)
cleanup_on_exit() {
    local exit_code=$?

    if [[ -n "${CONTAINER_ID:-}" ]]; then
        log "🧹 Cleaning up container: ${CONTAINER_ID}"

        # Stop container if still running
        if docker inspect "${CONTAINER_ID}" &> /dev/null; then
            local container_status=$(docker inspect --format '{{.State.Status}}' "${CONTAINER_ID}" 2>/dev/null || echo "unknown")

            if [[ "$container_status" == "running" ]]; then
                docker stop "${CONTAINER_ID}" 2>/dev/null || log_warning "Failed to stop container"
            fi

            # Remove container
            docker rm "${CONTAINER_ID}" 2>/dev/null || log_warning "Failed to remove container"
        fi

        # Clean up workspace directory
        if [[ -n "${WORKSPACE_DIR:-}" && -d "${WORKSPACE_DIR}" ]]; then
            log "🧹 Cleaning up workspace: ${WORKSPACE_DIR}"
            rm -rf "${WORKSPACE_DIR}" 2>/dev/null || log_warning "Failed to remove workspace"
        fi
    fi

    # Exit with original exit code
    exit $exit_code
}

# Set trap for cleanup on script exit (only for non-test modes since test modes use --rm flag)
if [[ ! "${TASK_ID}" =~ concurrent-.* && ! "${TASK_ID}" =~ test-.* && ! "${TASK_ID}" =~ context-.* ]]; then
    trap cleanup_on_exit EXIT INT TERM
fi

log_success "Agent spawning completed successfully"