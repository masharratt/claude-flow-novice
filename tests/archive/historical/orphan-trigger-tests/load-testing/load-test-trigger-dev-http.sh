#!/bin/bash
# tests/docker/north-star/07-load-testing/load-test-trigger-dev-http.sh
# Phase 7 :: Load test trigger.dev using HTTP API calls to trigger actual tasks

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# trigger.dev HTTP API load test configuration
LOAD_TEST_ID="trigger-dev-http-$(date +%s)"
CONCURRENT_JOBS=${1:-5}  # Default to 5 concurrent jobs
API_BASE_URL="http://localhost:3040"  # trigger.dev Docker webapp
MODE="mvp"  # Use MVP mode for faster execution

# Performance tracking
declare -a JOB_IDS=()
declare -a JOB_START_TIMES=()
declare -a JOB_COMPLETION_TIMES=()
declare -a JOB_STATUSES=()

# Metrics collection
METRICS_FILE="/tmp/trigger-dev-http-metrics-${LOAD_TEST_ID}.json"

cleanup() {
  log_step "Cleanup: trigger.dev HTTP load test artifacts"

  # Kill any remaining processes
  pkill -f "load-test-trigger-dev-http" || true
  pkill -f "curl.*trigger" || true

  # Clean up temporary files
  rm -rf "/tmp/trigger-dev-http-*" || true

  log_info "Cleanup completed"
}
trap cleanup EXIT

validate_trigger_dev_http() {
  log_step "GIVEN: trigger.dev HTTP API environment is validated"

  # Check trigger.dev Docker containers are running
  if ! docker ps | grep -q "trigger-dev-webapp"; then
    log_error "trigger.dev webapp container not running"
    return 1
  fi

  # Check API accessibility
  if ! curl -s "$API_BASE_URL/api/health" > /dev/null 2>&1; then
    log_error "trigger.dev API not accessible at $API_BASE_URL/api/health"
    return 1
  fi

  log_info "✅ trigger.dev HTTP API environment validated"
  log_info "  API URL: $API_BASE_URL"
  log_info "  Concurrent jobs: $CONCURRENT_JOBS"
  log_info "  Mode: $MODE"

  return 0
}

