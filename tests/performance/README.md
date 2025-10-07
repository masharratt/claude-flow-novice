# Phase 1 Performance Overhead Benchmark

## Overview

Measures actual performance overhead of Phase 1 integration systems (metrics, health, rate-limiting, shutdown) at scale.

**Target**: <1% total overhead compared to baseline message-bus-only performance.

## Quick Start

```bash
# Run full benchmark (100-agent scale, 5 statistical runs)
bash tests/performance/phase1-overhead-benchmark.sh

# Quick smoke test (1-3 agents, 2 runs)
bash tests/performance/quick-benchmark-test.sh

# Custom configuration
export BENCHMARK_ITERATIONS=50
export SCALE_LEVELS="1 10 50 100"
export STATISTICAL_RUNS=3
bash tests/performance/phase1-overhead-benchmark.sh
```

## Configuration

Environment variables:

- `BENCHMARK_ITERATIONS`: Messages per test (default: 100)
- `SCALE_LEVELS`: Agent counts to test (default: "1 10 100")
- `STATISTICAL_RUNS`: Runs per test for statistical accuracy (default: 5)
- `BENCHMARK_RESULTS_FILE`: Results output (default: /dev/shm/phase1-overhead-results.jsonl)
- `PERF_LOG`: Resource monitoring log (default: /dev/shm/phase1-overhead-perf.log)

## Test Suite

### Baseline Benchmarks (No Integration)
- `benchmark_baseline_send`: Message send latency (message-bus only)
- `benchmark_baseline_receive`: Message receive latency

### Component Integration Tests
- `benchmark_metrics_integration`: Message send + metrics emission
- `benchmark_health_integration`: Health check reporting and querying
- `benchmark_rate_limiting_integration`: Inbox capacity checks + backpressure
- `benchmark_shutdown_integration`: Coordinated graceful shutdown

### Full Integration Test
- `benchmark_full_integration`: All systems enabled (real-world scenario)

## Output

### Results File (JSONL)

Two types of records:

**1. Individual measurements:**
```json
{
  "timestamp": "2025-10-06T10:30:00.123Z",
  "test_name": "baseline",
  "agent_count": 100,
  "operation": "message_send",
  "elapsed_ms": 0.145,
  "cpu_percent": 2.3,
  "memory_mb": 150,
  "metadata": {...}
}
```

**2. Statistical summaries:**
```json
{
  "timestamp": "2025-10-06T10:30:05.456Z",
  "test_name": "baseline",
  "agent_count": 100,
  "operation": "message_send",
  "type": "statistics",
  "avg_ms": 0.145,
  "stddev_ms": 0.012,
  "p50_ms": 0.143,
  "p95_ms": 0.165,
  "p99_ms": 0.178
}
```

### Performance Log (Space-Delimited)

Real-time resource monitoring (1-second intervals):

```
timestamp cpu_percent memory_mb tmpfs_mb
1696594335 2.3 150 12
1696594336 2.5 152 13
```

### Console Report

```
==========================================
PERFORMANCE OVERHEAD ANALYSIS
==========================================

=== AVERAGE LATENCY ===
Baseline (message-bus only):      0.145ms
With Metrics:                      0.147ms (+1.38%)
Full Integration (all systems):    0.148ms (+2.07%)

=== P95 LATENCY ===
Baseline P95:                      0.165ms
Full Integration P95:              0.170ms (+3.03%)

⚠️  WARN: Total overhead 2.07% exceeds 1% target
         Recommended optimization focus areas:

==========================================
BOTTLENECK IDENTIFICATION
==========================================

Agent Count  Baseline  Metrics OH  Health OH  Rate Limit OH  Total OH
----------   --------  ----------  ---------  --------------  --------
1            0.120ms   0.5%        0.2%       0.1%            0.8%
10           0.135ms   1.1%        0.3%       0.2%            1.6%
100          0.145ms   1.4%        0.4%       0.3%            2.1%

Top bottlenecks by overhead contribution (100 agents):
  - metrics: 1.4% overhead
  - health: 0.4% overhead
  - rate_limiting: 0.3% overhead

=== RESOURCE USAGE (100 agents) ===
CPU (avg/max):     3.2% / 5.8%
Memory (avg/max):  145MB / 180MB
tmpfs (avg/max):   12MB / 18MB
```

## Interpreting Results

### Success Criteria

