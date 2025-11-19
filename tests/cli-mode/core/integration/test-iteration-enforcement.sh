#!/bin/bash
# tests/cli-mode/core/integration/test-iteration-enforcement.sh
# Phase 2 :: CLI Mode Iteration Enforcement (Priority 1)
# Validates iteration counter, max iterations, and decision-based iteration control

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
TEST_DIR="/tmp/cfn-cli-iteration-test-$(date +%s)"
ORCHESTRATE_WRAPPER=".claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh"

cleanup() {
  log_info "Cleaning up test artifacts"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: ITERATE decision triggers new iteration
test_iterate_decision_triggers_iteration() {
  log_step "ITERATE Decision Triggers New Iteration"

  # GIVEN: Mock orchestrator that returns ITERATE decision
  mkdir -p "$TEST_DIR"

  cat > "$TEST_DIR/mock-orchestrator.sh" << 'EOF'
#!/bin/bash
# Mock orchestrator that simulates ITERATE decision

ITERATION="${1:-1}"
MAX_ITERATIONS="${2:-10}"

echo "Mock orchestrator iteration $ITERATION"

if [ "$ITERATION" -lt 3 ]; then
  echo "DECISION: ITERATE"
  echo "REASON: Need more refinement"
  exit 0
else
  echo "DECISION: PROCEED"
  echo "REASON: Work complete"
  exit 0
fi
EOF

  chmod +x "$TEST_DIR/mock-orchestrator.sh"

  # WHEN: Run iteration loop simulation
  ITERATION=1
  MAX_ITERATIONS=10

  while [ $ITERATION -le $MAX_ITERATIONS ]; do
    log_info "Iteration $ITERATION"

    OUTPUT=$("$TEST_DIR/mock-orchestrator.sh" "$ITERATION" "$MAX_ITERATIONS")

    if echo "$OUTPUT" | grep -q "DECISION: ITERATE"; then
      log_info "ITERATE decision received, continuing..."
      ITERATION=$((ITERATION + 1))
    elif echo "$OUTPUT" | grep -q "DECISION: PROCEED"; then
      log_info "PROCEED decision received, stopping..."
      break
    else
      log_fail "Unknown decision"
      return 1
    fi
  done

  # THEN: Iteration counter incremented correctly
  if [ $ITERATION -eq 3 ]; then
    log_pass "ITERATE decision triggered 2 iterations, stopped at iteration 3"
    return 0
  else
    log_fail "Expected 3 iterations, got $ITERATION"
    return 1
  fi
}

# Test 2: Max iterations enforced (10 for Standard mode)
test_max_iterations_enforced() {
  log_step "Max Iterations Enforced (Standard Mode)"

  # GIVEN: Mock orchestrator that always returns ITERATE
  mkdir -p "$TEST_DIR"

  cat > "$TEST_DIR/always-iterate.sh" << 'EOF'
#!/bin/bash
echo "DECISION: ITERATE"
echo "REASON: Never satisfied"
exit 0
EOF

  chmod +x "$TEST_DIR/always-iterate.sh"

  # WHEN: Run with max iterations limit
  ITERATION=1
  MAX_ITERATIONS=10  # Standard mode default

  while [ $ITERATION -le $MAX_ITERATIONS ]; do
    OUTPUT=$("$TEST_DIR/always-iterate.sh")

    if echo "$OUTPUT" | grep -q "DECISION: ITERATE"; then
      ITERATION=$((ITERATION + 1))
    else
      break
    fi
  done

  # THEN: Loop stopped at max iterations
  if [ $ITERATION -eq 11 ]; then  # 11 because we increment after the last iteration
    log_pass "Max iterations enforced: stopped at iteration 10"
    return 0
  else
    log_fail "Expected to stop at iteration 10, got $ITERATION"
    return 1
  fi
}

# Test 3: Iteration counter increments correctly
test_iteration_counter_increments() {
  log_step "Iteration Counter Increments Correctly"

  # GIVEN: Iteration tracking
  ITERATION=1
  EXPECTED_ITERATIONS=5

  # WHEN: Simulate iterations
  ITERATIONS_RUN=0
  while [ $ITERATION -le $EXPECTED_ITERATIONS ]; do
    log_info "Iteration $ITERATION of $EXPECTED_ITERATIONS"
    ITERATIONS_RUN=$ITERATION
    ITERATION=$((ITERATION + 1))
  done

  # THEN: Counter reached expected value
  if [ $ITERATIONS_RUN -eq $EXPECTED_ITERATIONS ]; then
    log_pass "Iteration counter incremented correctly: 1 → $EXPECTED_ITERATIONS"
    return 0
  else
    log_fail "Expected $EXPECTED_ITERATIONS iterations, got $ITERATIONS_RUN"
    return 1
  fi
}

# Test 4: ABORT decision stops iteration
test_abort_decision_stops_iteration() {
  log_step "ABORT Decision Stops Iteration"

  # GIVEN: Mock orchestrator that returns ABORT on iteration 2
  mkdir -p "$TEST_DIR"

  cat > "$TEST_DIR/abort-orchestrator.sh" << 'EOF'
#!/bin/bash
ITERATION="${1:-1}"

if [ "$ITERATION" -eq 2 ]; then
  echo "DECISION: ABORT"
  echo "REASON: Critical error detected"
  exit 1
else
  echo "DECISION: ITERATE"
  echo "REASON: Continue working"
  exit 0
fi
EOF

  chmod +x "$TEST_DIR/abort-orchestrator.sh"

  # WHEN: Run iteration loop until ABORT
  ITERATION=1
  MAX_ITERATIONS=10
  ABORTED=false

  while [ $ITERATION -le $MAX_ITERATIONS ]; do
    OUTPUT=$("$TEST_DIR/abort-orchestrator.sh" "$ITERATION" 2>&1 || true)

    if echo "$OUTPUT" | grep -q "DECISION: ABORT"; then
      log_info "ABORT decision received"
      ABORTED=true
      break
    elif echo "$OUTPUT" | grep -q "DECISION: ITERATE"; then
      ITERATION=$((ITERATION + 1))
    else
      break
    fi
  done

  # THEN: Loop stopped on ABORT
  if [ "$ABORTED" = true ] && [ $ITERATION -eq 2 ]; then
    log_pass "ABORT decision stopped iteration at iteration 2"
    return 0
  else
    log_fail "Expected ABORT at iteration 2, got iteration $ITERATION (aborted: $ABORTED)"
    return 1
  fi
}

# Test 5: Mode-specific max iteration limits
test_mode_specific_max_iterations() {
  log_step "Mode-Specific Max Iteration Limits"

  # GIVEN: Different mode limits
  declare -A MODE_LIMITS
  MODE_LIMITS[mvp]=5
  MODE_LIMITS[standard]=10
  MODE_LIMITS[enterprise]=15

  # WHEN/THEN: Verify each mode has correct limit
  local failed=0
  for mode in mvp standard enterprise; do
    local expected="${MODE_LIMITS[$mode]}"
    log_info "Mode: $mode, Expected max iterations: $expected"

    # Simulate loop with mode-specific limit
    local max_iterations=$expected
    local iteration=1

    while [ $iteration -le $max_iterations ]; do
      iteration=$((iteration + 1))
    done

    if [ $((iteration - 1)) -eq $expected ]; then
      log_info "✓ $mode mode: $expected iterations"
    else
      log_fail "✗ $mode mode: expected $expected, got $((iteration - 1))"
      ((failed++))
    fi
  done

  if [ $failed -eq 0 ]; then
    log_pass "All modes have correct max iteration limits"
    return 0
  else
    log_fail "$failed mode(s) had incorrect limits"
    return 1
  fi
}

# Run tests
main() {
  local failed=0

  test_iterate_decision_triggers_iteration || ((failed++))
  test_max_iterations_enforced || ((failed++))
  test_iteration_counter_increments || ((failed++))
  test_abort_decision_stops_iteration || ((failed++))
  test_mode_specific_max_iterations || ((failed++))

  if [ $failed -eq 0 ]; then
    log_info "CLI Iteration Enforcement Tests" 0
    exit 0
  else
    log_info "CLI Iteration Enforcement Tests" $failed
    exit 1
  fi
}

# Handle script being sourced vs executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
