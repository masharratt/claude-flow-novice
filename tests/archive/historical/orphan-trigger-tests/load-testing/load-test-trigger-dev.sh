#!/bin/bash
# tests/docker/north-star/07-load-testing/load-test-trigger-dev.sh
# Phase 7 :: Load test trigger.dev with concurrent CFN Loops using REAL agents

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Load test configuration
LOAD_TEST_ID="load-test-$(date +%s)"
CONCURRENT_LOOPS=${1:-5}  # Default to 5, can be overridden
MODE="mvp"  # Use MVP mode for faster execution
DURATION_PER_LOOP=300  # 5 minutes max per loop
AGENT_TIMEOUT=180  # 3 minutes per agent

# Performance tracking
declare -a LOOP_PIDS=()
declare -a LOOP_START_TIMES=()
declare -a LOOP_COMPLETION_TIMES=()
declare -a LOOP_EXIT_CODES=()
declare -a LOOP_DELIVERABLE_COUNTS=()

# Metrics collection
METRICS_FILE="/tmp/trigger-dev-load-metrics-${LOAD_TEST_ID}.json"
REDIS_PREFIX="loadtest:${LOAD_TEST_ID}"

cleanup() {
  log_step "Cleanup: Load test processes and resources"

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
  pkill -f "load-test" || true
  pkill -f "claude-flow-novice" || true
  pkill -f "$LOAD_TEST_ID" || true

  # Clean up Redis test data
  if command -v redis-cli &> /dev/null; then
    redis-cli --scan --pattern "${REDIS_PREFIX}*" 2>/dev/null | \
      xargs -r redis-cli DEL || true
  fi

  # Clean up temporary files
  rm -rf "/tmp/trigger-dev-load-*" || true

  log_info "Cleanup completed"
}
trap cleanup EXIT

validate_load_test_environment() {
  log_step "GIVEN: Load test environment is validated"

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

  # Check trigger.dev environment
  if [ ! -d "$PROJECT_ROOT/trigger-dev" ]; then
    log_error "Trigger.dev directory not found"
    return 1
  fi

  if [ ! -f "$PROJECT_ROOT/trigger-dev/.env.local" ]; then
    log_error "Trigger.dev environment not configured"
    return 1
  fi

  # Check Claude Flow Novice
  if ! npx claude-flow-novice --help &> /dev/null; then
    log_error "Claude Flow Novice not available"
    return 1
  fi

  log_info "✅ Load test environment validated"
  log_info "  Concurrent loops: $CONCURRENT_LOOPS"
  log_info "  Mode: $MODE"
  log_info "  Duration per loop: ${DURATION_PER_LOOP}s"
  log_info "  Agent timeout: ${AGENT_TIMEOUT}s"

  return 0
}

