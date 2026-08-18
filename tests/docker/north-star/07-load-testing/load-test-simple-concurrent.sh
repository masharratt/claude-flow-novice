#!/usr/bin/env bash
# tests/docker/north-star/07-load-testing/load-test-simple-concurrent.sh
# Phase 7 :: Simple concurrent test using direct agent spawning

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Simple concurrent test configuration
LOAD_TEST_ID="simple-concurrent-$(date +%s)"
CONCURRENT_AGENTS=${1:-5}  # Default to 5 concurrent agents
AGENT_TIMEOUT=180  # 3 minutes max per agent

# Performance tracking
declare -a AGENT_PIDS=()
declare -a AGENT_START_TIMES=()
declare -a AGENT_COMPLETION_TIMES=()
declare -a AGENT_EXIT_CODES=()

cleanup() {
  log_step "Cleanup: Simple concurrent test artifacts"

  # Kill all remaining agent processes
  for pid in "${AGENT_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      log_info "Terminating agent process $pid"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done

  # Clean up temporary files
  rm -rf "/tmp/simple-concurrent-*" || true

  log_info "Cleanup completed"
}
trap cleanup EXIT

validate_environment() {
  log_step "GIVEN: Simple concurrent environment is validated"

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

  # Check Claude Flow Novice
  if ! npx claude-flow-novice --help &> /dev/null; then
    log_error "Claude Flow Novice not available"
    return 1
  fi

  log_info "✅ Environment validated"
  log_info "  Concurrent agents: $CONCURRENT_AGENTS"
  log_info "  Agent timeout: ${AGENT_TIMEOUT}s"

  return 0
}

spawn_concurrent_agents() {
  log_step "WHEN: $CONCURRENT_AGENTS agents are spawned concurrently"

  # Create different agent types and tasks
  local agent_types=("backend-developer" "frontend-engineer" "tester" "code-quality-validator" "documentation-specialist")
  local task_descriptions=(
    "Create a RESTful API server with Express.js that includes user authentication and database integration"
    "Build a responsive dashboard application with real-time data visualization and interactive charts"
    "Develop comprehensive unit tests for a Node.js application with mocking and coverage reporting"
    "Perform code quality analysis on a TypeScript project including security vulnerabilities and performance issues"
    "Create comprehensive API documentation with examples, diagrams, and usage guidelines"
  )

  log_info "Spawning $CONCURRENT_AGENTS agents CONCURRENTLY..."

  # Spawn ALL agents at once without delays for true concurrency
  for ((i=1; i<=CONCURRENT_AGENTS; i++)); do
    local agent_index=$((i - 1))
    local agent_type="${agent_types[$agent_index]}"
    local task_description="${task_descriptions[$agent_index]}"

    log_info "Starting concurrent agent $i: $agent_type"

    # Record start time
    AGENT_START_TIMES[i-1]=$(date +%s)

    # Create agent-specific workspace
    local workspace_dir="/tmp/simple-concurrent-workspace-$LOAD_TEST_ID/agent-$i"
    mkdir -p "$workspace_dir"

    # Spawn agent in background with NO delays for true concurrency
    (
      cd "$PROJECT_ROOT"
      timeout $AGENT_TIMEOUT npx claude-flow-novice agent "$agent_type" \
        --context="$task_description" \
        --workspace="$workspace_dir" \
        --mode=mvp \
        --provider=zai \
        2>&1 | tee "/tmp/simple-concurrent-log-$LOAD_TEST_ID-agent-$i.log"
    ) &

    local agent_pid=$!
    AGENT_PIDS[i-1]=$agent_pid

    log_info "✅ Agent $i ($agent_type) spawned concurrently with PID: $agent_pid"

    # NO DELAY HERE - spawn all agents immediately for true concurrency
  done

  log_info "✅ All $CONCURRENT_AGENTS agents spawned concurrently"
  return 0
}

