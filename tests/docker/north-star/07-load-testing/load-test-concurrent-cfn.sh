#!/usr/bin/env bash
# tests/docker/north-star/07-load-testing/load-test-concurrent-cfn.sh
# Phase 7 :: TRUE concurrent CFN Loop test using CLI mode with parallel execution

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# True concurrent CFN Loop test configuration
LOAD_TEST_ID="concurrent-cfn-$(date +%s)"
CONCURRENT_LOOPS=${1:-5}  # Default to 5 concurrent loops
MODE="mvp"  # Use MVP mode for faster execution
DURATION_PER_LOOP=180  # 3 minutes max per loop

# Performance tracking
declare -a LOOP_PIDS=()
declare -a LOOP_START_TIMES=()
declare -a LOOP_COMPLETION_TIMES=()
declare -a LOOP_EXIT_CODES=()

# Metrics collection
METRICS_FILE="/tmp/concurrent-cfn-metrics-${LOAD_TEST_ID}.json"
REDIS_PREFIX="concurrent-cfn:${LOAD_TEST_ID}"

cleanup() {
  log_step "Cleanup: Concurrent CFN Loop test artifacts"

  # Kill all remaining CFN Loop processes
  for pid in "${LOOP_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      log_info "Terminating CFN Loop process $pid"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done

  # Kill any remaining processes
  pkill -f "concurrent-cfn" || true
  pkill -f "cfn-loop-cli" || true
  pkill -f "$LOAD_TEST_ID" || true

  # Clean up Redis test data
  if command -v redis-cli &> /dev/null; then
    redis-cli --scan --pattern "${REDIS_PREFIX}*" 2>/dev/null | \
      xargs -r redis-cli DEL || true
  fi

  # Clean up temporary files
  rm -rf "/tmp/concurrent-cfn-*" || true

  log_info "Cleanup completed"
}
trap cleanup EXIT

validate_concurrent_environment() {
  log_step "GIVEN: Concurrent CFN Loop environment is validated"

  # Check essential dependencies
  local dependencies=("redis-cli" "npx" "node" "npm")
  for dep in "${dependencies[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
      log_error "Dependency not found: $dep"
      return 1
    fi
  done

  # Check Redis
  if ! redis-cli ping > /dev/null 2>&1; then
    log_error "Redis not available"
    return 1
  fi

  # Check Claude Flow Novice CLI
  if ! npx claude-flow-novice --help &> /dev/null; then
    log_error "Claude Flow Novice not available"
    return 1
  fi

  # Check CFN Loop CLI command
  if ! npx claude-flow-novice --help | grep -q "cfn-loop-cli"; then
    log_error "CFN Loop CLI command not available"
    return 1
  fi

  log_info "✅ Concurrent CFN Loop environment validated"
  log_info "  Concurrent loops: $CONCURRENT_LOOPS"
  log_info "  Mode: $MODE"
  log_info "  Duration per loop: ${DURATION_PER_LOOP}s"

  return 0
}

