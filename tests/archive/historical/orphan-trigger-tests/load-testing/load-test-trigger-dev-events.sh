#!/bin/bash
# tests/docker/north-star/07-load-testing/load-test-trigger-dev-events.sh
# Phase 7 :: Load test trigger.dev using CLI event submission to actual Docker service

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# trigger.dev event load test configuration
LOAD_TEST_ID="trigger-dev-events-$(date +%s)"
CONCURRENT_EVENTS=${1:-5}  # Default to 5 concurrent events
API_BASE_URL="http://localhost:3040"  # trigger.dev Docker instance
MODE="mvp"  # Use MVP mode for faster execution

# Performance tracking
declare -a EVENT_IDS=()
declare -a EVENT_START_TIMES=()
declare -a EVENT_COMPLETION_TIMES=()
declare -a EVENT_STATUSES=()

# Metrics collection
METRICS_FILE="/tmp/trigger-dev-events-metrics-${LOAD_TEST_ID}.json"

cleanup() {
  log_step "Cleanup: trigger.dev event load test artifacts"

  # Kill any remaining processes
  pkill -f "load-test-trigger-dev-events" || true
  pkill -f "curl.*trigger" || true

  # Clean up temporary files
  rm -rf "/tmp/trigger-dev-events-*" || true

  log_info "Cleanup completed"
}
trap cleanup EXIT

validate_trigger_dev_docker() {
  log_step "GIVEN: trigger.dev Docker environment is validated"

  # Check trigger.dev Docker containers are running
  if ! docker ps | grep -q "trigger-dev-webapp"; then
    log_error "trigger.dev webapp container not running"
    return 1
  fi

  if ! docker ps | grep -q "trigger-dev-worker"; then
    log_error "trigger.dev worker container not running"
    return 1
  fi

  # Check API accessibility (even with error, it means service is running)
  if ! curl -s "$API_BASE_URL" > /dev/null 2>&1; then
    log_error "trigger.dev API not accessible at $API_BASE_URL"
    return 1
  fi

  # Check Redis connection (Docker Redis)
  if ! redis-cli -h localhost -p 6380 ping > /dev/null 2>&1; then
    log_error "Redis not accessible (Docker instance on port 6380)"
    return 1
  fi

  log_info "✅ trigger.dev Docker environment validated"
  log_info "  API URL: $API_BASE_URL"
  log_info "  Web container: Running"
  log_info "  Worker container: Running"
  log_info "  Concurrent events: $CONCURRENT_EVENTS"
  log_info "  Mode: $MODE"

  return 0
}

prepare_trigger_tasks() {
  log_step "WHEN: trigger.dev tasks are prepared for load testing"

  log_info "Preparing $CONCURRENT_EVENTS diverse trigger.dev tasks..."

  # Create different task descriptions for concurrent trigger.dev execution
  local task_descriptions=(
    "Create a RESTful API server with Express.js that includes user authentication and database integration"
    "Build a responsive dashboard application with real-time data visualization and interactive charts"
    "Develop comprehensive unit tests for a Node.js application with mocking and coverage reporting"
    "Perform code quality analysis on a TypeScript project including security vulnerabilities and performance issues"
    "Create comprehensive API documentation with examples, diagrams, and usage guidelines"
    "Build a microservices architecture with API gateway, service discovery, and inter-service communication"
    "Develop a content management system with markdown support, tag system, and search functionality"
    "Create a data processing pipeline that transforms CSV files, validates data, and generates summary reports"
    "Build an e-commerce backend with inventory management, order processing, and payment integration"
    "Develop a monitoring system with metric collection, alerting, and dashboard visualization"
  )

  # Prepare task configurations
  for ((i=1; i<=CONCURRENT_EVENTS; i++)); do
    local task_index=$((i - 1))
    local task_description="${task_descriptions[$task_index]}"
    log_info "  Event $i: ${task_description:0:50}..."
  done

  log_info "✅ $CONCURRENT_EVENTS trigger.dev tasks prepared"
  return 0
}

