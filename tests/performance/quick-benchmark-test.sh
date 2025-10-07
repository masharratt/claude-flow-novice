#!/usr/bin/env bash
# Quick smoke test for phase1-overhead-benchmark.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=============================================="
echo "Phase 1 Benchmark Smoke Test"
echo "=============================================="

# Test with minimal configuration
export BENCHMARK_ITERATIONS=10
export SCALE_LEVELS="1 3"
export STATISTICAL_RUNS=2
export BENCHMARK_RESULTS_FILE="/dev/shm/quick-benchmark-test.jsonl"
export PERF_LOG="/dev/shm/quick-benchmark-test.log"

# Run benchmark
cd "$PROJECT_ROOT"
bash tests/performance/phase1-overhead-benchmark.sh 2>&1

# Verify results exist
if [[ -f "$BENCHMARK_RESULTS_FILE" ]]; then
    echo ""
    echo "✅ Results file created: $BENCHMARK_RESULTS_FILE"
    echo "Total results: $(wc -l < "$BENCHMARK_RESULTS_FILE")"

    # Show sample results
    echo ""
    echo "Sample results:"
    head -3 "$BENCHMARK_RESULTS_FILE" | jq -r '[.test_name, .operation, .agent_count, .elapsed_ms] | @tsv' | column -t

    # Cleanup
    rm -f "$BENCHMARK_RESULTS_FILE" "$PERF_LOG"
    echo ""
    echo "✅ Smoke test PASSED"
else
    echo "❌ Results file not found"
    exit 1
fi
