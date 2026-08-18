#!/usr/bin/env bash
# tests/docker/test-helpers.sh
# Docker-specific test utilities for CFN Loop Docker agent testing
# Extends tests/test-utils.sh with Docker-focused helpers

# Prevent multiple sourcing
if [ -n "${DOCKER_TEST_HELPERS_LOADED:-}" ]; then
    return 0
fi
DOCKER_TEST_HELPERS_LOADED=1

# Enable strict error handling
set -euo pipefail

# Source base test utilities
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# DOCKER AGENT CONFIGURATION
# ============================================================================

# Docker agent defaults
export AGENT_IMAGE="${AGENT_IMAGE:-claude-flow-novice-agent:latest}"
export COORDINATOR_IMAGE="${COORDINATOR_IMAGE:-claude-flow-novice-coordinator:latest}"
export ORCHESTRATOR_IMAGE="${ORCHESTRATOR_IMAGE:-claude-flow-novice-orchestrator:latest}"

# Docker compose paths
export DOCKER_COMPOSE_FILE="${DOCKER_COMPOSE_FILE:-docker-compose.yml}"
export DOCKER_COMPOSE_TEST_FILE="${DOCKER_COMPOSE_TEST_FILE:-tests/docker/docker-compose.test.yml}"

# ============================================================================
# DOCKER IMAGE MANAGEMENT
# ============================================================================

# Verify Docker image exists
# Usage: verify_image "image:tag"
verify_image() {
    local image="$1"

    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${image}$"; then
        log_success "Image exists: $image"
        return 0
    else
        log_error "Image not found: $image"
        return 1
    fi
}

# Build Docker image if needed
# Usage: ensure_image "image:tag" "/path/to/Dockerfile"
ensure_image() {
    local image="$1"
    local dockerfile="${2:-Dockerfile}"

    if verify_image "$image" 2>/dev/null; then
        log_info "Using existing image: $image"
        return 0
    fi

    log_info "Building image: $image"
    if docker build -t "$image" -f "$dockerfile" . >/dev/null 2>&1; then
        log_success "Built image: $image"
        return 0
    else
        log_error "Failed to build image: $image"
        return 1
    fi
}

# Get image size in MB
# Usage: size=$(get_image_size "image:tag")
get_image_size() {
    local image="$1"

    docker images --format "{{.Size}}" "$image" 2>/dev/null || echo "unknown"
}

# Pull Docker image
# Usage: pull_image "image:tag"
pull_image() {
    local image="$1"

    log_info "Pulling image: $image"
    if docker pull "$image" >/dev/null 2>&1; then
        log_success "Pulled image: $image"
        return 0
    else
        log_error "Failed to pull image: $image"
        return 1
    fi
}

# ============================================================================
# DOCKER CONTAINER LIFECYCLE
# ============================================================================

# Start Redis service
# Usage: start_redis
start_redis() {
    log_step "Starting Redis service"

    # Check if already running
    if is_container_running "cfn-redis"; then
        log_info "Redis already running"
        return 0
    fi

    # Start Redis
    docker-compose up -d redis >/dev/null 2>&1 || {
        log_error "Failed to start Redis"
        return 1
    }

    # Wait for health
    if wait_for_container "cfn-redis" 15; then
        sleep 2
        if verify_redis_health; then
            log_success "Redis service ready"
            return 0
        fi
    fi

    log_error "Redis failed to become healthy"
    return 1
}

# Stop Redis service
# Usage: stop_redis
stop_redis() {
    log_info "Stopping Redis service"
    docker-compose stop redis >/dev/null 2>&1 || true
    cleanup_container "cfn-redis"
}

# Start Docker agent with environment
# Usage: start_agent "test-agent-1" "ENV_VAR1=value1" "ENV_VAR2=value2"
start_agent() {
    local agent_name="$1"
    shift
    local env_vars=("$@")

    log_info "Starting agent: $agent_name"

    # Build docker run command
    local run_cmd="docker run -d --name $agent_name --network $DOCKER_NETWORK"

    # Add environment variables
    for env_var in "${env_vars[@]}"; do
        run_cmd+=" -e $env_var"
    done

    # Add image
    run_cmd+=" $AGENT_IMAGE"

    # Execute
    if eval "$run_cmd" >/dev/null 2>&1; then
        log_success "Started agent: $agent_name"
        return 0
    else
        log_error "Failed to start agent: $agent_name"
        return 1
    fi
}

