#!/bin/bash
# tests/tdd-compliance/test-red-green-refactor.sh
# Phase 3 :: TDD Compliance - Verify RED-GREEN-REFACTOR cycle

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test workspace
TEST_WORKSPACE="/tmp/tdd-red-green-refactor-$$"

cleanup() {
  rm -rf "$TEST_WORKSPACE"
  log_info "Cleanup complete"
}
trap cleanup EXIT

##############################################################################
# Test: RED Phase - Tests Fail Initially
##############################################################################

test_red_phase_failures() {
  log_step "GIVEN new tests without implementation (RED phase)"

  mkdir -p "$TEST_WORKSPACE"
  cd "$TEST_WORKSPACE"

  # Initialize minimal Node.js project
  cat > package.json <<'EOF'
{
  "name": "tdd-test",
  "version": "1.0.0",
  "scripts": {
    "test": "node --test"
  }
}
EOF

  # WHEN creating tests before implementation
  log_info "Creating test file (RED phase - expect failures)"
  mkdir -p tests
  cat > tests/validator.test.js <<'EOF'
const assert = require('assert');
const test = require('node:test');

// Import will fail - no implementation yet
let validateEmail;
try {
  validateEmail = require('../src/validator').validateEmail;
} catch (e) {
  validateEmail = () => { throw new Error('Not implemented'); };
}

test('should validate correct email format', () => {
  assert.strictEqual(validateEmail('user@example.com'), true);
});

test('should reject invalid email format', () => {
  assert.strictEqual(validateEmail('invalid-email'), false);
});
EOF

  # THEN tests should fail (RED phase)
  log_info "Running tests in RED phase (expect failures)"
  local EXIT_CODE=0
  npm test 2>&1 | tee /tmp/test-output-$$ || EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    assert_success "RED phase: Tests failed as expected (no implementation)"
  else
    log_error "RED phase violation: Tests passed without implementation"
    cd "$PROJECT_ROOT"
    return 1
  fi

  cd "$PROJECT_ROOT"
}

##############################################################################
# Test: GREEN Phase - Tests Pass After Implementation
##############################################################################

test_green_phase_success() {
  log_step "GIVEN failing tests from RED phase"

  mkdir -p "$TEST_WORKSPACE"
  cd "$TEST_WORKSPACE"

  # Setup from RED phase
  cat > package.json <<'EOF'
{
  "name": "tdd-test",
  "version": "1.0.0",
  "scripts": {
    "test": "node --test"
  }
}
EOF

  mkdir -p tests src
  cat > tests/validator.test.js <<'EOF'
const assert = require('assert');
const test = require('node:test');
const { validateEmail } = require('../src/validator');

test('should validate correct email format', () => {
  assert.strictEqual(validateEmail('user@example.com'), true);
});

test('should reject invalid email format', () => {
  assert.strictEqual(validateEmail('invalid-email'), false);
});

test('should handle empty string', () => {
  assert.strictEqual(validateEmail(''), false);
});
EOF

  # WHEN adding implementation to make tests pass (GREEN phase)
  log_info "Creating implementation (GREEN phase)"
  cat > src/validator.js <<'EOF'
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = { validateEmail };
EOF

  # THEN tests should pass (GREEN phase)
  log_info "Running tests in GREEN phase (expect success)"
  local EXIT_CODE=0
  npm test 2>&1 | tee /tmp/test-output-green-$$ || EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    assert_success "GREEN phase: Tests passed after implementation"
  else
    log_error "GREEN phase failed: Tests still failing with implementation"
    cd "$PROJECT_ROOT"
    return 1
  fi

  cd "$PROJECT_ROOT"
}

##############################################################################
# Test: REFACTOR Phase - Tests Still Pass After Improvement
##############################################################################

