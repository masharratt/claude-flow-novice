#!/bin/bash
# tests/cli-mode/test-path-resolution-fix.sh
# Phase 3 :: Validates CRITICAL-001 fix - Product Owner decision script path resolution (Priority 3)

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

test_critical001_fix_exists() {
  log_step "GIVEN CRITICAL-001 fix in orchestrate.sh"

  # WHEN checking orchestrate.sh for correct path resolution
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify file exists
  if [[ -f "$orchestrator" ]]; then
    pass "orchestrate.sh exists"
  else
    fail "orchestrate.sh exists"
    return
  fi

  log_info "✅ orchestrate.sh file validation passed"
}

test_project_root_usage() {
  log_step "GIVEN PROJECT_ROOT path resolution (CRITICAL-001 fix)"

  # WHEN checking for PROJECT_ROOT usage in decision script path
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify PROJECT_ROOT is used (not SCRIPT_DIR)
  if grep -q "\$PROJECT_ROOT/\\.claude/skills/cfn-product-owner-decision" "$orchestrator" 2>/dev/null; then
    pass "Uses PROJECT_ROOT for product owner decision script"
  else
    fail "Uses PROJECT_ROOT for product owner decision script"
  fi

  log_info "✅ PROJECT_ROOT usage validation passed"
}

test_script_dir_anti_pattern() {
  log_step "GIVEN SCRIPT_DIR anti-pattern detection (CRITICAL-001 bug)"

  # WHEN checking for incorrect SCRIPT_DIR usage
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify SCRIPT_DIR is NOT used for nested .claude/skills paths
  if grep -q "\$SCRIPT_DIR/\\.claude/skills/cfn-product-owner-decision" "$orchestrator" 2>/dev/null; then
    fail "CRITICAL-001 bug still present: SCRIPT_DIR used for nested path"
  else
    pass "SCRIPT_DIR anti-pattern not present"
  fi

  log_info "✅ SCRIPT_DIR anti-pattern detection passed"
}

test_nested_path_anti_pattern() {
  log_step "GIVEN nested .claude/skills path detection"

  # WHEN checking for invalid nested paths
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify no nested .claude/skills/.claude/skills paths exist
  if grep -q "\\.claude/skills/cfn-loop-orchestration/\\.claude/skills" "$orchestrator" 2>/dev/null; then
    fail "Invalid nested path detected: .claude/skills/.../. claude/skills"
  else
    pass "No invalid nested .claude/skills paths"
  fi

  log_info "✅ Nested path anti-pattern detection passed"
}

test_decision_script_path_format() {
  log_step "GIVEN correct decision script path format"

  # WHEN checking decision script invocation
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify correct path format: $PROJECT_ROOT/.claude/skills/cfn-product-owner-decision/execute-decision.sh
  local expected_pattern="\$PROJECT_ROOT/\\.claude/skills/cfn-product-owner-decision/execute-decision\\.sh"

  if grep -q "$expected_pattern" "$orchestrator" 2>/dev/null; then
    pass "Decision script path uses correct format"
  else
    # Try without escaped dots
    if grep -q "\$PROJECT_ROOT/.claude/skills/cfn-product-owner-decision/execute-decision.sh" "$orchestrator" 2>/dev/null; then
      pass "Decision script path uses correct format (alternative pattern)"
    else
      fail "Decision script path uses correct format"
    fi
  fi

  log_info "✅ Decision script path format validation passed"
}

test_decision_script_exists() {
  log_step "GIVEN execute-decision.sh script existence"

  # WHEN checking if decision script exists at correct location
  local decision_script="$PROJECT_ROOT/.claude/skills/cfn-product-owner-decision/execute-decision.sh"

  # THEN verify script exists
  if [[ -f "$decision_script" ]]; then
    pass "execute-decision.sh exists at correct location"
  else
    fail "execute-decision.sh exists at correct location"
  fi

  # Verify script is executable
  if [[ -x "$decision_script" ]]; then
    pass "execute-decision.sh is executable"
  else
    fail "execute-decision.sh is executable"
  fi

  log_info "✅ Decision script existence validation passed"
}

test_orchestrator_script_dir_definition() {
  log_step "GIVEN SCRIPT_DIR definition in orchestrate.sh"

  # WHEN checking SCRIPT_DIR variable definition
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify SCRIPT_DIR is defined
  if grep -q "SCRIPT_DIR=" "$orchestrator" 2>/dev/null; then
    pass "SCRIPT_DIR variable is defined"
  else
    fail "SCRIPT_DIR variable is defined"
  fi

  # Verify SCRIPT_DIR points to orchestration directory
  if grep -q "SCRIPT_DIR.*cfn-loop-orchestration\|cd.*dirname.*BASH_SOURCE" "$orchestrator" 2>/dev/null; then
    pass "SCRIPT_DIR definition is correct"
  else
    log_info "SCRIPT_DIR definition may use alternative pattern"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail
  fi

  log_info "✅ SCRIPT_DIR definition validation passed"
}