# Stop Docker agent
# Usage: stop_agent "test-agent-1"
stop_agent() {
    local agent_name="$1"

    log_info "Stopping agent: $agent_name"
    cleanup_container "$agent_name"
}

# Execute command in agent container
# Usage: result=$(agent_exec "agent-name" "ls -la")
agent_exec() {
    local agent_name="$1"
    shift

    container_exec "$agent_name" "$@"
}

# Get agent exit code
# Usage: exit_code=$(get_agent_exit_code "agent-name")
get_agent_exit_code() {
    local agent_name="$1"

    docker inspect "$agent_name" --format='{{.State.ExitCode}}' 2>/dev/null || echo "255"
}

# Check if agent completed successfully
# Usage: if agent_succeeded "agent-name"; then ...
agent_succeeded() {
    local agent_name="$1"
    local exit_code

    exit_code=$(get_agent_exit_code "$agent_name")
    [ "$exit_code" = "0" ]
}

# ============================================================================
# DOCKER NETWORK HELPERS
# ============================================================================

# Verify network connectivity between containers
# Usage: verify_network_connectivity "container1" "container2"
verify_network_connectivity() {
    local source_container="$1"
    local target_container="$2"

    log_info "Testing network connectivity: $source_container -> $target_container"

    # Ping test
    if docker exec "$source_container" ping -c 1 "$target_container" >/dev/null 2>&1; then
        log_success "Network connectivity verified"
        return 0
    else
        log_error "Network connectivity failed"
        return 1
    fi
}

# Get container IP address
# Usage: ip=$(get_container_ip "container-name")
get_container_ip() {
    local container="$1"

    docker inspect "$container" --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo ""
}

# List containers on network
# Usage: containers=$(list_network_containers "network-name")
list_network_containers() {
    local network="${1:-$DOCKER_NETWORK}"

    docker network inspect "$network" --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo ""
}

# ============================================================================
# DOCKER COMPOSE HELPERS
# ============================================================================

# Start Docker Compose services
# Usage: compose_up "redis" "coordinator"
compose_up() {
    local services=("$@")

    log_info "Starting services: ${services[*]}"

    if docker-compose up -d "${services[@]}" >/dev/null 2>&1; then
        log_success "Services started"
        return 0
    else
        log_error "Failed to start services"
        return 1
    fi
}

# Stop Docker Compose services
# Usage: compose_down
compose_down() {
    log_info "Stopping all Docker Compose services"
    docker-compose down >/dev/null 2>&1 || true
}

# Get service status
# Usage: status=$(get_service_status "redis")
get_service_status() {
    local service="$1"

    docker-compose ps "$service" --format json 2>/dev/null | jq -r '.State' || echo "unknown"
}

# ============================================================================
# LOG ANALYSIS HELPERS
# ============================================================================

# Search container logs for pattern
# Usage: if log_contains "container-name" "error pattern"; then ...
log_contains() {
    local container="$1"
    local pattern="$2"
    local lines="${3:-1000}"

    docker logs "$container" --tail "$lines" 2>&1 | grep -q "$pattern"
}

# Extract log lines matching pattern
# Usage: errors=$(extract_log_lines "container-name" "ERROR")
extract_log_lines() {
    local container="$1"
    local pattern="$2"
    local lines="${3:-1000}"

    docker logs "$container" --tail "$lines" 2>&1 | grep "$pattern" || echo ""
}

# Count log occurrences
# Usage: count=$(count_log_occurrences "container-name" "WARNING")
count_log_occurrences() {
    local container="$1"
    local pattern="$2"
    local lines="${3:-1000}"

    docker logs "$container" --tail "$lines" 2>&1 | grep -c "$pattern" || echo "0"
}

# Save container logs to file
# Usage: save_logs "container-name" "/tmp/logs.txt"
save_logs() {
    local container="$1"
    local output_file="$2"
    local lines="${3:-1000}"

    docker logs "$container" --tail "$lines" > "$output_file" 2>&1
}

# Get last N log lines
# Usage: recent_logs=$(get_recent_logs "container-name" 20)
get_recent_logs() {
    local container="$1"
    local lines="${2:-20}"

    docker logs "$container" --tail "$lines" 2>&1 || echo "FAILED_TO_GET_LOGS"
}

# ============================================================================
# RESOURCE MONITORING
# ============================================================================

