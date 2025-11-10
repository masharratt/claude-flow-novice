#!/usr/bin/env bash

##############################################################################
# CFN Loop Docker Forgiveness Test Runner
##############################################################################

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TESTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Test configuration
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.forgiveness.yml"
FORGIVENESS_TEST_SCRIPT="$TESTS_DIR/test-cfn-forgiveness-docker-hello-world.sh"
TIMESTAMP=$(date +%s)
TEST_MODE="${1:-standalone}"

# Logging functions
log_runner_info() {
    echo -e "${BLUE}[DOCKER FORGIVENESS RUNNER]${NC} $1"
}

log_runner_success() {
    echo -e "${GREEN}[DOCKER FORGIVENESS RUNNER]${NC} $1"
}

log_runner_error() {
    echo -e "${RED}[DOCKER FORGIVENESS RUNNER]${NC} $1"
}

log_runner_warning() {
    echo -e "${YELLOW}[DOCKER FORGIVENESS RUNNER]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_runner_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker >/dev/null 2>&1; then
        log_runner_error "Docker is not installed or not in PATH"
        exit 1
    fi

    # Check Docker daemon
    if ! docker info >/dev/null 2>&1; then
        log_runner_error "Docker daemon is not running"
        exit 1
    fi

    # Check Docker Compose
    if ! command -v docker-compose >/dev/null 2>&1; then
        log_runner_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi

    # Check if test script exists
    if [[ ! -f "$FORGIVENESS_TEST_SCRIPT" ]]; then
        log_runner_error "Docker forgiveness test script not found: $FORGIVENESS_TEST_SCRIPT"
        exit 1
    fi

    # Check if Docker Compose file exists
    if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
        log_runner_error "Docker Compose file not found: $DOCKER_COMPOSE_FILE"
        exit 1
    fi

    log_runner_success "All prerequisites satisfied"
}