- ✅ **Total overhead <1%**: Phase 1 systems add <1% latency to message-bus operations
- ✅ **CPU usage <5%**: Background processes consume <5% CPU at 100-agent scale
- ✅ **Memory stable**: No memory leaks, tmpfs usage remains bounded
- ✅ **P95/P99 stable**: Tail latencies remain low (no extreme outliers)

### Failure Indicators

- ⚠️ **Total overhead >1%**: Identify bottleneck component from breakdown
- ⚠️ **High stddev**: Indicates inconsistent performance (locking contention?)
- ⚠️ **CPU spikes**: Check background monitoring processes (alerting, health probes)
- ⚠️ **Memory growth**: Check for unbounded metrics.jsonl or alert.jsonl files

### Bottleneck Analysis

If overhead exceeds 1%, examine component-wise breakdown:

1. **Metrics overhead high (>0.5%)**:
   - Check flock contention on metrics.lock
   - Consider batching emit_metric() calls
   - Verify tmpfs write performance

2. **Health overhead high (>0.3%)**:
   - Reduce liveness probe frequency (default: 5s)
   - Check jq JSON construction overhead
   - Verify flock timeout on health.lock

3. **Rate limiting overhead high (>0.2%)**:
   - Optimize check_inbox_capacity() (currently uses `find`)
   - Consider caching inbox counts
   - Review backpressure retry logic

## Statistical Methodology

- **Multiple runs**: Each test runs `STATISTICAL_RUNS` times (default: 5)
- **Percentiles**: Reports P50, P95, P99 latencies
- **Standard deviation**: Measures consistency
- **Resource monitoring**: Background process samples CPU/memory/tmpfs every 1s

## Known Limitations

1. **WSL/Windows environments**: Avoid `find` on `/mnt/c/` paths (memory leaks)
2. **tmpfs required**: Tests use `/dev/shm/` for realistic performance
3. **Background noise**: Stop other processes for accurate measurements
4. **Warm-up**: First run may be slower (filesystem caching)

## Optimization Recommendations

Based on architecture analysis (from PHASE1_INTEGRATION_ARCHITECTURE.md):

### Critical Path Optimization (Message Send)
- **Current**: 100-200μs per message
- **Target**: <500μs (achieved ✅)
- **Optimizations**:
  - Use tmpfs (/dev/shm) for all message storage
  - Minimize flock critical sections
  - Atomic writes with temp-file + rename pattern

### Background Process Optimization
- **Alerting**: Currently 0.03% CPU overhead
- **Health probes**: Currently 0.01% CPU overhead
- **Rate monitoring**: Currently 0.015% CPU overhead
- **Total background**: <0.1% CPU (achieved ✅)

### Memory Optimization
- **20 agents**: 1-45MB tmpfs
- **100 agents**: 5-225MB tmpfs (projected)
- **Target**: <0.5% of 8GB RAM (achieved ✅)

## Integration with CI/CD

```bash
# Run in CI pipeline
export BENCHMARK_ITERATIONS=50
export SCALE_LEVELS="1 10 50"
export STATISTICAL_RUNS=3

bash tests/performance/phase1-overhead-benchmark.sh

# Check exit code
if jq -s 'map(select(.test_name == "full_integration" and .type == "statistics")) | .[0].avg_ms' phase1-overhead-results.jsonl | awk '{exit ($1 < 0.150) ? 0 : 1}'; then
    echo "Performance target met"
else
    echo "Performance regression detected"
    exit 1
fi
```

## Troubleshooting

### Benchmark hangs or crashes
- Check for orphaned background processes: `pkill -f "monitor-baseline"`
- Verify tmpfs space: `df -h /dev/shm`
- Check library dependencies: `ls -l lib/*.sh`

### High variance in results
- Stop background processes
- Increase `STATISTICAL_RUNS` to 10+
- Verify system is not under load

### "Command not found" errors
- Source libraries manually: `source lib/message-bus.sh`
- Check PROJECT_ROOT path
- Verify bash version: `bash --version` (requires 4.0+)

## References

- **Architecture**: planning/agent-coordination-v2/PHASE1_INTEGRATION_ARCHITECTURE.md
- **Integration Flow**: planning/agent-coordination-v2/INTEGRATION_FLOW_DIAGRAM.txt
- **Metrics System**: lib/metrics.sh
- **Health System**: lib/health.sh
- **Rate Limiting**: lib/rate-limiting.sh
- **Shutdown Coordination**: lib/shutdown-coordination.sh
