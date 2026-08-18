#!/usr/bin/env bash
# Cold Start Performance Testing for Docker Agents
# Tests container startup times and agent spawn performance

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Configuration
IMAGE_NAME=${IMAGE_NAME:-"claude-flow-novice:memory-monitored"}
REDIS_HOST=${REDIS_HOST:-"host.docker.internal"}
TEST_ITERATIONS=${TEST_ITERATIONS:-3}
RESULTS_DIR="performance-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create results directory
mkdir -p "$RESULTS_DIR"

echo "=== Docker Agent Cold Start Performance Test ==="
echo "Timestamp: $(date -Iseconds)"
echo "Image: $IMAGE_NAME"
echo "Iterations: $TEST_ITERATIONS"
echo "Results directory: $RESULTS_DIR"
echo

# Initialize results arrays
declare -a container_times
declare -a monitored_times
declare -a spawn_times

# Test 1: Basic Container Cold Start
echo "Test 1: Basic Container Cold Start"
for i in $(seq 1 $TEST_ITERATIONS); do
    echo "  Iteration $i/$TEST_ITERATIONS..."

    start_time=$(date +%s%N)

    docker run --rm \
        --name cold-start-test-$i \
        -e AGENT_ID=test-performance-$i \
        -e MEMORY_MONITORING=false \
        "$IMAGE_NAME" \
        node -e "console.log('Container started successfully')" >/dev/null 2>&1

    end_time=$(date +%s%N)
    startup_time_ms=$(( (end_time - start_time) / 1000000 ))
    container_times+=($startup_time_ms)

    echo "    Time: ${startup_time_ms}ms"
done

# Test 2: Container with Memory Monitoring
echo
echo "Test 2: Container with Memory Monitoring"
for i in $(seq 1 $TEST_ITERATIONS); do
    echo "  Iteration $i/$TEST_ITERATIONS..."

    start_time=$(date +%s%N)

    docker run --rm \
        --name cold-start-test-monitored-$i \
        -e AGENT_ID=test-performance-monitored-$i \
        -e MEMORY_MONITORING=true \
        -e REDIS_HOST="$REDIS_HOST" \
        "$IMAGE_NAME" \
        /app/monitor-wrapper.sh report-memory >/dev/null 2>&1

    end_time=$(date +%s%N)
    startup_time_monitored_ms=$(( (end_time - start_time) / 1000000 ))
    monitored_times+=($startup_time_monitored_ms)

    echo "    Time: ${startup_time_monitored_ms}ms"
done

# Test 3: Agent Spawn Time
echo
echo "Test 3: Agent Spawn Time"
for i in $(seq 1 $TEST_ITERATIONS); do
    echo "  Iteration $i/$TEST_ITERATIONS..."

    start_time=$(date +%s%N)

    docker run --rm \
        --name agent-spawn-test-$i \
        -e AGENT_ID=test-spawn-$i \
        -e MEMORY_MONITORING=true \
        -e REDIS_HOST="$REDIS_HOST" \
        -v "$(pwd):/app/workspace" \
        "$IMAGE_NAME" \
        /app/monitor-wrapper.sh start-agent agent-spawn-$i \
            --agent-type backend-developer \
            --task "Write hello world file to /tmp/hello.txt" \
            --timeout 30 >/dev/null 2>&1 || true

    end_time=$(date +%s%N)
    spawn_time_ms=$(( (end_time - start_time) / 1000000 ))
    spawn_times+=($spawn_time_ms)

    echo "    Time: ${spawn_time_ms}ms"
done

