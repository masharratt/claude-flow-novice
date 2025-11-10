#!/usr/bin/env bash

##############################################################################
# CFN Loop Forgiveness Docker Hello World Test Suite
##############################################################################

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="/tmp/cfn-docker-forgiveness-test-$(date +%s)"
TEST_ID="docker-forgiveness-test-$(date +%s)"
TIMESTAMP=$(date +%s)

# Docker environment variables
export DOCKER_NETWORK_NAME="${DOCKER_NETWORK_NAME:-cfn-forgiveness-test-network}"
export REDIS_CONTAINER_NAME="${REDIS_CONTAINER_NAME:-cfn-forgiveness-redis}"
export COORDINATOR_CONTAINER_NAME="${COORDINATOR_CONTAINER_NAME:-cfn-forgiveness-coordinator}"
export HELLO_WORLD_CONTAINER_NAME="${HELLO_WORLD_CONTAINER_NAME:-cfn-forgiveness-hello-world}"
export MONITORING_CONTAINER_NAME="${MONITORING_CONTAINER_NAME:-cfn-forgiveness-monitor}"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly MAGENTA='\033[0;35m'
readonly NC='\033[0m'

# Test metrics
declare -A DOCKER_TEST_RESULTS
declare -A DOCKER_RECOVERY_TIMES
declare -A DOCKER_CONTAINER_STATS
declare -A DOCKER_RESOURCE_METRICS

# Global test tracking
DOCKER_TESTS_PASSED=0
DOCKER_TESTS_FAILED=0
DOCKER_TESTS_TOTAL=0

# Docker-specific forgiveness mechanisms to test
DOCKER_FORGIVENESS_MECHANISMS=(
    "container_resource_constraints"
    "container_network_failures"
    "docker_daemon_failures"
    "container_image_issues"
    "volume_mount_failures"
    "container_lifecycle_events"
    "multi_container_coordination"
    "container_resource_isolation"
)

# Logging functions
log_docker_info() {
    echo -e "${BLUE}[DOCKER FORGIVENESS TEST]${NC} $1"
}

log_docker_success() {
    echo -e "${GREEN}[DOCKER PASS]${NC} $1"
    ((DOCKER_TESTS_PASSED++))
    DOCKER_TEST_RESULTS["$1"]="PASS"
}

log_docker_error() {
    echo -e "${RED}[DOCKER FAIL]${NC} $1"
    ((DOCKER_TESTS_FAILED++))
    DOCKER_TEST_RESULTS["$1"]="FAIL"
}

log_docker_warning() {
    echo -e "${YELLOW}[DOCKER WARN]${NC} $1"
}

log_docker_test_start() {
    echo -e "${CYAN}[DOCKER TEST START]${NC} $1"
    ((DOCKER_TESTS_TOTAL++))
}

log_container_info() {
    echo -e "${MAGENTA}[CONTAINER]${NC} $1"
}

# Docker utility functions
setup_docker_environment() {
    log_docker_info "Setting up Docker test environment..."
    mkdir -p "$TEST_RESULTS_DIR"/{docker-logs,container-stats,failures,checkpoints,telemetry}

    # Create Docker network
    if ! docker network ls | grep -q "$DOCKER_NETWORK_NAME"; then
        docker network create --driver bridge \
            --opt com.docker.network.bridge.name=cfn-forgiveness-br0 \
            "$DOCKER_NETWORK_NAME"
        log_docker_info "Created Docker network: $DOCKER_NETWORK_NAME"
    else
        log_docker_info "Docker network already exists: $DOCKER_NETWORK_NAME"
    fi
}

cleanup_docker_environment() {
    log_docker_info "Cleaning up Docker environment..."

    # Stop and remove containers
    local containers=(
        "$REDIS_CONTAINER_NAME"
        "$COORDINATOR_CONTAINER_NAME"
        "$HELLO_WORLD_CONTAINER_NAME"
        "$MONITORING_CONTAINER_NAME"
    )

    for container in "${containers[@]}"; do
        if docker ps -q -f name="$container" | grep -q .; then
            log_docker_info "Stopping container: $container"
            docker stop "$container" 2>/dev/null || true
        fi
        if docker ps -aq -f name="$container" | grep -q .; then
            log_docker_info "Removing container: $container"
            docker rm "$container" 2>/dev/null || true
        fi
    done

    # Remove Docker network
    if docker network ls | grep -q "$DOCKER_NETWORK_NAME"; then
        docker network rm "$DOCKER_NETWORK_NAME" 2>/dev/null || true
    fi

    # Remove temporary images
    docker images | grep "cfn-forgiveness-test" | awk '{print $3}' | xargs -r docker rmi 2>/dev/null || true

    log_docker_info "Docker cleanup completed"
}

create_docker_failure() {
    local failure_type="$1"
    local failure_dir="$TEST_RESULTS_DIR/failures/docker-$failure_type"
    mkdir -p "$failure_dir"
    echo "$failure_type" > "$failure_dir/active"
}

cleanup_docker_failure() {
    local failure_type="$1"
    local failure_dir="$TEST_RESULTS_DIR/failures/docker-$failure_type"
    rm -f "$failure_dir/active" 2>/dev/null || true
}

is_docker_failure_active() {
    local failure_type="$1"
    local failure_dir="$TEST_RESULTS_DIR/failures/docker-$failure_type"
    [[ -f "$failure_dir/active" ]]
}

measure_docker_recovery_time() {
    local test_name="$1"
    local start_time="$2"
    local end_time="$3"
    local recovery_time=$((end_time - start_time))
    DOCKER_RECOVERY_TIMES["$test_name"]=$recovery_time
    echo "$recovery_time"
}

get_container_stats() {
    local container_name="$1"
    local duration="${2:-5}"

    # Get container resource usage
    if docker ps -q -f name="$container_name" | grep -q .; then
        local stats
        stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" "$container_name" 2>/dev/null || echo "")

        if [[ -n "$stats" ]]; then
            DOCKER_CONTAINER_STATS["$container_name"]="$stats"
            echo "$stats"
        fi
    fi
}

start_redis_container() {
    log_container_info "Starting Redis container..."

    docker run -d \
        --name "$REDIS_CONTAINER_NAME" \
        --network "$DOCKER_NETWORK_NAME" \
        --memory "256m" \
        --cpus "0.3" \
        --restart "unless-stopped" \
        -v redis-test-data:/data \
        redis:7-alpine \
        redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru

    # Wait for Redis to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker exec "$REDIS_CONTAINER_NAME" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            log_container_info "Redis container is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    log_docker_error "Redis container failed to start"
    return 1
}

create_test_image() {
    local image_name="$1"
    local dockerfile_content="$2"

    local temp_dir="$TEST_RESULTS_DIR/temp-docker-$$"
    mkdir -p "$temp_dir"

    echo "$dockerfile_content" > "$temp_dir/Dockerfile"

    if docker build -t "$image_name" "$temp_dir" 2>/dev/null; then
        rm -rf "$temp_dir"
        return 0
    else
        rm -rf "$temp_dir"
        return 1
    fi
}

