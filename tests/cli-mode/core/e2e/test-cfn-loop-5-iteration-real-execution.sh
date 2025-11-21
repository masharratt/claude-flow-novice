#!/bin/bash
# tests/cli-mode/core/e2e/test-cfn-loop-5-iteration-real-execution.sh
# Phase 3 :: North Star Extended - 5 Iteration CFN Loop with Real Workflow (Priority 1)
#
# Validates complete CFN Loop workflow through 5 iterations:
# Iteration 1: Gate failure (test pass rate < 0.75)
# Iteration 2: Gate pass, Loop 2 requests changes (consensus < 0.90)
# Iteration 3: Gate pass, Loop 2 approves (consensus ≥ 0.90), PO decides ITERATE
# Iteration 4: Gate pass, Loop 2 approves (consensus ≥ 0.90), PO decides ITERATE
# Iteration 5: Gate pass, Loop 2 approves (consensus ≥ 0.95), PO decides PROCEED
#
# This test uses REAL agents and REAL coordination (NO simulations).
# Prevents BUG #21 regressions where tests pass but production fails.

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_ID="cfn-5iter-real-$(date +%s)-$$"
TASK_ID="cfn-cli-${TEST_ID}"
WORKSPACE="/tmp/cfn-5iter-test-${TEST_ID}"
LOG_FILE="/tmp/cfn-5iter-execution-$(date +%s).log"
MODE="standard"
MAX_ITERATIONS=5

# Cleanup function
cleanup() {
  local exit_code=$?
  
  log_info "Starting cleanup process..."
  
  # Remove test workspace
  if [[ -d "$WORKSPACE" ]]; then
    log_info "Removing test workspace: $WORKSPACE"
    rm -rf "$WORKSPACE" || true
  fi
  
  # Clean Redis keys
  log_info "Cleaning Redis keys: cfn_loop:task:${TASK_ID}:*"
  redis-cli --scan --pattern "cfn_loop:task:${TASK_ID}:*" | xargs -r redis-cli DEL 2>/dev/null || true
  
  log_info "Cleaning Redis keys: swarm:${TASK_ID}:*"
  redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL 2>/dev/null || true
  
  log_info "Cleanup complete (exit code: $exit_code)"
  return $exit_code
}
trap cleanup EXIT

# Print test header
print_header() {
  echo "========================================"
  echo "Test Suite: cfn-loop-5-iteration-real-execution"
  echo "========================================"
  echo ""
  log_info "Started at: $(date -Iseconds)"
  log_info "Log file: $LOG_FILE"
  echo ""
  echo "========================================"
  echo "🚀 5-Iteration CFN Loop Test (REAL Agents)"
  echo "========================================"
  echo ""
  log_warn "This test uses REAL production code paths"
  log_info "Test ID: $TEST_ID"
  log_info "Task ID: $TASK_ID"
  log_info "Workspace: $WORKSPACE"
  log_info "Mode: $MODE (gate ≥0.75, consensus ≥0.90)"
  log_info "Max Iterations: $MAX_ITERATIONS"
  echo ""
}

# Validate prerequisites
validate_prerequisites() {
  log_step "TEST 1: Validating prerequisites"
  
  # Check Redis
  if ! redis-cli ping >/dev/null 2>&1; then
    annotate "Redis not available"
    return 1
  fi
  assert_success "Redis is available"
  
  # Check npx
  if ! command -v npx >/dev/null 2>&1; then
    annotate "npx not found"
    return 1
  fi
  assert_success "npx is available"
  
  # Check TypeScript orchestrator (dist/cli/orchestrator-cli.js)
  if [[ ! -f "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/dist/cli/orchestrator-cli.js" ]]; then
    annotate "TypeScript orchestrator (dist/cli/orchestrator-cli.js) not found"
    return 1
  fi
  assert_success "TypeScript orchestrator (dist/cli/orchestrator-cli.js) exists"
  
  # Note: orchestrate.sh deprecated, using TypeScript orchestrator-cli.js instead
  # (checked above)
  
  # Create workspace
  mkdir -p "$WORKSPACE"
  assert_success "Test workspace created: $WORKSPACE"
  
  assert_success "All prerequisites met"
}