monitor_concurrent_agents() {
  log_step "THEN: Concurrent agent execution is monitored"

  local max_wait=$AGENT_TIMEOUT
  local check_interval=10  # Check every 10 seconds
  local waited=0

  log_info "Monitoring $CONCURRENT_AGENTS concurrent agents..."

  while [ $waited -lt $max_wait ]; do
    local active_agents=0
    local completed_agents=0
    local failed_agents=0

    # Check status of all agents
    for i in "${!AGENT_PIDS[@]}"; do
      local agent_pid=${AGENT_PIDS[i]}
      local agent_num=$((i + 1))

      if kill -0 "$agent_pid" 2>/dev/null; then
        # Agent still running
        active_agents=$((active_agents + 1))
      else
        # Agent completed
        if [ -z "${AGENT_EXIT_CODES[i]:-}" ]; then
          wait "$agent_pid"
          local exit_code=$?
          AGENT_EXIT_CODES[i]=$exit_code

          local completion_time=$(date +%s)
          local duration=$((completion_time - AGENT_START_TIMES[i]))
          AGENT_COMPLETION_TIMES[i]=$duration

          if [ $exit_code -eq 0 ]; then
            completed_agents=$((completed_agents + 1))
            log_success "✅ Agent $agent_num completed successfully (${duration}s)"
          else
            failed_agents=$((failed_agents + 1))
            log_warn "⚠️  Agent $agent_num completed with exit code: $exit_code (${duration}s)"
          fi
        fi
      fi
    done

    log_info "Concurrent progress: $active_agents running, $completed_agents completed, $failed_agents failed (${waited}s elapsed)"

    # Check if all agents are complete
    if [ $((completed_agents + failed_agents)) -eq $CONCURRENT_AGENTS ]; then
      log_info "All concurrent agents completed"
      break
    fi

    sleep $check_interval
    waited=$((waited + check_interval))
  done

  # Handle timeout for any remaining agents
  local remaining_agents=0
  for i in "${!AGENT_PIDS[@]}"; do
    local agent_pid=${AGENT_PIDS[i]}
    local agent_num=$((i + 1))

    if kill -0 "$agent_pid" 2>/dev/null; then
      log_warn "⚠️  Agent $agent_num timeout, terminating..."
      kill -TERM "$agent_pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$agent_pid" 2>/dev/null || true

      AGENT_EXIT_CODES[i]=124  # Timeout exit code
      remaining_agents=$((remaining_agents + 1))
    fi
  done

  if [ $remaining_agents -gt 0 ]; then
    log_warn "$remaining_agents agents terminated due to timeout"
  fi

  return 0
}

collect_system_metrics() {
  log_step "AND: System metrics are collected during concurrent test"

  # CPU and Memory usage
  local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>/dev/null || echo "0")
  local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}' 2>/dev/null || echo "0")

  # Redis metrics
  local redis_memory=$(redis-cli info memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "unknown")
  local redis_connections=$(redis-cli info clients 2>/dev/null | grep "connected_clients:" | cut -d: -f2 || echo "0")

  # Process counts
  local claude_processes=$(pgrep -f "claude-flow-novice" | wc -l || echo "0")
  local node_processes=$(pgrep -f "node" | wc -l || echo "0")
  local active_agent_pids=0

  # Count active agent processes
  for pid in "${AGENT_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      active_agent_pids=$((active_agent_pids + 1))
    fi
  done

  log_info "📊 Concurrent System Metrics:"
  log_info "  CPU Usage: ${cpu_usage}%"
  log_info "  Memory Usage: ${memory_usage}%"
  log_info "  Redis Memory: $redis_memory"
  log_info "  Redis Connections: $redis_connections"
  log_info "  Claude Processes: $claude_processes"
  log_info "  Node Processes: $node_processes"
  log_info "  Active Agents: $active_agent_pids"

  return 0
}