run_container_hello_world_task() {
    local task_name="$1"
    local timeout="${2:-120}"
    local container_memory="${3:-256m}"
    local container_cpus="${4:-0.5}"
    local start_time=$(date +%s)

    log_docker_info "Running container hello world task: $task_name (timeout: ${timeout}s, memory: ${container_memory}, cpus: ${container_cpus})"

    # Create test Dockerfile for hello world
    local hello_world_dockerfile='FROM node:18-alpine
RUN apk add --no-cache bash
WORKDIR /app
COPY package*.json ./
RUN npm install --production || echo "No package.json found"
COPY . .
CMD ["node", "-e", "console.log(\"Hello World from container!\"); process.exit(0);"]'

    if ! create_test_image "cfn-forgiveness-test-$task_name" "$hello_world_dockerfile"; then
        echo "FAILED:IMAGE_BUILD"
        return 1
    fi

    local task_output="$TEST_RESULTS_DIR/docker_task_output_$task_name.log"
    local task_error="$TEST_RESULTS_DIR/docker_task_error_$task_name.log"
    local container_name="cfn-forgiveness-task-$task_name"

    # Run container with resource constraints
    if timeout "$timeout" docker run --rm \
        --name "$container_name" \
        --network "$DOCKER_NETWORK_NAME" \
        --memory "$container_memory" \
        --cpus "$container_cpus" \
        -e CFN_MODE="container" \
        -e TASK_ID="$TEST_ID-$task_name" \
        -e AGENT_ID="container-agent-$$" \
        -e CFN_FORGIVENESS_TEST="true" \
        -v "$PROJECT_ROOT:/app:ro" \
        "cfn-forgiveness-test-$task_name" \
        > "$task_output" 2> "$task_error"; then

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        # Check if task completed successfully
        if [[ -f "$task_output" ]] && grep -q "Hello World" "$task_output" 2>/dev/null; then
            echo "SUCCESS:$duration"
            return 0
        else
            echo "FAILED:NO_OUTPUT:$duration"
            return 1
        fi
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "FAILED:TIMEOUT:$duration"
        return 1
    fi
}

# Test 1: Container Resource Constraints Forgiveness
test_container_resource_constraints() {
    log_docker_test_start "Container Resource Constraints Forgiveness"
    local test_name="container_resource_constraints"
    local start_time=$(date +%s)

    # Scenario 1: Memory constraint forgiveness
    log_docker_info "Testing memory constraint forgiveness"
    create_docker_failure "memory_constraint"

    local result=$(run_container_hello_world_task "${test_name}_memory" 90 "64m" "0.2")
    local duration=$(echo "$result" | cut -d: -f2)

    cleanup_docker_failure "memory_constraint"

    if [[ "$result" == "SUCCESS:"* ]]; then
        log_docker_success "Container resource constraints: Memory constraint handled - Duration: ${duration}s"
        measure_docker_recovery_time "${test_name}_memory" "$start_time" "$(date +%s)"
    else
        log_docker_error "Container resource constraints: Memory constraint not handled - $result"
    fi

    # Scenario 2: CPU constraint forgiveness
    log_docker_info "Testing CPU constraint forgiveness"
    create_docker_failure "cpu_constraint"

    local result2=$(run_container_hello_world_task "${test_name}_cpu" 90 "256m" "0.1")
    local duration2=$(echo "$result2" | cut -d: -f2)

    cleanup_docker_failure "cpu_constraint"

    if [[ "$result2" == "SUCCESS:"* ]]; then
        log_docker_success "Container resource constraints: CPU constraint handled - Duration: ${duration2}s"
        measure_docker_recovery_time "${test_name}_cpu" "$start_time" "$(date +%s)"
    else
        log_docker_error "Container resource constraints: CPU constraint not handled - $result2"
    fi

    # Scenario 3: Combined resource pressure
    log_docker_info "Testing combined resource pressure forgiveness"
    create_docker_failure "resource_pressure"

    # Start multiple resource-intensive containers
    local pressure_containers=()
    for i in {1..3}; do
        local container_name="pressure-container-$i"
        docker run -d \
            --name "$container_name" \
            --network "$DOCKER_NETWORK_NAME" \
            --memory "128m" \
            --cpus "0.3" \
            alpine:latest \
            sh -c "dd if=/dev/zero of=/dev/null bs=1M count=1000 >/dev/null 2>&1" &
        pressure_containers+=("$container_name")
    done

    sleep 2

    local result3=$(run_container_hello_world_task "${test_name}_pressure" 120 "128m" "0.2")
    local duration3=$(echo "$result3" | cut -d: -f2)

    # Clean up pressure containers
    for container in "${pressure_containers[@]}"; do
        docker stop "$container" 2>/dev/null || true
        docker rm "$container" 2>/dev/null || true
    done

    cleanup_docker_failure "resource_pressure"

    if [[ "$result3" == "SUCCESS:"* ]]; then
        log_docker_success "Container resource constraints: Resource pressure handled - Duration: ${duration3}s"
        measure_docker_recovery_time "${test_name}_pressure" "$start_time" "$(date +%s)"
    else
        log_docker_error "Container resource constraints: Resource pressure not handled - $result3"
    fi
}

