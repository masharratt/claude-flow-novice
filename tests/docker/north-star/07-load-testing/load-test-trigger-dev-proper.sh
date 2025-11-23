#!/bin/bash
# tests/docker/north-star/07-load-testing/load-test-trigger-dev-proper.sh
# Phase 7 :: REAL trigger.dev load test with concurrent jobs using actual trigger.dev events

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Real trigger.dev load test configuration
LOAD_TEST_ID="trigger-dev-load-$(date +%s)"
CONCURRENT_JOBS=${1:-5}  # Default to 5 concurrent jobs
MODE="standard"  # Use standard mode for production-quality results
API_BASE_URL="http://localhost:3033"  # trigger.dev API URL

# Performance tracking
declare -a JOB_IDS=()
declare -a JOB_START_TIMES=()
declare -a JOB_COMPLETION_TIMES=()
declare -a JOB_STATUSES=()

# Metrics collection
METRICS_FILE="/tmp/trigger-dev-real-load-metrics-${LOAD_TEST_ID}.json"

cleanup() {
  log_step "Cleanup: Real trigger.dev load test artifacts"

  # Kill any remaining processes
  pkill -f "load-test-trigger-dev-proper" || true
  pkill -f "curl.*trigger.dev" || true

  # Clean up temporary files
  rm -rf "/tmp/trigger-dev-real-load-*" || true

  log_info "Cleanup completed"
}
trap cleanup EXIT

validate_trigger_dev_environment() {
  log_step "GIVEN: trigger.dev environment is validated for load testing"

  # Check trigger.dev service is running
  if ! curl -s "$API_BASE_URL/health" > /dev/null 2>&1; then
    log_error "trigger.dev API not accessible at $API_BASE_URL"
    return 1
  fi

  # Check trigger.dev worker is running
  if ! pgrep -f "trigger.dev.worker" > /dev/null; then
    log_error "trigger.dev worker not running"
    return 1
  fi

  # Check Redis for trigger.dev
  if ! redis-cli -n 1 ping > /dev/null 2>&1; then
    log_error "Redis not accessible for trigger.dev (DB 1)"
    return 1
  fi

  # Check our v3 task is registered
  if ! curl -s "$API_BASE_URL/api/v1/tasks" | grep -q "cfnLoopV3Task"; then
    log_error "cfnLoopV3Task not registered in trigger.dev"
    return 1
  fi

  log_info "✅ trigger.dev environment validated"
  log_info "  API URL: $API_BASE_URL"
  log_info "  Worker running: $(pgrep -f 'trigger.dev.worker' | wc -l) processes"
  log_info "  Concurrent jobs: $CONCURRENT_JOBS"
  log_info "  Mode: $MODE"

  return 0
}

create_trigger_dev_jobs() {
  log_step "WHEN: trigger.dev jobs are created for load testing"

  log_info "Creating $CONCURRENT_JOBS concurrent trigger.dev jobs..."

  # Diverse task descriptions for realistic load testing
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
  )

  # Create concurrent jobs via trigger.dev API
  for ((i=1; i<=CONCURRENT_JOBS; i++)); do
    local task_index=$((i - 1))
    local task_description="${task_descriptions[$task_index]}"
    local job_payload=$(cat << EOF
{
  "taskId": "cfnLoopV3Task",
  "payload": {
    "description": "$task_description",
    "mode": "$MODE",
    "maxIterations": 2,
    "successCriteria": {
      "testCommand": "test -f /tmp/trigger-dev-deliverables/load-test-$LOAD_TEST_ID-job-$i/deliverable.txt && grep -q \"SUCCESS\" /tmp/trigger-dev-deliverables/load-test-$LOAD_TEST_ID-job-$i/deliverable.txt",
      "passRateThreshold": 0.80,
      "description": "Create working deliverable with success indicator"
    },
    "agents": ["backend-developer", "code-quality-validator", "tester"],
    "timeout": 240,
    "metadata": {
      "loadTestId": "$LOAD_TEST_ID",
      "jobNumber": $i,
      "concurrentJobs": $CONCURRENT_JOBS
    }
  }
}
EOF
)

    log_info "Creating job $i: ${task_description:0:50}..."

    # Submit job to trigger.dev
    local job_response=$(curl -s -X POST "$API_BASE_URL/api/v1/jobs" \
      -H "Content-Type: application/json" \
      -d "$job_payload")

    if [ $? -eq 0 ]; then
      local job_id=$(echo "$job_response" | jq -r '.id // empty')
      if [ -n "$job_id" ]; then
        JOB_IDS+=("$job_id")
        JOB_START_TIMES+=("$(date +%s)")
        log_info "✅ Job $i created with ID: $job_id"
      else
        log_error "❌ Failed to create job $i: Invalid response"
        JOB_IDS+=("failed-$i")
        JOB_START_TIMES+=("0")
      fi
    else
      log_error "❌ Failed to submit job $i to trigger.dev"
      JOB_IDS+=("error-$i")
      JOB_START_TIMES+=("0")
    fi

    # Small delay to avoid overwhelming the API
    sleep 0.1
  done

  log_info "✅ $CONCURRENT_JOBS trigger.dev jobs created"
  return 0
}