test_refactor_phase_quality() {
  log_step "GIVEN passing tests from GREEN phase"

  mkdir -p "$TEST_WORKSPACE"
  cd "$TEST_WORKSPACE"

  # Setup from GREEN phase
  cat > package.json <<'EOF'
{
  "name": "tdd-test",
  "version": "1.0.0",
  "scripts": {
    "test": "node --test"
  }
}
EOF

  mkdir -p tests src
  cat > tests/validator.test.js <<'EOF'
const assert = require('assert');
const test = require('node:test');
const { validateEmail } = require('../src/validator');

test('should validate correct email format', () => {
  assert.strictEqual(validateEmail('user@example.com'), true);
});

test('should reject invalid email format', () => {
  assert.strictEqual(validateEmail('invalid-email'), false);
});
EOF

  # Initial implementation (works but not optimal)
  cat > src/validator.js <<'EOF'
function validateEmail(email) {
  if (!email) return false;
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = { validateEmail };
EOF

  log_info "Running tests before refactor (baseline)"
  npm test >/dev/null 2>&1 || {
    log_error "Baseline tests failed"
    cd "$PROJECT_ROOT"
    return 1
  }

  # WHEN refactoring for better quality (REFACTOR phase)
  log_info "Refactoring implementation (REFACTOR phase)"
  cat > src/validator.js <<'EOF'
/**
 * Validates email address format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
function validateEmail(email) {
  // Input validation
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Improved regex with more comprehensive validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

module.exports = { validateEmail };
EOF

  # THEN tests should still pass (REFACTOR preserves behavior)
  log_info "Running tests after refactor (verify no regression)"
  local EXIT_CODE=0
  npm test 2>&1 | tee /tmp/test-output-refactor-$$ || EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    assert_success "REFACTOR phase: Tests still pass after code improvement"
  else
    log_error "REFACTOR phase failed: Code quality improvement broke tests"
    cd "$PROJECT_ROOT"
    return 1
  fi

  # Verify refactored code has better quality (documentation added)
  if grep -q "@param" src/validator.js; then
    log_info "Code quality improved: Documentation added"
  else
    log_warn "Code quality not improved: Missing documentation"
  fi

  cd "$PROJECT_ROOT"
}

##############################################################################
# Test: Complete RED-GREEN-REFACTOR Cycle
##############################################################################

test_complete_tdd_cycle() {
  log_step "GIVEN complete TDD workflow"

  mkdir -p "$TEST_WORKSPACE"
  cd "$TEST_WORKSPACE"

  cat > package.json <<'EOF'
{
  "name": "tdd-cycle-test",
  "version": "1.0.0",
  "scripts": {
    "test": "node --test"
  }
}
EOF

  mkdir -p tests src

  # Phase 1: RED - Write failing test
  log_info "Phase 1: RED - Writing failing test"
  cat > tests/math.test.js <<'EOF'
const assert = require('assert');
const test = require('node:test');

let multiply;
try {
  multiply = require('../src/math').multiply;
} catch (e) {
  multiply = () => { throw new Error('Not implemented'); };
}

test('should multiply two numbers', () => {
  assert.strictEqual(multiply(3, 4), 12);
});
EOF

  local RED_EXIT=0
  npm test >/dev/null 2>&1 || RED_EXIT=$?

  if [ $RED_EXIT -ne 0 ]; then
    log_info "✅ RED phase: Test failed as expected"
  else
    log_error "❌ RED phase: Test passed without implementation"
    cd "$PROJECT_ROOT"
    return 1
  fi

  # Phase 2: GREEN - Make test pass
  log_info "Phase 2: GREEN - Implementing to pass test"
  cat > src/math.js <<'EOF'
function multiply(a, b) {
  return a * b;
}

module.exports = { multiply };
EOF

  local GREEN_EXIT=0
  npm test >/dev/null 2>&1 || GREEN_EXIT=$?

  if [ $GREEN_EXIT -eq 0 ]; then
    log_info "✅ GREEN phase: Test passed with implementation"
  else
    log_error "❌ GREEN phase: Test still failing"
    cd "$PROJECT_ROOT"
    return 1
  fi

  # Phase 3: REFACTOR - Improve without breaking tests
  log_info "Phase 3: REFACTOR - Improving code quality"
  cat > src/math.js <<'EOF'
/**
 * Multiplies two numbers
 * @param {number} a - First operand
 * @param {number} b - Second operand
 * @returns {number} Product of a and b
 */
function multiply(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('Arguments must be numbers');
  }
  return a * b;
}

module.exports = { multiply };
EOF

  local REFACTOR_EXIT=0
  npm test >/dev/null 2>&1 || REFACTOR_EXIT=$?

  if [ $REFACTOR_EXIT -eq 0 ]; then
    log_info "✅ REFACTOR phase: Tests still pass after improvement"
  else
    log_error "❌ REFACTOR phase: Refactoring broke tests"
    cd "$PROJECT_ROOT"
    return 1
  fi

  assert_success "Complete RED-GREEN-REFACTOR cycle successful"
  cd "$PROJECT_ROOT"
}

##############################################################################
# Execute Tests
##############################################################################

log_step "Starting TDD Compliance Test Suite: RED-GREEN-REFACTOR Cycle"
echo ""

test_red_phase_failures
test_green_phase_success
test_refactor_phase_quality
test_complete_tdd_cycle

echo ""
log_step "✅ All RED-GREEN-REFACTOR cycle tests passed"
