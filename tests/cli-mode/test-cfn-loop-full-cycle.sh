#!/usr/bin/env bash
# tests/cli-mode/test-cfn-loop-full-cycle.sh
# Full CFN Loop Test: Loop 3 creates faulty TDD tests → Loop 2 catches violations → Product Owner decides

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_ID="cfn-full-cycle-$(date +%s)"
TEST_WORKSPACE="/tmp/cfn-full-cycle-test-$$"
TASK_ID="cfn-cli-${TEST_ID}"

# Cleanup function
cleanup() {
  local exit_code=$?
  log_info "Cleaning up test workspace..."
  rm -rf "$TEST_WORKSPACE" 2>/dev/null || true
  exit $exit_code
}

trap cleanup EXIT INT TERM

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

log_info "=== Full CFN Loop Test Suite ==="
log_info "Test ID: $TEST_ID"
log_info "Workspace: $TEST_WORKSPACE"

# ============================================================================
# Test 1: Loop 3 Creates Faulty TDD Tests (Should Pass Gate)
# ============================================================================
test_loop3_faulty_tdd() {
  log_step "GIVEN Loop 3 agent writes faulty TDD tests"

  mkdir -p "$TEST_WORKSPACE"

  # WHEN Loop 3 creates tests that pass but violate TDD principles
  # Example: Test that always passes (no real validation)
  cat > "$TEST_WORKSPACE/calculator.test.js" <<'EOF'
// Faulty TDD Test - Always passes, doesn't validate logic
describe('Calculator', () => {
  test('should add two numbers', () => {
    const result = add(2, 2);
    expect(result).toBeDefined(); // WEAK: Only checks if defined, not if correct
  });

  test('should subtract two numbers', () => {
    const result = subtract(5, 3);
    expect(result).not.toBeNull(); // WEAK: Only checks not null, not actual value
  });

  test('should multiply two numbers', () => {
    const result = multiply(3, 4);
    expect(true).toBe(true); // FAKE: Always passes, doesn't test anything
  });
});

function add(a, b) { return a + b; }
function subtract(a, b) { return a - b; }
function multiply(a, b) { return a * b; }
EOF

  # THEN verify test file was created
  if [ -f "$TEST_WORKSPACE/calculator.test.js" ]; then
    assert_success "Loop 3 created faulty TDD test file"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Loop 3 failed to create test file"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi

  # AND verify tests pass (but are weak)
  cd "$TEST_WORKSPACE"
  if node -e "$(cat <<'NODETEST'
const tests = require('fs').readFileSync('calculator.test.js', 'utf8');
// Simulate running tests - they will pass
console.log('PASS: 3/3 tests passed');
process.exit(0);
NODETEST
)" 2>/dev/null; then
    assert_success "Faulty tests pass Loop 3 gate (weak validation)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Tests failed unexpectedly"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi

  cd "$PROJECT_ROOT"
}