create_load_test_tasks() {
  log_step "WHEN: Load test tasks are created"

  local tasks_dir="/tmp/trigger-dev-load-tasks-$LOAD_TEST_ID"
  mkdir -p "$tasks_dir"

  log_info "Creating $CONCURRENT_LOOPS diverse load test tasks..."

  # Create different types of tasks to test variety
  local task_descriptions=(
    "Create a RESTful API server with Express.js that includes user authentication, database integration, and comprehensive error handling"
    "Build a responsive dashboard application with real-time data visualization, charts, and interactive filters"
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
    "Develop a WebSocket proxy with connection management, message routing, and load balancing"
  )

  # Create tasks for concurrent loops
  for ((i=1; i<=CONCURRENT_LOOPS; i++)); do
    local task_index=$((i - 1))
    local task_description="${task_descriptions[$task_index]}"
    local task_file="$tasks_dir/task-$i.json"

    cat > "$task_file" << EOF
{
  "taskId": "load-test-loop-$i",
  "description": "$task_description",
  "mode": "$MODE",
  "maxIterations": 2,
  "successCriteria": {
    "testCommand": "test -f /tmp/trigger-dev-deliverables/load-test-loop-$i/deliverable.txt && grep -q \"SUCCESS\" /tmp/trigger-dev-deliverables/load-test-loop-$i/deliverable.txt",
    "passRateThreshold": 0.70,
    "description": "Create working deliverable with success indicator"
  },
  "agents": ["backend-developer", "tester"],
  "timeout": $AGENT_TIMEOUT,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF

    log_info "  Task $i: ${task_description:0:50}..."
  done

  log_info "✅ $CONCURRENT_LOOPS load test tasks created"
  return 0
}

spawn_cfn_loop() {
  local loop_num=$1
  local task_file="/tmp/trigger-dev-load-tasks-$LOAD_TEST_ID/task-$loop_num.json"

  log_step "AND: Spawning CFN Loop $loop_num/$CONCURRENT_LOOPS"

  if [ ! -f "$task_file" ]; then
    log_error "Task file not found: $task_file"
    return 1
  fi

  # Read task configuration
  local task_description=$(jq -r '.description' "$task_file")
  local task_id=$(jq -r '.taskId' "$task_file")
  local max_iterations=$(jq -r '.maxIterations' "$task_file")

  log_info "Starting CFN Loop $loop_num: $task_id"
  log_info "  Description: ${task_description:0:60}..."
  log_info "  Max iterations: $max_iterations"

  # Record start time
  LOOP_START_TIMES[loop_num-1]=$(date +%s)

  # Create loop-specific workspace
  local workspace_dir="/tmp/trigger-dev-workspace-$LOAD_TEST_ID/loop-$loop_num"
  mkdir -p "$workspace_dir"

  # Spawn CFN Loop via trigger.dev
  (
    cd "$PROJECT_ROOT"
    timeout $DURATION_PER_LOOP npx claude-flow-novice agent product-owner \
      --context="$task_description" \
      --workspace="$workspace_dir" \
      --iteration="1" \
      --task-id="$task_id" \
      --mode="$MODE" \
      2>&1 | tee "/tmp/trigger-dev-load-log-$LOAD_TEST_ID-loop-$loop_num.log"
  ) &

  local loop_pid=$!
  LOOP_PIDS[loop_num-1]=$loop_pid

  log_info "✅ CFN Loop $loop_num spawned with PID: $loop_pid"

  # Store loop metadata in Redis for tracking
  redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:pid" "$loop_pid" > /dev/null
  redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:start_time" "${LOOP_START_TIMES[loop_num-1]}" > /dev/null
  redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:task_id" "$task_id" > /dev/null
  redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:status" "running" > /dev/null

  return 0
}

monitor_loop_execution() {
  local loop_num=$1
  local loop_pid=${LOOP_PIDS[loop_num-1]}
  local max_wait=$DURATION_PER_LOOP
  local check_interval=30
  local waited=0

  log_info "Monitoring CFN Loop $loop_num (PID: $loop_pid)..."

  while [ $waited -lt $max_wait ]; do
    if ! kill -0 "$loop_pid" 2>/dev/null; then
      # Loop completed
      wait "$loop_pid"
      local exit_code=$?
      LOOP_EXIT_CODES[loop_num-1]=$exit_code

      local completion_time=$(date +%s)
      local duration=$((completion_time - LOOP_START_TIMES[loop_num-1]))
      LOOP_COMPLETION_TIMES[loop_num-1]=$duration

      # Count deliverables
      local deliverable_dir="/tmp/trigger-dev-deliverables/load-test-loop-$loop_num"
      local deliverable_count=0
      if [ -d "$deliverable_dir" ]; then
        deliverable_count=$(find "$deliverable_dir" -type f | wc -l || echo "0")
      fi
      LOOP_DELIVERABLE_COUNTS[loop_num-1]=$deliverable_count

      # Update Redis with completion data
      redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:status" "completed" > /dev/null
      redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:exit_code" "$exit_code" > /dev/null
      redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:duration" "$duration" > /dev/null
      redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:deliverables" "$deliverable_count" > /dev/null

      if [ $exit_code -eq 0 ]; then
        log_success "✅ CFN Loop $loop_num completed successfully (${duration}s, $deliverable_count deliverables)"
      else
        log_warn "⚠️  CFN Loop $loop_num completed with exit code: $exit_code (${duration}s, $deliverable_count deliverables)"
      fi

      return $exit_code
    fi

    # Periodic progress update
    if [ $((waited % check_interval)) -eq 0 ] && [ $waited -gt 0 ]; then
      local elapsed=$((waited / 60))
      log_info "CFN Loop $loop_num progress: running (${elapsed}m elapsed)"
    fi

    sleep 10
    waited=$((waited + 10))
  done

  # Timeout handling
  log_warn "⚠️  CFN Loop $loop_num timeout, terminating..."
  kill -TERM "$loop_pid" 2>/dev/null || true
  sleep 2
  kill -KILL "$loop_pid" 2>/dev/null || true

  LOOP_EXIT_CODES[loop_num-1]=124  # Timeout exit code
  redis-cli SET "${REDIS_PREFIX}:loop:$loop_num:status" "timeout" > /dev/null

  return 124
}

collect_system_metrics() {
  log_step "AND: System metrics are collected"

  # CPU and Memory usage
  local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>/dev/null || echo "0")
  local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}' 2>/dev/null || echo "0")

  # Redis metrics
  local redis_memory=$(redis-cli info memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "unknown")
  local redis_connections=$(redis-cli info clients 2>/dev/null | grep "connected_clients:" | cut -d: -f2 || echo "0")

  # Process counts
  local claude_processes=$(pgrep -f "claude-flow-novice" | wc -l || echo "0")
  local node_processes=$(pgrep -f "node" | wc -l || echo "0")

  log_info "📊 System Metrics:"
  log_info "  CPU Usage: ${cpu_usage}%"
  log_info "  Memory Usage: ${memory_usage}%"
  log_info "  Redis Memory: $redis_memory"
  log_info "  Redis Connections: $redis_connections"
  log_info "  Claude Processes: $claude_processes"
  log_info "  Node Processes: $node_processes"

  # Store metrics in Redis
  local metrics_timestamp=$(date +%s)
  redis-cli LPUSH "${REDIS_PREFIX}:metrics" "$(cat << EOF
{
  "timestamp": $metrics_timestamp,
  "cpu_usage": "$cpu_usage",
  "memory_usage": "$memory_usage",
  "redis_memory": "$redis_memory",
  "redis_connections": "$redis_connections",
  "claude_processes": $claude_processes,
  "node_processes": $node_processes,
  "active_loops": ${#LOOP_PIDS[@]}
}
EOF
)" > /dev/null

  return 0
}