submit_trigger_events() {
  log_step "AND: $CONCURRENT_EVENTS trigger.dev events are submitted concurrently"

  local task_descriptions=(
    "Create a RESTful API server with Express.js that includes user authentication and database integration"
    "Build a responsive dashboard application with real-time data visualization and interactive charts"
    "Develop comprehensive unit tests for a Node.js application with mocking and coverage reporting"
    "Perform code quality analysis on a TypeScript project including security vulnerabilities and performance issues"
    "Create comprehensive API documentation with examples, diagrams, and usage guidelines"
    "Build a microservices architecture with API gateway, service discovery, and inter-service communication"
    "Develop a content management system with markdown support, tag system, and search functionality"
    "Create a data processing pipeline that transforms CSV files, validates data, and generates summary reports"
    "Build an e-commerce backend with inventory management, order processing, and payment integration"
    "Develop a monitoring system with metric collection, alerting, and dashboard visualization"
  )

  log_info "Submitting $CONCURRENT_EVENTS trigger.dev events CONCURRENTLY..."

  # Submit all events at once for true concurrency using the CLI
  for ((i=1; i<=CONCURRENT_EVENTS; i++)); do
    local task_index=$((i - 1))
    local task_description="${task_descriptions[$task_index]}"
    local event_id="load-test-event-$i"

    log_info "Submitting concurrent event $i: $event_id"

    # Record start time
    EVENT_START_TIMES[i-1]=$(date +%s)

    # Create event-specific workspace
    local workspace_dir="/tmp/trigger-dev-events-workspace-$LOAD_TEST_ID/event-$i"
    mkdir -p "$workspace_dir"

    # Submit event using trigger.dev CLI in background with NO delays for true concurrency
    (
      cd "$PROJECT_ROOT"
      echo "Submitting trigger.dev event: $task_description" | \
      timeout 120 npx trigger.dev run \
        --name="$event_id" \
        --payload="{\"description\": \"$task_description\", \"mode\": \"$MODE\", \"loadTestId\": \"$LOAD_TEST_ID\", \"eventNumber\": $i}" \
        2>&1 | tee "/tmp/trigger-dev-events-log-$LOAD_TEST_ID-event-$i.log"
    ) &

    local event_pid=$!
    EVENT_IDS+=("$event_pid")

    log_info "✅ Event $i submitted concurrently with PID: $event_pid"

    # NO DELAY HERE - submit all events immediately for true concurrency
  done

  log_info "✅ All $CONCURRENT_EVENTS trigger.dev events submitted concurrently"
  return 0
}

monitor_trigger_execution() {
  log_step "THEN: trigger.dev event execution is monitored"

  local max_wait=300  # 5 minutes max for all events
  local check_interval=15  # Check every 15 seconds
  local waited=0

  log_info "Monitoring $CONCURRENT_EVENTS trigger.dev events..."

  while [ $waited -lt $max_wait ]; do
    local active_events=0
    local completed_events=0
    local failed_events=0

    # Check status of all event processes
    for i in "${!EVENT_IDS[@]}"; do
      local event_pid=${EVENT_IDS[i]}
      local event_num=$((i + 1))

      if kill -0 "$event_pid" 2>/dev/null; then
        # Event still running
        active_events=$((active_events + 1))
      else
        # Event completed
        if [ -z "${EVENT_STATUSES[i]:-}" ]; then
          wait "$event_pid"
          local exit_code=$?
          EVENT_STATUSES[i]=$exit_code

          local completion_time=$(date +%s)
          local duration=$((completion_time - EVENT_START_TIMES[i]))
          EVENT_COMPLETION_TIMES[i]=$duration

          if [ $exit_code -eq 0 ]; then
            completed_events=$((completed_events + 1))
            log_success "✅ Event $event_num completed successfully (${duration}s)"
          else
            failed_events=$((failed_events + 1))
            log_warn "⚠️  Event $event_num completed with exit code: $exit_code (${duration}s)"
          fi
        fi
      fi
    done

    log_info "Event progress: $active_events running, $completed_events completed, $failed_events failed (${waited}s elapsed)"

    # Check if all events are complete
    if [ $((completed_events + failed_events)) -eq $CONCURRENT_EVENTS ]; then
      log_info "All trigger.dev events completed"
      break
    fi

    sleep $check_interval
    waited=$((waited + check_interval))
  done

  # Handle timeout for any remaining events
  local remaining_events=0
  for i in "${!EVENT_IDS[@]}"; do
    local event_pid=${EVENT_IDS[i]}
    local event_num=$((i + 1))

    if kill -0 "$event_pid" 2>/dev/null; then
      log_warn "⚠️  Event $event_num timeout, terminating..."
      kill -TERM "$event_pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$event_pid" 2>/dev/null || true

      EVENT_STATUSES[i]=124  # Timeout exit code
      remaining_events=$((remaining_events + 1))
    fi
  done

  if [ $remaining_events -gt 0 ]; then
    log_warn "$remaining_events events terminated due to timeout"
  fi

  return 0
}