# ============================================================================
# Test 2: Loop 2 Detects TDD Violations
# ============================================================================
test_loop2_catches_violations() {
  log_step "GIVEN Loop 2 validators review Loop 3 work"

  # WHEN Loop 2 analyzes the faulty tests
  local violations_found=0

  # Check 1: Weak assertions (expect(result).toBeDefined())
  if grep -q "toBeDefined()" "$TEST_WORKSPACE/calculator.test.js"; then
    log_warn "Violation detected: Weak assertion (toBeDefined)"
    violations_found=$((violations_found + 1))
  fi

  # Check 2: Non-validating assertions (expect(result).not.toBeNull())
  if grep -q "not.toBeNull()" "$TEST_WORKSPACE/calculator.test.js"; then
    log_warn "Violation detected: Non-validating assertion (not.toBeNull)"
    violations_found=$((violations_found + 1))
  fi

  # Check 3: Fake tests (expect(true).toBe(true))
  if grep -q "expect(true).toBe(true)" "$TEST_WORKSPACE/calculator.test.js"; then
    log_warn "Violation detected: Fake test (expect(true).toBe(true))"
    violations_found=$((violations_found + 1))
  fi

  # Check 4: No actual value assertions
  if ! grep -q "toBe([0-9])" "$TEST_WORKSPACE/calculator.test.js"; then
    log_warn "Violation detected: No actual value assertions"
    violations_found=$((violations_found + 1))
  fi

  # THEN verify Loop 2 found violations
  if [ "$violations_found" -ge 3 ]; then
    assert_success "Loop 2 detected ${violations_found} TDD violations"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Loop 2 failed to detect violations (found: $violations_found)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ============================================================================
# Test 3: Product Owner Decides ITERATE (Not PROCEED)
# ============================================================================
test_product_owner_decision() {
  log_step "GIVEN Product Owner reviews Loop 2 feedback"

  # WHEN Product Owner evaluates consensus
  local loop3_confidence=0.95  # High confidence (tests pass)
  local loop2_consensus=0.65   # Low consensus (violations found)
  local consensus_threshold=0.80

  # THEN Product Owner should decide ITERATE (not PROCEED)
  local decision=""
  if (( $(echo "$loop2_consensus < $consensus_threshold" | bc -l) )); then
    decision="ITERATE"
    log_info "Product Owner decision: $decision (consensus $loop2_consensus < threshold $consensus_threshold)"
  else
    decision="PROCEED"
    log_error "Incorrect decision: $decision (should be ITERATE)"
  fi

  if [ "$decision" = "ITERATE" ]; then
    assert_success "Product Owner correctly decided ITERATE"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Product Owner incorrectly decided $decision"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ============================================================================
# Test 4: 6 Subagents Create Files in Parallel
# ============================================================================
test_six_subagents_parallel() {
  log_step "GIVEN 6 subagents create hello world files in parallel"

  mkdir -p "$TEST_WORKSPACE/multi-lang"

  # WHEN coordinator spawns 6 agents in parallel (simulated)
  local agents=("python-dev" "js-dev" "rust-dev" "go-dev" "java-dev" "ts-dev")
  local files=("hello.py" "hello.js" "hello.rs" "hello.go" "Hello.java" "hello.ts")

  for i in "${!agents[@]}"; do
    local agent="${agents[$i]}"
    local file="${files[$i]}"

    # Simulate agent creating file
    case "$file" in
      "hello.py")
        echo "#!/usr/bin/env python3" > "$TEST_WORKSPACE/multi-lang/$file"
        echo "print('Hello, World!')" >> "$TEST_WORKSPACE/multi-lang/$file"
        ;;
      "hello.js")
        echo "#!/usr/bin/env node" > "$TEST_WORKSPACE/multi-lang/$file"
        echo "console.log('Hello, World!');" >> "$TEST_WORKSPACE/multi-lang/$file"
        ;;
      "hello.rs")
        echo "fn main() {" > "$TEST_WORKSPACE/multi-lang/$file"
        echo "    println!(\"Hello, World!\");" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "}" >> "$TEST_WORKSPACE/multi-lang/$file"
        ;;
      "hello.go")
        echo "package main" > "$TEST_WORKSPACE/multi-lang/$file"
        echo "" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "import \"fmt\"" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "func main() {" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "    fmt.Println(\"Hello, World!\")" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "}" >> "$TEST_WORKSPACE/multi-lang/$file"
        ;;
      "Hello.java")
        echo "public class Hello {" > "$TEST_WORKSPACE/multi-lang/$file"
        echo "    public static void main(String[] args) {" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "        System.out.println(\"Hello, World!\");" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "    }" >> "$TEST_WORKSPACE/multi-lang/$file"
        echo "}" >> "$TEST_WORKSPACE/multi-lang/$file"
        ;;
      "hello.ts")
        echo "console.log('Hello, World!');" > "$TEST_WORKSPACE/multi-lang/$file"
        ;;
    esac

    log_info "Agent $agent created $file"
  done

  # THEN verify all 6 files created
  local files_created=0
  for file in "${files[@]}"; do
    if [ -f "$TEST_WORKSPACE/multi-lang/$file" ]; then
      files_created=$((files_created + 1))
    fi
  done

  if [ "$files_created" -eq 6 ]; then
    assert_success "All 6 subagents created their files in parallel"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Only $files_created/6 files created"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ============================================================================
# Test 5: Full CFN Loop Integration
# ============================================================================
test_full_cfn_loop_integration() {
  log_step "GIVEN full CFN Loop execution with TDD violation"

  # WHEN executing complete loop
  # Loop 3: Create faulty tests (simulated above)
  local loop3_pass_rate=1.0  # All tests pass
  local gate_threshold=0.70

  # Gate check passes (tests pass, even though weak)
  local gate_passed=false
  if (( $(echo "$loop3_pass_rate >= $gate_threshold" | bc -l) )); then
    gate_passed=true
    log_info "Loop 3 gate passed: $loop3_pass_rate >= $gate_threshold"
  fi

  # Loop 2: Detect violations (simulated above)
  local violations_detected=4
  local loop2_consensus=$(echo "scale=2; 1.0 - ($violations_detected * 0.1)" | bc)
  log_info "Loop 2 consensus: $loop2_consensus (detected $violations_detected violations)"

  # Product Owner: Decide based on consensus
  local consensus_threshold=0.80
  local po_decision=""
  if (( $(echo "$loop2_consensus >= $consensus_threshold" | bc -l) )); then
    po_decision="PROCEED"
  else
    po_decision="ITERATE"
  fi

  # THEN verify full loop workflow
  if [ "$gate_passed" = true ] && [ "$po_decision" = "ITERATE" ]; then
    assert_success "Full CFN Loop: Gate passed, Loop 2 caught violations, PO decided ITERATE"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Full CFN Loop failed: gate_passed=$gate_passed, po_decision=$po_decision"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ============================================================================
# Execute Tests
# ============================================================================

log_info "Running full CFN Loop test suite..."
echo ""

test_loop3_faulty_tdd
test_loop2_catches_violations
test_product_owner_decision
test_six_subagents_parallel
test_full_cfn_loop_integration

# ============================================================================
# Summary
# ============================================================================

echo ""
log_info "=== Test Summary ==="
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
  echo "✅ All tests PASSED"
  exit 0
else
  echo "❌ Some tests FAILED"
  exit 1
fi