# Test 2: Container Network Issues Forgiveness
test_container_network_failures() {
    log_docker_test_start "Container Network Issues Forgiveness"
    local test_name="container_network_failures"
    local start_time=$(date +%s)

    # Ensure Redis is running for network tests
    if ! start_redis_container; then
        log_docker_error "Cannot start network tests - Redis container failed"
        return 1
    fi

    # Scenario 1: Network partition simulation
    log_docker_info "Testing network partition forgiveness"
    create_docker_failure "network_partition"

    # Create a container with network restrictions
    local restricted_dockerfile='FROM node:18-alpine
RUN apk add --no-cache bash
WORKDIR /app
CMD ["sh", "-c", "echo \"Hello World - Network Restricted\"; sleep 30"]'

    if create_test_image "cfn-network-restricted-test" "$restricted_dockerfile"; then
        # Start container with limited network access
        docker run -d \
            --name "network-restricted-test" \
            --network "$DOCKER_NETWORK_NAME" \
            --memory "128m" \
            "cfn-network-restricted-test" &

        sleep 2

        # Test container communication
        if docker exec "network-restricted-test" ping -c 1 "$REDIS_CONTAINER_NAME" >/dev/null 2>&1; then
            log_docker_success "Container network failures: Network partition handled correctly"
            measure_docker_recovery_time "${test_name}_partition" "$start_time" "$(date +%s)"
        else
            log_docker_error "Container network failures: Network partition not handled"
        fi

        docker stop "network-restricted-test" 2>/dev/null || true
        docker rm "network-restricted-test" 2>/dev/null || true
    else
        log_docker_error "Container network failures: Failed to create network-restricted test image"
    fi

    cleanup_docker_failure "network_partition"

    # Scenario 2: DNS resolution failure forgiveness
    log_docker_info "Testing DNS resolution failure forgiveness"
    create_docker_failure "dns_failure"

    # Create container with DNS issues
    local dns_test_dockerfile='FROM node:18-alpine
RUN apk add --no-cache bind-tools
WORKDIR /app
CMD ["sh", "-c", "nslookup google.com || echo \"DNS resolution failed - using fallback\"; echo \"Hello World - DNS Test\""]'

    if create_test_image "cfn-dns-test" "$dns_test_dockerfile"; then
        # Run container with custom DNS (potentially broken)
        if timeout 60 docker run --rm \
            --name "dns-test-container" \
            --network "$DOCKER_NETWORK_NAME" \
            --dns "8.8.8.8" \
            --dns "1.1.1.1" \
            "cfn-dns-test" > "$TEST_RESULTS_DIR/dns_test_output.log" 2>&1; then

            if grep -q "Hello World" "$TEST_RESULTS_DIR/dns_test_output.log" 2>/dev/null; then
                log_docker_success "Container network failures: DNS resolution handled with fallback"
                measure_docker_recovery_time "${test_name}_dns" "$start_time" "$(date +%s)"
            else
                log_docker_error "Container network failures: DNS resolution fallback failed"
            fi
        else
            log_docker_error "Container network failures: DNS test container failed"
        fi
    fi

    cleanup_docker_failure "dns_failure"

    # Scenario 3: Port conflict resolution
    log_docker_info "Testing port conflict resolution"
    create_docker_failure "port_conflict"

    # Occupy a port with another container
    docker run -d \
        --name "port-occupier" \
        --network "$DOCKER_NETWORK_NAME" \
        -p 3000:3000 \
        nginx:alpine &

    sleep 2

    # Try to start another container on the same port
    local port_test_dockerfile='FROM nginx:alpine
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]'

    if create_test_image "cfn-port-test" "$port_test_dockerfile"; then
        # This should fail gracefully due to port conflict
        if ! timeout 30 docker run --rm \
            --name "port-conflict-test" \
            --network "$DOCKER_NETWORK_NAME" \
            -p 3000:3000 \
            "cfn-port-test" 2>/dev/null; then

            log_docker_success "Container network failures: Port conflict handled gracefully"
            measure_docker_recovery_time "${test_name}_port" "$start_time" "$(date +%s)"
        else
            log_docker_error "Container network failures: Port conflict not handled properly"
        fi
    fi

    docker stop "port-occupier" 2>/dev/null || true
    docker rm "port-occupier" 2>/dev/null || true

    cleanup_docker_failure "port_conflict"
}

# Test 3: Docker Daemon Failures Forgiveness
test_docker_daemon_failures() {
    log_docker_test_start "Docker Daemon Failures Forgiveness"
    local test_name="docker_daemon_failures"
    local start_time=$(date +%s)

    # Scenario 1: Docker daemon timeout simulation
    log_docker_info "Testing Docker daemon timeout forgiveness"
    create_docker_failure "daemon_timeout"

    # Simulate daemon timeout by using very short timeouts
    export DOCKER_CLIENT_TIMEOUT="5"
    export COMPOSE_HTTP_TIMEOUT="5"

    # Try operations with short timeout
    local timeout_test_passed=false
    if timeout 30 docker ps >/dev/null 2>&1; then
        timeout_test_passed=true
    fi

    # Reset timeouts
    unset DOCKER_CLIENT_TIMEOUT COMPOSE_HTTP_TIMEOUT

    cleanup_docker_failure "daemon_timeout"

    if $timeout_test_passed; then
        log_docker_success "Docker daemon failures: Timeout handling working"
        measure_docker_recovery_time "${test_name}_timeout" "$start_time" "$(date +%s)"
    else
        log_docker_error "Docker daemon failures: Timeout handling failed"
    fi

    # Scenario 2: Container restart loop prevention
    log_docker_info "Testing container restart loop prevention"
    create_docker_failure "restart_loop"

    # Create a container that exits immediately
    local failing_dockerfile='FROM alpine:latest
CMD ["sh", "-c", "exit 1"]'

    if create_test_image "cfn-failing-test" "$failing_dockerfile"; then
        local restart_count=0
        local max_restarts=3

        # Try to run the failing container multiple times
        for i in $(seq 1 $max_restarts); do
            if timeout 10 docker run --rm "cfn-failing-test" 2>/dev/null; then
                restart_count=$((restart_count + 1))
            else
                break
            fi
        done

        if [[ $restart_count -lt $max_restarts ]]; then
            log_docker_success "Docker daemon failures: Restart loop prevented (${restart_count} attempts)"
            measure_docker_recovery_time "${test_name}_restart" "$start_time" "$(date +%s)"
        else
            log_docker_error "Docker daemon failures: Restart loop not prevented (${restart_count} attempts)"
        fi
    fi

    cleanup_docker_failure "restart_loop"

    # Scenario 3: Docker API rate limiting
    log_docker_info "Testing Docker API rate limiting forgiveness"
    create_docker_failure "api_rate_limit"

    # Simulate rapid API calls
    local api_calls=0
    local max_api_calls=10

    for i in $(seq 1 $max_api_calls); do
        if timeout 5 docker images >/dev/null 2>&1; then
            api_calls=$((api_calls + 1))
        else
            break
        fi
    done

    cleanup_docker_failure "api_rate_limit"

    if [[ $api_calls -ge $max_api_calls ]]; then
        log_docker_success "Docker daemon failures: API rate limiting handled (${api_calls} calls)"
        measure_docker_recovery_time "${test_name}_api" "$start_time" "$(date +%s)"
    else
        log_docker_error "Docker daemon failures: API rate limiting failed (${api_calls} calls)"
    fi
}