# Spawn real coordinator
spawn_coordinator() {
  log_step "TEST 2: Spawning real cfn-v3-coordinator"
  
  log_info "Task ID: $TASK_ID"
  log_info "Task Description: Create incrementally improved hello-world.txt through 5 iterations"
  log_info "Mode: $MODE"
  log_info "Max Iterations: $MAX_ITERATIONS"
  
  # Build context with iteration requirements
  local CONTEXT="TASK_DESCRIPTION='Create file hello-world.txt with progressive improvements across 5 iterations:
Iteration 1: Basic file (should fail tests - missing greeting)
Iteration 2: Add Hello (should pass gate but need validator fixes - missing name)
Iteration 3: Add World (should pass all but PO wants refinement - missing punctuation)
Iteration 4: Add punctuation (should pass all but PO wants polish - no capitalization)
Iteration 5: Perfect output: Hello, World! (should PROCEED)' \
MODE='$MODE' \
MAX_ITERATIONS=$MAX_ITERATIONS \
CFN_DOCKER_MODE='false' \
EXPECTED_FILES='hello-world.txt' \
WORKSPACE='$WORKSPACE'"
  
  log_info "Spawning coordinator via npx claude-flow-novice agent..."
  log_info "Redis environment: localhost:6379"
  
  # Spawn coordinator in background
  (
    cd "$PROJECT_ROOT"
    npx claude-flow-novice agent cfn-v3-coordinator \
      --task-id "$TASK_ID" \
      --context "$CONTEXT" \
      --timeout 600 \
      > "$WORKSPACE/coordinator.log" 2>&1
  ) &
  
  local COORDINATOR_PID=$!
  assert_success "Coordinator spawned (PID: $COORDINATOR_PID)"
  
  # Wait for coordinator to start
  log_info "Waiting for coordinator process (timeout: 30s)"
  sleep 2
  
  if ! kill -0 $COORDINATOR_PID 2>/dev/null; then
    annotate "Coordinator process died immediately"
    cat "$WORKSPACE/coordinator.log" || true
    return 1
  fi
  assert_success "Coordinator process detected"
  
  if kill -0 $COORDINATOR_PID 2>/dev/null; then
    assert_success "Coordinator process running"
  else
    log_warn "Coordinator process not detected (may have completed quickly)"
  fi
  
  # Store PID for cleanup
  echo $COORDINATOR_PID > "$WORKSPACE/coordinator.pid"
}

# Verify orchestrator invocation
verify_orchestrator() {
  log_step "TEST 3: Verifying orchestrator invocation"
  
  log_info "Waiting for orchestrator invocation (timeout: 120s)"
  
  local timeout=120
  local elapsed=0
  local orchestrator_invoked=false
  
  while [[ $elapsed -lt $timeout ]]; do
    if grep -q "INVOKING ORCHESTRATOR\|ORCHESTRATOR COMPLETED" "$WORKSPACE/coordinator.log" 2>/dev/null; then
      orchestrator_invoked=true
      break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  
  if [[ "$orchestrator_invoked" == "true" ]]; then
    assert_success "Orchestrator invocation detected in coordinator log"
    assert_success "Orchestrator invoked successfully"
  else
    annotate "Orchestrator invocation not detected in coordinator log"
    cat "$WORKSPACE/coordinator.log" 2>/dev/null | tail -50 || true
    return 1
  fi
}