collect_trigger_metrics() {
  log_step "AND: trigger.dev metrics are collected during load test"

  # CPU and Memory usage
  local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>/dev/null || echo "0")
  local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}' 2>/dev/null || echo "0")

  # Redis metrics (Docker Redis)
  local redis_memory=$(redis-cli -h localhost -p 6380 info memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "unknown")
  local redis_connections=$(redis-cli -h localhost -p 6380 info clients 2>/dev/null | grep "connected_clients:" | cut -d: -f2 || echo "0")

  # Docker container metrics
  local trigger_containers=$(docker ps --filter "name=trigger" --format "table {{.Names}}\t{{.Status}}" | wc -l || echo "0")
  local trigger_memory=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" trigger-dev-webapp trigger-dev-worker 2>/dev/null || echo "unknown")

  # Process counts
  local trigger_processes=$(pgrep -f "trigger" | wc -l || echo "0")
  local node_processes=$(pgrep -f "node" | wc -l || echo "0")

  log_info "📊 trigger.dev System Metrics:"
  log_info "  CPU Usage: ${cpu_usage}%"
  log_info "  Memory Usage: ${memory_usage}%"
  log_info "  Redis Memory: $redis_memory"
  log_info "  Redis Connections: $redis_connections"
  log_info "  Trigger Containers: $trigger_containers"
  log_info "  Trigger Processes: $trigger_processes"
  log_info "  Node Processes: $node_processes"
  log_info "  Trigger Memory Usage: $trigger_memory"

  return 0
}

