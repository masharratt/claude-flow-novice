#!/usr/bin/env bash
# tests/performance/run-all-benchmarks.sh
# Socket Proxy Performance Benchmark Suite
# Measures overhead of Docker socket proxy vs direct socket access

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
RESULTS_DIR=".artifacts/benchmarks"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Run a single benchmark
run_benchmark() {
    local benchmark_name="$1"
    local benchmark_script="$2"

    log_info "Running: $benchmark_name"

    if [ ! -f "$benchmark_script" ]; then
        log_error "Benchmark script not found: $benchmark_script"
        return 1
    fi

    bash "$benchmark_script"
}

echo ""
echo "==============================================="
echo "  Socket Proxy Performance Benchmark Suite"
echo "==============================================="
echo ""

# Main benchmarks
BENCHMARKS=(
    "Container Create Latency,tests/performance/benchmark-container-create.sh"
    "Container Start Latency,tests/performance/benchmark-container-start.sh"
    "Container Remove Latency,tests/performance/benchmark-container-remove.sh"
    "Concurrent Operations,tests/performance/benchmark-concurrent.sh"
    "Socket Overhead Analysis,tests/performance/benchmark-socket-overhead.sh"
)

PASSED=0
FAILED=0

for benchmark in "${BENCHMARKS[@]}"; do
    IFS=',' read -r name script <<< "$benchmark"

    if run_benchmark "$name" "$script"; then
        ((PASSED++))
    else
        ((FAILED++))
    fi

    echo ""
done

# Summary
echo "==============================================="
echo "  Benchmark Execution Summary"
echo "==============================================="
echo ""
log_success "Passed: $PASSED"

if [ $FAILED -gt 0 ]; then
    log_warning "Failed: $FAILED"
fi

echo ""
echo "Results saved to: $RESULTS_DIR"
echo ""

# Overall status
if [ $FAILED -eq 0 ]; then
    log_success "All benchmarks completed successfully"
    exit 0
else
    log_warning "$FAILED benchmarks had issues"
    exit 1
fi