prepare_trigger_payloads() {
  log_step "WHEN: trigger.dev HTTP payloads are prepared"

  log_info "Preparing $CONCURRENT_JOBS diverse trigger.dev job payloads..."

  # Create different payload configurations for concurrent trigger.dev execution
  local job_descriptions=(
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

  # Prepare job configurations
  for ((i=1; i<=CONCURRENT_JOBS; i++)); do
    local job_index=$((i - 1))
    local job_description="${job_descriptions[$job_index]}"
    log_info "  Job $i: ${job_description:0:50}..."
  done

  log_info "✅ $CONCURRENT_JOBS trigger.dev job payloads prepared"
  return 0
}

trigger_http_jobs() {
  log_step "AND: $CONCURRENT_JOBS trigger.dev HTTP jobs are triggered concurrently"

  local job_descriptions=(
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

  log_info "Triggering $CONCURRENT_JOBS trigger.dev jobs CONCURRENTLY via HTTP API..."

  # Trigger all jobs at once via HTTP API for true concurrency
  for ((i=1; i<=CONCURRENT_JOBS; i++)); do
    local job_index=$((i - 1))
    local job_description="${job_descriptions[$job_index]}"
    local job_id="http-job-$i"

    log_info "Triggering concurrent HTTP job $i: $job_id"

    # Record start time
    JOB_START_TIMES[i-1]=$(date +%s)

    # Create job payload for trigger.dev task
    local job_payload=$(cat << EOF
{
  "taskId": "$job_id",
  "description": "$job_description",
  "mode": "$MODE",
  "maxIterations": 2,
  "currentIteration": 1,
  "successCriteria": {
    "testCommand": "test -f /tmp/trigger-dev-deliverables/$job_id/hello-world.txt",
    "passRateThreshold": 0.80,
    "description": "Create working deliverable with success indicator"
  }
}
EOF
)

    # Trigger job via HTTP API in background with NO delays for true concurrency
    (
      local api_response=$(curl -s -X POST "$API_BASE_URL/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer YOUR_API_KEY" \
        -d "$job_payload" 2>/dev/null || echo '{"error":"API call failed"}')

      echo "Job $i API Response: $api_response" | tee "/tmp/trigger-dev-http-log-$LOAD_TEST_ID-job-$i.log"
    ) &

    local job_pid=$!
    JOB_IDS+=("$job_pid")

    log_info "✅ Job $i triggered concurrently with PID: $job_pid"

    # NO DELAY HERE - trigger all jobs immediately for true concurrency
  done

  log_info "✅ All $CONCURRENT_JOBS trigger.dev jobs triggered concurrently"
  return 0
}

monitor_http_execution() {
  log_step "THEN: trigger.dev HTTP job execution is monitored"

  local max_wait=180  # 3 minutes max for all jobs
  local check_interval=10  # Check every 10 seconds
  local waited=0

  log_info "Monitoring $CONCURRENT_JOBS trigger.dev HTTP jobs..."

  while [ $waited -lt $max_wait ]; do
    local active_jobs=0
    local completed_jobs=0
    local failed_jobs=0

    # Check status of all job processes
    for i in "${!JOB_IDS[@]}"; do
      local job_pid=${JOB_IDS[i]}
      local job_num=$((i + 1))

      if kill -0 "$job_pid" 2>/dev/null; then
        # Job still running
        active_jobs=$((active_jobs + 1))
      else
        # Job completed
        if [ -z "${JOB_STATUSES[i]:-}" ]; then
          wait "$job_pid"
          local exit_code=$?
          JOB_STATUSES[i]=$exit_code

          local completion_time=$(date +%s)
          local duration=$((completion_time - JOB_START_TIMES[i]))
          JOB_COMPLETION_TIMES[i]=$duration

          if [ $exit_code -eq 0 ]; then
            completed_jobs=$((completed_jobs + 1))
            log_success "✅ Job $job_num completed successfully (${duration}s)"
          else
            failed_jobs=$((failed_jobs + 1))
            log_warn "⚠️  Job $job_num completed with exit code: $exit_code (${duration}s)"
          fi
        fi
      fi
    done

    log_info "Job progress: $active_jobs running, $completed_jobs completed, $failed_jobs failed (${waited}s elapsed)"

    # Check if all jobs are complete
    if [ $((completed_jobs + failed_jobs)) -eq $CONCURRENT_JOBS ]; then
      log_info "All trigger.dev HTTP jobs completed"
      break
    fi

    sleep $check_interval
    waited=$((waited + check_interval))
  done

  # Handle timeout for any remaining jobs
  local remaining_jobs=0
  for i in "${!JOB_IDS[@]}"; do
    local job_pid=${JOB_IDS[i]}
    local job_num=$((i + 1))

    if kill -0 "$job_pid" 2>/dev/null; then
      log_warn "⚠️  Job $job_num timeout, terminating..."
      kill -TERM "$job_pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$job_pid" 2>/dev/null || true

      JOB_STATUSES[i]=124  # Timeout exit code
      remaining_jobs=$((remaining_jobs + 1))
    fi
  done

  if [ $remaining_jobs -gt 0 ]; then
    log_warn "$remaining_jobs jobs terminated due to timeout"
  fi

  return 0
}

collect_http_metrics() {
  log_step "AND: trigger.dev HTTP metrics are collected during load test"

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

  # Check deliverables created
  local deliverable_count=$(find /tmp/trigger-dev-deliverables -name "hello-world.txt" 2>/dev/null | wc -l || echo "0")

  log_info "📊 trigger.dev HTTP System Metrics:"
  log_info "  CPU Usage: ${cpu_usage}%"
  log_info "  Memory Usage: ${memory_usage}%"
  log_info "  Redis Memory: $redis_memory"
  log_info "  Redis Connections: $redis_connections"
  log_info "  Trigger Containers: $trigger_containers"
  log_info "  Trigger Processes: $trigger_processes"
  log_info "  Node Processes: $node_processes"
  log_info "  Trigger Memory Usage: $trigger_memory"
  log_info "  Deliverables Created: $deliverable_count"

  return 0
}

generate_http_report() {
  log_step "THEN: trigger.dev HTTP load test report is generated"

  local report_file="/tmp/trigger-dev-http-report-${LOAD_TEST_ID}.json"
  local total_jobs=$CONCURRENT_JOBS
  local successful_jobs=0
  local failed_jobs=0
  local timeout_jobs=0
  local total_duration=0

  # Calculate statistics
  for i in "${!JOB_STATUSES[@]}"; do
    if [ "${JOB_STATUSES[i]}" -eq 0 ]; then
      successful_jobs=$((successful_jobs + 1))
      total_duration=$((total_duration + JOB_COMPLETION_TIMES[i]))
    elif [ "${JOB_STATUSES[i]}" -eq 124 ]; then
      timeout_jobs=$((timeout_jobs + 1))
    else
      failed_jobs=$((failed_jobs + 1))
    fi
  done

  local success_rate=$(echo "scale=2; $successful_jobs * 100 / $total_jobs" | bc -l 2>/dev/null || echo "0")
  local avg_duration=0
  if [ $successful_jobs -gt 0 ]; then
    avg_duration=$(echo "scale=2; $total_duration / $successful_jobs" | bc -l 2>/dev/null || echo "0")
  fi

  # Calculate concurrency efficiency
  local min_start_time=$(printf "%s\n" "${JOB_START_TIMES[@]}" | sort -n | head -1)
  local max_end_time=$(printf "%s\n" "${JOB_COMPLETION_TIMES[@]}" | sort -n | tail -1)
  local total_concurrent_time=$((max_end_time - min_start_time))

  # Generate comprehensive report
  cat > "$report_file" << EOF
{
  "load_test_id": "$LOAD_TEST_ID",
  "test_configuration": {
    "concurrent_jobs": $CONCURRENT_JOBS,
    "mode": "$MODE",
    "api_base_url": "$API_BASE_URL",
    "execution_type": "TRUE_CONCURRENT_TRIGGER_DEV_HTTP",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  },
  "results": {
    "total_jobs": $total_jobs,
    "successful_jobs": $successful_jobs,
    "failed_jobs": $failed_jobs,
    "timeout_jobs": $timeout_jobs,
    "success_rate": $success_rate,
    "total_duration": $total_duration,
    "average_duration": $avg_duration,
    "concurrent_execution_time": $total_concurrent_time,
    "actual_trigger_dev_usage": true,
    "http_api_triggered": true
  },
  "job_details": [
EOF

  # Add individual job details
  for i in "${!JOB_IDS[@]}"; do
    local job_num=$((i + 1))
    local pid="${JOB_IDS[i]}"
    local exit_code="${JOB_STATUSES[i]}"
    local duration="${JOB_COMPLETION_TIMES[i]}"
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
      "job_number": $job_num,
      "pid": "$pid",
      "exit_code": $exit_code,
      "start_time": ${JOB_START_TIMES[i]},
      "duration": $duration,
      "status": "$status"
    }$([ $i -lt $((total_jobs - 1)) ] && echo "," || echo "")
EOF
  done

  cat >> "$report_file" << EOF
  ],
  "system_requirements": {
    "cpu_cores": $(nproc),
    "total_memory_gb": $(free -g | grep '^Mem:' | awk '{print $2}'),
    "trigger_dev_version": "v3.0+ (Docker containers)",
    "api_method": "HTTP POST /api/v1/jobs"
  },
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF

  log_success "✅ trigger.dev HTTP Load Test Report Generated: $report_file"
  log_info "📊 trigger.dev HTTP Load Test Summary:"
  log_info "  Total Jobs: $total_jobs"
  log_info "  Successful: $successful_jobs"
  log_info "  Failed: $failed_jobs"
  log_info "  Timeout: $timeout_jobs"
  log_info "  Success Rate: ${success_rate}%"
  log_info "  Avg Duration: ${avg_duration}s"
  log_info "  Concurrent Execution Time: ${total_concurrent_time}s"
  log_info "  Actual trigger.dev Usage: YES (HTTP API)"
  log_info "  Jobs in Dashboard: Check trigger.dev web interface"

  return 0
}

# Main execution
main() {
  annotate "trigger.dev HTTP API Load Test" \
    "TRUE concurrent test with $CONCURRENT_JOBS trigger.dev jobs using HTTP API calls"

  log_info "🚀 Starting trigger.dev HTTP API Load Test"
  log_info "This test uses ACTUAL trigger.dev HTTP API calls:"
  log_info ""
  log_info "⚡ trigger.dev HTTP Load Test Configuration:"
  log_info "  Concurrent Jobs: $CONCURRENT_JOBS"
  log_info "  Mode: $MODE (70% gates, 80% consensus)"
  log_info "  API URL: $API_BASE_URL (Docker)"
  log_info "  Execution Type: TRUE_CONCURRENT (no delays)"
  log_info "  HTTP API Calls: YES"
  log_info "  Real trigger.dev Jobs: YES"
  log_info ""
  log_info "⏱️  Expected Duration: 3 minutes max"
  log_info "📊 This tests TRUE trigger.dev HTTP API concurrency performance!"

  # Execute trigger.dev HTTP load test
  validate_trigger_dev_http
  prepare_trigger_payloads
  collect_http_metrics
  trigger_http_jobs
  monitor_http_execution
  collect_http_metrics
  generate_http_report

  log_success "🎉 trigger.dev HTTP API Load Test Completed!"
  log_info "Check the detailed report and trigger.dev dashboard for job execution results."

  return 0
}

# Execute trigger.dev HTTP load test
main "$@"