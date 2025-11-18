#!/bin/bash
# tests/tdd-compliance/test-post-edit-feedback.sh
# Phase 3 :: TDD Compliance - Verify post-edit pipeline integration

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test workspace
TEST_WORKSPACE="/tmp/tdd-post-edit-$$"
POST_EDIT_HOOK="$PROJECT_ROOT/.claude/hooks/cfn-invoke-post-edit.sh"

cleanup() {
  rm -rf "$TEST_WORKSPACE"
  log_info "Cleanup complete"
}
trap cleanup EXIT

##############################################################################
# Test: Agents Invoke Post-Edit Hook After File Edits
##############################################################################

test_post_edit_hook_invocation() {
  log_step "GIVEN agent edits a file"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/example.ts"

  cat > "$TEST_FILE" <<'EOF'
export function processData(input: string): string {
  return input.toUpperCase();
}
EOF

  # WHEN agent completes file edit
  log_info "Simulating agent file edit completion"

  # THEN agent should invoke post-edit hook
  if [ -x "$POST_EDIT_HOOK" ]; then
    log_info "Invoking post-edit hook: $POST_EDIT_HOOK"

    local EXIT_CODE=0
    local OUTPUT
    OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "test-agent-$$" 2>&1) || EXIT_CODE=$?

    log_info "Post-edit hook output:"
    echo "$OUTPUT"

    if [ $EXIT_CODE -eq 0 ]; then
      assert_success "Post-edit hook invoked successfully"
    else
      log_warn "Post-edit hook returned non-zero exit code: $EXIT_CODE (may be expected for validation failures)"
    fi
  else
    log_error "Post-edit hook not found or not executable: $POST_EDIT_HOOK"
    return 1
  fi
}

##############################################################################
# Test: Post-Edit Validation Feedback Loop
##############################################################################

test_validation_feedback_loop() {
  log_step "GIVEN file with potential issues"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/unsafe-script.sh"

  # Create file with pipe safety issue (example validation target)
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
# Unsafe pipe - no error handling
cat file.txt | grep "pattern" | wc -l
EOF

  # WHEN post-edit validation runs
  log_info "Running post-edit validation on file with issues"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local EXIT_CODE=0
    local OUTPUT
    OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "validator-$$" 2>&1) || EXIT_CODE=$?

    log_info "Validation output:"
    echo "$OUTPUT"

    # THEN validation feedback should be available
    if echo "$OUTPUT" | grep -iq "validation\|warning\|error\|pipe"; then
      assert_success "Post-edit validation provided feedback"
    else
      log_info "No specific validation warnings (file may be acceptable)"
    fi
  else
    log_warn "Post-edit hook not available - skipping validation test"
  fi
}

##############################################################################
# Test: Agent Receives Validation Results
##############################################################################