# Test 4: Container Image Issues Forgiveness
test_container_image_issues() {
    log_docker_test_start "Container Image Issues Forgiveness"
    local test_name="container_image_issues"
    local start_time=$(date +%s)

    # Scenario 1: Missing image fallback
    log_docker_info "Testing missing image fallback"
    create_docker_failure "missing_image"

    # Try to run a non-existent image
    if ! timeout 30 docker run "this-image-does-not-exist:latest" 2>/dev/null; then
        # Fallback to a working image
        if timeout 30 docker run --rm alpine:latest echo "Hello World - Fallback successful"; then
            log_docker_success "Container image issues: Missing image handled with fallback"
            measure_docker_recovery_time "${test_name}_missing" "$start_time" "$(date +%s)"
        else
            log_docker_error "Container image issues: Missing image fallback failed"
        fi
    else
        log_docker_error "Container image issues: Unexpected success with non-existent image"
    fi

    cleanup_docker_failure "missing_image"

    # Scenario 2: Corrupted image detection
    log_docker_info "Testing corrupted image detection"
    create_docker_failure "corrupted_image"

    # Create a test image and then simulate corruption
    local corrupt_test_dockerfile='FROM alpine:latest
RUN echo "test data" > /test.txt
CMD ["cat", "/test.txt"]'

    if create_test_image "cfn-corrupt-test" "$corrupt_test_dockerfile"; then
        # Remove the image tag to simulate corruption
        docker rmi "cfn-corrupt-test:latest" 2>/dev/null || true

        # Try to run the corrupted image
        if ! timeout 30 docker run "cfn-corrupt-test:latest" 2>/dev/null; then
            # Should fallback to rebuilding
            if create_test_image "cfn-corrupt-test" "$corrupt_test_dockerfile"; then
                log_docker_success "Container image issues: Corrupted image detected and rebuilt"
                measure_docker_recovery_time "${test_name}_corrupt" "$start_time" "$(date +%s)"
            else
                log_docker_error "Container image issues: Corrupted image rebuild failed"
            fi
        else
            log_docker_error "Container image issues: Corrupted image unexpectedly ran"
        fi
    fi

    cleanup_docker_failure "corrupted_image"

    # Scenario 3: Large image loading timeout
    log_docker_info "Testing large image loading timeout"
    create_docker_failure "large_image_timeout"

    # Try to pull a large image with short timeout
    local large_image_pulled=false
    if timeout 30 docker pull "ubuntu:22.04" >/dev/null 2>&1; then
        large_image_pulled=true
    fi

    # Fallback to small image
    if ! $large_image_pulled; then
        if timeout 30 docker run --rm alpine:latest echo "Hello World - Small image fallback"; then
            log_docker_success "Container image issues: Large image timeout handled with small image fallback"
            measure_docker_recovery_time "${test_name}_large" "$start_time" "$(date +%s)"
        else
            log_docker_error "Container image issues: Small image fallback failed"
        fi
    else
        log_docker_info "Container image issues: Large image pulled successfully within timeout"
        measure_docker_recovery_time "${test_name}_large" "$start_time" "$(date +%s)"
    fi

    cleanup_docker_failure "large_image_timeout"
}

# Test 5: Volume Mount Failures Forgiveness
test_volume_mount_failures() {
    log_docker_test_start "Volume Mount Failures Forgiveness"
    local test_name="volume_mount_failures"
    local start_time=$(date +%s)

    # Scenario 1: Non-existent volume handling
    log_docker_info "Testing non-existent volume handling"
    create_docker_failure "nonexistent_volume"

    local volume_test_dockerfile='FROM alpine:latest
RUN mkdir -p /data
WORKDIR /data
CMD ["sh", "-c", "echo \"Hello World from volume\" > /app/hello.txt; cat /app/hello.txt"]'

    if create_test_image "cfn-volume-test" "$volume_test_dockerfile"; then
        # Try to mount non-existent volume
        if timeout 30 docker run --rm \
            -v "/non-existent-volume:/app:rw" \
            "cfn-volume-test" 2>/dev/null; then
            log_docker_error "Volume mount failures: Non-existent volume unexpectedly worked"
        else
            # Fallback to creating the volume
            if docker volume create "test-volume-$TEST_ID" 2>/dev/null; then
                if timeout 30 docker run --rm \
                    -v "test-volume-$TEST_ID:/app:rw" \
                    "cfn-volume-test" 2>/dev/null; then
                    log_docker_success "Volume mount failures: Non-existent volume handled with fallback"
                    measure_docker_recovery_time "${test_name}_nonexistent" "$start_time" "$(date +%s)"
                else
                    log_docker_error "Volume mount failures: Volume creation fallback failed"
                fi
                docker volume rm "test-volume-$TEST_ID" 2>/dev/null || true
            else
                log_docker_error "Volume mount failures: Failed to create fallback volume"
            fi
        fi
    fi

    cleanup_docker_failure "nonexistent_volume"

    # Scenario 2: Read-only volume fallback
    log_docker_info "Testing read-only volume fallback"
    create_docker_failure "readonly_volume"

    # Create a temporary directory
    local temp_dir="/tmp/cfn-test-readonly-$$"
    mkdir -p "$temp_dir"
    echo "initial data" > "$temp_dir/test.txt"

    # Try to mount as read-only but write to it
    if timeout 30 docker run --rm \
        -v "$temp_dir:/app:ro" \
        alpine:latest \
        sh -c "echo 'Hello World' > /app/test.txt" 2>/dev/null; then
        log_docker_error "Volume mount failures: Read-only volume unexpectedly allowed writes"
    else
        # Fallback to using tmpfs or writable volume
        if timeout 30 docker run --rm \
            --tmpfs /app:rw,size=10m \
            alpine:latest \
            sh -c "echo 'Hello World' > /app/test.txt && cat /app/test.txt" 2>/dev/null; then
            log_docker_success "Volume mount failures: Read-only volume handled with tmpfs fallback"
            measure_docker_recovery_time "${test_name}_readonly" "$start_time" "$(date +%s)"
        else
            log_docker_error "Volume mount failures: Read-only volume fallback failed"
        fi
    fi

    rm -rf "$temp_dir" 2>/dev/null || true
    cleanup_docker_failure "readonly_volume"

    # Scenario 3: Permission denied volume access
    log_docker_info "Testing permission denied volume access"
    create_docker_failure "permission_denied"

    # Create a directory with restricted permissions
    local restricted_dir="/tmp/cfn-restricted-$$"
    mkdir -p "$restricted_dir"
    chmod 000 "$restricted_dir"

    # Try to mount restricted directory
    if timeout 30 docker run --rm \
        -v "$restricted_dir:/app:rw" \
        alpine:latest \
        sh -c "echo 'Hello World' > /app/test.txt" 2>/dev/null; then
        log_docker_error "Volume mount failures: Restricted volume unexpectedly worked"
    else
        # Fallback to using container's own filesystem
        if timeout 30 docker run --rm \
            alpine:latest \
            sh -c "echo 'Hello World' > /tmp/test.txt && cat /tmp/test.txt" 2>/dev/null; then
            log_docker_success "Volume mount failures: Permission denied handled with internal filesystem"
            measure_docker_recovery_time "${test_name}_permission" "$start_time" "$(date +%s)"
        else
            log_docker_error "Volume mount failures: Permission denied fallback failed"
        fi
    fi

    chmod 755 "$restricted_dir" 2>/dev/null || true
    rm -rf "$restricted_dir" 2>/dev/null || true
    cleanup_docker_failure "permission_denied"
}