create_concurrent_tasks() {
  log_step "WHEN: Concurrent CFN Loop tasks are prepared"

  local tasks_dir="/tmp/concurrent-cfn-tasks-$LOAD_TEST_ID"
  mkdir -p "$tasks_dir"

  log_info "Preparing $CONCURRENT_LOOPS diverse concurrent tasks..."

  # Create different types of tasks for concurrent execution
  local task_descriptions=(
    "Create a RESTful API server with Express.js that includes user authentication and database integration"
    "Build a responsive dashboard application with real-time data visualization and interactive charts"
    "Develop a command-line tool with argument parsing, configuration files, and progress reporting"
    "Create a microservices architecture with API gateway, service discovery, and inter-service communication"
    "Build a data processing pipeline that transforms CSV files, validates data, and generates summary reports"
    "Develop a content management system with markdown support, tag system, and search functionality"
    "Create a game server with real-time multiplayer support, room management, and game state synchronization"
    "Build an e-commerce backend with inventory management, order processing, and payment integration"
    "Develop a monitoring system with metric collection, alerting, and dashboard visualization"
    "Create a chat application with WebSocket support, room management, and message persistence"
    "Build a file processing service with upload handling, virus scanning, and format conversion"
    "Develop an authentication service with JWT tokens, OAuth integration, and user management"
    "Create a caching layer with Redis integration, cache invalidation, and performance metrics"
    "Build a notification system with email, SMS, and push notification support"
    "Develop a logging service with structured logging, log rotation, and search capabilities"
    "Create a configuration management system with environment variables, secrets management, and validation"
    "Build a testing framework with unit tests, integration tests, and automated test execution"
    "Develop a deployment pipeline with CI/CD integration, rollback capabilities, and health checks"
    "Create an analytics service with data aggregation, reporting, and visualization"
    "Build a recommendation engine with collaborative filtering, machine learning, and personalization"
  )

  # Prepare task configurations
  for ((i=1; i<=CONCURRENT_LOOPS; i++)); do
    local task_index=$((i - 1))
    local task_description="${task_descriptions[$task_index]}"

    log_info "  Task $i: ${task_description:0:50}..."
  done

  log_info "✅ $CONCURRENT_LOOPS concurrent tasks prepared"
  return 0
}

spawn_concurrent_cfn_loops() {
  log_step "AND: $CONCURRENT_LOOPS CFN Loops are spawned concurrently"

  # Create different types of tasks for concurrent execution
  local task_descriptions=(
    "Create a RESTful API server with Express.js that includes user authentication and database integration"
    "Build a responsive dashboard application with real-time data visualization and interactive charts"
    "Develop a command-line tool with argument parsing, configuration files, and progress reporting"
    "Create a microservices architecture with API gateway, service discovery, and inter-service communication"
    "Build a data processing pipeline that transforms CSV files, validates data, and generates summary reports"
    "Develop a content management system with markdown support, tag system, and search functionality"
    "Create a game server with real-time multiplayer support, room management, and game state synchronization"
    "Build an e-commerce backend with inventory management, order processing, and payment integration"
    "Develop a monitoring system with metric collection, alerting, and dashboard visualization"
    "Create a chat application with WebSocket support, room management, and message persistence"
    "Build a file processing service with upload handling, virus scanning, and format conversion"
    "Develop an authentication service with JWT tokens, OAuth integration, and user management"
    "Create a caching layer with Redis integration, cache invalidation, and performance metrics"
    "Build a notification system with email, SMS, and push notification support"
    "Develop a logging service with structured logging, log rotation, and search capabilities"
    "Create a configuration management system with environment variables, secrets management, and validation"
    "Build a testing framework with unit tests, integration tests, and automated test execution"
    "Develop a deployment pipeline with CI/CD integration, rollback capabilities, and health checks"
    "Create an analytics service with data aggregation, reporting, and visualization"
    "Build a recommendation engine with collaborative filtering, machine learning, and personalization"
  )

  log_info "Spawning $CONCURRENT_LOOPS CFN Loops CONCURRENTLY..."

  # Spawn ALL loops at once without delays for true concurrency
  for ((i=1; i<=CONCURRENT_LOOPS; i++)); do
    local task_index=$((i - 1))
    local task_description="${task_descriptions[$task_index]}"
    local loop_id="concurrent-loop-$i"

    log_info "Starting concurrent CFN Loop $i: $loop_id"

    # Record start time
    LOOP_START_TIMES[i-1]=$(date +%s)

    # Create loop-specific workspace
    local workspace_dir="/tmp/concurrent-cfn-workspace-$LOAD_TEST_ID/loop-$i"
    mkdir -p "$workspace_dir"

    # Spawn CFN Loop in background with NO delays for true concurrency
    (
      cd "$PROJECT_ROOT"
      timeout $DURATION_PER_LOOP npx claude-flow-novice cfn-loop-cli "$task_description" \
        --mode="$MODE" \
        --task-id="$loop_id" \
        --provider=zai \
        2>&1 | tee "/tmp/concurrent-cfn-log-$LOAD_TEST_ID-loop-$i.log"
    ) &

    local loop_pid=$!
    LOOP_PIDS[i-1]=$loop_pid

    log_info "✅ CFN Loop $i spawned concurrently with PID: $loop_pid"

    # Store loop metadata in Redis for tracking
    redis-cli SET "${REDIS_PREFIX}:loop:$i:pid" "$loop_pid" > /dev/null
    redis-cli SET "${REDIS_PREFIX}:loop:$i:start_time" "${LOOP_START_TIMES[i-1]}" > /dev/null
    redis-cli SET "${REDIS_PREFIX}:loop:$i:task_id" "$loop_id" > /dev/null
    redis-cli SET "${REDIS_PREFIX}:loop:$i:status" "running" > /dev/null

    # NO DELAY HERE - spawn all loops immediately for true concurrency
  done

  log_info "✅ All $CONCURRENT_LOOPS CFN Loops spawned concurrently"
  return 0
}

