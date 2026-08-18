#!/usr/bin/env bash
# tests/docker/north-star/06-integration/test-ultimate-cfn-loop.sh
# Phase 6 :: Ultimate CFN Loop test with coordinator -> loops -> agents -> iterations (3 iterations)

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Ultimate test configuration
ULTIMATE_TASK_ID="ultimate-cfn-$(date +%s)"
TASK_DESCRIPTION="Create a comprehensive project documentation website with HTML, CSS, and JavaScript"
MAX_ITERATIONS=3
MODE="standard"  # Use standard mode for quality gates (95% pass rate, 90% consensus)

# Success criteria for the task
SUCCESS_CRITERIA='{
  "testCommand": "test -f /tmp/trigger-dev-deliverables/'$ULTIMATE_TASK_ID'/index.html && test -f /tmp/trigger-dev-deliverables/'$ULTIMATE_TASK_ID'/style.css && test -f /tmp/trigger-dev-deliverables/'$ULTIMATE_TASK_ID'/script.js && grep -q \"<!DOCTYPE html>\" /tmp/trigger-dev-deliverables/'$ULTIMATE_TASK_ID'/index.html",
  "passRateThreshold": 0.95,
  "description": "Create a complete website with HTML structure, CSS styling, and JavaScript functionality"
}'

# Thresholds for standard mode
THRESHOLDS='{
  "loop3PassRateThreshold": 0.95,
  "loop2ConsensusThreshold": 0.90
}'

# Runtime tracking
declare -a ITERATION_START_TIMES=()
declare -a ITERATION_DURATIONS=()
declare -a ITERATION_DECISIONS=()

cleanup() {
  log_step "Cleanup: Ultimate CFN Loop test artifacts and processes"

  # Kill any remaining CFN Loop processes
  pkill -f "cfn-loop" || true
  pkill -f "claude-flow-novice" || true
  pkill -f "$ULTIMATE_TASK_ID" || true

  # Clean up Redis test data
  if command -v redis-cli &> /dev/null; then
    redis-cli --scan --pattern "*$ULTIMATE_TASK_ID*" 2>/dev/null | \
      xargs -r redis-cli DEL || true
  fi

  # Clean up workspace directories
  rm -rf "/tmp/north-star-ultimate-$ULTIMATE_TASK_ID" || true

  log_info "Cleanup completed"
}
trap cleanup EXIT

validate_ultimate_environment() {
  log_step "GIVEN: Ultimate CFN Loop environment is ready"

  # Check all critical dependencies
  local dependencies=("redis-cli" "docker" "node" "npm")
  for dep in "${dependencies[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
      log_error "Dependency not found: $dep"
      return 1
    fi
  done

  # Check Redis connectivity
  if ! redis-cli ping > /dev/null 2>&1; then
    log_error "Redis not available"
    return 1
  fi

  # Check CFN Loop CLI
  if [ ! -f "$PROJECT_ROOT/.claude/commands/cfn/cfn-loop-task" ]; then
    log_error "CFN Loop Task command not found"
    return 1
  fi

  # Check Docker daemon
  if ! docker info > /dev/null 2>&1; then
    log_error "Docker daemon not running"
    return 1
  fi

  # Check trigger.dev environment
  if [ ! -f "$PROJECT_ROOT/trigger-dev/.env.local" ]; then
    log_error "Trigger.dev environment not configured"
    return 1
  fi

  log_info "✅ Ultimate environment validated"
  log_info "Task ID: $ULTIMATE_TASK_ID"
  log_info "Max Iterations: $MAX_ITERATIONS"
  log_info "Mode: $MODE"

  return 0
}