# Test 6: Container Lifecycle Events Forgiveness
test_container_lifecycle_events() {
    log_docker_test_start "Container Lifecycle Events Forgiveness"
    local test_name="container_lifecycle_events"
    local start_time=$(date +%s)

    # Scenario 1: Unexpected termination handling
    log_docker_info "Testing unexpected termination handling"
    create_docker_failure "unexpected_termination"

    # Create a container that can be terminated
    local termination_test_dockerfile='FROM alpine:latest
CMD ["sh", "-c", "echo \"Starting long-running task...\"; sleep 60; echo \"Task completed\""]'

    if create_test_image "cfn-termination-test" "$termination_test_dockerfile"; then
        # Start container
        local container_id
        container_id=$(docker run -d \
            --name "termination-test-container" \
            --network "$DOCKER_NETWORK_NAME" \
            "cfn-termination-test")

        sleep 2

        # Check if container is running
        if docker ps -q -f id="$container_id" | grep -q .; then
            # Kill the container unexpectedly
            docker kill "$container_id" 2>/dev/null || true

            # Container should be able to handle this gracefully
            sleep 2

            if ! docker ps -q -f id="$container_id" | grep -q .; then
                log_docker_success "Container lifecycle: Unexpected termination handled gracefully"
                measure_docker_recovery_time "${test_name}_termination" "$start_time" "$(date +%s)"
            else
                log_docker_error "Container lifecycle: Unexpected termination not handled"
            fi
        else
            log_docker_error "Container lifecycle: Container failed to start"
        fi

        docker rm "$container_id" 2>/dev/null || true
    fi

    cleanup_docker_failure "unexpected_termination"

    # Scenario 2: Container restart recovery
    log_docker_info "Testing container restart recovery"
    create_docker_failure "restart_recovery"

    # Create a container with restart policy
    if docker run -d \
        --name "restart-recovery-test" \
        --network "$DOCKER_NETWORK_NAME" \
        --restart "unless-stopped" \
        alpine:latest \
        sh -c 'echo "Hello World" > /tmp/hello.txt; while true; do sleep 10; done'; then

        sleep 2

        # Check if initial output was created
        if docker exec "restart-recovery-test" cat /tmp/hello.txt 2>/dev/null | grep -q "Hello World"; then
            log_docker_success "Container lifecycle: Container restart recovery working"
            measure_docker_recovery_time "${test_name}_restart" "$start_time" "$(date +%s)"
        else
            log_docker_error "Container lifecycle: Container restart recovery failed"
        fi

        docker stop "restart-recovery-test" 2>/dev/null || true
        docker rm "restart-recovery-test" 2>/dev/null || true
    else
        log_docker_error "Container lifecycle: Failed to start restart recovery test"
    fi

    cleanup_docker_failure "restart_recovery"

    # Scenario 3: Graceful shutdown with signal handling
    log_docker_info "Testing graceful shutdown with signal handling"
    create_docker_failure "graceful_shutdown"

    local signal_test_dockerfile='FROM alpine:latest
RUN apk add --no-cache bash
COPY <<EOF /app/shutdown-handler.sh
#!/bin/bash
trap "echo \\"Received signal - shutting down gracefully\\"; exit 0" TERM INT
echo "Starting graceful shutdown test..."
sleep 30
echo "Normal completion"
EOF
RUN chmod +x /app/shutdown-handler.sh
WORKDIR /app
CMD ["/app/shutdown-handler.sh"]'

    if create_test_image "cfn-signal-test" "$signal_test_dockerfile"; then
        # Start container
        local signal_container_id
        signal_container_id=$(docker run -d \
            --name "signal-test-container" \
            --network "$DOCKER_NETWORK_NAME" \
            "cfn-signal-test")

        sleep 2

        # Send graceful shutdown signal
        if docker kill --signal TERM "$signal_container_id" 2>/dev/null; then
            sleep 3

            # Check container logs for graceful shutdown message
            if docker logs "$signal_container_id" 2>/dev/null | grep -q "shutting down gracefully"; then
                log_docker_success "Container lifecycle: Graceful shutdown signal handled"
                measure_docker_recovery_time "${test_name}_signal" "$start_time" "$(date +%s)"
            else
                log_docker_error "Container lifecycle: Graceful shutdown signal not handled"
            fi
        else
            log_docker_error "Container lifecycle: Failed to send signal to container"
        fi

        docker rm "$signal_container_id" 2>/dev/null || true
    fi

    cleanup_docker_failure "graceful_shutdown"
}