monitor_concurrent_execution() {
  log_step "THEN: Concurrent CFN Loop execution is monitored"

  local max_wait=$DURATION_PER_LOOP
  local check_interval=15  # Check every 15 seconds
  local waited=0

  log_info "Monitoring $CONCURRENT_LOOPS concurrent CFN Loops..."

  while [ $waited -lt $max_wait ]; do
    local active_loops=0
    local completed_loops=0
    local failed_loops=0

    # Check status of all loops
    for i in "${!LOOP_PIDS[@]}"; do
      local loop_pid=${LOOP_PIDS[i]}
      local loop_num=$((i + 1))

      if kill -0 "$loop_pid" 2>/dev/null; then
        # Loop still running
        active_loops=$((active_loops + 1))
      else
        # Loop completed
        if [ -z "${LOOP_EXIT_CODES[i]:-}" ]; then
          wait "$loop_pid"
          local exit_code=$?
          LOOP_EXIT_CODES[i]=$exit_code

          local completion_time=$(date +%s)
          local duration=$((completion_time - LOOP_START_TIMES[i]))
          LOOP_COMPLETION_TIMES[i]=$duration

          # Update Redis with completion data
          redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:status" "completed" > /dev/null
          redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:exit_code" "$exit_code" > /dev/null
          redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:duration" "$duration" > /dev/null

          if [ $exit_code -eq 0 ]; then
            completed_loops=$((completed_loops + 1))
            log_success "✅ CFN Loop $loop_num completed successfully (${duration}s)"
          else
            failed_loops=$((failed_loops + 1))
            log_warn "⚠️  CFN Loop $loop_num completed with exit code: $exit_code (${duration}s)"
          fi
        fi
      fi
    done

    log_info "Concurrent progress: $active_loops running, $completed_loops completed, $failed_loops failed (${waited}s elapsed)"

    # Check if all loops are complete
    if [ $((completed_loops + failed_loops)) -eq $CONCURRENT_LOOPS ]; then
      log_info "All concurrent CFN Loops completed"
      break
    fi

    sleep $check_interval
    waited=$((waited + check_interval))
  done

  # Handle timeout for any remaining loops
  local remaining_loops=0
  for i in "${!LOOP_PIDS[@]}"; do
    local loop_pid=${LOOP_PIDS[i]}
    local loop_num=$((i + 1))

    if kill -0 "$loop_pid" 2>/dev/null; then
      log_warn "⚠️  CFN Loop $loop_num timeout, terminating..."
      kill -TERM "$loop_pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$loop_pid" 2>/dev/null || true

      LOOP_EXIT_CODES[i]=124  # Timeout exit code
      redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:status" "timeout" > /dev/null
      remaining_loops=$((remaining_loops + 1))
    fi
  done

  if [ $remaining_loops -gt 0 ]; then
    log_warn "$remaining_loops CFN Loops terminated due to timeout"
  fi

  return 0
}

