#!/bin/bash
# 8-Hour Stability Test Launcher
# Phase 2 Sprint 2.3 - Stability Validation with 50 Agents
# Success Criteria: <5% memory growth, >1000 msg/s throughput, no resource leaks

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCKER_CONFIG_DIR="${PROJECT_ROOT}/config/docker"
RESULTS_DIR="${DOCKER_CONFIG_DIR}/stability-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Test parameters
TEST_DURATION_HOURS=8
TEST_DURATION_SECONDS=$((TEST_DURATION_HOURS * 3600))
MAX_AGENTS=50
THROUGHPUT_TARGET=1000
MEMORY_GROWTH_THRESHOLD=5  # percent

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    log_info "Cleaning up Docker resources..."
    cd "${DOCKER_CONFIG_DIR}"
    docker-compose -f docker-compose.stability-test.yml down -v 2>/dev/null || true
    log_success "Cleanup complete"
}

# Trap signals for cleanup
trap cleanup EXIT INT TERM

# Main execution
main() {
    log_info "8-Hour Stability Test Launcher"
    log_info "=============================="
    log_info "Configuration:"
    log_info "  - Duration: ${TEST_DURATION_HOURS} hours (${TEST_DURATION_SECONDS}s)"
    log_info "  - Max Agents: ${MAX_AGENTS}"
    log_info "  - Throughput Target: ${THROUGHPUT_TARGET} msg/s"
    log_info "  - Memory Growth Threshold: ${MEMORY_GROWTH_THRESHOLD}%"
    log_info ""

    # Pre-flight checks
    log_info "Running pre-flight checks..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose not found. Please install docker-compose."
        exit 1
    fi

    log_success "Docker and docker-compose found"

    # Check system resources
    log_info "Checking system resources..."
    AVAILABLE_MEM=$(free -m | awk 'NR==2{print $7}')
    REQUIRED_MEM=8192  # 8GB minimum

    if [ "${AVAILABLE_MEM}" -lt "${REQUIRED_MEM}" ]; then
        log_warning "Available memory (${AVAILABLE_MEM}MB) is below recommended (${REQUIRED_MEM}MB)"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_success "Sufficient memory available (${AVAILABLE_MEM}MB)"
    fi

    # Create results directory
    mkdir -p "${RESULTS_DIR}"
    log_success "Results directory created: ${RESULTS_DIR}"

    # Build and start containers
    log_info "Building Docker images..."
    cd "${DOCKER_CONFIG_DIR}"

    if ! docker-compose -f docker-compose.stability-test.yml build --no-cache; then
        log_error "Docker build failed"
        exit 1
    fi
    log_success "Docker images built successfully"

    # Start monitoring stack first
    log_info "Starting monitoring stack..."
    docker-compose -f docker-compose.stability-test.yml up -d prometheus grafana node-exporter

    # Wait for monitoring to be ready
    log_info "Waiting for monitoring services to be ready (30s)..."
    sleep 30
    log_success "Monitoring stack ready"
    log_info "  - Prometheus: http://localhost:9090"
    log_info "  - Grafana: http://localhost:3001 (admin/stability-test)"

    # Start stability test
    log_info ""
    log_info "Starting 8-hour stability test..."
    log_info "Test start time: $(date)"
    log_info "Expected completion: $(date -d "+${TEST_DURATION_HOURS} hours" 2>/dev/null || date -v+${TEST_DURATION_HOURS}H 2>/dev/null || echo "in ${TEST_DURATION_HOURS} hours")"
    log_info ""

    # Launch test container
    docker-compose -f docker-compose.stability-test.yml up stability-test 2>&1 | tee "${RESULTS_DIR}/test-output-${TIMESTAMP}.log"

    TEST_EXIT_CODE=$?

    # Analyze results
    log_info ""
    log_info "Test execution completed with exit code: ${TEST_EXIT_CODE}"
    log_info "Analyzing results..."

    if [ -f "${RESULTS_DIR}/resource-usage-"*".csv" ]; then
        LATEST_CSV=$(ls -t "${RESULTS_DIR}/resource-usage-"*".csv" | head -1)
        log_info "Resource usage data: ${LATEST_CSV}"

        # Calculate memory growth
        INITIAL_MEM=$(head -2 "${LATEST_CSV}" | tail -1 | cut -d',' -f3)
        FINAL_MEM=$(tail -1 "${LATEST_CSV}" | cut -d',' -f3)
        MEMORY_GROWTH=$(awk -v init="${INITIAL_MEM}" -v final="${FINAL_MEM}" 'BEGIN {printf "%.2f", ((final - init) / init) * 100}')

        log_info "Memory Analysis:"
        log_info "  - Initial RSS: ${INITIAL_MEM}MB"
        log_info "  - Final RSS: ${FINAL_MEM}MB"
        log_info "  - Memory Growth: ${MEMORY_GROWTH}%"

        if (( $(echo "${MEMORY_GROWTH} < ${MEMORY_GROWTH_THRESHOLD}" | bc -l) )); then
            log_success "Memory growth within threshold (<${MEMORY_GROWTH_THRESHOLD}%)"
        else
            log_error "Memory growth exceeded threshold (${MEMORY_GROWTH}% > ${MEMORY_GROWTH_THRESHOLD}%)"
        fi
    else
        log_warning "No resource usage CSV found"
    fi

    # Final summary
    log_info ""
    log_info "=============================="
    log_info "Stability Test Complete"
    log_info "=============================="
    log_info "Test Duration: ${TEST_DURATION_HOURS} hours"
    log_info "Results Directory: ${RESULTS_DIR}"
    log_info "Test Log: ${RESULTS_DIR}/test-output-${TIMESTAMP}.log"
    log_info ""

    if [ "${TEST_EXIT_CODE}" -eq 0 ]; then
        log_success "Test passed successfully"
        return 0
    else
        log_error "Test failed with exit code ${TEST_EXIT_CODE}"
        return 1
    fi
}

# Execute main function
main "$@"