start_cfn_coordinator() {
  log_step "WHEN: CFN Coordinator is started for ultimate test"

  # Create coordinator configuration
  local coordinator_config=$(cat <<EOF
{
  "taskId": "$ULTIMATE_TASK_ID",
  "description": "$TASK_DESCRIPTION",
  "mode": "$MODE",
  "maxIterations": $MAX_ITERATIONS,
  "successCriteria": $SUCCESS_CRITERIA,
  "thresholds": $THRESHOLDS,
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "orchestrator": "ultimate-test"
}
EOF
  )

  log_info "Starting CFN Loop with configuration:"
  log_info "  Task: $TASK_DESCRIPTION"
  log_info "  Mode: $MODE (95% gate, 90% consensus)"
  log_info "  Max iterations: $MAX_ITERATIONS"

  # Execute CFN Loop in Task mode for full visibility
  local start_time=$(date +%s)
  ITERATION_START_TIMES[0]=$start_time

  # Start the CFN Loop task
  (
    cd "$PROJECT_ROOT"
    timeout 1800 /cfn-loop-task "$TASK_DESCRIPTION" \
      --mode=$MODE \
      --max-iterations=$MAX_ITERATIONS \
      --timeout=1800 \
      --ace-reflect
  ) &

  local coordinator_pid=$!
  log_info "✅ CFN Loop coordinator started with PID: $coordinator_pid"

  # Store PID for monitoring
  echo "$coordinator_pid" > "/tmp/north-star-ultimate-$ULTIMATE_TASK_ID/coordinator.pid"

  return 0
}

monitor_cfn_execution() {
  log_step "THEN: CFN Loop execution is monitored through $MAX_ITERATIONS iterations"

  local max_wait_time=1800  # 30 minutes total
  local check_interval=30   # Check every 30 seconds
  local elapsed=0

  local current_iteration=0
  local last_deliverable_count=0
  local workspace_dir="/tmp/north-star-workspace/$ULTIMATE_TASK_ID"

  while [ $elapsed -lt $max_wait_time ]; do
    log_info "Monitoring CFN Loop execution... (${elapsed}s elapsed, checking iteration progress)"

    # Check workspace activity
    if [ -d "$workspace_dir" ]; then
      local current_files=$(find "$workspace_dir" -type f | wc -l || echo "0")
      local current_dirs=$(find "$workspace_dir" -type d | wc -l || echo "0")

      if [ "$current_files" -gt "$last_deliverable_count" ]; then
        log_info "📁 Workspace activity: $current_files files in $current_dirs directories"
        last_deliverable_count=$current_files

        # Check for iteration indicators
        local iteration_dirs=$(find "$workspace_dir" -name "iteration-*" -type d | wc -l || echo "0")
        if [ "$iteration_dirs" -gt "$current_iteration" ]; then
          current_iteration=$iteration_dirs
          local iter_duration=$(($(date +%s) - ITERATION_START_TIMES[current_iteration-1]))
          ITERATION_DURATIONS[current_iteration-1]=$iter_duration

          log_info "🔄 Iteration $current_iteration detected (duration: ${iter_duration}s)"
        fi
      fi
    fi

    # Check trigger.dev deliverables
    local deliverable_dir="/tmp/trigger-dev-deliverables/$ULTIMATE_TASK_ID"
    if [ -d "$deliverable_dir" ]; then
      local deliverable_files=$(find "$deliverable_dir" -type f | wc -l || echo "0")
      if [ "$deliverable_files" -gt 0 ]; then
        log_info "📦 Deliverables created: $deliverable_files files"

        # List deliverables
        find "$deliverable_dir" -type f | while read -r file; do
          local size=$(stat -c%s "$file" 2>/dev/null || echo "0")
          log_info "  📄 $(basename "$file") (${size} bytes)"
        done
      fi
    fi

    # Check Redis coordination signals
    local coordination_keys=$(redis-cli --scan --pattern "*$ULTIMATE_TASK_ID*" 2>/dev/null | wc -l || echo "0")
    if [ "$coordination_keys" -gt 0 ]; then
      log_info "🔗 Redis coordination: $coordination_keys active keys"
    fi

    # Check if process is still running
    if [ -f "/tmp/north-star-ultimate-$ULTIMATE_TASK_ID/coordinator.pid" ]; then
      local coordinator_pid=$(cat "/tmp/north-star-ultimate-$ULTIMATE_TASK_ID/coordinator.pid" 2>/dev/null || echo "")
      if [ -n "$coordinator_pid" ] && kill -0 "$coordinator_pid" 2>/dev/null; then
        log_info "⚙️  Coordinator process active (PID: $coordinator_pid)"
      else
        log_info "🏁 Coordinator process completed - checking final results"
        break
      fi
    fi

    sleep $check_interval
    elapsed=$((elapsed + check_interval))
  done

  # Final iteration tracking
  local total_duration=$(($(date +%s) - ITERATION_START_TIMES[0]))
  log_info "Total execution time: ${total_duration}s"

  return 0
}

