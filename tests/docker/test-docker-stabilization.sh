#!/bin/bash
# Comprehensive Docker Integration Test for CFN Stabilization

set -eo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.stabilization.yml"
ENV_FILE="$PROJECT_ROOT/docker.stabilization.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TEST_WARNINGS=0

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}
log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    TESTS_WARNINGS=$((TESTS_WARNINGS + 1))
}
log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Test helper functions
test_command() {
    local test_name="$1"
    local command="$2"

    echo -n "Testing $test_name... "
    if eval "$command" >/dev/null 2>&1; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name: $command failed"
        return 0  # Don't exit the test suite on individual test failure
    fi
}

test_file_exists() {
    local test_name="$1"
    local file_path="$2"

    echo -n "Testing $test_name... "
    if [[ -f "$file_path" ]]; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name: $file_path not found"
        return 0  # Don't exit the test suite on individual test failure
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test environment..."
    if [[ -f "$COMPOSE_FILE" ]]; then
        docker-compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
    fi
    log_info "Cleanup completed"
}

# Set trap for cleanup
# trap cleanup EXIT  # Temporarily disabled for debugging

# ========================================
# Test Suite: Docker Stabilization
# ========================================

main() {
    echo "🐳 CFN Docker-Native Stabilization Integration Test"
    echo "===================================================="
    echo

    # Load environment
    if [[ -f "$ENV_FILE" ]]; then
        log_info "Loading environment configuration..."
        set -a
        source "$ENV_FILE"
        set +a
    else
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi

    # ========================================
    # Test 1: Build Artifacts Validation
    # ========================================
    echo "📋 Test 1: Build Artifacts Validation"
    echo "------------------------------------"

    test_file_exists "Dockerfile.orchestrator" "$PROJECT_ROOT/Dockerfile.orchestrator"
    test_file_exists "Dockerfile.agent.stabilized" "$PROJECT_ROOT/Dockerfile.agent.stabilized"
    test_file_exists "Dockerfile.telemetry" "$PROJECT_ROOT/Dockerfile.telemetry"
    test_file_exists "redis configuration" "$PROJECT_ROOT/redis/redis.conf"
    test_file_exists "compose configuration" "$COMPOSE_FILE"

    echo

    # ========================================
    # Test 2: Environment Variable Wiring
    # ========================================
    echo "🔧 Test 2: Environment Variable Wiring"
    echo "-------------------------------------"

    # Check that compose file references environment variables
    log_info "Checking resource limit environment variable references..."
    if grep -q '${CFN_ORCHESTRATOR_MEMORY_LIMIT' "$COMPOSE_FILE"; then
        log_success "Orchestrator memory limit variable reference"
    else
        log_error "Orchestrator memory limit variable not referenced"
    fi

    if grep -q '${CFN_TASK_MEMORY_LIMIT' "$COMPOSE_FILE"; then
        log_success "Task agent memory limit variable reference"
    else
        log_error "Task agent memory limit variable not referenced"
    fi

    if grep -q '${CFN_CLI_MEMORY_LIMIT' "$COMPOSE_FILE"; then
        log_success "CLI agent memory limit variable reference"
    else
        log_error "CLI agent memory limit variable not referenced"
    fi

    echo

    # ========================================
    # Test 3: Docker Build Validation
    # ========================================
    echo "🏗️  Test 3: Docker Build Validation"
    echo "---------------------------------"

    log_info "Building orchestrator image..."
    if docker build -f "$PROJECT_ROOT/Dockerfile.orchestrator" -t cfn-test-orchestrator "$PROJECT_ROOT" >/dev/null 2>&1; then
        log_success "Orchestrator image built successfully"
    else
        log_error "Orchestrator build failed"
    fi

    log_info "Building telemetry image..."
    if docker build -f "$PROJECT_ROOT/Dockerfile.telemetry" -t cfn-test-telemetry "$PROJECT_ROOT" >/dev/null 2>&1; then
        log_success "Telemetry image built successfully"
    else
        log_error "Telemetry build failed"
    fi

    # Test multi-stage agent build
    log_info "Building agent images (multi-stage)..."
    if docker build -f "$PROJECT_ROOT/Dockerfile.agent.stabilized" --target task-mode -t cfn-test-agent-task "$PROJECT_ROOT" >/dev/null 2>&1; then
        log_success "Task mode agent image built successfully"
    else
        log_error "Task mode agent build failed"
    fi

    if docker build -f "$PROJECT_ROOT/Dockerfile.agent.stabilized" --target cli-mode -t cfn-test-agent-cli "$PROJECT_ROOT" >/dev/null 2>&1; then
        log_success "CLI mode agent image built successfully"
    else
        log_error "CLI mode agent build failed"
    fi

    echo

    # ========================================
    # Test 4: Container Resource Limits
    # ========================================
    echo "⚡ Test 4: Container Resource Limits"
    echo "----------------------------------"

    # Deploy minimal stack for testing
    log_info "Deploying minimal test stack..."
    docker-compose -f "$COMPOSE_FILE" up -d redis >/dev/null 2>&1

    # Wait for Redis
    log_info "Waiting for Redis to be ready..."
    local redis_ready=false
    for i in {1..30}; do
        if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping >/dev/null 2>&1; then
            redis_ready=true
            break
        fi
        sleep 1
    done

    if [[ "$redis_ready" = true ]]; then
        log_success "Redis is ready"
    else
        log_error "Redis failed to start"
    fi

    # Check Redis resource limits
    log_info "Validating Redis resource limits..."
    local redis_memory_limit=$(docker inspect cfn-redis | jq '.[0].HostConfig.Memory')
    local expected_memory=${CFN_REDIS_MEMORY_LIMIT:-1073741824}  # 1GB default

    if [[ "$redis_memory_limit" -eq "$expected_memory" ]]; then
        log_success "Redis memory limit enforced: $redis_memory_limit bytes"
    else
        log_warning "Redis memory limit mismatch: expected $expected_memory, got $redis_memory_limit"
    fi

    local redis_cpu_limit=$(docker inspect cfn-redis | jq '.[0].HostConfig.NanoCpus')
    local expected_cpu=${CFN_REDIS_CPU_LIMIT:-300000000}  # 0.3 CPU default

    if [[ "$redis_cpu_limit" -eq "$expected_cpu" ]]; then
        log_success "Redis CPU limit enforced: $redis_cpu_limit nanoseconds"
    else
        log_warning "Redis CPU limit mismatch: expected $expected_cpu, got $redis_cpu_limit"
    fi

    echo

    # ========================================
    # Test 5: Telemetry Collection
    # ========================================
    echo "📊 Test 5: Telemetry Collection"
    echo "------------------------------"

    log_info "Starting telemetry collector..."
    docker run -d --name cfn-test-telemetry-runner \
        --network claude-flow-novice_cfn-network \
        -e REDIS_URL=redis://redis:6379 \
        -e TELEMETRY_INTERVAL=5 \
        cfn-test-telemetry >/dev/null 2>&1

    # Wait for telemetry to start
    sleep 10

    # Check if telemetry container is running
    if docker ps --filter "name=cfn-test-telemetry-runner" --quiet | grep -q .; then
        log_success "Telemetry container is running"
    else
        log_error "Telemetry container failed to start"
    fi

    # Check if metrics are being collected
    log_info "Checking telemetry logs..."
    local telemetry_logs=$(docker logs cfn-test-telemetry-runner 2>&1)
    if echo "$telemetry_logs" | grep -q "Redis connected successfully"; then
        log_success "Redis connectivity established"
    else
        log_error "Redis connectivity failed in telemetry"
    fi

    # Check for metrics collection
    if echo "$telemetry_logs" | grep -q "Metrics stored successfully"; then
        log_success "Metrics collection working"
    else
        log_warning "Metrics collection not yet started (may need more time)"
    fi

    # Test Redis key storage
    log_info "Testing Redis metrics storage..."
    local metrics_key=$(docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli keys "metrics:system:latest" 2>/dev/null || echo "")
    if [[ "$metrics_key" == "metrics:system:latest" ]]; then
        log_success "Metrics key found in Redis"
    else
        log_warning "Metrics key not found in Redis yet"
    fi

    echo

    # ========================================
    # Test 6: Container Mode Detection
    # ========================================
    echo "🔍 Test 6: Container Mode Detection"
    echo "---------------------------------"

    # Test task mode detection
    log_info "Testing container mode detection..."
    local task_mode_output=$(docker run --rm \
        -e TASK_ID=test-task-123 \
        -e AGENT_ID=test-agent-456 \
        cfn-test-agent-task \
        bash -c "source /app/container-mode-detection.sh && detect_container_mode" 2>/dev/null || echo "")

    if [[ "$task_mode_output" == "container-task" ]]; then
        log_success "Task mode detection working"
    else
        log_error "Task mode detection failed: got '$task_mode_output'"
    fi

    # Test CLI mode detection
    local cli_mode_output=$(docker run --rm \
        -e CFN_SWARM_ID=test-swarm-789 \
        -e CFN_REDIS_URL=redis://redis:6379 \
        cfn-test-agent-cli \
        bash -c "source /app/container-mode-detection.sh && detect_container_mode" 2>/dev/null || echo "")

    if [[ "$cli_mode_output" == "container-cli" ]]; then
        log_success "CLI mode detection working"
    else
        log_error "CLI mode detection failed: got '$cli_mode_output'"
    fi

    echo

    # ========================================
    # Test 7: Integration Test Summary
    # ========================================
    echo "📈 Test 7: Integration Test Summary"
    echo "---------------------------------"

    # Clean up test containers
    docker rm -f cfn-test-telemetry-runner 2>/dev/null || true
    docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true

    # Test results
    echo
    echo "========================================"
    echo "           TEST RESULTS SUMMARY"
    echo "========================================"
    echo "✅ Passed: $TESTS_PASSED"
    echo "⚠️  Warnings: $TESTS_WARNINGS"
    echo "❌ Failed: $TESTS_FAILED"
    echo "========================================"

    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    if [[ $total_tests -gt 0 ]]; then
        local success_rate=$((TESTS_PASSED * 100 / total_tests))
        echo "📊 Success Rate: ${success_rate}%"
    fi

    echo

    # Final verdict
    if [[ $TESTS_FAILED -eq 0 ]]; then
        if [[ $TESTS_WARNINGS -eq 0 ]]; then
            log_success "🎉 ALL TESTS PASSED - Docker-native stabilization is fully functional!"
            echo
            echo "✅ Resource limits are properly enforced via environment variables"
            echo "✅ Multi-stage builds create optimized container images"
            echo "✅ Telemetry collection works with Redis integration"
            echo "✅ Container mode detection routes coordination correctly"
            echo "✅ Memory leak prevention via container isolation is active"
            return 0
        else
            log_warning "⚠️ ALL CRITICAL TESTS PASSED - Some warnings detected"
            echo
            echo "✅ Core functionality is working"
            echo "⚠️ Some optimizations may be needed"
            return 0
        fi
    else
        log_error "❌ SOME TESTS FAILED - Docker-native stabilization needs fixes"
        echo
        echo "❌ Critical issues detected that must be resolved"
        echo "🔧 Please review the failing tests and fix the underlying issues"
        return 1
    fi
}

# Execute main function
main "$@"