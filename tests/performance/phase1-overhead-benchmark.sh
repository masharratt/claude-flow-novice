#!/usr/bin/env bash
# Phase 1 Performance Overhead Benchmark Suite
# Measures actual performance impact of integrated systems
#
# USAGE:
#   ./phase1-overhead-benchmark.sh
#
# CONFIGURATION (environment variables):
#   SCALE_LEVELS="1 10 50"              # Agent counts to test (default: 1 10 50)
#   BENCHMARK_ITERATIONS=100            # Iterations per benchmark (default: 100)
#   STATISTICAL_RUNS=5                  # Runs for statistical accuracy (default: 5)
#   BENCHMARK_TIMEOUT=300               # Global timeout in seconds (default: 300s = 5min)
#   LATENCY_REGRESSION_THRESHOLD=1000   # Max latency before early exit (default: 1000ms)
#
# EXPECTED EXECUTION TIME:
#   - 1 agent:  ~30 seconds
#   - 10 agents: ~2 minutes
#   - 50 agents: ~4 minutes
#   - Total: <5 minutes (with timeout protection)
#
# FEATURES:
#   - Progress logging every 10 agents and 25 iterations
#   - Automatic timeout after 5 minutes (configurable)
#   - Early exit on performance regression (>1s latency)
#   - Graceful handling of partial results
#   - Signal handling (Ctrl+C) with cleanup

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source system libraries
source "$PROJECT_ROOT/lib/message-bus.sh" 2>/dev/null || true
source "$PROJECT_ROOT/lib/metrics.sh" 2>/dev/null || true
source "$PROJECT_ROOT/lib/health.sh" 2>/dev/null || true
source "$PROJECT_ROOT/lib/rate-limiting.sh" 2>/dev/null || true
source "$PROJECT_ROOT/lib/shutdown-coordination.sh" 2>/dev/null || true

# Benchmark configuration
BENCHMARK_RESULTS_FILE="${BENCHMARK_RESULTS_FILE:-/dev/shm/phase1-overhead-results.jsonl}"
BENCHMARK_ITERATIONS="${BENCHMARK_ITERATIONS:-100}"
SCALE_LEVELS="${SCALE_LEVELS:-1 10 50}"  # Reduced from 100 to 50 for faster execution
STATISTICAL_RUNS="${STATISTICAL_RUNS:-5}"
BENCHMARK_TIMEOUT="${BENCHMARK_TIMEOUT:-300}"  # 5-minute global timeout
LATENCY_REGRESSION_THRESHOLD="${LATENCY_REGRESSION_THRESHOLD:-1000}"  # 1s = performance regression

# Clean results file
> "$BENCHMARK_RESULTS_FILE"

# Performance tracking
PERF_LOG="${PERF_LOG:-/dev/shm/phase1-overhead-perf.log}"
> "$PERF_LOG"

# Global state
BENCHMARK_START_TIME=""
BENCHMARK_INTERRUPTED="false"

# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================

# Check if benchmark has exceeded timeout
check_benchmark_timeout() {
    if [[ -z "$BENCHMARK_START_TIME" ]]; then
        return 0  # No timeout set
    fi

    local current_time=$(date +%s)
    local elapsed=$((current_time - BENCHMARK_START_TIME))

    if [[ $elapsed -ge $BENCHMARK_TIMEOUT ]]; then
        echo "⚠️  TIMEOUT: Benchmark exceeded ${BENCHMARK_TIMEOUT}s limit (${elapsed}s elapsed)"
        BENCHMARK_INTERRUPTED="true"
        return 1
    fi

    return 0
}

# Progress logging helper
log_progress() {
    local message="$1"
    local timestamp=$(date +"%H:%M:%S")
    echo "[$timestamp] $message"
}

# Early exit check for performance regression
check_performance_regression() {
    local latency_ms="$1"
    local operation="$2"

    # Convert to integer for comparison
    local latency_int=$(printf "%.0f" "$latency_ms")

    if [[ $latency_int -ge $LATENCY_REGRESSION_THRESHOLD ]]; then
        echo "⚠️  PERFORMANCE REGRESSION: $operation latency ${latency_ms}ms exceeds ${LATENCY_REGRESSION_THRESHOLD}ms threshold"
        return 1
    fi

    return 0
}

# High-precision timing
benchmark_start() {
    date +%s%N  # Nanoseconds
}

benchmark_end() {
    local start_ns="$1"
    local end_ns=$(date +%s%N)
    local elapsed_ns=$((end_ns - start_ns))
    local elapsed_ms=$(awk "BEGIN {printf \"%.3f\", $elapsed_ns / 1000000}")
    echo "$elapsed_ms"
}