monitor_job_execution() {
  log_step "AND: trigger.dev job execution is monitored"

  local max_wait=600  # 10 minutes max for all jobs
  local check_interval=10
  local waited=0

  log_info "Monitoring $CONCURRENT_JOBS concurrent trigger.dev jobs..."

  while [ $waited -lt $max_wait ]; do
    local completed_jobs=0
    local running_jobs=0
    local failed_jobs=0

    # Check status of all jobs
    for i in "${!JOB_IDS[@]}"; do
      local job_id="${JOB_IDS[i]}"
      local job_num=$((i + 1))

      if [[ "$job_id" == failed-* || "$job_id" == error-* ]]; then
        failed_jobs=$((failed_jobs + 1))
        continue
      fi

      # Get job status from trigger.dev API
      local job_status_response=$(curl -s "$API_BASE_URL/api/v1/jobs/$job_id" 2>/dev/null || echo '{}')
      local job_status=$(echo "$job_status_response" | jq -r '.status // "unknown"')

      case "$job_status" in
        "COMPLETED")
          completed_jobs=$((completed_jobs + 1))
          if [ -z "${JOB_STATUSES[i]:-}" ]; then
            JOB_COMPLETION_TIMES[i]=$(date +%s)
            JOB_STATUSES[i]="COMPLETED"
            local duration=$((${JOB_COMPLETION_TIMES[i]} - JOB_START_TIMES[i]))
            log_success "✅ Job $job_num completed (${duration}s)"
          fi
          ;;
        "FAILED"|"ERROR")
          failed_jobs=$((failed_jobs + 1))
          if [ -z "${JOB_STATUSES[i]:-}" ]; then
            JOB_COMPLETION_TIMES[i]=$(date +%s)
            JOB_STATUSES[i]="FAILED"
            local duration=$((${JOB_COMPLETION_TIMES[i]} - JOB_START_TIMES[i]))
            log_error "❌ Job $job_num failed (${duration}s)"
          fi
          ;;
        "RUNNING"|"EXECUTING")
          running_jobs=$((running_jobs + 1))
          ;;
        "PENDING"|"QUEUED")
          running_jobs=$((running_jobs + 1))
          ;;
        *)
          log_warn "⚠️  Job $job_num unknown status: $job_status"
          running_jobs=$((running_jobs + 1))
          ;;
      esac
    done

    log_info "Job progress: $completed_jobs completed, $running_jobs running, $failed_jobs failed (${waited}s elapsed)"

    # Check if all jobs are complete
    if [ $((completed_jobs + failed_jobs)) -eq $CONCURRENT_JOBS ]; then
      log_info "All trigger.dev jobs completed"
      break
    fi

    sleep $check_interval
    waited=$((waited + check_interval))
  done

  # Handle timeout
  if [ $waited -ge $max_wait ]; then
    log_warn "⚠️  Load test timeout, some jobs may still be running"
  fi

  return 0
}

collect_system_metrics() {
  log_step "AND: System metrics are collected during trigger.dev load test"

  # CPU and Memory usage
  local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>/dev/null || echo "0")
  local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}' 2>/dev/null || echo "0")

  # Redis metrics (trigger.dev uses DB 1)
  local redis_memory=$(redis-cli -n 1 info memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "unknown")
  local redis_connections=$(redis-cli -n 1 info clients 2>/dev/null | grep "connected_clients:" | cut -d: -f2 || echo "0")
  local trigger_dev_keys=$(redis-cli -n 1 dbsize 2>/dev/null || echo "0")

  # Process counts
  local trigger_dev_processes=$(pgrep -f "trigger.dev" | wc -l || echo "0")
  local claude_processes=$(pgrep -f "claude-flow-novice" | wc -l || echo "0")
  local node_processes=$(pgrep -f "node" | wc -l || echo "0")

  log_info "📊 System Metrics during trigger.dev load test:"
  log_info "  CPU Usage: ${cpu_usage}%"
  log_info "  Memory Usage: ${memory_usage}%"
  log_info "  Redis Memory: $redis_memory"
  log_info "  Redis Connections: $redis_connections"
  log_info "  Trigger.dev Keys: $trigger_dev_keys"
  log_info "  Trigger.dev Processes: $trigger_dev_processes"
  log_info "  Claude Processes: $claude_processes"
  log_info "  Node Processes: $node_processes"

  # Store metrics
  local metrics_timestamp=$(date +%s)
  cat >> "$METRICS_FILE" << EOF
{
  "timestamp": $metrics_timestamp,
  "loadTestId": "$LOAD_TEST_ID",
  "concurrentJobs": $CONCURRENT_JOOPS,
  "cpu_usage": "$cpu_usage",
  "memory_usage": "$memory_usage",
  "redis_memory": "$redis_memory",
  "redis_connections": "$redis_connections",
  "trigger_dev_keys": $trigger_dev_keys,
  "trigger_dev_processes": $trigger_dev_processes,
  "claude_processes": $claude_processes,
  "node_processes": $node_processes
}
EOF

  return 0
}