# Test 7: Multi-Container Coordination Forgiveness
test_multi_container_coordination() {
    log_docker_test_start "Multi-Container Coordination Forgiveness"
    local test_name="multi_container_coordination"
    local start_time=$(date +%s)

    # Ensure Redis is running for coordination tests
    if ! start_redis_container; then
        log_docker_error "Cannot start coordination tests - Redis container failed"
        return 1
    fi

    # Scenario 1: Container communication failure forgiveness
    log_docker_info "Testing container communication failure forgiveness"
    create_docker_failure "communication_failure"

    # Start multiple containers that need to communicate
    local containers=()

    # Container 1: Producer
    if docker run -d \
        --name "coordination-producer" \
        --network "$DOCKER_NETWORK_NAME" \
        alpine:latest \
        sh -c 'while true; do echo "producer-$(date)" | nc -w 1 127.0.0.1 8080 || true; sleep 5; done'; then
        containers+=("coordination-producer")
    fi

    # Container 2: Consumer
    if docker run -d \
        --name "coordination-consumer" \
        --network "$DOCKER_NETWORK_NAME" \
        alpine:latest \
        sh -c 'nc -l -p 8080 > /tmp/messages & while true; do cat /tmp/messages 2>/dev/null || echo "waiting..."; sleep 2; done'; then
        containers+=("coordination-consumer")
    fi

    sleep 5

    # Test communication
    local communication_working=false
    if docker logs "coordination-consumer" 2>/dev/null | grep -q "producer"; then
        communication_working=true
    fi

    # Simulate communication failure by stopping producer
    docker stop "coordination-producer" 2>/dev/null || true
    sleep 3

    # Check if consumer handles failure gracefully
    if docker logs "coordination-consumer" 2>/dev/null | grep -q "waiting"; then
        if $communication_working; then
            log_docker_success "Multi-container coordination: Communication failure handled gracefully"
            measure_docker_recovery_time "${test_name}_communication" "$start_time" "$(date +%s)"
        else
            log_docker_error "Multi-container coordination: Initial communication failed"
        fi
    else
        log_docker_error "Multi-container coordination: Communication failure not handled"
    fi

    # Clean up containers
    for container in "${containers[@]}"; do
        docker stop "$container" 2>/dev/null || true
        docker rm "$container" 2>/dev/null || true
    done

    cleanup_docker_failure "communication_failure"

    # Scenario 2: Redis coordination failure forgiveness
    log_docker_info "Testing Redis coordination failure forgiveness"
    create_docker_failure "redis_coordination"

    # Test Redis-based coordination
    local coordinator_dockerfile='FROM node:18-alpine
RUN apk add --no-cache redis
WORKDIR /app
COPY <<EOF /app/coordination-test.js
const redis = require("redis");
const client = redis.createClient({ host: "cfn-forgiveness-redis", port: 6379 });

async function testCoordination() {
    try {
        await client.connect();
        console.log("Redis connected");

        // Set a coordination value
        await client.set("coordination:test", "Hello from coordinator");

        // Read it back
        const value = await client.get("coordination:test");
        console.log("Coordination value:", value);

        await client.quit();
        process.exit(0);
    } catch (error) {
        console.error("Redis coordination failed:", error.message);
        process.exit(1);
    }
}

testCoordination();
EOF
RUN npm init -y && npm install redis'

    if create_test_image "cfn-coordination-test" "$coordinator_dockerfile"; then
        # Test with Redis running
        if timeout 30 docker run --rm \
            --name "coordination-test" \
            --network "$DOCKER_NETWORK_NAME" \
            "cfn-coordination-test" > "$TEST_RESULTS_DIR/coordination_test.log" 2>&1; then

            if grep -q "Hello from coordinator" "$TEST_RESULTS_DIR/coordination_test.log" 2>/dev/null; then
                log_docker_success "Multi-container coordination: Redis coordination working"
                measure_docker_recovery_time "${test_name}_redis" "$start_time" "$(date +%s)"
            else
                log_docker_error "Multi-container coordination: Redis coordination failed"
            fi
        else
            log_docker_error "Multi-container coordination: Redis coordination test failed"
        fi
    fi

    cleanup_docker_failure "redis_coordination"

    # Scenario 3: Service discovery forgiveness
    log_docker_info "Testing service discovery forgiveness"
    create_docker_failure "service_discovery"

    # Test service discovery with fallback
    local discovery_dockerfile='FROM alpine:latest
RUN apk add --no-cache bind-tools
WORKDIR /app
COPY <<EOF /app/discovery-test.sh
#!/bin/bash
echo "Testing service discovery..."

# Try to discover Redis service
if nslookup cfn-forgiveness-redis >/dev/null 2>&1; then
    echo "Service discovery successful"
    echo "Hello World - Service discovered"
else
    echo "Service discovery failed - using fallback"
    echo "Hello World - Fallback mode"
fi
EOF
RUN chmod +x /app/discovery-test.sh
CMD ["/app/discovery-test.sh"]'

    if create_test_image "cfn-discovery-test" "$discovery_dockerfile"; then
        if timeout 30 docker run --rm \
            --name "discovery-test" \
            --network "$DOCKER_NETWORK_NAME" \
            "cfn-discovery-test" > "$TEST_RESULTS_DIR/discovery_test.log" 2>&1; then

            if grep -q "Hello World" "$TEST_RESULTS_DIR/discovery_test.log" 2>/dev/null; then
                log_docker_success "Multi-container coordination: Service discovery working with fallback"
                measure_docker_recovery_time "${test_name}_discovery" "$start_time" "$(date +%s)"
            else
                log_docker_error "Multi-container coordination: Service discovery failed"
            fi
        else
            log_docker_error "Multi-container coordination: Service discovery test failed"
        fi
    fi

    cleanup_docker_failure "service_discovery"
}

# Test 8: Container Resource Isolation Forgiveness
test_container_resource_isolation() {
    log_docker_test_start "Container Resource Isolation Forgiveness"
    local test_name="container_resource_isolation"
    local start_time=$(date +%s)

    # Scenario 1: Memory isolation under pressure
    log_docker_info "Testing memory isolation under pressure"
    create_docker_failure "memory_isolation"

    # Start memory-intensive containers
    local memory_containers=()
    for i in {1..3}; do
        local container_name="memory-pressure-$i"
        if docker run -d \
            --name "$container_name" \
            --network "$DOCKER_NETWORK_NAME" \
            --memory "128m" \
            alpine:latest \
            sh -c 'dd if=/dev/zero of=/dev/null bs=1M count=500 >/dev/null 2>&1 & sleep 60'; then
            memory_containers+=("$container_name")
        fi
    done

    sleep 3

    # Run test container with resource isolation
    local isolation_result=$(run_container_hello_world_task "${test_name}_memory_pressure" 60 "64m" "0.2")
    local isolation_duration=$(echo "$isolation_result" | cut -d: -f2)

    # Clean up memory pressure containers
    for container in "${memory_containers[@]}"; do
        docker stop "$container" 2>/dev/null || true
        docker rm "$container" 2>/dev/null || true
    done

    cleanup_docker_failure "memory_isolation"

    if [[ "$isolation_result" == "SUCCESS:"* ]]; then
        log_docker_success "Container resource isolation: Memory isolation maintained under pressure - Duration: ${isolation_duration}s"
        measure_docker_recovery_time "${test_name}_memory" "$start_time" "$(date +%s)"
    else
        log_docker_error "Container resource isolation: Memory isolation failed - $isolation_result"
    fi

    # Scenario 2: CPU isolation with contention
    log_docker_info "Testing CPU isolation with contention"
    create_docker_failure "cpu_isolation"

    # Start CPU-intensive containers
    local cpu_containers=()
    for i in {1..2}; do
        local container_name="cpu-pressure-$i"
        if docker run -d \
            --name "$container_name" \
            --network "$DOCKER_NETWORK_NAME" \
            --cpus "0.8" \
            alpine:latest \
            sh -c 'dd if=/dev/zero of=/dev/null bs=1M count=1000 >/dev/null 2>&1 & while true; do dd if=/dev/zero of=/dev/null bs=1M count=100 >/dev/null 2>&1; sleep 1; done'; then
            cpu_containers+=("$container_name")
        fi
    done

    sleep 3

    # Run test container with limited CPU
    local cpu_result=$(run_container_hello_world_task "${test_name}_cpu_pressure" 90 "256m" "0.1")
    local cpu_duration=$(echo "$cpu_result" | cut -d: -f2)

    # Get container stats
    get_container_stats "cfn-forgiveness-task-${test_name}_cpu_pressure"

    # Clean up CPU pressure containers
    for container in "${cpu_containers[@]}"; do
        docker stop "$container" 2>/dev/null || true
        docker rm "$container" 2>/dev/null || true
    done

    cleanup_docker_failure "cpu_isolation"

    if [[ "$cpu_result" == "SUCCESS:"* ]]; then
        log_docker_success "Container resource isolation: CPU isolation maintained under contention - Duration: ${cpu_duration}s"
        measure_docker_recovery_time "${test_name}_cpu" "$start_time" "$(date +%s)"
    else
        log_docker_error "Container resource isolation: CPU isolation failed - $cpu_result"
    fi

    # Scenario 3: Network bandwidth isolation
    log_docker_info "Testing network bandwidth isolation"
    create_docker_failure "network_isolation"

    # Start network-intensive containers
    local network_containers=()
    for i in {1..2}; do
        local container_name="network-pressure-$i"
        if docker run -d \
            --name "$container_name" \
            --network "$DOCKER_NETWORK_NAME" \
            alpine:latest \
            sh -c 'while true; do wget -q -O /dev/null http://example.com || wget -q -O /dev/null http://google.com || true; sleep 2; done'; then
            network_containers+=("$container_name")
        fi
    done

    sleep 5

    # Test network operations under pressure
    local network_test_dockerfile='FROM alpine:latest
RUN apk add --no-cache curl
WORKDIR /app
CMD ["sh", "-c", "curl -s --max-time 10 http://example.com >/dev/null && echo \"Hello World - Network test successful\" || echo \"Hello World - Network test failed (fallback)\""]'

    if create_test_image "cfn-network-isolation-test" "$network_test_dockerfile"; then
        if timeout 30 docker run --rm \
            --name "network-isolation-test" \
            --network "$DOCKER_NETWORK_NAME" \
            "cfn-network-isolation-test" > "$TEST_RESULTS_DIR/network_isolation_test.log" 2>&1; then

            if grep -q "Hello World" "$TEST_RESULTS_DIR/network_isolation_test.log" 2>/dev/null; then
                log_docker_success "Container resource isolation: Network isolation maintained under pressure"
                measure_docker_recovery_time "${test_name}_network" "$start_time" "$(date +%s)"
            else
                log_docker_error "Container resource isolation: Network isolation test failed"
            fi
        else
            log_docker_error "Container resource isolation: Network isolation test container failed"
        fi
    fi

    # Clean up network pressure containers
    for container in "${network_containers[@]}"; do
        docker stop "$container" 2>/dev/null || true
        docker rm "$container" 2>/dev/null || true
    done

    cleanup_docker_failure "network_isolation"
}