# CPU/memory measurement
get_cpu_percent() {
    top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1
}

get_memory_mb() {
    free -m | awk 'NR==2{print $3}'
}

get_tmpfs_usage_mb() {
    df -m /dev/shm | awk 'NR==2{print $3}'
}

# Statistical analysis helpers
calculate_percentile() {
    local percentile="$1"
    shift
    local values=("$@")

    printf '%s\n' "${values[@]}" | sort -n | awk -v p="$percentile" '
    {
        a[NR] = $0
    }
    END {
        idx = int((NR + 1) * p / 100)
        if (idx < 1) idx = 1
        if (idx > NR) idx = NR
        print a[idx]
    }'
}

calculate_average() {
    local values=("$@")
    local sum=0
    local count=${#values[@]}

    for val in "${values[@]}"; do
        sum=$(awk "BEGIN {printf \"%.3f\", $sum + $val}")
    done

    awk "BEGIN {printf \"%.3f\", $sum / $count}"
}

calculate_stddev() {
    local values=("$@")
    local count=${#values[@]}
    local avg=$(calculate_average "${values[@]}")
    local variance=0

    for val in "${values[@]}"; do
        local diff=$(awk "BEGIN {printf \"%.3f\", $val - $avg}")
        variance=$(awk "BEGIN {printf \"%.6f\", $variance + ($diff * $diff)}")
    done

    variance=$(awk "BEGIN {printf \"%.6f\", $variance / $count}")
    awk "BEGIN {printf \"%.3f\", sqrt($variance)}"
}

# Record benchmark result with statistics
record_result() {
    local test_name="$1"
    local agent_count="$2"
    local operation="$3"
    local elapsed_ms="$4"
    local cpu_percent="${5:-0}"
    local memory_mb="${6:-0}"
    local metadata="${7:-{}}"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

    # Build JSON result
    local result=$(jq -n \
        --arg ts "$timestamp" \
        --arg test "$test_name" \
        --arg agents "$agent_count" \
        --arg op "$operation" \
        --arg elapsed "$elapsed_ms" \
        --arg cpu "$cpu_percent" \
        --arg mem "$memory_mb" \
        --argjson meta "$metadata" \
        '{
            timestamp: $ts,
            test_name: $test,
            agent_count: ($agents|tonumber),
            operation: $op,
            elapsed_ms: ($elapsed|tonumber),
            cpu_percent: ($cpu|tonumber),
            memory_mb: ($mem|tonumber),
            metadata: $meta
        }')

    echo "$result" >> "$BENCHMARK_RESULTS_FILE"
    echo "$result" | jq -c '.'
}

# Record statistical summary
record_stats_summary() {
    local test_name="$1"
    local agent_count="$2"
    local operation="$3"
    shift 3
    local values=("$@")

    local avg=$(calculate_average "${values[@]}")
    local stddev=$(calculate_stddev "${values[@]}")
    local p50=$(calculate_percentile 50 "${values[@]}")
    local p95=$(calculate_percentile 95 "${values[@]}")
    local p99=$(calculate_percentile 99 "${values[@]}")

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

    local result=$(jq -n \
        --arg ts "$timestamp" \
        --arg test "$test_name" \
        --arg agents "$agent_count" \
        --arg op "$operation" \
        --arg avg "$avg" \
        --arg stddev "$stddev" \
        --arg p50 "$p50" \
        --arg p95 "$p95" \
        --arg p99 "$p99" \
        '{
            timestamp: $ts,
            test_name: $test,
            agent_count: ($agents|tonumber),
            operation: $op,
            type: "statistics",
            avg_ms: ($avg|tonumber),
            stddev_ms: ($stddev|tonumber),
            p50_ms: ($p50|tonumber),
            p95_ms: ($p95|tonumber),
            p99_ms: ($p99|tonumber)
        }')

    echo "$result" >> "$BENCHMARK_RESULTS_FILE"
    echo "[STATS] $operation: avg=${avg}ms, p50=${p50}ms, p95=${p95}ms, p99=${p99}ms, stddev=${stddev}ms"
}

# Background resource monitor
start_resource_monitor() {
    local monitor_pid_file="$1"
    local interval="${2:-1}"

    (
        while true; do
            local cpu=$(get_cpu_percent)
            local mem=$(get_memory_mb)
            local tmpfs=$(get_tmpfs_usage_mb)
            local timestamp=$(date +%s)

            echo "$timestamp $cpu $mem $tmpfs" >> "$PERF_LOG"
            sleep "$interval"
        done
    ) &

    echo $! > "$monitor_pid_file"
}

stop_resource_monitor() {
    local monitor_pid_file="$1"

    if [[ -f "$monitor_pid_file" ]]; then
        local pid=$(cat "$monitor_pid_file")
        kill "$pid" 2>/dev/null || true
        rm -f "$monitor_pid_file"
    fi
}

analyze_resource_usage() {
    local start_time="$1"
    local end_time="$2"

    awk -v start="$start_time" -v end="$end_time" '
    $1 >= start && $1 <= end {
        cpu_sum += $2
        mem_sum += $3
        tmpfs_sum += $4
        count++
        if ($2 > cpu_max) cpu_max = $2
        if ($3 > mem_max) mem_max = $3
        if ($4 > tmpfs_max) tmpfs_max = $4
    }
    END {
        if (count > 0) {
            printf "{\"avg_cpu\":%.2f,\"max_cpu\":%.2f,\"avg_mem\":%.0f,\"max_mem\":%.0f,\"avg_tmpfs\":%.0f,\"max_tmpfs\":%.0f}\n",
                cpu_sum/count, cpu_max, mem_sum/count, mem_max, tmpfs_sum/count, tmpfs_max
        } else {
            print "{}"
        }
    }' "$PERF_LOG"
}

# ==============================================================================
# BASELINE BENCHMARKS (Message Bus Only)
# ==============================================================================

benchmark_baseline_send() {
    local agent_count="$1"
    local iterations="$2"

    log_progress "Baseline: Message send ($agent_count agents, $iterations iterations)"

    # Check timeout before starting
    check_benchmark_timeout || return 1

    # Setup agents
    local agents=()
    for ((i=1; i<=agent_count; i++)); do
        local agent_id="baseline-agent-$i"
        init_message_bus "$agent_id" &>/dev/null
        agents+=("$agent_id")

        # Progress logging every 10 agents
        if [[ $((i % 10)) -eq 0 ]]; then
            log_progress "  Initialized $i/$agent_count agents"
        fi
    done

    # Start resource monitoring
    local monitor_pid_file="/tmp/monitor-baseline-$$"
    start_resource_monitor "$monitor_pid_file" 1

    # Multiple runs for statistical accuracy
    local latencies=()
    for ((run=1; run<=STATISTICAL_RUNS; run++)); do
        # Check timeout between runs
        check_benchmark_timeout || break

        log_progress "  Run $run/$STATISTICAL_RUNS ($iterations iterations)"
        local run_start=$(benchmark_start)

        for ((i=0; i<iterations; i++)); do
            local from="${agents[$((i % agent_count))]}"
            local to="${agents[$(((i + 1) % agent_count))]}"
            send_message "$from" "$to" "benchmark_msg" '{"iteration":'$i'}' &>/dev/null

            # Progress every 25 iterations for large-scale tests
            if [[ $agent_count -ge 25 ]] && [[ $((i % 25)) -eq 0 ]] && [[ $i -gt 0 ]]; then
                log_progress "    Iteration $i/$iterations"
            fi
        done

        local run_elapsed=$(benchmark_end "$run_start")
        local run_avg=$(awk "BEGIN {printf \"%.3f\", $run_elapsed / $iterations}")
        latencies+=("$run_avg")

        log_progress "  Run $run complete: avg ${run_avg}ms per message"

        # Early exit on performance regression
        if ! check_performance_regression "$run_avg" "baseline_send"; then
            echo "  Stopping benchmark due to performance regression"
            break
        fi
    done

    # Stop monitoring and analyze
    stop_resource_monitor "$monitor_pid_file"
    local start_epoch=$(($(date +%s) - (STATISTICAL_RUNS * iterations / 10)))
    local end_epoch=$(date +%s)
    local resource_stats=$(analyze_resource_usage "$start_epoch" "$end_epoch")

    # Record statistical summary
    record_stats_summary "baseline" "$agent_count" "message_send" "${latencies[@]}"

    # Record detailed result with resource usage
    local avg_latency=$(calculate_average "${latencies[@]}")
    record_result "baseline" "$agent_count" "message_send_detail" "$avg_latency" "0" "0" \
        "{\"iterations\":$iterations,\"runs\":$STATISTICAL_RUNS,\"resource_stats\":$resource_stats}"

    # Cleanup
    for agent_id in "${agents[@]}"; do
        cleanup_message_bus "$agent_id" &>/dev/null
    done

    local p95=$(calculate_percentile 95 "${latencies[@]}")
    echo "  Avg latency: ${avg_latency}ms, P95: ${p95}ms"
}

benchmark_baseline_receive() {
    local agent_count="$1"
    local iterations="$2"

    echo "[BENCHMARK] Baseline: Message receive ($agent_count agents, $iterations messages)"

    # Setup agents and send messages
    local agents=()
    for ((i=1; i<=agent_count; i++)); do
        local agent_id="baseline-recv-agent-$i"
        init_message_bus "$agent_id" &>/dev/null
        agents+=("$agent_id")
    done

    # Pre-populate inboxes
    for ((i=0; i<iterations; i++)); do
        local from="${agents[0]}"
        local to="${agents[$(((i % (agent_count - 1)) + 1))]}"
        send_message "$from" "$to" "test_msg" '{"data":"test"}' &>/dev/null
    done

    # Measure receive performance
    local start_time=$(benchmark_start)

    for agent_id in "${agents[@]:1}"; do
        receive_messages "$agent_id" &>/dev/null
    done

    local elapsed=$(benchmark_end "$start_time")
    local avg_latency=$(awk "BEGIN {printf \"%.3f\", $elapsed / (($agent_count - 1) * ($iterations / ($agent_count - 1)))}")

    record_result "baseline" "$agent_count" "message_receive" "$avg_latency" "0" "0" \
        "{\"iterations\":$iterations,\"total_ms\":$elapsed}"

    # Cleanup
    for agent_id in "${agents[@]}"; do
        cleanup_message_bus "$agent_id" &>/dev/null
    done

    echo "  Avg latency: ${avg_latency}ms"
}

# ==============================================================================
# METRICS INTEGRATION OVERHEAD
# ==============================================================================

benchmark_metrics_integration() {
    local agent_count="$1"
    local iterations="$2"

    echo "[BENCHMARK] Metrics Integration: Message send with metrics ($agent_count agents, $iterations iterations)"

    # Setup agents
    local agents=()
    for ((i=1; i<=agent_count; i++)); do
        local agent_id="metrics-agent-$i"
        init_message_bus "$agent_id" &>/dev/null
        agents+=("$agent_id")
    done

    # Clear metrics file
    > "$METRICS_FILE"

    # Measure send with metrics emission
    local start_cpu=$(get_cpu_percent)
    local start_mem=$(get_memory_mb)
    local start_time=$(benchmark_start)

    for ((i=0; i<iterations; i++)); do
        local from="${agents[$((i % agent_count))]}"
        local to="${agents[$(((i + 1) % agent_count))]}"

        # Send with metric emission (simulating integration)
        send_message "$from" "$to" "benchmark_msg" '{"iteration":'$i'}' &>/dev/null
        emit_metric "coordination.messages" "1" "count" "{\"from\":\"$from\",\"to\":\"$to\"}" 2>/dev/null
    done

    local elapsed=$(benchmark_end "$start_time")
    local end_cpu=$(get_cpu_percent)
    local end_mem=$(get_memory_mb)

    local avg_latency=$(awk "BEGIN {printf \"%.3f\", $elapsed / $iterations}")
    local cpu_delta=$(awk "BEGIN {printf \"%.2f\", $end_cpu - $start_cpu}")
    local mem_delta=$((end_mem - start_mem))

    # Calculate metrics file size
    local metrics_size_kb=$(du -k "$METRICS_FILE" | cut -f1)

    record_result "metrics_integration" "$agent_count" "message_send_with_metrics" "$avg_latency" "$cpu_delta" "$mem_delta" \
        "{\"iterations\":$iterations,\"total_ms\":$elapsed,\"metrics_file_kb\":$metrics_size_kb}"

    # Cleanup
    for agent_id in "${agents[@]}"; do
        cleanup_message_bus "$agent_id" &>/dev/null
    done

    echo "  Avg latency: ${avg_latency}ms, CPU delta: ${cpu_delta}%, Mem delta: ${mem_delta}MB, Metrics: ${metrics_size_kb}KB"
}

# ==============================================================================
# HEALTH CHECK INTEGRATION OVERHEAD
# ==============================================================================

benchmark_health_integration() {
    local agent_count="$1"
    local iterations="$2"

    echo "[BENCHMARK] Health Integration: Health check propagation ($agent_count agents, $iterations checks)"

    # Setup agents
    local agents=()
    for ((i=1; i<=agent_count; i++)); do
        local agent_id="health-agent-$i"
        init_message_bus "$agent_id" &>/dev/null
        agents+=("$agent_id")
    done

    # Measure health check performance
    local start_time=$(benchmark_start)

    for ((i=0; i<iterations; i++)); do
        for agent_id in "${agents[@]}"; do
            report_health "$agent_id" "healthy" '{"benchmark":true}' 2>/dev/null
        done
    done

    local elapsed=$(benchmark_end "$start_time")
    local total_checks=$((agent_count * iterations))
    local avg_latency=$(awk "BEGIN {printf \"%.3f\", $elapsed / $total_checks}")

    # Measure health check read performance
    local check_start=$(benchmark_start)
    for agent_id in "${agents[@]}"; do
        check_agent_health "$agent_id" &>/dev/null
    done
    local check_elapsed=$(benchmark_end "$check_start")
    local avg_check_latency=$(awk "BEGIN {printf \"%.3f\", $check_elapsed / $agent_count}")

    record_result "health_integration" "$agent_count" "health_report" "$avg_latency" "0" "0" \
        "{\"iterations\":$iterations,\"total_checks\":$total_checks}"

    record_result "health_integration" "$agent_count" "health_check" "$avg_check_latency" "0" "0" \
        "{\"agents_checked\":$agent_count}"

    # Cleanup
    for agent_id in "${agents[@]}"; do
        cleanup_message_bus "$agent_id" &>/dev/null
        rm -rf "$HEALTH_DIR/$agent_id" 2>/dev/null || true
    done

    echo "  Health report latency: ${avg_latency}ms, Health check latency: ${avg_check_latency}ms"
}

# ==============================================================================
# RATE LIMITING INTEGRATION OVERHEAD
# ==============================================================================

benchmark_rate_limiting_integration() {
    local agent_count="$1"
    local iterations="$2"

    echo "[BENCHMARK] Rate Limiting: Inbox capacity checks ($agent_count agents, $iterations checks)"

    # Setup agents
    local agents=()
    for ((i=1; i<=agent_count; i++)); do
        local agent_id="ratelimit-agent-$i"
        init_message_bus "$agent_id" &>/dev/null
        agents+=("$agent_id")
    done

    # Measure capacity check overhead
    local start_time=$(benchmark_start)

    for ((i=0; i<iterations; i++)); do
        for agent_id in "${agents[@]}"; do
            check_inbox_capacity "$agent_id" &>/dev/null || true
        done
    done

    local elapsed=$(benchmark_end "$start_time")
    local total_checks=$((agent_count * iterations))
    local avg_latency=$(awk "BEGIN {printf \"%.3f\", $elapsed / $total_checks}")

    # Measure send with backpressure
    local bp_start=$(benchmark_start)
    for ((i=0; i<10; i++)); do
        local from="${agents[0]}"
        local to="${agents[1]}"
        send_with_backpressure "$from" "$to" "test" '{"data":"test"}' &>/dev/null || true
    done
    local bp_elapsed=$(benchmark_end "$bp_start")
    local bp_avg_latency=$(awk "BEGIN {printf \"%.3f\", $bp_elapsed / 10}")

    record_result "rate_limiting_integration" "$agent_count" "capacity_check" "$avg_latency" "0" "0" \
        "{\"iterations\":$iterations,\"total_checks\":$total_checks}"

    record_result "rate_limiting_integration" "$agent_count" "send_with_backpressure" "$bp_avg_latency" "0" "0" \
        "{\"iterations\":10}"

    # Cleanup
    for agent_id in "${agents[@]}"; do
        cleanup_message_bus "$agent_id" &>/dev/null
    done

    echo "  Capacity check latency: ${avg_latency}ms, Backpressure send latency: ${bp_avg_latency}ms"
}

# ==============================================================================
# SHUTDOWN COORDINATION OVERHEAD
# ==============================================================================

benchmark_shutdown_integration() {
    local agent_count="$1"

    echo "[BENCHMARK] Shutdown Integration: Coordinated shutdown ($agent_count agents)"

    # Setup agents
    local agents=()
    for ((i=1; i<=agent_count; i++)); do
        local agent_id="shutdown-agent-$i"
        init_message_bus "$agent_id" &>/dev/null
        agents+=("$agent_id")
    done

    # Send some messages to create shutdown workload
    for ((i=0; i<10; i++)); do
        local from="${agents[0]}"
        local to="${agents[$((i % agent_count))]}"
        send_message "$from" "$to" "test" '{"data":"test"}' &>/dev/null
    done

    # Measure coordinated shutdown time
    local start_time=$(benchmark_start)

    for agent_id in "${agents[@]}"; do
        shutdown_with_coordination "$agent_id" 10 &>/dev/null
    done

    local elapsed=$(benchmark_end "$start_time")
    local avg_shutdown=$(awk "BEGIN {printf \"%.3f\", $elapsed / $agent_count}")

    record_result "shutdown_integration" "$agent_count" "coordinated_shutdown" "$avg_shutdown" "0" "0" \
        "{\"total_agents\":$agent_count,\"total_ms\":$elapsed}"

    echo "  Avg shutdown time: ${avg_shutdown}ms"
}

# ==============================================================================
# TOTAL SYSTEM OVERHEAD
# ==============================================================================

benchmark_full_integration() {
    local agent_count="$1"
    local iterations="$2"

    log_progress "Full Integration: All systems enabled ($agent_count agents, $iterations iterations)"

    # Check timeout before starting
    check_benchmark_timeout || return 1

    # Setup agents with all systems
    local agents=()
    for ((i=1; i<=agent_count; i++)); do
        local agent_id="full-agent-$i"
        init_message_bus "$agent_id" &>/dev/null
        report_health "$agent_id" "healthy" "{}" 2>/dev/null
        agents+=("$agent_id")

        # Progress logging every 10 agents
        if [[ $((i % 10)) -eq 0 ]]; then
            log_progress "  Initialized $i/$agent_count agents"
        fi
    done

    # Clear metrics
    > "$METRICS_FILE"

    # Start resource monitoring
    local monitor_pid_file="/tmp/monitor-full-$$"
    start_resource_monitor "$monitor_pid_file" 1

    # Multiple runs for statistical accuracy
    local latencies=()
    for ((run=1; run<=STATISTICAL_RUNS; run++)); do
        # Check timeout between runs
        check_benchmark_timeout || break

        log_progress "  Run $run/$STATISTICAL_RUNS ($iterations iterations with all systems)"
        local run_start=$(benchmark_start)
        local start_epoch=$(date +%s)

        for ((i=0; i<iterations; i++)); do
            local from="${agents[$((i % agent_count))]}"
            local to="${agents[$(((i + 1) % agent_count))]}"

            # Check capacity (rate limiting)
            check_inbox_capacity "$to" &>/dev/null || true

            # Send message
            send_message "$from" "$to" "benchmark" '{"iteration":'$i'}' &>/dev/null

            # Emit metrics
            emit_metric "coordination.messages" "1" "count" "{\"from\":\"$from\"}" 2>/dev/null

            # Update health (every 10 iterations)
            if [[ $((i % 10)) -eq 0 ]]; then
                report_health "$from" "healthy" "{}" 2>/dev/null
            fi

            # Progress every 25 iterations for large-scale tests
            if [[ $agent_count -ge 25 ]] && [[ $((i % 25)) -eq 0 ]] && [[ $i -gt 0 ]]; then
                log_progress "    Iteration $i/$iterations"
            fi
        done

        local run_elapsed=$(benchmark_end "$run_start")
        local run_avg=$(awk "BEGIN {printf \"%.3f\", $run_elapsed / $iterations}")
        latencies+=("$run_avg")

        log_progress "  Run $run complete: avg ${run_avg}ms per operation"

        # Early exit on performance regression
        if ! check_performance_regression "$run_avg" "full_integration"; then
            echo "  Stopping benchmark due to performance regression"
            break
        fi
    done

    # Stop monitoring and analyze
    stop_resource_monitor "$monitor_pid_file"
    local end_epoch=$(date +%s)
    local start_epoch=$((end_epoch - (STATISTICAL_RUNS * iterations / 10)))
    local resource_stats=$(analyze_resource_usage "$start_epoch" "$end_epoch")

    # Record statistical summary
    record_stats_summary "full_integration" "$agent_count" "complete_operation" "${latencies[@]}"

    # Record detailed result with resource usage
    local avg_latency=$(calculate_average "${latencies[@]}")
    record_result "full_integration" "$agent_count" "complete_operation_detail" "$avg_latency" "0" "0" \
        "{\"iterations\":$iterations,\"runs\":$STATISTICAL_RUNS,\"resource_stats\":$resource_stats}"

    # Coordinated shutdown
    local shutdown_start=$(benchmark_start)
    for agent_id in "${agents[@]}"; do
        shutdown_with_coordination "$agent_id" 10 &>/dev/null
    done
    local shutdown_elapsed=$(benchmark_end "$shutdown_start")

    record_result "full_integration" "$agent_count" "shutdown" "$shutdown_elapsed" "0" "0" \
        "{\"total_agents\":$agent_count}"

    local p95=$(calculate_percentile 95 "${latencies[@]}")
    echo "  Avg operation latency: ${avg_latency}ms, P95: ${p95}ms"
    echo "  Shutdown time: ${shutdown_elapsed}ms"
}

# ==============================================================================
# OVERHEAD CALCULATION
# ==============================================================================

identify_bottlenecks() {
    echo ""
    echo "=========================================="
    echo "BOTTLENECK IDENTIFICATION"
    echo "=========================================="

    # Analyze component-wise overhead contribution
    jq -s '
    group_by(.agent_count) | map({
        agent_count: .[0].agent_count,
        baseline: (map(select(.test_name == "baseline" and .type == "statistics")) | .[0].avg_ms // 0),
        metrics: (map(select(.test_name == "metrics_integration" and .type == "statistics")) | .[0].avg_ms // 0),
        health: (map(select(.test_name == "health_integration" and .operation == "health_report")) | .[0].elapsed_ms // 0),
        rate_limiting: (map(select(.test_name == "rate_limiting_integration" and .operation == "capacity_check")) | .[0].elapsed_ms // 0),
        full: (map(select(.test_name == "full_integration" and .type == "statistics")) | .[0].avg_ms // 0)
    }) | map({
        agent_count,
        baseline,
        metrics_overhead: ((metrics - baseline) / baseline * 100),
        health_overhead: (health / baseline * 100),
        rate_limiting_overhead: (rate_limiting / baseline * 100),
        total_overhead: ((full - baseline) / baseline * 100)
    })' "$BENCHMARK_RESULTS_FILE" | jq -r '
    def format: if . == 0 then "N/A" else (. | tostring + "%") end;
    ["Agent Count", "Baseline", "Metrics OH", "Health OH", "Rate Limit OH", "Total OH"],
    ["----------", "--------", "----------", "---------", "--------------", "--------"],
    (.[] | [
        .agent_count,
        (.baseline | tostring + "ms"),
        (.metrics_overhead | format),
        (.health_overhead | format),
        (.rate_limiting_overhead | format),
        (.total_overhead | format)
    ]) | @tsv' | column -t

    echo ""
    echo "Top bottlenecks by overhead contribution:"
    jq -s '
    group_by(.agent_count) | map({
        agent_count: .[0].agent_count,
        baseline: (map(select(.test_name == "baseline" and .type == "statistics")) | .[0].avg_ms // 0),
        components: {
            metrics: (map(select(.test_name == "metrics_integration" and .type == "statistics")) | .[0].avg_ms // 0),
            health: (map(select(.test_name == "health_integration" and .operation == "health_report")) | .[0].elapsed_ms // 0),
            rate_limiting: (map(select(.test_name == "rate_limiting_integration" and .operation == "capacity_check")) | .[0].elapsed_ms // 0)
        }
    }) | .[] | select(.agent_count == 100) |
    {
        metrics: ((.components.metrics - .baseline) / .baseline * 100),
        health: (.components.health / .baseline * 100),
        rate_limiting: (.components.rate_limiting / .baseline * 100)
    } | to_entries | sort_by(.value) | reverse | .[] |
    "  - \(.key): \(.value | tostring)% overhead"
    ' "$BENCHMARK_RESULTS_FILE"
}

calculate_overhead() {
    echo ""
    echo "=========================================="
    echo "PERFORMANCE OVERHEAD ANALYSIS"
    echo "=========================================="

    # Process results with jq - use statistics type for accurate averages
    local baseline_latency=$(jq -s 'map(select(.test_name == "baseline" and .type == "statistics")) | map(.avg_ms) | add / length' "$BENCHMARK_RESULTS_FILE")
    local metrics_latency=$(jq -s 'map(select(.test_name == "metrics_integration" and .type == "statistics")) | map(.avg_ms) | add / length' "$BENCHMARK_RESULTS_FILE")
    local full_latency=$(jq -s 'map(select(.test_name == "full_integration" and .type == "statistics")) | map(.avg_ms) | add / length' "$BENCHMARK_RESULTS_FILE")

    # Get percentiles for baseline and full
    local baseline_p95=$(jq -s 'map(select(.test_name == "baseline" and .type == "statistics")) | map(.p95_ms) | add / length' "$BENCHMARK_RESULTS_FILE")
    local full_p95=$(jq -s 'map(select(.test_name == "full_integration" and .type == "statistics")) | map(.p95_ms) | add / length' "$BENCHMARK_RESULTS_FILE")

    # Calculate overhead percentages
    local metrics_overhead=$(awk "BEGIN {printf \"%.2f\", (($metrics_latency - $baseline_latency) / $baseline_latency) * 100}")
    local total_overhead=$(awk "BEGIN {printf \"%.2f\", (($full_latency - $baseline_latency) / $baseline_latency) * 100}")
    local p95_overhead=$(awk "BEGIN {printf \"%.2f\", (($full_p95 - $baseline_p95) / $baseline_p95) * 100}")

    echo ""
    echo "=== AVERAGE LATENCY ==="
    echo "Baseline (message-bus only):      ${baseline_latency}ms"
    echo "With Metrics:                     ${metrics_latency}ms (+${metrics_overhead}%)"
    echo "Full Integration (all systems):   ${full_latency}ms (+${total_overhead}%)"
    echo ""
    echo "=== P95 LATENCY ==="
    echo "Baseline P95:                     ${baseline_p95}ms"
    echo "Full Integration P95:             ${full_p95}ms (+${p95_overhead}%)"
    echo ""

    # Check if meets target (<1% overhead)
    local overhead_pass=$(awk "BEGIN {print ($total_overhead < 1.0) ? 1 : 0}")

    if [[ $overhead_pass -eq 1 ]]; then
        echo "✅ PASS: Total overhead ${total_overhead}% is below 1% target"
    else
        echo "⚠️  WARN: Total overhead ${total_overhead}% exceeds 1% target"
        echo "         Recommended optimization focus areas:"
        identify_bottlenecks
    fi

    # Resource usage summary
    echo ""
    echo "=== RESOURCE USAGE (100 agents) ==="
    jq -s 'map(select(.agent_count == 100 and .test_name == "full_integration" and .metadata.resource_stats)) | .[0].metadata.resource_stats |
    "CPU (avg/max):     \(.avg_cpu)% / \(.max_cpu)%\n" +
    "Memory (avg/max):  \(.avg_mem)MB / \(.max_mem)MB\n" +
    "tmpfs (avg/max):   \(.avg_tmpfs)MB / \(.max_tmpfs)MB"
    ' "$BENCHMARK_RESULTS_FILE" -r || echo "Resource data not available"

    echo ""
    echo "Detailed results: $BENCHMARK_RESULTS_FILE"
    echo "Performance log:  $PERF_LOG"
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

main() {
    echo "=========================================="
    echo "Phase 1 Performance Overhead Benchmark"
    echo "=========================================="
    echo "Configuration:"
    echo "  Scale levels: $SCALE_LEVELS agents"
    echo "  Iterations: $BENCHMARK_ITERATIONS per benchmark"
    echo "  Statistical runs: $STATISTICAL_RUNS"
    echo "  Timeout: ${BENCHMARK_TIMEOUT}s"
    echo "  Regression threshold: ${LATENCY_REGRESSION_THRESHOLD}ms"
    echo "Results: $BENCHMARK_RESULTS_FILE"
    echo ""

    # Start global timeout tracking
    BENCHMARK_START_TIME=$(date +%s)

    # Run benchmarks at different scales
    for scale in $SCALE_LEVELS; do
        # Check timeout before each scale level
        if ! check_benchmark_timeout; then
            log_progress "Stopping benchmark suite due to timeout"
            break
        fi

        echo ""
        echo "=========================================="
        echo "SCALE: $scale agents"
        echo "=========================================="

        # Baseline benchmarks
        benchmark_baseline_send "$scale" "$BENCHMARK_ITERATIONS" || continue
        check_benchmark_timeout || break

        benchmark_baseline_receive "$scale" "$BENCHMARK_ITERATIONS" || continue
        check_benchmark_timeout || break

        # Integration benchmarks
        benchmark_metrics_integration "$scale" "$BENCHMARK_ITERATIONS" || continue
        check_benchmark_timeout || break

        benchmark_health_integration "$scale" "$BENCHMARK_ITERATIONS" || continue
        check_benchmark_timeout || break

        benchmark_rate_limiting_integration "$scale" "$BENCHMARK_ITERATIONS" || continue
        check_benchmark_timeout || break

        benchmark_shutdown_integration "$scale" || continue
        check_benchmark_timeout || break

        # Full integration
        benchmark_full_integration "$scale" "$BENCHMARK_ITERATIONS" || continue

        log_progress "Completed all benchmarks for $scale agents"
    done

    # Calculate and display overhead
    echo ""
    if [[ "$BENCHMARK_INTERRUPTED" == "true" ]]; then
        echo "⚠️  Benchmark suite interrupted (timeout or performance regression)"
        echo "⚠️  Results may be incomplete - use partial data with caution"
        echo ""
    fi

    local end_time=$(date +%s)
    local total_elapsed=$((end_time - BENCHMARK_START_TIME))
    log_progress "Total benchmark execution time: ${total_elapsed}s"

    calculate_overhead
}

# Cleanup function for signals
cleanup_on_exit() {
    echo ""
    echo "⚠️  Benchmark interrupted by signal"
    BENCHMARK_INTERRUPTED="true"

    # Kill any running resource monitors
    pkill -f "phase1-overhead-perf.log" 2>/dev/null || true

    # Try to calculate overhead with partial results
    if [[ -f "$BENCHMARK_RESULTS_FILE" ]] && [[ -s "$BENCHMARK_RESULTS_FILE" ]]; then
        echo "Attempting to generate partial results..."
        calculate_overhead 2>/dev/null || true
    fi

    exit 1
}

# Register signal handlers
trap cleanup_on_exit INT TERM

# Run benchmarks
main "$@"