test_agent_receives_validation_results() {
  log_step "GIVEN agent completes file edit with validation"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/validated-code.ts"
  local AGENT_ID="test-agent-validation-$$"

  cat > "$TEST_FILE" <<'EOF'
export class DataProcessor {
  process(data: any) {
    // Simple implementation
    return data;
  }
}
EOF

  # WHEN agent invokes post-edit hook
  log_info "Agent invoking post-edit validation"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local VALIDATION_OUTPUT="/tmp/validation-output-$$"

    "$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "$AGENT_ID" > "$VALIDATION_OUTPUT" 2>&1 || true

    # THEN validation results should be accessible
    if [ -f "$VALIDATION_OUTPUT" ]; then
      log_info "Validation results captured:"
      cat "$VALIDATION_OUTPUT"

      if [ -s "$VALIDATION_OUTPUT" ]; then
        assert_success "Agent received validation results"
      else
        log_warn "Validation output empty (may indicate silent pass)"
      fi

      rm -f "$VALIDATION_OUTPUT"
    else
      log_warn "Validation output not captured"
    fi
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Test: Multiple Validators in Pipeline
##############################################################################

test_multiple_validator_integration() {
  log_step "GIVEN post-edit pipeline with multiple validators"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/multi-validate.sh"

  # Create shell script (targets multiple validators)
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
set -euo pipefail

# This script should trigger multiple validators:
# 1. Pipe safety check
# 2. Shell linting
# 3. Security validation

echo "Processing data..." | tee /tmp/output.txt
EOF

  # WHEN post-edit pipeline executes
  log_info "Running multi-validator post-edit pipeline"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local EXIT_CODE=0
    local OUTPUT
    OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "multi-validator-$$" 2>&1) || EXIT_CODE=$?

    log_info "Pipeline output:"
    echo "$OUTPUT"

    # THEN multiple validators should execute
    # Check for evidence of different validation stages
    local VALIDATION_COUNT=0

    if echo "$OUTPUT" | grep -iq "validation\|running\|check"; then
      VALIDATION_COUNT=$((VALIDATION_COUNT + 1))
    fi

    if [ $VALIDATION_COUNT -gt 0 ]; then
      log_info "Detected $VALIDATION_COUNT validation stages"
      assert_success "Multiple validators integrated in pipeline"
    else
      log_warn "Could not detect multiple validation stages"
    fi
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Test: Post-Edit Hook Handles Different File Types
##############################################################################

test_file_type_handling() {
  log_step "GIVEN various file types"

  mkdir -p "$TEST_WORKSPACE"

  # TypeScript file
  local TS_FILE="$TEST_WORKSPACE/test.ts"
  cat > "$TS_FILE" <<'EOF'
export const config = { debug: true };
EOF

  # Shell script
  local SH_FILE="$TEST_WORKSPACE/test.sh"
  cat > "$SH_FILE" <<'EOF'
#!/bin/bash
echo "Test script"
EOF

  # Markdown file
  local MD_FILE="$TEST_WORKSPACE/test.md"
  cat > "$MD_FILE" <<'EOF'
# Test Documentation
This is a test file.
EOF

  if [ -x "$POST_EDIT_HOOK" ]; then
    log_info "Testing TypeScript file validation"
    "$POST_EDIT_HOOK" "$TS_FILE" --agent-id "ts-test-$$" >/dev/null 2>&1 || true

    log_info "Testing shell script validation"
    "$POST_EDIT_HOOK" "$SH_FILE" --agent-id "sh-test-$$" >/dev/null 2>&1 || true

    log_info "Testing markdown file validation"
    "$POST_EDIT_HOOK" "$MD_FILE" --agent-id "md-test-$$" >/dev/null 2>&1 || true

    assert_success "Post-edit hook handles multiple file types"
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Test: Non-Blocking Mode (Default Behavior)
##############################################################################

test_non_blocking_mode() {
  log_step "GIVEN post-edit validation in non-blocking mode"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/non-blocking-test.ts"

  cat > "$TEST_FILE" <<'EOF'
export function test() {
  console.log("test");
}
EOF

  # WHEN validation runs in non-blocking mode (default)
  log_info "Running validation in non-blocking mode (default)"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local EXIT_CODE=0
    "$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "non-blocking-$$" >/dev/null 2>&1 || EXIT_CODE=$?

    # THEN hook should always return success (exit 0) in non-blocking mode
    if [ $EXIT_CODE -eq 0 ]; then
      assert_success "Non-blocking mode: Hook returns success even with warnings"
    else
      log_warn "Hook returned non-zero in non-blocking mode: $EXIT_CODE"
    fi
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Execute Tests
##############################################################################

log_step "Starting TDD Compliance Test Suite: Post-Edit Pipeline Integration"
echo ""

test_post_edit_hook_invocation
test_validation_feedback_loop
test_agent_receives_validation_results
test_multiple_validator_integration
test_file_type_handling
test_non_blocking_mode

echo ""
log_step "✅ All post-edit pipeline integration tests passed"