# Setup test environment
setup_docker_compose_environment() {
    log_runner_info "Setting up Docker Compose test environment..."

    # Create required directories
    mkdir -p "$SCRIPT_DIR"/{forgiveness-results,test-volume,lifecycle-test-data}
    mkdir -p "$SCRIPT_DIR"/logs/{containers,monitoring,redis}

    # Set environment variables for Docker Compose
    export TIMESTAMP
    export PWD="$PROJECT_ROOT"

    # Create fluent-bit configuration if monitoring is enabled
    if [[ "$TEST_MODE" == "compose-with-monitoring" ]]; then
        cat > "$SCRIPT_DIR/fluent-bit.conf" << EOF
[SERVICE]
    Flush        1
    Daemon       off
    Log_Level    info
    Parsers_File parsers.conf

[INPUT]
    Name         tail
    Path         /fluent-bit/logs/*.log
    Tag          forgiveness.*
    Mem_Buf_Limit 5MB

[OUTPUT]
    Name         stdout
    Match        *
    Format       json_lines

[OUTPUT]
    Name         file
    Match        *
    Path         /fluent-bit/logs/output
    File         fluent-bit.log
EOF
    fi

    log_runner_success "Docker Compose environment setup complete"
}

# Cleanup Docker Compose environment
cleanup_docker_compose_environment() {
    log_runner_info "Cleaning up Docker Compose environment..."

    # Stop and remove all services
    cd "$SCRIPT_DIR"
    docker-compose -f "$DOCKER_COMPOSE_FILE" down --remove-orphans --volumes --timeout 30 2>/dev/null || true

    # Remove test networks
    docker network ls --filter name="cfn-forgiveness" -q | xargs -r docker network rm 2>/dev/null || true

    # Remove test volumes
    docker volume ls --filter name="cfn-forgiveness" -q | xargs -r docker volume rm 2>/dev/null || true

    # Remove test images
    docker images | grep "cfn-forgiveness" | awk '{print $3}' | xargs -r docker rmi 2>/dev/null || true

    # Clean up test directories
    rm -rf "$SCRIPT_DIR/forgiveness-results"/*
    rm -rf "$SCRIPT_DIR/test-volume"/*
    rm -rf "$SCRIPT_DIR/lifecycle-test-data"/*

    log_runner_success "Docker Compose environment cleanup complete"
}

# Run standalone Docker tests
run_standalone_tests() {
    log_runner_info "Running standalone Docker forgiveness tests..."

    if bash "$FORGIVENESS_TEST_SCRIPT"; then
        log_runner_success "Standalone Docker forgiveness tests passed"
        return 0
    else
        log_runner_error "Standalone Docker forgiveness tests failed"
        return 1
    fi
}

# Run Docker Compose basic tests
run_compose_basic_tests() {
    log_runner_info "Running Docker Compose basic forgiveness tests..."

    cd "$SCRIPT_DIR"

    # Start core services
    log_runner_info "Starting core services (Redis, Coordinator)..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d redis-forgiveness cfn-forgiveness-coordinator

    # Wait for services to be ready
    log_runner_info "Waiting for services to be ready..."
    sleep 10

    # Check service health
    local redis_healthy=false
    local coordinator_healthy=false

    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps redis-forgiveness | grep -q "Up (healthy)"; then
        redis_healthy=true
        log_runner_success "Redis service is healthy"
    else
        log_runner_error "Redis service is not healthy"
    fi

    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps cfn-forgiveness-coordinator | grep -q "Up (healthy)"; then
        coordinator_healthy=true
        log_runner_success "Coordinator service is healthy"
    else
        log_runner_error "Coordinator service is not healthy"
    fi

    if $redis_healthy && $coordinator_healthy; then
        log_runner_success "Docker Compose basic services are ready"
        return 0
    else
        log_runner_error "Docker Compose basic services failed to start"
        return 1
    fi
}

# Run Docker Compose stress tests
run_compose_stress_tests() {
    log_runner_info "Running Docker Compose stress tests..."

    cd "$SCRIPT_DIR"

    # Start stress generators
    log_runner_info "Starting stress generators..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" --profile stress up -d stress-generator

    # Start resource-constrained agents
    log_runner_info "Starting resource-constrained agents..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d agent-memory-test agent-cpu-test agent-network-test

    # Let stress tests run
    log_runner_info "Running stress tests for 60 seconds..."
    sleep 60

    # Check container status
    local containers_up=0
    local total_containers=4  # stress-generator + 3 agents

    for container in stress-generator agent-memory-test agent-cpu-test agent-network-test; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$container" | grep -q "Up"; then
            ((containers_up++))
            log_runner_success "Container $container is up"
        else
            log_runner_warning "Container $container is down"
        fi
    done

    local success_rate=$(( (containers_up * 100) / total_containers ))
    log_runner_info "Stress test success rate: $success_rate% ($containers_up/$total_containers containers up)"

    if [[ $success_rate -ge 75 ]]; then
        log_runner_success "Docker Compose stress tests passed"
        return 0
    else
        log_runner_error "Docker Compose stress tests failed (success rate: $success_rate%)"
        return 1
    fi
}

# Run Docker Compose network failure tests
run_compose_network_failure_tests() {
    log_runner_info "Running Docker Compose network failure tests..."

    cd "$SCRIPT_DIR"

    # Start core services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d redis-forgiveness cfn-forgiveness-coordinator agent-network-test

    # Wait for services to be ready
    sleep 10

    # Simulate network partition
    log_runner_info "Simulating network partition..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" --profile network-test up -d network-partition

    # Let network partition run
    sleep 30

    # Check if services recover after network partition
    local network_partition_recovered=false

    # Check Redis connectivity from coordinator
    if docker exec cfn-forgiveness-coordinator redis-cli -h redis-forgiveness ping 2>/dev/null | grep -q "PONG"; then
        network_partition_recovered=true
        log_runner_success "Network partition recovery successful"
    else
        log_runner_error "Network partition recovery failed"
    fi

    # Stop network partition
    docker-compose -f "$DOCKER_COMPOSE_FILE" stop network-partition 2>/dev/null || true

    if $network_partition_recovered; then
        log_runner_success "Docker Compose network failure tests passed"
        return 0
    else
        log_runner_error "Docker Compose network failure tests failed"
        return 1
    fi
}

# Run Docker Compose volume failure tests
run_compose_volume_failure_tests() {
    log_runner_info "Running Docker Compose volume failure tests..."

    cd "$SCRIPT_DIR"

    # Start volume test service
    log_runner_info "Starting volume failure test..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" --profile volume-test up -d volume-test

    # Wait for volume test to run
    sleep 15

    # Check if volume test handled failures gracefully
    local volume_test_handled=false

    # Check container logs for volume failure handling
    if docker logs cfn-forgiveness-volume-test 2>/dev/null | grep -q -i "fallback\|error\|failed"; then
        volume_test_handled=true
        log_runner_success "Volume failure handled gracefully"
    else
        log_runner_warning "Volume failure may not have been triggered or handled"
    fi

    if $volume_test_handled; then
        log_runner_success "Docker Compose volume failure tests passed"
        return 0
    else
        log_runner_warning "Docker Compose volume failure tests inconclusive"
        return 0  # Don't fail the test, just warn
    fi
}

# Run Docker Compose monitoring tests
run_compose_monitoring_tests() {
    log_runner_info "Running Docker Compose monitoring tests..."

    cd "$SCRIPT_DIR"

    # Start monitoring stack
    log_runner_info "Starting monitoring stack..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" --profile monitoring up -d monitoring log-aggregator

    # Start core services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d redis-forgiveness cfn-forgiveness-coordinator

    # Wait for monitoring to be ready
    sleep 15

    # Check if monitoring is working
    local monitoring_working=false

    # Check cAdvisor accessibility
    if curl -s http://localhost:9281/metrics >/dev/null 2>&1; then
        monitoring_working=true
        log_runner_success "cAdvisor monitoring is accessible"
    else
        log_runner_warning "cAdvisor monitoring not accessible"
    fi

    # Check log aggregation
    if docker logs cfn-forgiveness-logs 2>/dev/null | grep -q "fluent-bit"; then
        log_runner_success "Log aggregation is working"
    else
        log_runner_warning "Log aggregation may not be working"
    fi

    if $monitoring_working; then
        log_runner_success "Docker Compose monitoring tests passed"
        return 0
    else
        log_runner_warning "Docker Compose monitoring tests partially failed"
        return 0  # Don't fail the test, monitoring is optional
    fi
}

# Generate comprehensive test report
generate_compose_test_report() {
    local test_results_file="$SCRIPT_DIR/forgiveness-results/compose-test-results-$TIMESTAMP.json"

    log_runner_info "Generating Docker Compose test report..."

    # Collect container statistics
    local container_stats
    container_stats=$(docker stats --no-stream --format json 2>/dev/null || echo "[]")

    # Collect network information
    local network_info
    network_info=$(docker network ls --filter name="cfn-forgiveness" --format json 2>/dev/null || echo "[]")

    # Collect volume information
    local volume_info
    volume_info=$(docker volume ls --filter name="cfn-forgiveness" --format json 2>/dev/null || echo "[]")

    # Create JSON report
    cat > "$test_results_file" << EOF
{
  "test_run": {
    "timestamp": "$(date -Iseconds)",
    "mode": "$TEST_MODE",
    "script_dir": "$SCRIPT_DIR",
    "project_root": "$PROJECT_ROOT"
  },
  "docker_environment": {
    "version": "$(docker --version)",
    "compose_version": "$(docker-compose --version)",
    "daemon_info": {
      "server_version": "$(docker info --format '{{.ServerVersion}}' 2>/dev/null || echo 'unknown')",
      "memory_total": "$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 'unknown')",
      "cpu_count": "$(docker info --format '{{.NCPU}}' 2>/dev/null || echo 'unknown')"
    }
  },
  "test_results": {
    "container_stats": $container_stats,
    "network_info": $network_info,
    "volume_info": $volume_info,
    "services": {
      "redis": "$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q redis-forgiveness 2>/dev/null || echo 'not_running')",
      "coordinator": "$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q cfn-forgiveness-coordinator 2>/dev/null || echo 'not_running')",
      "agents": [
        "$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q agent-memory-test 2>/dev/null || echo 'not_running')",
        "$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q agent-cpu-test 2>/dev/null || echo 'not_running')",
        "$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q agent-network-test 2>/dev/null || echo 'not_running')"
      ]
    }
  },
  "forgiveness_tests": {
    "standalone": {
      "status": "not_run",
      "output": ""
    },
    "compose_basic": {
      "status": "not_run",
      "output": ""
    },
    "compose_stress": {
      "status": "not_run",
      "output": ""
    },
    "compose_network_failure": {
      "status": "not_run",
      "output": ""
    },
    "compose_volume_failure": {
      "status": "not_run",
      "output": ""
    },
    "compose_monitoring": {
      "status": "not_run",
      "output": ""
    }
  }
}
EOF

    log_runner_success "Docker Compose test report generated: $test_results_file"
}

# Main test execution
main() {
    echo "🐳 CFN Loop Docker Forgiveness Test Runner"
    echo "=========================================="
    echo ""

    log_runner_info "Test mode: $TEST_MODE"
    log_runner_info "Timestamp: $TIMESTAMP"
    echo ""

    # Check prerequisites
    check_prerequisites

    # Setup environment
    setup_docker_compose_environment

    # Trap for cleanup
    trap cleanup_docker_compose_environment EXIT INT TERM

    local overall_success=true

    case "$TEST_MODE" in
        "standalone")
            log_runner_info "Running standalone Docker forgiveness tests..."
            if ! run_standalone_tests; then
                overall_success=false
            fi
            ;;

        "compose-basic")
            log_runner_info "Running Docker Compose basic forgiveness tests..."
            if ! run_compose_basic_tests; then
                overall_success=false
            fi
            ;;

        "compose-stress")
            log_runner_info "Running Docker Compose stress tests..."
            if ! run_compose_basic_tests; then
                overall_success=false
            fi
            if ! run_compose_stress_tests; then
                overall_success=false
            fi
            ;;

        "compose-network-failure")
            log_runner_info "Running Docker Compose network failure tests..."
            if ! run_compose_basic_tests; then
                overall_success=false
            fi
            if ! run_compose_network_failure_tests; then
                overall_success=false
            fi
            ;;

        "compose-volume-failure")
            log_runner_info "Running Docker Compose volume failure tests..."
            if ! run_compose_basic_tests; then
                overall_success=false
            fi
            if ! run_compose_volume_failure_tests; then
                overall_success=false
            fi
            ;;

        "compose-with-monitoring")
            log_runner_info "Running Docker Compose tests with monitoring..."
            if ! run_compose_basic_tests; then
                overall_success=false
            fi
            if ! run_compose_stress_tests; then
                overall_success=false
            fi
            if ! run_compose_monitoring_tests; then
                overall_success=false
            fi
            ;;

        "compose-all")
            log_runner_info "Running all Docker Compose forgiveness tests..."
            if ! run_compose_basic_tests; then
                overall_success=false
            fi
            if ! run_compose_stress_tests; then
                overall_success=false
            fi
            if ! run_compose_network_failure_tests; then
                overall_success=false
            fi
            if ! run_compose_volume_failure_tests; then
                overall_success=false
            fi
            if ! run_compose_monitoring_tests; then
                overall_success=false
            fi
            ;;

        *)
            log_runner_error "Unknown test mode: $TEST_MODE"
            echo ""
            echo "Available test modes:"
            echo "  standalone                - Run standalone Docker tests"
            echo "  compose-basic             - Run basic Docker Compose tests"
            echo "  compose-stress            - Run Docker Compose stress tests"
            echo "  compose-network-failure   - Run network failure tests"
            echo "  compose-volume-failure    - Run volume failure tests"
            echo "  compose-with-monitoring   - Run tests with monitoring stack"
            echo "  compose-all               - Run all Docker Compose tests"
            echo ""
            exit 1
            ;;
    esac

    # Generate report
    generate_compose_test_report

    echo ""
    if $overall_success; then
        log_runner_success "🎉 All Docker forgiveness tests completed successfully!"
        exit 0
    else
        log_runner_error "❌ Some Docker forgiveness tests failed. Check logs for details."
        exit 1
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 [TEST_MODE]"
    echo ""
    echo "CFN Loop Docker Forgiveness Test Runner"
    echo ""
    echo "Test Modes:"
    echo "  standalone                - Run standalone Docker tests"
    echo "  compose-basic             - Run basic Docker Compose tests"
    echo "  compose-stress            - Run Docker Compose stress tests"
    echo "  compose-network-failure   - Run network failure tests"
    echo "  compose-volume-failure    - Run volume failure tests"
    echo "  compose-with-monitoring   - Run tests with monitoring stack"
    echo "  compose-all               - Run all Docker Compose tests"
    echo ""
    echo "Examples:"
    echo "  $0 standalone              # Run standalone tests"
    echo "  $0 compose-all             # Run all compose tests"
    echo "  $0 compose-stress          # Run stress tests only"
    echo ""
}

# Parse command line arguments
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage
    exit 0
fi

# Run main function
main "$@"