# Get container memory usage in MB
# Usage: mem=$(get_container_memory "container-name")
get_container_memory() {
    local container="$1"

    docker stats "$container" --no-stream --format "{{.MemUsage}}" 2>/dev/null | awk '{print $1}' || echo "unknown"
}

# Get container CPU usage percentage
# Usage: cpu=$(get_container_cpu "container-name")
get_container_cpu() {
    local container="$1"

    docker stats "$container" --no-stream --format "{{.CPUPerc}}" 2>/dev/null || echo "unknown"
}

# Monitor container resources
# Usage: monitor_resources "container-name" 5
monitor_resources() {
    local container="$1"
    local duration="${2:-10}"

    log_info "Monitoring $container for ${duration}s"

    docker stats "$container" --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || {
        log_error "Failed to get resource stats"
        return 1
    }
}

# ============================================================================
# VOLUME AND MOUNT HELPERS
# ============================================================================

# Create temporary volume
# Usage: vol=$(create_test_volume "test-vol")
create_test_volume() {
    local volume_name="$1"

    if docker volume create "$volume_name" >/dev/null 2>&1; then
        log_success "Created volume: $volume_name"
        echo "$volume_name"
        return 0
    else
        log_error "Failed to create volume: $volume_name"
        return 1
    fi
}

# Cleanup test volume
# Usage: cleanup_volume "test-vol"
cleanup_volume() {
    local volume_name="$1"

    if docker volume ls | grep -q "$volume_name"; then
        log_info "Removing volume: $volume_name"
        docker volume rm "$volume_name" >/dev/null 2>&1 || true
    fi
}

# ============================================================================
# TEST SCENARIO HELPERS
# ============================================================================

# Setup Docker test environment
# Usage: setup_docker_test "test-name"
setup_docker_test() {
    local test_name="${1:-docker-test}"

    # Call base setup
    setup_test "$test_name"

    # Ensure Docker images exist
    log_step "Verifying Docker images"
    if ! verify_image "$AGENT_IMAGE"; then
        log_warn "Agent image not found: $AGENT_IMAGE"
        log_info "Build with: docker build -t $AGENT_IMAGE -f Dockerfile.agent ."
    fi

    # Start Redis
    start_redis || {
        log_error "Failed to start Redis"
        return 1
    }

    log_success "Docker test environment ready"
}

# Cleanup Docker test environment
# Usage: cleanup_docker_test
cleanup_docker_test() {
    log_step "Cleaning up Docker test environment"

    # Stop Redis
    stop_redis

    # Clean up any test containers
    docker ps -a --filter "name=test-" --format "{{.Names}}" | while read -r container; do
        cleanup_container "$container"
    done

    # Call base teardown
    teardown_test
}

# Run agent test scenario
# Usage: run_agent_scenario "scenario-name" "agent-command"
run_agent_scenario() {
    local scenario_name="$1"
    local agent_command="$2"
    local agent_name="test-agent-$(date +%s)"

    log_step "Running scenario: $scenario_name"

    # Start agent
    start_agent "$agent_name" \
        "CFN_REDIS_HOST=cfn-redis" \
        "CFN_REDIS_PORT=6379" \
        "TASK_ID=test-task-$(date +%s)"

    # Wait for completion
    local timeout=30
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if ! is_container_running "$agent_name"; then
            break
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    # Check result
    if agent_succeeded "$agent_name"; then
        log_success "Scenario passed: $scenario_name"
        cleanup_container "$agent_name"
        return 0
    else
        log_error "Scenario failed: $scenario_name"
        log_error "Exit code: $(get_agent_exit_code "$agent_name")"
        get_recent_logs "$agent_name" 50
        cleanup_container "$agent_name"
        return 1
    fi
}

# ============================================================================
# EXPORT FUNCTIONS
# ============================================================================

export -f verify_image ensure_image get_image_size pull_image
export -f start_redis stop_redis start_agent stop_agent agent_exec
export -f get_agent_exit_code agent_succeeded
export -f verify_network_connectivity get_container_ip list_network_containers
export -f compose_up compose_down get_service_status
export -f log_contains extract_log_lines count_log_occurrences save_logs get_recent_logs
export -f get_container_memory get_container_cpu monitor_resources
export -f create_test_volume cleanup_volume
export -f setup_docker_test cleanup_docker_test run_agent_scenario

log_info "Docker test helpers loaded"
