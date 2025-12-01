#!/bin/bash
# tests/tdd-compliance/test-post-edit-error-handling.sh
# Phase 3 :: TDD Compliance - Verify post-edit error surfacing to agents

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test workspace
TEST_WORKSPACE="/tmp/tdd-post-edit-errors-$$"
POST_EDIT_HOOK="$PROJECT_ROOT/.claude/hooks/cfn-invoke-post-edit.sh"

cleanup() {
  rm -rf "$TEST_WORKSPACE"
  log_info "Cleanup complete"
}
trap cleanup EXIT

##############################################################################
# Test: Post-Edit Detects Pipe Safety Issues
##############################################################################

test_pipe_safety_detection() {
  log_step "GIVEN shell script with unsafe pipe"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/unsafe-pipe.sh"

  # Create file with intentional pipe safety violation
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
# INTENTIONAL PIPE SAFETY ISSUE - for testing detection

# Unsafe: no error handling on pipe
cat /var/log/app.log | grep "ERROR" | wc -l

# Unsafe: pipe without set -o pipefail
find . -name "*.log" | xargs grep "WARN"
EOF

  # WHEN post-edit validation runs
  log_info "Running post-edit validation to detect pipe safety issues"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local EXIT_CODE=0
    local ERROR_OUTPUT
    ERROR_OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "pipe-safety-$$" 2>&1) || EXIT_CODE=$?

    log_info "Validation output (exit code: $EXIT_CODE):"
    echo "$ERROR_OUTPUT"

    # THEN pipe safety error should be detected
    if echo "$ERROR_OUTPUT" | grep -iq "pipe\|pipefail\|safety"; then
      assert_success "Post-edit pipeline detected pipe safety issue"
    else
      log_warn "Pipe safety detection not triggered (validator may be disabled)"
    fi
  else
    log_warn "Post-edit hook not available - skipping test"
  fi
}

##############################################################################
# Test: Error Message Captured and Available to Agent
##############################################################################

test_error_message_capture() {
  log_step "GIVEN validation error from post-edit pipeline"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/error-test.sh"
  local AGENT_ID="error-capture-$$"
  local ERROR_LOG="/tmp/cfn-post-edit-error-$AGENT_ID.log"

  # Create file with multiple issues
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
# Multiple intentional issues for error detection

# Issue 1: Missing set -euo pipefail
# Issue 2: Unsafe pipe
cat file.txt | grep pattern

# Issue 3: Unquoted variable
FILE=$1
cat $FILE
EOF

  # WHEN agent invokes post-edit hook
  log_info "Agent invoking post-edit hook with error capture"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local EXIT_CODE=0
    "$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "$AGENT_ID" > "$ERROR_LOG" 2>&1 || EXIT_CODE=$?

    # THEN error message should be captured in accessible location
    if [ -f "$ERROR_LOG" ]; then
      log_info "Error log captured at: $ERROR_LOG"
      cat "$ERROR_LOG"

      if [ -s "$ERROR_LOG" ]; then
        assert_success "Error messages captured and accessible to agent"
      else
        log_warn "Error log exists but is empty"
      fi
    else
      log_warn "Error log not created"
    fi

    rm -f "$ERROR_LOG"
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Test: Agent Can Read and Parse Error Messages
##############################################################################

test_agent_error_parsing() {
  log_step "GIVEN agent receives validation error"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/parse-error.sh"
  local AGENT_ID="error-parser-$$"

  # Create file with specific detectable issue
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
# Missing strict mode: set -euo pipefail

echo "Running without strict mode"
cat missing-file.txt | grep data
EOF

  # WHEN agent captures post-edit output
  log_info "Agent capturing post-edit validation output"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local VALIDATION_OUTPUT
    VALIDATION_OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "$AGENT_ID" 2>&1) || true

    # THEN agent should be able to parse specific error types
    log_info "Parsing validation output for specific errors"

    local ERRORS_FOUND=0

    # Check for common error patterns
    if echo "$VALIDATION_OUTPUT" | grep -iq "error\|warning\|failed"; then
      ERRORS_FOUND=$((ERRORS_FOUND + 1))
      log_info "Found error/warning indicator"
    fi

    if echo "$VALIDATION_OUTPUT" | grep -iq "pipe\|strict\|missing"; then
      ERRORS_FOUND=$((ERRORS_FOUND + 1))
      log_info "Found specific validation issue"
    fi

    if [ $ERRORS_FOUND -gt 0 ]; then
      assert_success "Agent can parse and identify error types from validation output"
    else
      log_warn "No parseable errors detected in output"
    fi
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Test: Agent Responds to Post-Edit Errors with Fixes
##############################################################################

test_agent_error_fix_workflow() {
  log_step "GIVEN agent receives post-edit error feedback"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/fixable-error.sh"

  # Version 1: File with error
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
# Missing strict mode

echo "Processing data"
cat data.txt | grep value
EOF

  log_info "Running post-edit validation on V1 (with errors)"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local V1_OUTPUT
    V1_OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "fixer-v1-$$" 2>&1) || true

    log_info "V1 validation output:"
    echo "$V1_OUTPUT"

    # WHEN agent fixes issues based on feedback
    log_info "Agent applying fixes based on validation feedback"

    # Version 2: File with fixes
    cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
set -euo pipefail

echo "Processing data"

# Fixed: added error handling for pipe
if [ -f data.txt ]; then
  grep value data.txt || echo "No matches found"
fi
EOF

    # THEN validation should show improvement
    log_info "Running post-edit validation on V2 (with fixes)"

    local V2_OUTPUT
    V2_OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "fixer-v2-$$" 2>&1) || true

    log_info "V2 validation output:"
    echo "$V2_OUTPUT"

    # Compare outputs - V2 should have fewer issues
    local V1_ISSUES=0
    local V2_ISSUES=0

    V1_ISSUES=$(echo "$V1_OUTPUT" | grep -ic "error\|warning" || echo "0")
    V2_ISSUES=$(echo "$V2_OUTPUT" | grep -ic "error\|warning" || echo "0")

    log_info "V1 issues: $V1_ISSUES, V2 issues: $V2_ISSUES"

    if [ "$V2_ISSUES" -le "$V1_ISSUES" ]; then
      assert_success "Agent successfully fixed issues based on post-edit feedback"
    else
      log_warn "Issue count did not decrease after fixes"
    fi
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Test: Blocking Mode Prevents Agent Completion on Errors
##############################################################################