collect_concurrent_metrics() {
  log_step "AND: Concurrent execution metrics are collected"

  # CPU and Memory usage
  local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>/dev/null || echo "0")
  local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}' 2>/dev/null || echo "0")

  # Redis metrics
  local redis_memory=$(redis-cli info memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "unknown")
  local redis_connections=$(redis-cli info clients 2>/dev/null | grep "connected_clients:" | cut -d: -f2 || echo "0")

  # Process counts
  local claude_processes=$(pgrep -f "claude-flow-novice" | wc -l || echo "0")
  local node_processes=$(pgrep -f "node" | wc -l || echo "0")
  local active_cfn_pids=0

  # Count active CFN Loop processes
  for pid in "${LOOP_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      active_cfn_pids=$((active_cfn_pids + 1))
    fi
  done

  log_info "📊 Concurrent Execution Metrics:"
  log_info "  CPU Usage: ${cpu_usage}%"
  log_info "  Memory Usage: ${memory_usage}%"
  log_info "  Redis Memory: $redis_memory"
  log_info "  Redis Connections: $redis_connections"
  log_info "  Claude Processes: $claude_processes"
  log_info "  Node Processes: $node_processes"
  log_info "  Active CFN Loops: $active_cfn_pids"

  # Store metrics
  local metrics_timestamp=$(date +%s)
  cat >> "$METRICS_FILE" << EOF
{
  "timestamp": $metrics_timestamp,
  "loadTestId": "$LOAD_TEST_ID",
  "concurrentLoops": $CONCURRENT_LOOPS,
  "activeCfnLoops": $active_cfn_pids,
  "cpu_usage": "$cpu_usage",
  "memory_usage": "$memory_usage",
  "redis_memory": "$redis_memory",
  "redis_connections": "$redis_connections",
  "claude_processes": $claude_processes,
  "node_processes": $node_processes
}
EOF

  return 0
}