generate_concurrent_report() {
  log_step "THEN: Concurrent test report is generated"

  local report_file="/tmp/simple-concurrent-report-${LOAD_TEST_ID}.json"
  local total_agents=$CONCURRENT_AGENTS
  local successful_agents=0
  local failed_agents=0
  local timeout_agents=0
  local total_duration=0

  # Calculate statistics
  for i in "${!AGENT_EXIT_CODES[@]}"; do
    if [ "${AGENT_EXIT_CODES[i]}" -eq 0 ]; then
      successful_agents=$((successful_agents + 1))
      total_duration=$((total_duration + AGENT_COMPLETION_TIMES[i]))
    elif [ "${AGENT_EXIT_CODES[i]}" -eq 124 ]; then
      timeout_agents=$((timeout_agents + 1))
    else
      failed_agents=$((failed_agents + 1))
    fi
  done

  local success_rate=$(echo "scale=2; $successful_agents * 100 / $total_agents" | bc -l 2>/dev/null || echo "0")
  local avg_duration=0
  if [ $successful_agents -gt 0 ]; then
    avg_duration=$(echo "scale=2; $total_duration / $successful_agents" | bc -l 2>/dev/null || echo "0")
  fi

  # Calculate concurrency efficiency
  local min_start_time=$(printf "%s\n" "${AGENT_START_TIMES[@]}" | sort -n | head -1)
  local max_end_time=$(printf "%s\n" "${AGENT_COMPLETION_TIMES[@]}" | sort -n | tail -1)
  local total_concurrent_time=$((max_end_time - min_start_time))

  # Generate report
  cat > "$report_file" << EOF
{
  "load_test_id": "$LOAD_TEST_ID",
  "test_configuration": {
    "concurrent_agents": $CONCURRENT_AGENTS,
    "agent_timeout": $AGENT_TIMEOUT,
    "execution_type": "TRUE_CONCURRENT",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  },
  "results": {
    "total_agents": $total_agents,
    "successful_agents": $successful_agents,
    "failed_agents": $failed_agents,
    "timeout_agents": $timeout_agents,
    "success_rate": $success_rate,
    "total_duration": $total_duration,
    "average_duration": $avg_duration,
    "concurrent_execution_time": $total_concurrent_time
  },
  "agent_details": [
EOF

  # Add individual agent details
  for i in "${!AGENT_PIDS[@]}"; do
    local agent_num=$((i + 1))
    local pid="${AGENT_PIDS[i]}"
    local exit_code="${AGENT_EXIT_CODES[i]}"
    local duration="${AGENT_COMPLETION_TIMES[i]}"
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
      "agent_number": $agent_num,
      "pid": "$pid",
      "exit_code": $exit_code,
      "start_time": ${AGENT_START_TIMES[i]},
      "duration": $duration,
      "status": "$status"
    }$([ $i -lt $((total_agents - 1)) ] && echo "," || echo "")
EOF
  done

  cat >> "$report_file" << EOF
  ],
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF

  log_success "✅ Concurrent Test Report Generated: $report_file"
  log_info "📊 Concurrent Test Summary:"
  log_info "  Total Agents: $total_agents"
  log_info "  Successful: $successful_agents"
  log_info "  Failed: $failed_agents"
  log_info "  Timeout: $timeout_agents"
  log_info "  Success Rate: ${success_rate}%"
  log_info "  Avg Duration: ${avg_duration}s"
  log_info "  Concurrent Execution Time: ${total_concurrent_time}s"

  return 0
}

# Main execution
main() {
  annotate "Simple Concurrent Agent Test" \
    "TRUE concurrent test with $CONCURRENT_AGENTS agents running simultaneously"

  log_info "🚀 Starting Simple Concurrent Agent Test"
  log_info "This test executes agents ACTUALLY CONCURRENTLY (no delays):"
  log_info ""
  log_info "⚡ Concurrent Test Configuration:"
  log_info "  Concurrent Agents: $CONCURRENT_AGENTS"
  log_info "  Agent Timeout: ${AGENT_TIMEOUT}s"
  log_info "  Execution Type: TRUE_CONCURRENT (no delays)"
  log_info "  Real Agent Spawning: YES"
  log_info ""
  log_info "⏱️  Expected Duration: ${AGENT_TIMEOUT}s max"
  log_info "📊 This tests TRUE agent concurrency performance!"

  # Execute concurrent test
  validate_environment
  collect_system_metrics
  spawn_concurrent_agents
  monitor_concurrent_agents
  collect_system_metrics
  generate_concurrent_report

  log_success "🎉 Simple Concurrent Agent Test Completed!"
  log_info "Check the detailed report for concurrency metrics and analysis."

  return 0
}

# Execute concurrent test
main "$@"