# Calculate statistics
calculate_stats() {
    local -n times_ref=$1
    local sum=0
    local min=${times_ref[0]}
    local max=${times_ref[0]}

    for time in "${times_ref[@]}"; do
        sum=$((sum + time))
        if (( time < min )); then min=$time; fi
        if (( time > max )); then max=$time; fi
    done

    local avg=$((sum / ${#times_ref[@]}))

    echo "$avg,$min,$max,$sum"
}

# Get system info
echo "Gathering system information..."
docker_version=$(docker --version)
host_os=$(uname -a)
available_memory=$(free -h)
cpu_info=$(lscpu | grep "Model name" | cut -d':' -f2- | xargs || echo "Unknown")

# Process results
container_stats=$(calculate_stats container_times)
monitored_stats=$(calculate_stats monitored_times)
spawn_stats=$(calculate_stats spawn_times)

IFS=',' read -r container_avg container_min container_max container_sum <<< "$container_stats"
IFS=',' read -r monitored_avg monitored_min monitored_max monitored_sum <<< "$monitored_stats"
IFS=',' read -r spawn_avg spawn_min spawn_max spawn_sum <<< "$spawn_stats"

# Calculate overhead
monitoring_overhead_avg=$((monitored_avg - container_avg))

# Display results
echo
echo "=== Performance Results ==="
echo
echo "Container Cold Start:"
echo "  Average: ${container_avg}ms"
echo "  Min: ${container_min}ms"
echo "  Max: ${container_max}ms"
echo "  Total: ${container_sum}ms"
echo
echo "Container with Memory Monitoring:"
echo "  Average: ${monitored_avg}ms"
echo "  Min: ${monitored_min}ms"
echo "  Max: ${monitored_max}ms"
echo "  Total: ${monitored_sum}ms"
echo
echo "Agent Spawn Time:"
echo "  Average: ${spawn_avg}ms"
echo "  Min: ${spawn_min}ms"
echo "  Max: ${spawn_max}ms"
echo "  Total: ${spawn_sum}ms"
echo
echo "Monitoring Overhead:"
echo "  Average: ${monitoring_overhead_avg}ms"
echo "  Overhead %: $(( (monitoring_overhead_avg * 100) / container_avg ))%"

# Save detailed results
results_file="$RESULTS_DIR/performance-results-$TIMESTAMP.json"
cat > "$results_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "test_configuration": {
    "image_name": "$IMAGE_NAME",
    "redis_host": "$REDIS_HOST",
    "iterations": $TEST_ITERATIONS,
    "system_info": {
      "docker_version": "$docker_version",
      "host_os": "$host_os",
      "available_memory": "$available_memory",
      "cpu_info": "$cpu_info"
    }
  },
  "results": {
    "container_cold_start": {
      "times_ms": [$(IFS=','; echo "${container_times[*]}")],
      "average_ms": $container_avg,
      "min_ms": $container_min,
      "max_ms": $container_max,
      "total_ms": $container_sum
    },
    "container_with_monitoring": {
      "times_ms": [$(IFS=','; echo "${monitored_times[*]}")],
      "average_ms": $monitored_avg,
      "min_ms": $monitored_min,
      "max_ms": $monitored_max,
      "total_ms": $monitored_sum
    },
    "agent_spawn": {
      "times_ms": [$(IFS=','; echo "${spawn_times[*]}")],
      "average_ms": $spawn_avg,
      "min_ms": $spawn_min,
      "max_ms": $spawn_max,
      "total_ms": $spawn_sum
    },
    "monitoring_overhead": {
      "average_ms": $monitoring_overhead_avg,
      "percentage": $(( (monitoring_overhead_avg * 100) / container_avg ))
    }
  },
  "raw_data": {
    "container_times_ms": [$(IFS=','; echo "${container_times[*]}")],
    "monitored_times_ms": [$(IFS=','; echo "${monitored_times[*]}")],
    "spawn_times_ms": [$(IFS=','; echo "${spawn_times[*]}")]
  }
}
EOF

echo
echo "Detailed results saved to: $results_file"

# Save CSV for spreadsheet analysis
csv_file="$RESULTS_DIR/performance-results-$TIMESTAMP.csv"
cat > "$csv_file" << EOF
Iteration,Container_ms,Monitored_ms,Spawn_ms
$(for i in $(seq 0 $((TEST_ITERATIONS-1))); do
    echo "$((i+1)),${container_times[$i]},${monitored_times[$i]},${spawn_times[$i]}"
done)
EOF

echo "CSV data saved to: $csv_file"

# Performance recommendations
echo
echo "=== Performance Analysis ==="
if (( monitoring_overhead_avg < 100 )); then
    echo "✅ Memory monitoring overhead is acceptable (<100ms)"
else
    echo "⚠️  Memory monitoring overhead is high (${monitoring_overhead_avg}ms)"
fi

if (( container_avg < 2000 )); then
    echo "✅ Container startup time is good (<2s)"
else
    echo "⚠️  Container startup time could be improved (${container_avg}ms)"
fi

if (( spawn_avg < 5000 )); then
    echo "✅ Agent spawn time is reasonable (<5s)"
else
    echo "⚠️  Agent spawn time is slow (${spawn_avg}ms)"
fi

echo
echo "Test completed successfully!"