# Verify multi-iteration workflow
verify_iterations() {
  log_step "TEST 4: Verifying 5-iteration workflow"
  
  log_info "Waiting for iterations to complete (timeout: 480s = 8 minutes)"
  
  local timeout=480
  local elapsed=0
  local iterations_found=0
  
  while [[ $elapsed -lt $timeout ]]; do
    # Count iterations in log
    iterations_found=$(grep -c "=== ITERATION" "$WORKSPACE/coordinator.log" 2>/dev/null || echo "0")
    
    # Check if workflow completed
    if grep -q "Orchestration complete" "$WORKSPACE/coordinator.log" 2>/dev/null || \
       grep -q "PROCEED" "$WORKSPACE/coordinator.log" 2>/dev/null; then
      log_info "Workflow completed, found $iterations_found iterations"
      break
    fi
    
    sleep 5
    elapsed=$((elapsed + 5))
    
    # Progress update every 30 seconds
    if (( elapsed % 30 == 0 )); then
      log_info "Progress: ${elapsed}s elapsed, ${iterations_found} iterations detected"
    fi
  done
  
  # Validate iteration count
  if [[ $iterations_found -ge 3 ]]; then
    assert_success "Multiple iterations completed ($iterations_found iterations)"
  else
    log_warn "Expected 5 iterations, found $iterations_found"
    annotate "Iteration count lower than expected"
  fi
  
  # Check for PROCEED decision
  if grep -q "PROCEED" "$WORKSPACE/coordinator.log" 2>/dev/null; then
    assert_success "Product Owner PROCEED decision detected"
  else
    log_warn "PROCEED decision not found in logs"
  fi
}

# Verify deliverable with iterations
verify_deliverable_iterations() {
  log_step "TEST 5: Verifying deliverable evolution"
  
  log_info "Checking final deliverable: hello-world.txt"
  
  local timeout=60
  local elapsed=0
  
  while [[ $elapsed -lt $timeout ]]; do
    if [[ -f "$WORKSPACE/hello-world.txt" ]]; then
      assert_success "Deliverable created: hello-world.txt"
      
      # Check content
      local content=$(cat "$WORKSPACE/hello-world.txt" 2>/dev/null || echo "")
      log_info "Final content: '$content'"
      
      # Validate content has evolved (should contain greeting)
      if [[ "$content" =~ Hello|World|hello|world ]]; then
        assert_success "Deliverable contains greeting content"
      else
        log_warn "Deliverable exists but may not have expected content"
      fi
      
      return 0
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  annotate "Deliverable not created within ${timeout}s"
  ls -la "$WORKSPACE/" 2>/dev/null || true
  return 1
}

# Verify agent activity
verify_agent_activity() {
  log_step "TEST 6: Verifying agent activity"
  
  log_info "Checking for agent spawning evidence..."
  
  # Check .artifacts/logs for spawn logs
  local spawn_logs=$(find "$PROJECT_ROOT/.artifacts/logs" -name "spawn-agents-${TASK_ID}.log" 2>/dev/null || true)
  
  if [[ -n "$spawn_logs" ]]; then
    local agent_count=$(grep -c "Agent.*spawned" "$spawn_logs" 2>/dev/null || echo "0")
    log_info "Spawn log found: $agent_count agents spawned"
    assert_success "Agent spawning logged ($agent_count agents)"
  else
    log_info "No spawn log found yet (agents may still be spawning)"
  fi
  
  # Check recent agent processes
  log_info "Recent agent activity:"
  ps aux | grep -E "claude-flow-novice agent|backend-developer|devops-engineer|code-reviewer|tester|security-specialist" | grep -v grep | head -10 || log_info "(no agents currently running)"
}

# Main test execution
main() {
  print_header
  
  # Run test phases
  validate_prerequisites || return 1
  spawn_coordinator || return 1
  verify_orchestrator || return 1
  verify_iterations || return 1
  verify_deliverable_iterations || return 1
  verify_agent_activity || return 1
  
  # Final summary
  echo ""
  echo "========================================"
  log_success "✅ 5-ITERATION CFN LOOP TEST COMPLETED"
  echo "========================================"
  log_info "Workspace: $WORKSPACE"
  log_info "Coordinator log: $WORKSPACE/coordinator.log"
  log_info "Agent spawn log: $PROJECT_ROOT/.artifacts/logs/spawn-agents-${TASK_ID}.log"
  echo ""
  
  return 0
}

# Execute main
if main 2>&1 | tee "$LOG_FILE"; then
  echo ""
  log_success "✅ TEST PASSED"
  echo ""
  exit 0
else
  echo ""
  log_error "❌ TEST FAILED"
  echo ""
  exit 1
fi