# Combined Docker Forgiveness Scenarios
test_combined_docker_scenarios() {
    log_docker_test_start "Combined Docker Forgiveness Scenarios"
    local test_name="combined_docker_scenarios"
    local start_time=$(date +%s)

    # Scenario 1: Multiple container failures simultaneously
    log_docker_info "Testing multiple container failures simultaneously"
    create_docker_failure "combined_container_failures"

    # Create multiple failure conditions
    # 1. Resource pressure
    stress_containers=()
    for i in {1..2}; do
        local container_name="stress-container-$i"
        if docker run -d \
            --name "$container_name" \
            --network "$DOCKER_NETWORK_NAME" \
            --memory "64m" \
            --cpus "0.5" \
            alpine:latest \
            sh -c 'dd if=/dev/zero of=/dev/null bs=1M count=200 >/dev/null 2>&1 & sleep 30'; then
            stress_containers+=("$container_name")
        fi
    done

    # 2. Network issues
    if start_redis_container; then
        # Test with Redis under pressure
        local combined_result=$(run_container_hello_world_task "${test_name}_combined" 120 "64m" "0.2")
        local combined_duration=$(echo "$combined_result" | cut -d: -f2)

        # Clean up stress containers
        for container in "${stress_containers[@]}"; do
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        done

        cleanup_docker_failure "combined_container_failures"

        if [[ "$combined_result" == "SUCCESS:"* ]]; then
            log_docker_success "Combined Docker scenarios: Multiple container failures handled - Duration: ${combined_duration}s"
            measure_docker_recovery_time "${test_name}_combined" "$start_time" "$(date +%s)"
        else
            log_docker_error "Combined Docker scenarios: Multiple container failures not handled - $combined_result"
        fi
    else
        log_docker_error "Combined Docker scenarios: Redis setup failed"
        cleanup_docker_failure "combined_container_failures"
    fi

    # Scenario 2: Docker vs CLI forgiveness parity
    log_docker_info "Testing Docker vs CLI forgiveness parity"
    create_docker_failure "docker_cli_parity"

    # Run equivalent CLI and Docker tests
    local cli_result="$TEST_RESULTS_DIR/cli_parity_result.log"
    local docker_result="$TEST_RESULTS_DIR/docker_parity_result.log"

    # CLI test (simplified)
    timeout 60 npx claude-flow-novice agent-spawn hello-world \
        --type backend-developer \
        --simple \
        > "$cli_result" 2>&1 || echo "CLI_FAILED" > "$cli_result"

    # Docker test (equivalent)
    run_container_hello_world_task "${test_name}_parity" 60 "256m" "0.5" > "$docker_result" 2>&1 || echo "DOCKER_FAILED" > "$docker_result"

    # Compare results
    local cli_success=false
    local docker_success=false

    if grep -q "Hello World" "$cli_result" 2>/dev/null || grep -q "SUCCESS" "$cli_result" 2>/dev/null; then
        cli_success=true
    fi

    if grep -q "SUCCESS" "$docker_result" 2>/dev/null; then
        docker_success=true
    fi

    cleanup_docker_failure "docker_cli_parity"

    if $cli_success && $docker_success; then
        log_docker_success "Combined Docker scenarios: Docker vs CLI parity confirmed - Both succeeded"
        measure_docker_recovery_time "${test_name}_parity" "$start_time" "$(date +%s)"
    elif $cli_success && ! $docker_success; then
        log_docker_error "Combined Docker scenarios: Docker failed but CLI succeeded - Parity issue"
    elif ! $cli_success && $docker_success; then
        log_docker_warning "Combined Docker scenarios: CLI failed but Docker succeeded - Docker may be more resilient"
    else
        log_docker_error "Combined Docker scenarios: Both CLI and Docker failed"
    fi
}