generate_concurrent_report() {
  log_step "THEN: Concurrent CFN Loop test report is generated"

  local report_file="/tmp/concurrent-cfn-report-${LOAD_TEST_ID}.json"
  local total_loops=$CONCURRENT_LOOPS
  local successful_loops=0
  local failed_loops=0
  local timeout_loops=0
  local total_duration=0

  # Calculate statistics
  for i in "${!LOOP_EXIT_CODES[@]}"; do
    if [ "${LOOP_EXIT_CODES[i]}" -eq 0 ]; then
      successful_loops=$((successful_loops + 1))
      total_duration=$((total_duration + LOOP_COMPLETION_TIMES[i]))
    elif [ "${LOOP_EXIT_CODES[i]}" -eq 124 ]; then
      timeout_loops=$((timeout_loops + 1))
    else
      failed_loops=$((failed_loops + 1))
    fi
  done

  local success_rate=$(echo "scale=2; $successful_loops * 100 / $total_loops" | bc -l 2>/dev/null || echo "0")
  local avg_duration=0
  if [ $successful_loops -gt 0 ]; then
    avg_duration=$(echo "scale=2; $total_duration / $successful_loops" | bc -l 2>/dev/null || echo "0")
  fi

  # Calculate concurrency efficiency (how many loops were actually running in parallel)
  local min_start_time=$(printf "%s\n" "${LOOP_START_TIMES[@]}" | sort -n | head -1)
  local max_end_time=$(printf "%s\n" "${LOOP_COMPLETION_TIMES[@]}" | sort -n | tail -1)
  local total_concurrent_time=$((max_end_time - min_start_time))

  # Generate comprehensive report
  cat > "$report_file" << EOF
{
  "load_test_id": "$LOAD_TEST_ID",
  "test_configuration": {
    "concurrent_loops": $CONCURRENT_LOOPS,
    "mode": "$MODE",
    "duration_per_loop": $DURATION_PER_LOOP,
    "execution_type": "TRUE_CONCURRENT",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  },
  "results": {
    "total_loops": $total_loops,
    "successful_loops": $successful_loops,
    "failed_loops": $failed_loops,
    "timeout_loops": $timeout_loops,
    "success_rate": $success_rate,
    "total_duration": $total_duration,
    "average_duration": $avg_duration,
    "concurrent_execution_time": $total_concurrent_time,
    "concurrency_efficiency": $(echo "scale=2; $avg_duration * $successful_loops / $total_concurrent_time" | bc -l 2>/dev/null || echo "0")
  },
  "loop_details": [
EOF

  # Add individual loop details
  for i in "${!LOOP_PIDS[@]}"; do
    local loop_num=$((i + 1))
    local pid="${LOOP_PIDS[i]}"
    local exit_code="${LOOP_EXIT_CODES[i]}"
    local duration="${LOOP_COMPLETION_TIMES[i]}"
    local status="unknown"

    if [ "$exit_code" -eq 0 ]; then
      status="success"
    elif [ "$exit_code" -eq 124 ]; then
      status="timeout"
    elif [ "$exit_code" -gt 0 ]; then
      status="failed"
    else
      status="unknown"
    fi

    cat >> "$report_file" << EOF
    {
      "loop_number": $loop_num,
      "pid": "$pid",
      "exit_code": $exit_code,
      "start_time": ${LOOP_START_TIMES[i]},
      "duration": $duration,
      "status": "$status"
    }$([ $i -lt $((total_loops - 1)) ] && echo "," || echo "")
EOF
  done

  cat >> "$report_file" << EOF
  ],
  "system_requirements": {
    "cpu_cores": $(nproc),
    "total_memory_gb": $(free -g | grep '^Mem:' | awk '{print $2}'),
    "redis_version": "$(redis-cli --version | head -1 || echo 'unknown')",
    "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
    "claude_flow_version": "$(npx claude-flow-novice --version 2>/dev/null || echo 'unknown')"
  },
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF

  log_success "✅ Concurrent CFN Loop Report Generated: $report_file"
  log_info "📊 Concurrent Load Test Summary:"
  log_info "  Total Loops: $total_loops"
  log_info "  Successful: $successful_loops"
  log_info "  Failed: $failed_loops"
  log_info "  Timeout: $timeout_loops"
  log_info "  Success Rate: ${success_rate}%"
  log_info "  Avg Duration: ${avg_duration}s"
  log_info "  Concurrent Execution Time: ${total_concurrent_time}s"

  return 0
}

# Main execution
main() {
  annotate "Concurrent CFN Loop Load Test" \
    "TRUE concurrent test with $CONCURRENT_LOOPS CFN Loops running simultaneously"

  log_info "🚀 Starting TRUE Concurrent CFN Loop Load Test"
  log_info "This test executes CFN Loops ACTUALLY CONCURRENTLY (no delays):"
  log_info ""
  log_info "⚡ Concurrent Test Configuration:"
  log_info "  Concurrent CFN Loops: $CONCURRENT_LOOPS"
  log_info "  Mode: $MODE (70% gates, 80% consensus)"
  log_info "  Max Duration per Loop: ${DURATION_PER_LOOP}s"
  log_info "  Execution Type: TRUE_CONCURRENT (no delays)"
  log_info "  CFN Loop CLI: YES"
  log_info "  Real Agent Spawning: YES"
  log_info ""
  log_info "⏱️  Expected Duration: ${DURATION_PER_LOOP}s max"
  log_info "📊 This tests TRUE concurrency performance!"

  # Execute concurrent load test
  validate_concurrent_environment
  create_concurrent_tasks
  collect_concurrent_metrics
  spawn_concurrent_cfn_loops
  monitor_concurrent_execution
  collect_concurrent_metrics
  generate_concurrent_report

  log_success "🎉 TRUE Concurrent CFN Loop Load Test Completed!"
  log_info "Check the detailed report for concurrency metrics and analysis."

  return 0
}

# Execute concurrent load test
main "$@"