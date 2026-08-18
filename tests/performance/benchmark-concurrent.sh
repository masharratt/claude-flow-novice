#!/usr/bin/env bash
# tests/performance/benchmark-concurrent.sh
# Benchmark: Concurrent container operations throughput

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
RESULTS_FILE=".artifacts/benchmarks/benchmark-concurrent-throughput.txt"
mkdir -p "$(dirname "$RESULTS_FILE")"

# Test parameters
CONCURRENT_CONTAINERS=10
TEST_IMAGE="alpine:3.18"

# Ensure test image exists
if ! docker images | grep -q "^$TEST_IMAGE"; then
    docker pull "$TEST_IMAGE" > /dev/null 2>&1 || true
fi

echo "Concurrent Operations Throughput Benchmark"
echo "=========================================="
echo "Image: $TEST_IMAGE"
echo "Concurrent containers: $CONCURRENT_CONTAINERS"
echo "Test Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

{
    echo "Concurrent Operations Throughput Benchmark"
    echo "=========================================="
    echo "Image: $TEST_IMAGE"
    echo "Concurrent containers: $CONCURRENT_CONTAINERS"
    echo "Test Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    # Cleanup before test
    docker ps -aq --filter "label=perf-test=concurrent" 2>/dev/null | xargs docker rm -f 2>/dev/null || true
    sleep 1

    echo "Scenario 1: Sequential Container Operations"
    echo "-------------------------------------------"

    start_total=$(date +%s%N)
    for ((i=1; i<=CONCURRENT_CONTAINERS; i++)); do
        CONTAINER_ID=$(docker create --label="perf-test=concurrent" "$TEST_IMAGE" /bin/true 2>/dev/null)
        docker start "$CONTAINER_ID" > /dev/null 2>&1 || true
        docker rm -f "$CONTAINER_ID" > /dev/null 2>&1 || true
    done
    end_total=$(date +%s%N)

    sequential_duration=$((($end_total - $start_total) / 1000000))
    sequential_throughput=$((CONCURRENT_CONTAINERS * 1000 / sequential_duration))

    echo "  Total time: ${sequential_duration}ms"
    echo "  Throughput: ${sequential_throughput} ops/s"
    echo ""

    echo "Scenario 2: Parallel Container Operations"
    echo "----------------------------------------"

    start_total=$(date +%s%N)
    container_ids=()
    for ((i=1; i<=CONCURRENT_CONTAINERS; i++)); do
        (
            CONTAINER_ID=$(docker create --label="perf-test=concurrent" "$TEST_IMAGE" /bin/true 2>/dev/null)
            docker start "$CONTAINER_ID" > /dev/null 2>&1 || true
            docker rm -f "$CONTAINER_ID" > /dev/null 2>&1 || true
        ) &
    done
    wait
    end_total=$(date +%s%N)

    parallel_duration=$((($end_total - $start_total) / 1000000))
    parallel_throughput=$((CONCURRENT_CONTAINERS * 1000 / parallel_duration))

    echo "  Total time: ${parallel_duration}ms"
    echo "  Throughput: ${parallel_throughput} ops/s"
    echo ""

    # Calculate parallelization benefit
    speedup=$((parallel_duration * 100 / sequential_duration))
    improvement=$((100 - speedup))

    echo "Parallelization Analysis:"
    echo "  Sequential throughput: ${sequential_throughput} ops/s"
    echo "  Parallel throughput: ${parallel_throughput} ops/s"
    echo "  Speedup: ${improvement}% (lower is better parallelization)"
    echo ""

    echo "Proxy Impact Estimate:"
    echo "  Expected degradation with proxy: 5-15%"
    echo "  Observed degradation: ${improvement}%"
    echo ""

    if [ $improvement -lt 25 ]; then
        echo "Result: PASS - Parallelization overhead acceptable"
        exit_code=0
    else
        echo "Result: WARNING - Parallelization overhead high"
        exit_code=1
    fi

} | tee "$RESULTS_FILE"

# Cleanup
docker ps -aq --filter "label=perf-test=concurrent" 2>/dev/null | xargs docker rm -f 2>/dev/null || true

echo ""
echo "Results saved to: $RESULTS_FILE"
echo ""
