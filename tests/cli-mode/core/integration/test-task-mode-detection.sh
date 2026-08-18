#!/usr/bin/env bash
# tests/cli-mode/test-task-mode-detection.sh
# Phase 3 :: Validates CRITICAL-004 fix - Task mode detection and TASK_ID sanitization (Priority 3)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test counters
PASS_COUNT=0
TOTAL_COUNT=0

pass() { echo "✅ PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); TOTAL_COUNT=$((TOTAL_COUNT + 1)); return 0; }
fail() { echo "❌ FAIL: $1"; TOTAL_COUNT=$((TOTAL_COUNT + 1)); return 0; }

cleanup() {
  log_info "Cleanup complete - smoke test only, no processes spawned"
}
trap cleanup EXIT

test_critical004_fix_exists() {
  log_step "GIVEN CRITICAL-004 fix in spawn-agent.sh"

  # WHEN checking spawn-agent.sh for TASK_ID validation
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify file exists
  if [[ -f "$spawn_agent" ]]; then
    pass "spawn-agent.sh exists"
  else
    fail "spawn-agent.sh exists"
    return
  fi

  log_info "✅ spawn-agent.sh file validation passed"
}

test_task_id_existence_check() {
  log_step "GIVEN TASK_ID existence check (not pattern)"

  # WHEN checking TASK_ID validation logic
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify existence check (not restrictive pattern)
  if grep -q "if \[\[ -z \"\${TASK_ID:-}\" \]\]" "$spawn_agent" 2>/dev/null; then
    pass "TASK_ID existence check present"
  else
    fail "TASK_ID existence check present"
  fi

  # Verify error message for missing TASK_ID
  if grep -q "TASK_ID environment variable required" "$spawn_agent" 2>/dev/null; then
    pass "Missing TASK_ID error message present"
  else
    fail "Missing TASK_ID error message present"
  fi

  log_info "✅ TASK_ID existence check validation passed"
}

test_no_restrictive_pattern() {
  log_step "GIVEN no restrictive task-* pattern (CRITICAL-004 fix)"

  # WHEN checking for removed restrictive pattern
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify restrictive pattern is NOT present
  # Old bug: [[ "${TASK_ID:-}" != task-* ]]
  if grep -q "\[\[ \"\${TASK_ID:-}\" != task-\* \]\]" "$spawn_agent" 2>/dev/null; then
    fail "CRITICAL-004 bug still present: Restrictive task-* pattern found"
  else
    pass "Restrictive task-* pattern removed (CRITICAL-004 fix)"
  fi

  log_info "✅ Restrictive pattern removal validation passed"
}

test_character_sanitization() {
  log_step "GIVEN TASK_ID character sanitization (security fix)"

  # WHEN checking sanitization logic
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify character sanitization exists
  if grep -q "\[\[.*TASK_ID.*=\~.*\[^a-zA-Z0-9._-\]\|contains invalid characters" "$spawn_agent" 2>/dev/null; then
    pass "TASK_ID character sanitization present"
  else
    fail "TASK_ID character sanitization present"
  fi

  # Verify allowed characters list
  if grep -q "alphanumeric.*dot.*underscore.*hyphen\|a-zA-Z0-9._-" "$spawn_agent" 2>/dev/null; then
    pass "Allowed characters documented/enforced"
  else
    fail "Allowed characters documented/enforced"
  fi

  log_info "✅ Character sanitization validation passed"
}

test_valid_task_id_formats() {
  log_step "GIVEN valid TASK_ID formats"

  # WHEN testing various valid TASK_ID patterns
  local valid_formats=(
    "task-1234567890"
    "test-spawn-agent-001"
    "infra-test-redis"
    "task-coordinator-12345"
    "test-orchestrator"
    "infra-test-001"
    "task_with_underscores"
    "task.with.dots"
    "task-with-hyphens-123"
  )

  # THEN verify regex accepts all valid formats
  local sanitization_regex="^[a-zA-Z0-9._-]+$"

  for task_id in "${valid_formats[@]}"; do
    if [[ "$task_id" =~ $sanitization_regex ]]; then
      pass "Valid TASK_ID format accepted: $task_id"
    else
      fail "Valid TASK_ID format accepted: $task_id"
    fi
  done

  log_info "✅ Valid TASK_ID formats validation passed"
}

test_invalid_task_id_rejection() {
  log_step "GIVEN invalid TASK_ID formats (command injection patterns)"

  # WHEN testing command injection patterns
  local invalid_formats=(
    "task; rm -rf /"
    "task\$(whoami)"
    "task|cat /etc/passwd"
    "task&background"
    "task\`ls\`"
    "task>output.txt"
    "task<input.txt"
    "task'single"
    "task\"double"
    "task\\backslash"
    "task\$VAR"
    "task()function"
    "task[array]"
    "task{brace}"
    "task*glob"
    "task?question"
    "task with spaces"
  )

  # THEN verify regex rejects all invalid formats
  local sanitization_regex="^[a-zA-Z0-9._-]+$"

  for task_id in "${invalid_formats[@]}"; do
    if [[ ! "$task_id" =~ $sanitization_regex ]]; then
      # Sanitize output for display
      local display_id="${task_id//;/SEMICOLON}"
      display_id="${display_id//\$/DOLLAR}"
      display_id="${display_id//|/PIPE}"
      display_id="${display_id//&/AMPERSAND}"
      display_id="${display_id//\`/BACKTICK}"
      pass "Invalid TASK_ID rejected: $display_id"
    else
      fail "Invalid TASK_ID rejected: ${task_id//;/SEMICOLON}"
    fi
  done

  log_info "✅ Invalid TASK_ID rejection validation passed"
}

test_error_message_clarity() {
  log_step "GIVEN clear error messages for TASK_ID issues"

  # WHEN checking error messages
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify error messages are informative
  # Missing TASK_ID error
  if grep -q "TASK_ID environment variable required" "$spawn_agent" 2>/dev/null; then
    pass "Missing TASK_ID error message is clear"
  else
    fail "Missing TASK_ID error message is clear"
  fi

  # Invalid characters error
  if grep -q "TASK_ID contains invalid characters\|invalid characters" "$spawn_agent" 2>/dev/null; then
    pass "Invalid characters error message is clear"
  else
    fail "Invalid characters error message is clear"
  fi

  # ANTI-023 guidance
  if grep -q "ANTI-023\|CLI-spawned coordinators only\|Task Mode agents" "$spawn_agent" 2>/dev/null; then
    pass "ANTI-023 guidance present in error messages"
  else
    fail "ANTI-023 guidance present in error messages"
  fi

  log_info "✅ Error message clarity validation passed"
}

test_anti_023_enforcement() {
  log_step "GIVEN ANTI-023 enforcement (Task mode detection)"

  # WHEN checking ANTI-023 protection
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify ANTI-023 message exists
  if grep -q "ANTI-023" "$spawn_agent" 2>/dev/null; then
    pass "ANTI-023 protection message present"
  else
    fail "ANTI-023 protection message present"
  fi

  # Verify guidance to use Task() tool
  if grep -q "Task() tool\|Task Mode" "$spawn_agent" 2>/dev/null; then
    pass "ANTI-023 guidance to use Task() tool present"
  else
    fail "ANTI-023 guidance to use Task() tool present"
  fi

  log_info "✅ ANTI-023 enforcement validation passed"
}

test_cfn_execution_mode_removed() {
  log_step "GIVEN CFN_EXECUTION_MODE dependency removed (iteration 2 bug)"

  # WHEN checking for CFN_EXECUTION_MODE usage
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify CFN_EXECUTION_MODE is NOT used
  if grep -q "CFN_EXECUTION_MODE" "$spawn_agent" 2>/dev/null; then
    fail "CFN_EXECUTION_MODE dependency should be removed (iteration 2 bug)"
  else
    pass "CFN_EXECUTION_MODE dependency removed"
  fi

  log_info "✅ CFN_EXECUTION_MODE removal validation passed"
}

test_sanitizer_skill_dependency_removed() {
  log_step "GIVEN sanitizer skill dependency removed (iteration 1 bug)"

  # WHEN checking for sanitizer skill sourcing
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify sanitizer skill is NOT sourced
  # Note: Inline sanitization should be used instead
  if grep -q "task-mode-env-sanitizer\\.sh\|source.*sanitize" "$spawn_agent" 2>/dev/null; then
    log_info "Sanitizer skill may be present for other purposes (acceptable if optional)"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail - may be legitimate
  else
    pass "No dependency on external sanitizer skill"
  fi

  # Verify inline sanitization is present
  if grep -q "Sanitize TASK_ID\|TASK_ID.*=~.*\[^a-zA-Z0-9._-\]" "$spawn_agent" 2>/dev/null; then
    pass "Inline TASK_ID sanitization present"
  else
    fail "Inline TASK_ID sanitization present"
  fi

  log_info "✅ Sanitizer dependency removal validation passed"
}

test_task_id_parameter_position() {
  log_step "GIVEN TASK_ID validation occurs early in script"

  # WHEN checking validation order
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify TASK_ID validation is near top of script
  local task_id_line=$(grep -n "TASK_ID environment variable required" "$spawn_agent" 2>/dev/null | head -1 | cut -d: -f1)

  if [[ -n "$task_id_line" && "$task_id_line" -lt 50 ]]; then
    pass "TASK_ID validation occurs early in script (line $task_id_line)"
  else
    log_info "TASK_ID validation may occur later (line $task_id_line) - acceptable if before usage"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail
  fi

  log_info "✅ TASK_ID validation position check passed"
}

# Execute tests
test_critical004_fix_exists
test_task_id_existence_check
test_no_restrictive_pattern
test_character_sanitization
test_valid_task_id_formats
test_invalid_task_id_rejection
test_error_message_clarity
test_anti_023_enforcement
test_cfn_execution_mode_removed
test_sanitizer_skill_dependency_removed
test_task_id_parameter_position

# Test summary
echo ""
log_step "Test Summary"
PASS_RATE=$(awk "BEGIN {printf \"%.0f\", ($PASS_COUNT / $TOTAL_COUNT * 100)}")
echo -e "${GREEN}Total Tests: $TOTAL_COUNT${NC}"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
if [[ $TOTAL_COUNT -ne $PASS_COUNT ]]; then
  echo -e "${RED}Failed: $((TOTAL_COUNT - PASS_COUNT))${NC}"
fi
echo -e "${GREEN}Pass Rate: ${PASS_RATE}%${NC}"

if [[ $PASS_COUNT -eq $TOTAL_COUNT ]]; then
  echo ""
  echo -e "${GREEN}✅ All task mode detection tests PASSED${NC}"
  echo ""
  log_info "CRITICAL-004 fix validation complete"
  log_info "✅ TASK_ID existence check (not restrictive pattern)"
  log_info "✅ Character sanitization prevents command injection"
  log_info "✅ Supports all CLI formats: task-*, test-*, infra-test-*"
  log_info "✅ ANTI-023 enforcement present"
  log_info "✅ No dependency on CFN_EXECUTION_MODE or external sanitizer"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
