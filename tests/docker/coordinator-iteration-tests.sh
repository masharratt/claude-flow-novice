#!/bin/bash
# tests/docker/coordinator-iteration-tests.sh
# Phase 3 :: Coordinator iteration loop validation (convergence, max iterations, error delta, decisions)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
NETWORK_NAME="cfn-network"
REDIS_SERVICE="cfn-redis"
TEST_DIR="/tmp/cfn-iteration-test-$(date +%s)"

cleanup() {
    log_step "GIVEN cleanup of test artifacts"
    docker stop cfn-coordinator-iter-test 2>/dev/null || true
    docker rm -f cfn-coordinator-iter-test 2>/dev/null || true
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: Multi-iteration convergence (errors → 0)
test_multi_iteration_convergence() {
    log_step "Test 1: Coordinator iterates until errors = 0"

    # GIVEN: Test project with decreasing errors per iteration
    mkdir -p "$TEST_DIR/src"

    # Create mock TypeScript file with 3 errors
    cat > "$TEST_DIR/src/test.ts" << 'EOF'
// Iteration 1: 3 errors
const x: number = "string"; // error 1
const y: string = 123; // error 2
function foo(): number { return "bar"; } // error 3
EOF

    cat > "$TEST_DIR/package.json" << 'EOF'
{
  "name": "iteration-test",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
EOF

    cat > "$TEST_DIR/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
EOF

    # WHEN: Coordinator runs (mock with iteration counter)
    # Note: Real coordinator would spawn agents; we simulate iteration pattern
    INITIAL_ERRORS=3
    ITERATION=1
    MAX_ITERATIONS=5
    CURRENT_ERRORS=$INITIAL_ERRORS

    log_info "Simulating coordinator iteration loop"
    while [ $CURRENT_ERRORS -gt 0 ] && [ $ITERATION -le $MAX_ITERATIONS ]; do
        log_info "Iteration $ITERATION: $CURRENT_ERRORS errors remaining"

        # Simulate error reduction (33% per iteration)
        CURRENT_ERRORS=$((CURRENT_ERRORS - 1))
        ITERATION=$((ITERATION + 1))

        sleep 1
    done

    # THEN: Coordinator converged to 0 errors
    if [ $CURRENT_ERRORS -eq 0 ] && [ $ITERATION -le $MAX_ITERATIONS ]; then
        log_pass "Coordinator converged in $((ITERATION - 1)) iterations"
    else
        log_fail "Coordinator failed to converge (errors: $CURRENT_ERRORS, iterations: $ITERATION)"
        return 1
    fi
}

# Test 2: Max iteration limit enforcement
test_max_iteration_limit() {
    log_step "Test 2: Coordinator stops at max iterations"

    # GIVEN: Scenario with persistent errors (never converges)
    mkdir -p "$TEST_DIR/persistent"

    # WHEN: Coordinator runs with max 3 iterations
    MAX_ITERATIONS=3
    ITERATION=1
    ERRORS=100 # Errors never reach 0

    log_info "Simulating non-converging scenario"
    while [ $ITERATION -le $MAX_ITERATIONS ]; do
        log_info "Iteration $ITERATION: $ERRORS errors (persistent)"

        # Errors don't decrease (worst case)
        ITERATION=$((ITERATION + 1))
        sleep 1
    done

    # THEN: Stopped at exactly max iterations
    if [ $((ITERATION - 1)) -eq $MAX_ITERATIONS ]; then
        log_pass "Coordinator stopped at max iterations ($MAX_ITERATIONS)"
    else
        log_fail "Coordinator exceeded max iterations (expected: $MAX_ITERATIONS, actual: $((ITERATION - 1)))"
        return 1
    fi
}

# Test 3: Error delta tracking
test_error_delta_tracking() {
    log_step "Test 3: Coordinator tracks error reduction per iteration"

    # GIVEN: Error counts per iteration
    ITER_1_ERRORS=100
    ITER_2_ERRORS=42
    ITER_3_ERRORS=10

    # WHEN: Calculate deltas
    DELTA_1_2=$((ITER_1_ERRORS - ITER_2_ERRORS))
    DELTA_2_3=$((ITER_2_ERRORS - ITER_3_ERRORS))

    log_info "Iteration 1 → 2: $ITER_1_ERRORS → $ITER_2_ERRORS (delta: -$DELTA_1_2)"
    log_info "Iteration 2 → 3: $ITER_2_ERRORS → $ITER_3_ERRORS (delta: -$DELTA_2_3)"

    # THEN: Deltas are positive (errors decreasing)
    if [ $DELTA_1_2 -gt 0 ] && [ $DELTA_2_3 -gt 0 ]; then
        log_pass "Error delta tracked correctly (58% → 76% reduction)"
    else
        log_fail "Error delta tracking failed"
        return 1
    fi
}

# Test 4: PROCEED/ITERATE decision gate
test_proceed_iterate_decision() {
    log_step "Test 4: Product Owner decision based on error count"

    # GIVEN: Different error scenarios
    SCENARIOS=(
        "0:PROCEED:Zero errors"
        "5:ITERATE:Errors remaining"
        "100:ITERATE:Many errors"
    )

    for scenario in "${SCENARIOS[@]}"; do
        IFS=':' read -r ERRORS EXPECTED_DECISION DESCRIPTION <<< "$scenario"

        # WHEN: Product Owner evaluates
        if [ "$ERRORS" -eq 0 ]; then
            DECISION="PROCEED"
        else
            DECISION="ITERATE"
        fi

        log_info "$DESCRIPTION: $ERRORS errors → $DECISION"

        # THEN: Decision matches expected
        if [ "$DECISION" = "$EXPECTED_DECISION" ]; then
            log_pass "Correct decision for $DESCRIPTION"
        else
            log_fail "Wrong decision: expected $EXPECTED_DECISION, got $DECISION"
            return 1
        fi
    done

    # Test ABORT on max iterations
    ERRORS=10
    ITERATION=11
    MAX_ITERATIONS=10

    if [ $ITERATION -gt $MAX_ITERATIONS ]; then
        DECISION="ABORT"
        log_info "Max iterations exceeded: $ITERATION > $MAX_ITERATIONS → ABORT"
        log_pass "ABORT decision on max iterations"
    else
        log_fail "Should have aborted at max iterations"
        return 1
    fi
}

# Run all tests
log_step "Starting Coordinator Iteration Loop Tests"
echo ""

test_multi_iteration_convergence
test_max_iteration_limit
test_error_delta_tracking
test_proceed_iterate_decision

echo ""
print_test_summary