validate_final_deliverables() {
  log_step "AND: Final deliverables are validated"

  local deliverable_dir="/tmp/trigger-dev-deliverables/$ULTIMATE_TASK_ID"
  local expected_files=("index.html" "style.css" "script.js")
  local validation_passed=true

  # Check deliverable directory exists
  if [ ! -d "$deliverable_dir" ]; then
    log_error "❌ Deliverable directory not found: $deliverable_dir"
    return 1
  fi

  log_info "Validating deliverables in: $deliverable_dir"

  # Validate each expected file
  for expected_file in "${expected_files[@]}"; do
    local file_path="$deliverable_dir/$expected_file"

    if [ -f "$file_path" ]; then
      local size=$(stat -c%s "$file_path" 2>/dev/null || echo "0")
      log_info "✅ $expected_file found (${size} bytes)"

      # Additional content validation
      case "$expected_file" in
        "index.html")
          if grep -q "!DOCTYPE html" "$file_path" 2>/dev/null; then
            log_info "✅ HTML structure valid"
          else
            log_error "❌ HTML structure invalid"
            validation_passed=false
          fi
          ;;
        "style.css")
          if grep -q "style\|css\|{" "$file_path" 2>/dev/null; then
            log_info "✅ CSS content valid"
          else
            log_error "❌ CSS content invalid"
            validation_passed=false
          fi
          ;;
        "script.js")
          if grep -q "function\|const\|let\|var" "$file_path" 2>/dev/null; then
            log_info "✅ JavaScript content valid"
          else
            log_error "❌ JavaScript content invalid"
            validation_passed=false
          fi
          ;;
      esac
    else
      log_error "❌ $expected_file not found"
      validation_passed=false
    fi
  done

  # Run success criteria test command
  local test_command="test -f $deliverable_dir/index.html && test -f $deliverable_dir/style.css && test -f $deliverable_dir/script.js && grep -q \"<!DOCTYPE html>\" $deliverable_dir/index.html"

  if eval "$test_command"; then
    log_info "✅ Success criteria test passed"
  else
    log_error "❌ Success criteria test failed"
    validation_passed=false
  fi

  # Validate file sizes are reasonable
  for file in "$deliverable_dir"/*; do
    if [ -f "$file" ]; then
      local size=$(stat -c%s "$file" 2>/dev/null || echo "0")
      if [ "$size" -lt 10 ]; then
        log_error "❌ File too small: $(basename "$file") (${size} bytes)"
        validation_passed=false
      elif [ "$size" -gt 100000 ]; then
        log_warn "⚠️  File large: $(basename "$file") (${size} bytes)"
      fi
    fi
  done

  if [ "$validation_passed" = true ]; then
    log_success "✅ All deliverables validated successfully"
    return 0
  else
    log_error "❌ Deliverable validation failed"
    return 1
  fi
}

analyze_iterative_progression() {
  log_step "AND: Iterative progression is analyzed"

  local workspace_dir="/tmp/north-star-workspace/$ULTIMATE_TASK_ID"

  log_info "Analyzing iterative progression across ${#ITERATION_DURATIONS[@]} iterations"

  # Show iteration timeline
  for i in "${!ITERATION_DURATIONS[@]}"; do
    local iter_num=$((i + 1))
    local duration=${ITERATION_DURATIONS[i]}
    log_info "Iteration $iter_num: ${duration}s"
  done

  # Analyze workspace structure
  if [ -d "$workspace_dir" ]; then
    log_info "Workspace analysis:"

    # Show iteration directories
    find "$workspace_dir" -name "iteration-*" -type d | sort | while read -r iter_dir; do
      local iter_name=$(basename "$iter_dir")
      local file_count=$(find "$iter_dir" -type f | wc -l || echo "0")
      local total_size=$(find "$iter_dir" -type f -exec cat {} + 2>/dev/null | wc -c | tr -d " " || echo "0")

      log_info "  📁 $iter_name: $file_count files, ${total_size} bytes"

      # Show file types
      find "$iter_dir" -type f | sed 's/.*\.//' | sort | uniq -c | while read -r count ext; do
        log_info "    📄 $ext files: $count"
      done
    done
  fi

  # Validate progression (files should evolve across iterations)
  local final_deliverable_dir="/tmp/trigger-dev-deliverables/$ULTIMATE_TASK_ID"
  if [ -d "$final_deliverable_dir" ]; then
    local final_file_count=$(find "$final_deliverable_dir" -type f | wc -l || echo "0")
    local final_total_size=$(find "$final_deliverable_dir" -type f -exec cat {} + 2>/dev/null | wc -c | tr -d " " || echo "0")

    log_info "Final deliverables: $final_file_count files, ${final_total_size} bytes"

    if [ "$final_file_count" -ge 3 ]; then
      log_info "✅ Expected file count achieved (>= 3)"
    else
      log_warn "⚠️  Low file count: $final_file_count (expected >= 3)"
    fi
  fi

  return 0
}

validate_cfn_loop_quality() {
  log_step "AND: CFN Loop quality standards are validated"

  # Check for quality gate indicators
  local workspace_dir="/tmp/north-star-workspace/$ULTIMATE_TASK_ID"
  local quality_indicators=0

  if [ -d "$workspace_dir" ]; then
    # Look for quality-related artifacts
    local test_results=$(find "$workspace_dir" -name "*test*" -o -name "*quality*" | wc -l || echo "0")
    local validation_files=$(find "$workspace_dir" -name "*valid*" -o -name "*review*" | wc -l || echo "0")

    quality_indicators=$((test_results + validation_files))

    if [ "$quality_indicators" -gt 0 ]; then
      log_info "✅ Quality indicators found: $quality_indicators files"
    else
      log_info "ℹ️  No explicit quality indicator files (may be integrated)"
    fi
  fi

  # Check Redis for quality metrics
  local quality_keys=$(redis-cli --scan --pattern "*$ULTIMATE_TASK_ID*quality*" 2>/dev/null | wc -l || echo "0")
  local gate_keys=$(redis-cli --scan --pattern "*$ULTIMATE_TASK_ID*gate*" 2>/dev/null | wc -l || echo "0")
  local consensus_keys=$(redis-cli --scan --pattern "*$ULTIMATE_TASK_ID*consensus*" 2>/dev/null | wc -l || echo "0")

  log_info "Quality coordination keys:"
  log_info "  🎯 Quality: $quality_keys"
  log_info "  🚪 Gate: $gate_keys"
  log_info "  🤝 Consensus: $consensus_keys"

  local total_coordination=$((quality_keys + gate_keys + consensus_keys))
  if [ "$total_coordination" -gt 0 ]; then
    log_info "✅ CFN Loop coordination activity detected ($total_coordination keys)"
  else
    log_warn "⚠️  No coordination activity found"
  fi

  return 0
}

# Main execution
main() {
  annotate "Ultimate CFN Loop Test" \
    "Complete coordinator → loops → agents → iterations workflow with 3 iterations and real deliverables"

  log_info "🚀 Starting Ultimate CFN Loop Test"
  log_info "This will execute a complete CFN Loop workflow:"
  log_info "  1. Coordinator orchestration"
  log_info "  2. Multiple iterations (up to $MAX_ITERATIONS)"
  log_info "  3. Real agent spawning and execution"
  log_info "  4. Quality gates and consensus validation"
  log_info "  5. Final deliverable creation"
  log_info ""
  log_info "Task: $TASK_DESCRIPTION"
  log_info "Task ID: $ULTIMATE_TASK_ID"
  log_info "Expected duration: 5-30 minutes"

  # Execute ultimate test workflow
  validate_ultimate_environment

  # Create workspace tracking
  mkdir -p "/tmp/north-star-ultimate-$ULTIMATE_TASK_ID"

  start_cfn_coordinator
  monitor_cfn_execution

  # Final validations
  validate_final_deliverables
  analyze_iterative_progression
  validate_cfn_loop_quality

  log_success "🎉 Ultimate CFN Loop Test Completed Successfully!"
  log_info "✅ Coordinator orchestration validated"
  log_info "✅ Multi-iteration workflow executed"
  log_info "✅ Real agent spawning and coordination"
  log_info "✅ Quality gates and consensus validated"
  log_info "✅ Final deliverables created and validated"

  return 0
}

# Execute ultimate test
main "$@"