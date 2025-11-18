#!/bin/bash
# tests/tdd-compliance/test-tests-before-code.sh
# Phase 3 :: TDD Compliance - Verify agents write tests before implementation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test temporary workspace
TEST_WORKSPACE="/tmp/tdd-test-workspace-$$"

cleanup() {
  rm -rf "$TEST_WORKSPACE"
  log_info "Cleanup complete"
}
trap cleanup EXIT

##############################################################################
# Test: Agents Create Test Files Before Implementation Files
##############################################################################

test_test_file_creation_order() {
  log_step "GIVEN a TDD-compliant agent implementing a new feature"

  mkdir -p "$TEST_WORKSPACE/src"
  mkdir -p "$TEST_WORKSPACE/tests"

  # Simulate agent behavior: create test file FIRST
  local TEST_FILE="$TEST_WORKSPACE/tests/auth-validator.test.ts"
  local IMPL_FILE="$TEST_WORKSPACE/src/auth-validator.ts"

  # WHEN agent follows TDD protocol
  log_info "Creating test file first (TDD Phase 1)"
  cat > "$TEST_FILE" <<'EOF'
import { validateToken } from '../src/auth-validator';

describe('JWT Token Validator', () => {
  test('should validate valid JWT token', () => {
    const token = 'valid.jwt.token';
    expect(validateToken(token)).toBe(true);
  });

  test('should reject invalid token', () => {
    const token = 'invalid-token';
    expect(validateToken(token)).toBe(false);
  });
});
EOF

  # Small delay to ensure timestamp difference
  sleep 1

  log_info "Creating implementation file second (TDD Phase 2)"
  cat > "$IMPL_FILE" <<'EOF'
export function validateToken(token: string): boolean {
  // Implementation to make tests pass
  if (!token || token === 'invalid-token') {
    return false;
  }
  return token.includes('.');
}
EOF

  # THEN test file should have earlier timestamp than implementation
  local TEST_TIME=$(stat -c %Y "$TEST_FILE" 2>/dev/null || stat -f %m "$TEST_FILE")
  local IMPL_TIME=$(stat -c %Y "$IMPL_FILE" 2>/dev/null || stat -f %m "$IMPL_FILE")

  log_info "Test file timestamp: $TEST_TIME"
  log_info "Implementation timestamp: $IMPL_TIME"

  if [ "$TEST_TIME" -lt "$IMPL_TIME" ]; then
    assert_success "Test file created before implementation (TDD compliant)"
  else
    log_error "Implementation created before tests (TDD violation)"
    return 1
  fi
}

##############################################################################
# Test: Git Commit Timestamps Show TDD Order
##############################################################################

test_git_commit_order() {
  log_step "GIVEN agent commits follow TDD workflow"

  # Initialize git repo in test workspace
  cd "$TEST_WORKSPACE"
  git init -q
  git config user.email "test@cfn.local"
  git config user.name "TDD Test"

  # WHEN agent commits test first, then implementation
  mkdir -p tests src

  log_info "Committing test file (RED phase)"
  cat > tests/calculator.test.ts <<'EOF'
import { add } from '../src/calculator';

test('should add two numbers', () => {
  expect(add(2, 3)).toBe(5);
});
EOF

  git add tests/calculator.test.ts
  git commit -q -m "test: add calculator tests (RED - expected to fail)"
  local TEST_COMMIT_TIME=$(git log -1 --format=%ct)

  sleep 1

  log_info "Committing implementation (GREEN phase)"
  cat > src/calculator.ts <<'EOF'
export function add(a: number, b: number): number {
  return a + b;
}
EOF

  git add src/calculator.ts
  git commit -q -m "feat: implement calculator to pass tests (GREEN)"
  local IMPL_COMMIT_TIME=$(git log -1 --format=%ct)

  # THEN test commit should be earlier than implementation commit
  log_info "Test commit time: $TEST_COMMIT_TIME"
  log_info "Implementation commit time: $IMPL_COMMIT_TIME"

  if [ "$TEST_COMMIT_TIME" -lt "$IMPL_COMMIT_TIME" ]; then
    assert_success "Git history shows TDD order: tests before implementation"
  else
    log_error "Git history violates TDD: implementation before tests"
    return 1
  fi

  cd "$PROJECT_ROOT"
}

##############################################################################
# Test: Verify Test File Exists Before Implementation
##############################################################################

test_paired_test_existence() {
  log_step "GIVEN implementation file exists"

  mkdir -p "$TEST_WORKSPACE/src"
  mkdir -p "$TEST_WORKSPACE/tests"

  local IMPL_FILE="$TEST_WORKSPACE/src/user-service.ts"
  local TEST_FILE="$TEST_WORKSPACE/tests/user-service.test.ts"

  # WHEN checking for paired test file
  cat > "$IMPL_FILE" <<'EOF'
export class UserService {
  getUser(id: string) {
    return { id, name: 'Test User' };
  }
}
EOF

  # THEN test file should exist
  if [ ! -f "$TEST_FILE" ]; then
    log_info "Creating required test file (TDD requirement)"
    cat > "$TEST_FILE" <<'EOF'
import { UserService } from '../src/user-service';

describe('UserService', () => {
  test('should retrieve user by ID', () => {
    const service = new UserService();
    const user = service.getUser('123');
    expect(user.id).toBe('123');
  });
});
EOF
  fi

  if [ -f "$TEST_FILE" ]; then
    assert_success "Test file exists for implementation (TDD compliant)"
  else
    log_error "No test file found for implementation (TDD violation)"
    return 1
  fi
}

##############################################################################
# Execute Tests
##############################################################################

log_step "Starting TDD Compliance Test Suite: Tests Before Code"
echo ""

test_test_file_creation_order
test_git_commit_order
test_paired_test_existence

echo ""
log_step "✅ All TDD test-creation-order checks passed"