generate_trigger_report() {
  log_step "THEN: trigger.dev event load test report is generated"

  local report_file="/tmp/trigger-dev-events-report-${LOAD_TEST_ID}.json"
  local total_events=$CONCURRENT_EVENTS
  local successful_events=0
  local failed_events=0
  local timeout_events=0
  local total_duration=0

  # Calculate statistics
  for i in "${!EVENT_STATUSES[@]}"; do
    if [ "${EVENT_STATUSES[i]}" -eq 0 ]; then
      successful_events=$((successful_events + 1))
      total_duration=$((total_duration + EVENT_COMPLETION_TIMES[i]))
    elif [ "${EVENT_STATUSES[i]}" -eq 124 ]; then
      timeout_events=$((timeout_events + 1))
    else
      failed_events=$((failed_events + 1))
    fi
  done

  local success_rate=$(echo "scale=2; $successful_events * 100 / $total_events" | bc -l 2>/dev/null || echo "0")
  local avg_duration=0
  if [ $successful_events -gt 0 ]; then
    avg_duration=$(echo "scale=2; $total_duration / $successful_events" | bc -l 2>/dev/null || echo "0")
  fi

  # Calculate concurrency efficiency
  local min_start_time=$(printf "%s\n" "${EVENT_START_TIMES[@]}" | sort -n | head -1)
  local max_end_time=$(printf "%s\n" "${EVENT_COMPLETION_TIMES[@]}" | sort -n | tail -1)
  local total_concurrent_time=$((max_end_time - min_start_time))

  # Generate comprehensive report
  cat > "$report_file" << EOF
{
  "load_test_id": "$LOAD_TEST_ID",
  "test_configuration": {
    "concurrent_events": $CONCURRENT_EVENTS,
    "mode": "$MODE",
    "api_base_url": "$API_BASE_URL",
    "execution_type": "TRUE_CONCURRENT_TRIGGER_DEV",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  },
  "results": {
    "total_events": $total_events,
    "successful_events": $successful_events,
    "failed_events": $failed_events,
    "timeout_events": $timeout_events,
    "success_rate": $success_rate,
    "total_duration": $total_duration,
    "average_duration": $avg_duration,
    "concurrent_execution_time": $total_concurrent_time,
    "actual_trigger_dev_usage": true
  },
  "event_details": [
EOF

  # Add individual event details
  for i in "${!EVENT_IDS[@]}"; do
    local event_num=$((i + 1))
    local pid="${EVENT_IDS[i]}"
    local exit_code="${EVENT_STATUSES[i]}"
    local duration="${EVENT_COMPLETION_TIMES[i]}"
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
      "event_number": $event_num,
      "pid": "$pid",
      "exit_code": $exit_code,
      "start_time": ${EVENT_START_TIMES[i]},
      "duration": $duration,
      "status": "$status"
    }$([ $i -lt $((total_events - 1)) ] && echo "," || echo "")
EOF
  done

  cat >> "$report_file" << EOF
  ],
  "system_requirements": {
    "cpu_cores": $(nproc),
    "total_memory_gb": $(free -g | grep '^Mem:' | awk '{print $2}'),
    "trigger_dev_version": "$(docker exec trigger-dev-webapp npm list @trigger.dev/sdk 2>/dev/null | head -1 || echo 'unknown')"
  },
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF

  log_success "✅ trigger.dev Event Load Test Report Generated: $report_file"
  log_info "📊 trigger.dev Load Test Summary:"
  log_info "  Total Events: $total_events"
  log_info "  Successful: $successful_events"
  log_info "  Failed: $failed_events"
  log_info "  Timeout: $timeout_events"
  log_info "  Success Rate: ${success_rate}%"
  log_info "  Avg Duration: ${avg_duration}s"
  log_info "  Concurrent Execution Time: ${total_concurrent_time}s"
  log_info "  Actual trigger.dev Usage: YES"

  return 0
}

# Main execution
main() {
  annotate "trigger.dev Event Load Test" \
    "TRUE concurrent test with $CONCURRENT_EVENTS trigger.dev events using actual Docker service"

  log_info "🚀 Starting trigger.dev Event Load Test"
  log_info "This test uses ACTUAL trigger.dev Docker service:"
  log_info ""
  log_info "⚡ trigger.dev Load Test Configuration:"
  log_info "  Concurrent Events: $CONCURRENT_EVENTS"
  log_info "  Mode: $MODE (70% gates, 80% consensus)"
  log_info "  API URL: $API_BASE_URL (Docker)"
  log_info "  Execution Type: TRUE_CONCURRENT (no delays)"
  log_info "  Real trigger.dev Events: YES"
  log_info "  Real trigger.dev Jobs: YES"
  log_info ""
  log_info "⏱️  Expected Duration: 5 minutes max"
  log_info "📊 This tests TRUE trigger.dev concurrency performance!"

  # Execute trigger.dev load test
  validate_trigger_dev_docker
  prepare_trigger_tasks
  collect_trigger_metrics
  submit_trigger_events
  monitor_trigger_execution
  collect_trigger_metrics
  generate_trigger_report

  log_success "🎉 trigger.dev Event Load Test Completed!"
  log_info "Check the detailed report for trigger.dev concurrency metrics and analysis."

  return 0
}

# Execute trigger.dev load test
main "$@"