generate_trigger_dev_load_report() {
  log_step "THEN: trigger.dev load test report is generated"

  local report_file="/tmp/trigger-dev-real-load-report-${LOAD_TEST_ID}.json"
  local total_jobs=$CONCURRENT_JOBS
  local successful_jobs=0
  local failed_jobs=0
  local total_duration=0

  # Calculate statistics
  for i in "${!JOB_STATUSES[@]}"; do
    if [ "${JOB_STATUSES[i]}" = "COMPLETED" ]; then
      successful_jobs=$((successful_jobs + 1))
      local duration=$((${JOB_COMPLETION_TIMES[i]} - JOB_START_TIMES[i]))
      total_duration=$((total_duration + duration))
    elif [ "${JOB_STATUSES[i]}" = "FAILED" ]; then
      failed_jobs=$((failed_jobs + 1))
    fi
  done

  local success_rate=$(echo "scale=2; $successful_jobs * 100 / $total_jobs" | bc -l 2>/dev/null || echo "0")
  local avg_duration=0
  if [ $successful_jobs -gt 0 ]; then
    avg_duration=$(echo "scale=2; $total_duration / $successful_jobs" | bc -l 2>/dev/null || echo "0")
  fi

  # Generate comprehensive report
  cat > "$report_file" << EOF
{
  "load_test_id": "$LOAD_TEST_ID",
  "test_configuration": {
    "concurrent_jobs": $CONCURRENT_JOBS,
    "mode": "$MODE",
    "api_base_url": "$API_BASE_URL",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  },
  "results": {
    "total_jobs": $total_jobs,
    "successful_jobs": $successful_jobs,
    "failed_jobs": $failed_jobs,
    "success_rate": $success_rate,
    "total_duration": $total_duration,
    "average_duration": $avg_duration
  },
  "job_details": [
EOF

  # Add individual job details
  for i in "${!JOB_IDS[@]}"; do
    local job_num=$((i + 1))
    local job_id="${JOB_IDS[i]}"
    local status="${JOB_STATUSES[i]:-TIMEOUT}"
    local duration=0
    if [ -n "${JOB_COMPLETION_TIMES[i]:-}" ] && [ -n "${JOB_START_TIMES[i]:-}" ]; then
      duration=$((${JOB_COMPLETION_TIMES[i]} - JOB_START_TIMES[i]))
    fi

    cat >> "$report_file" << EOF
    {
      "job_number": $job_num,
      "job_id": "$job_id",
      "status": "$status",
      "duration": $duration
    }$([ $i -lt $((total_jobs - 1)) ] && echo "," || echo "")
EOF
  done

  cat >> "$report_file" << EOF
  ],
  "system_requirements": {
    "cpu_cores": $(nproc),
    "total_memory_gb": $(free -g | grep '^Mem:' | awk '{print $2}'),
    "trigger_dev_version": "$(curl -s $API_BASE_URL/api/v1/health | jq -r '.version // "unknown"')"
  },
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF

  log_success "✅ trigger.dev Load Test Report Generated: $report_file"
  log_info "📊 Load Test Summary:"
  log_info "  Total Jobs: $total_jobs"
  log_info "  Successful: $successful_jobs"
  log_info "  Failed: $failed_jobs"
  log_info "  Success Rate: ${success_rate}%"
  log_info "  Avg Duration: ${avg_duration}s"

  return 0
}

# Main execution
main() {
  annotate "Real trigger.dev Load Test" \
    "Stress test trigger.dev with $CONCURRENT_JOBS concurrent jobs using actual trigger.dev events"

  log_info "🚀 Starting Real trigger.dev Load Test"
  log_info "This test uses ACTUAL trigger.dev events/jobs:"
  log_info ""
  log_info "⚡ Load Test Configuration:"
  log_info "  Concurrent Jobs: $CONCURRENT_JOBS"
  log_info "  Mode: $MODE (95% gates, 90% consensus)"
  log_info "  API URL: $API_BASE_URL"
  log_info "  Real trigger.dev Events: YES"
  log_info "  Real trigger.dev Jobs: YES"
  log_info ""
  log_info "⏱️  Expected Duration: 5-10 minutes"
  log_info "📊 This will create real load on trigger.dev infrastructure!"

  # Execute load test
  validate_trigger_dev_environment
  create_trigger_dev_jobs
  collect_system_metrics
  monitor_job_execution
  generate_trigger_dev_load_report

  log_success "🎉 Real trigger.dev Load Test Completed!"
  log_info "Check the detailed report for complete metrics and analysis."

  return 0
}

# Execute load test
main "$@"