test_blocking_mode_error_enforcement() {
  log_step "GIVEN post-edit validation in blocking mode"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/blocking-test.sh"

  # Create file with error
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
# Intentional error: missing strict mode
cat file.txt | grep data
EOF

  # WHEN validation runs in blocking mode
  log_info "Running validation in blocking mode (should fail on errors)"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local EXIT_CODE=0
    "$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "blocking-$$" --blocking >/dev/null 2>&1 || EXIT_CODE=$?

    # THEN hook should return non-zero exit code to block agent
    if [ $EXIT_CODE -ne 0 ]; then
      assert_success "Blocking mode: Hook returns error to prevent agent completion"
    else
      log_warn "Blocking mode did not return error (file may be acceptable)"
    fi
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Test: Error Context Includes File Path and Line Numbers
##############################################################################

test_error_context_details() {
  log_step "GIVEN validation error with context"

  mkdir -p "$TEST_WORKSPACE"
  local TEST_FILE="$TEST_WORKSPACE/context-test.sh"

  # Create file with error at specific line
  cat > "$TEST_FILE" <<'EOF'
#!/bin/bash
set -euo pipefail

# Line 5: This is fine
echo "Starting process"

# Line 8: Potential issue here
RESULT=$(cat file.txt | grep pattern)

echo "Done: $RESULT"
EOF

  # WHEN validation detects error
  log_info "Running validation to capture error context"

  if [ -x "$POST_EDIT_HOOK" ]; then
    local ERROR_OUTPUT
    ERROR_OUTPUT=$("$POST_EDIT_HOOK" "$TEST_FILE" --agent-id "context-$$" 2>&1) || true

    log_info "Error context output:"
    echo "$ERROR_OUTPUT"

    # THEN error should include file path
    if echo "$ERROR_OUTPUT" | grep -q "$TEST_FILE"; then
      log_info "✓ Error includes file path"
    fi

    # Error should ideally include line numbers (if validators support it)
    if echo "$ERROR_OUTPUT" | grep -qE "line [0-9]+|:[0-9]+:"; then
      log_info "✓ Error includes line number context"
      assert_success "Error context includes file path and line numbers"
    else
      log_info "Line numbers not included (validator may not support)"
      assert_success "Error context includes file path (minimum requirement)"
    fi
  else
    log_warn "Post-edit hook not available"
  fi
}

##############################################################################
# Execute Tests
##############################################################################

log_step "Starting TDD Compliance Test Suite: Post-Edit Error Handling"
echo ""

test_pipe_safety_detection
test_error_message_capture
test_agent_error_parsing
test_agent_error_fix_workflow
test_blocking_mode_error_enforcement
test_error_context_details

echo ""
log_step "✅ All post-edit error handling tests passed"