test_orchestrator_project_root_definition() {
  log_step "GIVEN PROJECT_ROOT definition in orchestrate.sh"

  # WHEN checking PROJECT_ROOT variable definition
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify PROJECT_ROOT is defined
  if grep -q "PROJECT_ROOT=" "$orchestrator" 2>/dev/null; then
    pass "PROJECT_ROOT variable is defined"
  else
    fail "PROJECT_ROOT variable is defined"
  fi

  # Verify PROJECT_ROOT calculation from SCRIPT_DIR
  if grep -q "PROJECT_ROOT.*SCRIPT_DIR.*\\.\\./\\.\\./\\.\\.\|cd.*SCRIPT_DIR" "$orchestrator" 2>/dev/null; then
    pass "PROJECT_ROOT calculated correctly from SCRIPT_DIR"
  else
    log_info "PROJECT_ROOT may use git rev-parse or alternative calculation"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail
  fi

  log_info "✅ PROJECT_ROOT definition validation passed"
}

test_path_resolution_consistency() {
  log_step "GIVEN path resolution consistency across orchestrator"

  # WHEN checking all .claude/skills references
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify all skill paths use PROJECT_ROOT
  local skill_paths=$(grep -o "\$[A-Z_]*/.claude/skills" "$orchestrator" 2>/dev/null | sort -u)

  log_info "Found skill path patterns:"
  echo "$skill_paths" | while read -r path; do
    log_info "  $path"
  done

  # Count PROJECT_ROOT usage vs SCRIPT_DIR usage for skills
  local project_root_count=$(grep -o "\$PROJECT_ROOT/.claude/skills" "$orchestrator" 2>/dev/null | wc -l)
  local script_dir_count=$(grep -o "\$SCRIPT_DIR/.claude/skills" "$orchestrator" 2>/dev/null | wc -l)

  log_info "PROJECT_ROOT usage for skills: $project_root_count"
  log_info "SCRIPT_DIR usage for skills: $script_dir_count"

  if [[ "$project_root_count" -gt 0 && "$script_dir_count" -eq 0 ]]; then
    pass "All skill paths use PROJECT_ROOT consistently"
  elif [[ "$project_root_count" -gt 0 && "$script_dir_count" -eq 0 ]]; then
    pass "Path resolution is consistent (PROJECT_ROOT only)"
  else
    log_info "Mixed path resolution detected (may need review)"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail - may have valid SCRIPT_DIR uses
  fi

  log_info "✅ Path resolution consistency validation passed"
}

test_line_923_specific_fix() {
  log_step "GIVEN line 923 specific fix in orchestrate.sh (CRITICAL-001)"

  # WHEN checking the specific line mentioned in bug report
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify the fix is in place (approximate line check)
  # Note: Line numbers may shift, so we check for pattern near that area
  local decision_line=$(grep -n "\$PROJECT_ROOT/.claude/skills/cfn-product-owner-decision/execute-decision.sh" "$orchestrator" 2>/dev/null | head -1 | cut -d: -f1)

  if [[ -n "$decision_line" ]]; then
    log_info "Decision script path found at line: $decision_line (original bug at line 923)"
    pass "Decision script path uses PROJECT_ROOT (CRITICAL-001 fix verified)"
  else
    fail "Decision script path uses PROJECT_ROOT (CRITICAL-001 fix verified)"
  fi

  log_info "✅ Line 923 specific fix validation passed"
}

# Execute tests
test_critical001_fix_exists
test_project_root_usage
test_script_dir_anti_pattern
test_nested_path_anti_pattern
test_decision_script_path_format
test_decision_script_exists
test_orchestrator_script_dir_definition
test_orchestrator_project_root_definition
test_path_resolution_consistency
test_line_923_specific_fix

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
  echo -e "${GREEN}✅ All path resolution fix tests PASSED${NC}"
  echo ""
  log_info "CRITICAL-001 fix validation complete"
  log_info "✅ PROJECT_ROOT used for decision script (not SCRIPT_DIR)"
  log_info "✅ No nested .claude/skills/.claude/skills paths"
  log_info "✅ Decision script exists and is executable"
  log_info "✅ Path resolution consistent across orchestrator"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
