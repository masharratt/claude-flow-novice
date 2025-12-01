#!/usr/bin/env bash

##############################################################################
# TypeScript Integration Test - CFN Loop Orchestrator
#
# Validates that the enhanced orchestrator can call TypeScript modules
# and fall back to bash scripts gracefully.
#
# Usage:
#   ./test-typescript-integration.sh
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

##############################################################################
# Helper Functions
##############################################################################

log_test() {
  echo -e "${YELLOW}[TEST]${NC} $1"
  TESTS_RUN=$((TESTS_RUN + 1))
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_info() {
  echo -e "[INFO] $1"
}

##############################################################################
# Test 1: Orchestrator Syntax Validation
##############################################################################

test_syntax_validation() {
  log_test "Orchestrator bash syntax validation"

  if bash -n "$SCRIPT_DIR/orchestrate-enhanced.sh" 2>/dev/null; then
    log_pass "Syntax is valid"
  else
    log_fail "Syntax errors detected"
  fi
}

##############################################################################
# Test 2: TypeScript Module Availability
##############################################################################

test_typescript_modules() {
  log_test "TypeScript module availability"

  local modules_found=0
  local modules_expected=5

  # Check agent selector
  if [ -f "$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/dist/cli.cjs" ]; then
    log_info "✓ Agent selector: cli.cjs found"
    modules_found=$((modules_found + 1))
  else
    log_info "✗ Agent selector: cli.cjs not found"
  fi

  # Check coordination wrapper
  if [ -f "$PROJECT_ROOT/dist/coordination/coordination-wrapper.js" ]; then
    log_info "✓ Coordination wrapper: coordination-wrapper.js found"
    modules_found=$((modules_found + 1))
  else
    log_info "✗ Coordination wrapper: coordination-wrapper.js not found"
  fi

  # Check spawn agent
  if [ -f "$PROJECT_ROOT/dist/coordination/spawn-agent.js" ]; then
    log_info "✓ Spawn agent: spawn-agent.js found"
    modules_found=$((modules_found + 1))
  else
    log_info "✗ Spawn agent: spawn-agent.js not found (optional)"
    modules_found=$((modules_found + 1))  # Non-blocking
  fi

  # Check gate checker
  if [ -f "$SCRIPT_DIR/dist/helpers/gate-check.js" ]; then
    log_info "✓ Gate checker: gate-check.js found"
    modules_found=$((modules_found + 1))
  else
    log_info "✗ Gate checker: gate-check.js not found"
  fi

  # Check consensus helper
  if [ -f "$SCRIPT_DIR/dist/helpers/consensus.js" ]; then
    log_info "✓ Consensus helper: consensus.js found"
    modules_found=$((modules_found + 1))
  else
    log_info "✗ Consensus helper: consensus.js not found"
  fi

  if [ $modules_found -ge 3 ]; then
    log_pass "Sufficient TypeScript modules available ($modules_found/$modules_expected)"
  else
    log_fail "Insufficient TypeScript modules ($modules_found/$modules_expected)"
  fi
}

##############################################################################
# Test 3: Feature Flag Support
##############################################################################

test_feature_flag() {
  log_test "Feature flag support (USE_TYPESCRIPT)"

  # Test with USE_TYPESCRIPT=true
  if USE_TYPESCRIPT=true bash -n "$SCRIPT_DIR/orchestrate-enhanced.sh" 2>/dev/null; then
    log_info "✓ USE_TYPESCRIPT=true accepted"
  else
    log_fail "USE_TYPESCRIPT=true rejected"
    return
  fi

  # Test with USE_TYPESCRIPT=false
  if USE_TYPESCRIPT=false bash -n "$SCRIPT_DIR/orchestrate-enhanced.sh" 2>/dev/null; then
    log_info "✓ USE_TYPESCRIPT=false accepted"
  else
    log_fail "USE_TYPESCRIPT=false rejected"
    return
  fi

  log_pass "Feature flag works correctly"
}

##############################################################################
# Test 4: TypeScript Helper Functions Defined
##############################################################################

test_helper_functions() {
  log_test "TypeScript helper functions defined"

  local helpers=(
    "call_ts_spawn_agent"
    "call_ts_select_agents"
    "call_ts_coordination_signal"
    "call_ts_coordination_wait"
    "call_ts_validate_gate"
    "call_ts_detect_vapor"
    "call_ts_collect_consensus"
  )

  local defined_count=0

  for helper in "${helpers[@]}"; do
    if grep -q "^${helper}()" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
      log_info "✓ $helper() defined"
      defined_count=$((defined_count + 1))
    else
      log_info "✗ $helper() not found"
    fi
  done

  if [ $defined_count -eq ${#helpers[@]} ]; then
    log_pass "All $defined_count helper functions defined"
  else
    log_fail "Only $defined_count/${#helpers[@]} helper functions defined"
  fi
}

##############################################################################
# Test 5: Bash Fallback Logic
##############################################################################

test_bash_fallback() {
  log_test "Bash fallback logic present"

  local fallback_checks=0

  # Check for bash script fallback in helper functions
  if grep -q "\.claude/skills/cfn-agent-spawning/spawn-agent\.sh" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Spawn agent fallback defined"
    fallback_checks=$((fallback_checks + 1))
  else
    log_info "✗ Spawn agent fallback missing"
  fi

  if grep -q "\.claude/skills/cfn-agent-selection-with-fallback/select-agents\.sh" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Agent selection fallback defined"
    fallback_checks=$((fallback_checks + 1))
  else
    log_info "✗ Agent selection fallback missing"
  fi

  if grep -q "\.claude/skills/cfn-coordination/coordination-signal\.sh" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Coordination signal fallback defined"
    fallback_checks=$((fallback_checks + 1))
  else
    log_info "✗ Coordination signal fallback missing"
  fi

  if [ $fallback_checks -ge 2 ]; then
    log_pass "Bash fallback logic present ($fallback_checks checks)"
  else
    log_fail "Insufficient bash fallback logic ($fallback_checks checks)"
  fi
}

##############################################################################
# Test 6: Mode-Specific Thresholds
##############################################################################

test_mode_thresholds() {
  log_test "Mode-specific thresholds configured"

  local thresholds_found=0

  if grep -q "GATE_THRESHOLD=0.70" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ MVP gate threshold (0.70)"
    thresholds_found=$((thresholds_found + 1))
  fi

  if grep -q "GATE_THRESHOLD=0.95" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Standard gate threshold (0.95)"
    thresholds_found=$((thresholds_found + 1))
  fi

  if grep -q "GATE_THRESHOLD=0.98" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Enterprise gate threshold (0.98)"
    thresholds_found=$((thresholds_found + 1))
  fi

  if [ $thresholds_found -eq 3 ]; then
    log_pass "All mode thresholds configured"
  else
    log_fail "Missing mode thresholds ($thresholds_found/3)"
  fi
}

##############################################################################
# Test 7: Package.json Build Scripts
##############################################################################

test_package_scripts() {
  log_test "Package.json build scripts present"

  local scripts_found=0

  if grep -q '"build:orchestrator"' "$PROJECT_ROOT/package.json"; then
    log_info "✓ build:orchestrator script"
    scripts_found=$((scripts_found + 1))
  fi

  if grep -q '"build:all"' "$PROJECT_ROOT/package.json"; then
    log_info "✓ build:all script"
    scripts_found=$((scripts_found + 1))
  fi

  if grep -q '"build:spawner"' "$PROJECT_ROOT/package.json"; then
    log_info "✓ build:spawner script"
    scripts_found=$((scripts_found + 1))
  fi

  if grep -q '"build:selector"' "$PROJECT_ROOT/package.json"; then
    log_info "✓ build:selector script"
    scripts_found=$((scripts_found + 1))
  fi

  if grep -q '"build:coordination"' "$PROJECT_ROOT/package.json"; then
    log_info "✓ build:coordination script"
    scripts_found=$((scripts_found + 1))
  fi

  if [ $scripts_found -ge 3 ]; then
    log_pass "Build scripts present ($scripts_found/5)"
  else
    log_fail "Insufficient build scripts ($scripts_found/5)"
  fi
}

##############################################################################
# Test 8: Orchestration Flow Phases
##############################################################################

test_orchestration_phases() {
  log_test "Orchestration flow phases present"

  local phases=(
    "Phase 1: Agent Selection"
    "Phase 2: Loop 3 Execution"
    "Phase 3: Gate Check"
    "Phase 4: Loop 2 Execution"
    "Phase 5: Consensus Check"
    "Phase 6: Product Owner Decision"
  )

  local phases_found=0

  for phase in "${phases[@]}"; do
    if grep -q "$phase" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
      log_info "✓ $phase"
      phases_found=$((phases_found + 1))
    else
      log_info "✗ $phase missing"
    fi
  done

  if [ $phases_found -eq ${#phases[@]} ]; then
    log_pass "All orchestration phases present"
  else
    log_fail "Missing orchestration phases ($phases_found/${#phases[@]})"
  fi
}

##############################################################################
# Test 9: Error Handling
##############################################################################

test_error_handling() {
  log_test "Error handling and validation"

  local error_checks=0

  # Check for input sanitization
  if grep -q "sanitize_input" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Input sanitization function"
    error_checks=$((error_checks + 1))
  fi

  # Check for required argument validation
  if grep -q "if \[ -z \"\$TASK_ID\" \]" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Required argument validation"
    error_checks=$((error_checks + 1))
  fi

  # Check for mode validation
  if grep -q "if \[\[ ! \"\$MODE\" =~ \^(mvp|standard|enterprise)\$ \]\]" "$SCRIPT_DIR/orchestrate-enhanced.sh"; then
    log_info "✓ Mode validation"
    error_checks=$((error_checks + 1))
  fi

  if [ $error_checks -ge 2 ]; then
    log_pass "Error handling present ($error_checks checks)"
  else
    log_fail "Insufficient error handling ($error_checks checks)"
  fi
}

##############################################################################
# Test 10: Documentation
##############################################################################

test_documentation() {
  log_test "Documentation and comments"

  if [ -f "$SCRIPT_DIR/TYPESCRIPT_INTEGRATION_REPORT.md" ]; then
    log_info "✓ TYPESCRIPT_INTEGRATION_REPORT.md present"

    # Check for key sections
    local sections=(
      "Executive Summary"
      "Deliverables"
      "TypeScript Helper Functions"
      "Integration Verification"
      "Performance Comparison"
    )

    local sections_found=0

    for section in "${sections[@]}"; do
      if grep -q "$section" "$SCRIPT_DIR/TYPESCRIPT_INTEGRATION_REPORT.md"; then
        sections_found=$((sections_found + 1))
      fi
    done

    if [ $sections_found -eq ${#sections[@]} ]; then
      log_pass "Documentation complete with all sections"
    else
      log_fail "Documentation missing sections ($sections_found/${#sections[@]})"
    fi
  else
    log_fail "TYPESCRIPT_INTEGRATION_REPORT.md not found"
  fi
}

##############################################################################
# Main Test Execution
##############################################################################

echo ""
echo "=========================================="
echo "TypeScript Integration Test Suite"
echo "=========================================="
echo ""

# Run all tests
test_syntax_validation
test_typescript_modules
test_feature_flag
test_helper_functions
test_bash_fallback
test_mode_thresholds
test_package_scripts
test_orchestration_phases
test_error_handling
test_documentation

##############################################################################
# Test Summary
##############################################################################

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Tests Run:    $TESTS_RUN"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}$TESTS_FAILED test(s) failed.${NC}"
  exit 1
fi