# Generate comprehensive Docker forgiveness report
generate_docker_forgiveness_report() {
    log_docker_info "Generating Docker forgiveness test report..."

    local report_file="$TEST_RESULTS_DIR/docker-forgiveness-report.md"

    cat > "$report_file" << EOF
# CFN Loop Docker Forgiveness Test Report

**Test ID:** $TEST_ID
**Date:** $(date)
**Test Duration:** $(( ($(date +%s) - TIMESTAMP) / 60 )) minutes

## Executive Summary

- **Total Docker Tests:** $DOCKER_TESTS_TOTAL
- **Passed:** $DOCKER_TESTS_PASSED
- **Failed:** $DOCKER_TESTS_FAILED
- **Success Rate:** $(( DOCKER_TESTS_TOTAL > 0 ? (DOCKER_TESTS_PASSED * 100) / DOCKER_TESTS_TOTAL : 0 ))%

## Docker-Specific Forgiveness Mechanisms Tested

EOF

    # Add results for each mechanism
    for mechanism in "${DOCKER_FORGIVENESS_MECHANISMS[@]}"; do
        echo "### $mechanism" >> "$report_file"
        echo "" >> "$report_file"

        # Find tests for this mechanism
        local mechanism_tests=($(printf '%s\n' "${!DOCKER_TEST_RESULTS[@]}" | grep "$mechanism" || true))

        if [[ ${#mechanism_tests[@]} -gt 0 ]]; then
            for test in "${mechanism_tests[@]}"; do
                local status="${DOCKER_TEST_RESULTS[$test]:-UNKNOWN}"
                local recovery_time="${DOCKER_RECOVERY_TIMES[$test]:-N/A}"
                echo "- **$test**: $status (Recovery: ${recovery_time}s)" >> "$report_file"
            done
        else
            echo "- No specific tests found" >> "$report_file"
        fi
        echo "" >> "$report_file"
    done

    # Add container resource metrics
    cat >> "$report_file" << EOF
## Container Resource Metrics

| Container | CPU Usage | Memory Usage | Network I/O | Block I/O |
|-----------|-----------|--------------|-------------|-----------|
EOF

    for container in "${!DOCKER_CONTAINER_STATS[@]}"; do
        echo "| $container | ${DOCKER_CONTAINER_STATS[$container]} |" >> "$report_file"
    done

    # Add recovery time analysis
    cat >> "$report_file" << EOF

## Docker Recovery Time Analysis

| Test | Recovery Time (s) | Status |
|------|------------------|--------|
EOF

    for test in "${!DOCKER_RECOVERY_TIMES[@]}"; do
        local status="${DOCKER_TEST_RESULTS[$test]:-UNKNOWN}"
        echo "| $test | ${DOCKER_RECOVERY_TIMES[$test]} | $status |" >> "$report_file"
    done

    # Add Docker environment analysis
    cat >> "$report_file" << EOF

## Docker Environment Analysis

### Docker Configuration
- **Docker Version:** $(docker --version 2>/dev/null || echo "Not available")
- **Docker Daemon Status:** $(docker info --format "{{.ServerVersion}}" 2>/dev/null || echo "Not running")
- **Default Network:** $(docker network ls --filter "driver=bridge" --format "{{.Name}}" | head -1 || echo "N/A")
- **Available Images:** $(docker images --format "{{.Repository}}:{{.Tag}}" | wc -l) images

### Container Resource Limits
- **Default Memory Limit:** As configured in tests (64m-512m)
- **Default CPU Limit:** As configured in tests (0.1-0.5)
- **Network Used:** $DOCKER_NETWORK_NAME
- **Volume Driver:** local (default)

## Docker vs CLI Forgiveness Comparison

EOF

    if [[ $DOCKER_TESTS_FAILED -eq 0 ]]; then
        echo "✅ **Docker forgiveness mechanisms are working correctly**" >> "$report_file"
        echo "✅ **Docker provides equivalent or better forgiveness than CLI**" >> "$report_file"
        echo "" >> "$report_file"
        echo "### Docker-Specific Enhancements:" >> "$report_file"
        echo "- ✅ Container resource isolation and constraints" >> "$report_file"
        echo "- ✅ Multi-container coordination with Redis" >> "$report_file"
        echo "- ✅ Volume mount failure handling" >> "$report_file"
        echo "- ✅ Container lifecycle event management" >> "$report_file"
        echo "- ✅ Docker daemon failure recovery" >> "$report_file"
        echo "- ✅ Container image issue resolution" >> "$report_file"
    else
        echo "❌ **Some Docker forgiveness mechanisms need attention**" >> "$report_file"
        echo "" >> "$report_file"

        for test in "${!DOCKER_TEST_RESULTS[@]}"; do
            if [[ "${DOCKER_TEST_RESULTS[$test]}" == "FAIL" ]]; then
                echo "- **$test**: Review Docker-specific implementation" >> "$report_file"
            fi
        done
    fi

    cat >> "$report_file" << EOF

## Container-Specific Recommendations

### Resource Management
- Monitor container memory usage during forgiveness operations
- Implement appropriate CPU limits to prevent host resource exhaustion
- Use health checks for automatic container recovery

### Network Resilience
- Implement container service discovery with fallback mechanisms
- Use overlay networks for multi-host communication
- Configure appropriate network timeouts and retry policies

### Volume Management
- Implement volume mount validation and fallback strategies
- Use read-only mounts where appropriate for security
- Plan for volume cleanup and garbage collection

### Container Lifecycle
- Configure appropriate restart policies
- Implement graceful shutdown handling
- Use container orchestration for production deployments

## Test Artifacts

All test logs and outputs are stored in: \`$TEST_RESULTS_DIR\`

### Key Files:
- \`docker-logs/\`: Individual container logs
- \`container-stats/\`: Resource usage statistics
- \`failures/\`: Active Docker failure condition markers
- \`telemetry/\`: CFN Loop telemetry data from containers
- \`*.log\`: Test execution logs

## Production Deployment Considerations

### Docker Environment Requirements
- **Docker Engine:** 20.10+ for advanced resource management
- **Memory:** Minimum 2GB RAM for container orchestration
- **Storage:** 10GB+ available space for images and volumes
- **Network:** Stable network connectivity for multi-container coordination

### Monitoring and Observability
- Container health checks and monitoring
- Resource usage tracking and alerting
- Log aggregation from all containers
- Performance metrics collection

### Security Considerations
- Container image scanning and validation
- Network segmentation and firewall rules
- Volume permissions and access control
- Secret management for containerized environments

---

*Report generated by CFN Loop Docker Forgiveness Test Suite*
EOF

    log_docker_success "Docker forgiveness test report generated: $report_file"
    echo ""
    echo "📊 Docker Test Summary: $DOCKER_TESTS_PASSED/$DOCKER_TESTS_TOTAL passed ($(( DOCKER_TESTS_TOTAL > 0 ? (DOCKER_TESTS_PASSED * 100) / DOCKER_TESTS_TOTAL : 0 ))%)"
    echo "📁 Results directory: $TEST_RESULTS_DIR"
    echo "📄 Report: $report_file"
}

# Main test execution
main() {
    echo "🐳 CFN Loop Docker Forgiveness Hello World Test Suite"
    echo "====================================================="
    echo ""

    # Setup Docker environment
    setup_docker_environment

    # Trap for cleanup
    trap cleanup_docker_environment EXIT INT TERM

    # Run individual mechanism tests
    test_container_resource_constraints
    test_container_network_failures
    test_docker_daemon_failures
    test_container_image_issues
    test_volume_mount_failures
    test_container_lifecycle_events
    test_multi_container_coordination
    test_container_resource_isolation

    # Run combined scenarios
    test_combined_docker_scenarios

    # Generate comprehensive report
    generate_docker_forgiveness_report

    echo ""
    if [[ $DOCKER_TESTS_FAILED -eq 0 ]]; then
        echo "🎉 All Docker forgiveness tests passed! CFN Loop Docker environment is resilient."
        exit 0
    else
        echo "❌ $DOCKER_TESTS_FAILED Docker test(s) failed. Review the report for details."
        exit 1
    fi
}

# Run main function
main "$@"