generate_load_test_report() {
  log_step "THEN: Load test report is generated"

  local report_file="/tmp/trigger-dev-load-report-${LOAD_TEST_ID}.json"
  local total_loops=$CONCURRENT_LOOPS
  local successful_loops=0
  local total_duration=0
  local total_deliverables=0

  # Calculate statistics
  for ((i=0; i<total_loops; i++)); do
    if [ "${LOOP_EXIT_CODES[i]}" -eq 0 ]; then
      successful_loops=$((successful_loops + 1))
    fi
    total_duration=$((total_duration + LOOP_COMPLETION_TIMES[i]))
    total_deliverables=$((total_deliverables + LOOP_DELIVERABLE_COUNTS[i]))
  done

  local success_rate=$(echo "scale=2; $successful_loops * 100 / $total_loops" | bc -l 2>/dev/null || echo "0")
  local avg_duration=0
  if [ $successful_loops -gt 0 ]; then
    avg_duration=$(echo "scale=2; $total_duration / $successful_loops" | bc -l 2>/dev/null || echo "0")
  fi

  # Generate comprehensive report
  cat > "$report_file" << EOF
{
  "load_test_id": "$LOAD_TEST_ID",
  "test_configuration": {
    "concurrent_loops": $CONCURRENT_LOOPS,
    "mode": "$MODE",
    "duration_per_loop": $DURATION_PER_LOOP,
    "agent_timeout": $AGENT_TIMEOUT,
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  },
  "results": {
    "total_loops": $total_loops,
    "successful_loops": $successful_loops,
    "failed_loops": $((total_loops - successful_loops)),
    "success_rate": $success_rate,
    "total_duration": $total_duration,
    "average_duration": $avg_duration,
    "total_deliverables": $total_deliverables
  },
  "loop_details": [
EOF

  # Add individual loop details
  for ((i=0; i<total_loops; i++)); do
    local loop_num=$((i + 1))
    cat >> "$report_file" << EOF
    {
      "loop_number": $loop_num,
      "pid": "${LOOP_PIDS[i]}",
      "exit_code": ${LOOP_EXIT_CODES[i]},
      "start_time": ${LOOP_START_TIMES[i]},
      "duration": ${LOOP_COMPLETION_TIMES[i]},
      "deliverables": ${LOOP_DELIVERABLE_COUNTS[i]},
      "status": "$([ "${LOOP_EXIT_CODES[i]}" -eq 0 ] && echo "success" || echo "failed")"
    }$([ $i -lt $((total_loops - 1)) ] && echo "," || echo "")"
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

  log_success "✅ Load test report generated: $report_file"
  log_info "📊 Load Test Summary:"
  log_info "  Total Loops: $total_loops"
  log_info "  Successful: $successful_loops"
  log_info "  Success Rate: ${success_rate}%"
  log_info "  Avg Duration: ${avg_duration}s"
  log_info "  Total Deliverables: $total_deliverables"

  return 0
}

# Main execution
main() {
  annotate "Trigger.dev Load Test with Real CFN Loops" \
    "Stress test trigger.dev with $CONCURRENT_LOOPS concurrent CFN Loops using real agents"

  log_info "🚀 Starting Trigger.dev Load Test"
  log_info "This test will stress trigger.dev with concurrent CFN Loop execution:"
  log_info ""
  log_info "⚡ Load Test Configuration:"
  log_info "  Concurrent CFN Loops: $CONCURRENT_LOOPS"
  log_info "  Mode: $MODE (70% gates, 80% consensus)"
  log_info "  Max Duration per Loop: ${DURATION_PER_LOOP}s"
  log_info "  Agent Timeout: ${AGENT_TIMEOUT}s"
  log_info "  Real Agent Spawning: YES"
  log_info ""
  log_info "⏱️  Expected Duration: $((CONCURRENT_LOOPS * 5 / 60)) minutes"
  log_info "📊 This will create significant load on trigger.dev!"

  # Execute load test
  validate_load_test_environment
  create_load_test_tasks

  # Spawn all concurrent CFN Loops
  log_info "Spawning $CONCURRENT_LOOPS concurrent CFN Loops..."
  for ((i=1; i<=CONCURRENT_LOOPS; i++)); do
    spawn_cfn_loop $i
    sleep 5  # Small delay between spawns
  done

  log_info "All CFN Loops spawned. Monitoring execution..."

  # Monitor all loops with periodic metrics
  local active_loops=$CONCURRENT_LOOPS
  while [ $active_loops -gt 0 ]; do
    active_loops=0
    for pid in "${LOOP_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        active_loops=$((active_loops + 1))
      fi
    done

    if [ $active_loops -gt 0 ]; then
      log_info "Active CFN Loops: $active_loops/$CONCURRENT_LOOPS"
      collect_system_metrics
      sleep 30
    fi
  done

  log_info "All CFN Loops completed. Generating final report..."
  generate_load_test_report

  log_success "🎉 Trigger.dev Load Test Completed!"
  log_info "Check the detailed report for complete metrics and analysis."

  return 0
}

# Execute load test
main "$@"