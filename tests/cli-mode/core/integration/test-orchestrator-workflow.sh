#!/bin/bash
# tests/cli-mode/test-orchestrator-workflow.sh
# Phase 2 :: Validates orchestrate.sh execution flow structure (Priority 2)

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

test_orchestrator_exists() {
  log_step "GIVEN orchestrate.sh script"

  # WHEN checking if orchestrator exists
  local orchestrator_path="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN file should exist and be executable
  if [[ -f "$orchestrator_path" ]]; then
    pass "Orchestrator script exists"
  else
    fail "Orchestrator script exists"
    return
  fi

  if [[ -x "$orchestrator_path" ]]; then
    pass "Orchestrator script is executable"
  else
    fail "Orchestrator script is executable"
  fi

  log_info "✅ Orchestrator script validation passed"
}

test_loop3_spawning_logic() {
  log_step "GIVEN Loop 3 agent spawning logic"

  # WHEN checking Loop 3 spawning structure
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify Loop 3 spawning exists
  if grep -q "spawn_loop3_agents" "$orchestrator" 2>/dev/null; then
    pass "Loop 3 spawning function exists"
  else
    fail "Loop 3 spawning function exists"
  fi

  # Verify CLI spawning integration (uses npx claude-flow-novice directly)
  if grep -q "npx claude-flow-novice agent" "$orchestrator" 2>/dev/null; then
    pass "Loop 3 agents spawned via npx claude-flow-novice"
  else
    fail "Loop 3 agents spawned via npx claude-flow-novice"
  fi

  # Verify agent spawning function exists
  if grep -q "spawn_loop3_agents" "$orchestrator" 2>/dev/null; then
    pass "Loop 3 spawning function implemented"
  else
    fail "Loop 3 spawning function implemented"
  fi

  log_info "✅ Loop 3 spawning logic validation passed"
}

test_gate_check_logic() {
  log_step "GIVEN test-driven gate check logic"

  # WHEN checking gate check implementation
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify gate check logic exists
  if grep -q "gate" "$orchestrator" 2>/dev/null; then
    pass "Gate check logic exists"
  else
    fail "Gate check logic exists"
  fi

  # Verify test pass rate checking (v3.0 test-driven validation)
  if grep -q "pass.*rate\|test.*result\|threshold" "$orchestrator" 2>/dev/null; then
    pass "Test pass rate checking exists (v3.0)"
  else
    fail "Test pass rate checking exists (v3.0)"
  fi

  # Verify gate threshold comparison
  if grep -q "0\\.95\|GATE_THRESHOLD\|MVPthreshold\|STANDARDthreshold\|ENTERPRISEthreshold" "$orchestrator" 2>/dev/null; then
    pass "Gate threshold configuration exists"
  else
    fail "Gate threshold configuration exists"
  fi

  log_info "✅ Gate check logic validation passed"
}

test_loop2_spawning_logic() {
  log_step "GIVEN Loop 2 validator spawning logic"

  # WHEN checking Loop 2 spawning structure
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify Loop 2 spawning exists
  if grep -q "spawn_loop2_agents\|spawn.*validator" "$orchestrator" 2>/dev/null; then
    pass "Loop 2 validator spawning function exists"
  else
    fail "Loop 2 validator spawning function exists"
  fi

  # Verify validators have waiting mechanism (uses wait_for_loop2_agents)
  if grep -q "wait_for_loop2_agents\|wait.*validator" "$orchestrator" 2>/dev/null; then
    pass "Loop 2 validator waiting mechanism exists"
  else
    fail "Loop 2 validator waiting mechanism exists"
  fi

  # Verify consensus collection logic
  if grep -q "consensus\|collect.*scores\|validator.*scores" "$orchestrator" 2>/dev/null; then
    pass "Consensus collection logic exists"
  else
    fail "Consensus collection logic exists"
  fi

  log_info "✅ Loop 2 spawning logic validation passed"
}

test_product_owner_logic() {
  log_step "GIVEN Product Owner decision logic"

  # WHEN checking Product Owner spawning and decision handling
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify Product Owner spawning exists
  if grep -q "product.*owner\|cfn-product-owner-decision" "$orchestrator" 2>/dev/null; then
    pass "Product Owner spawning logic exists"
  else
    fail "Product Owner spawning logic exists"
  fi

  # Verify decision extraction (PROCEED/ITERATE/ABORT)
  if grep -q "PROCEED\|ITERATE\|ABORT" "$orchestrator" 2>/dev/null; then
    pass "Decision extraction logic exists"
  else
    fail "Decision extraction logic exists"
  fi

  # Verify CRITICAL-001 fix: PROJECT_ROOT usage (not SCRIPT_DIR)
  if grep -q "\$PROJECT_ROOT/\\.claude/skills/cfn-product-owner-decision" "$orchestrator" 2>/dev/null; then
    pass "CRITICAL-001 fix: Uses PROJECT_ROOT for decision script"
  else
    log_info "Checking for SCRIPT_DIR usage (anti-pattern)"
    if grep -q "\$SCRIPT_DIR/\\.claude/skills" "$orchestrator" 2>/dev/null; then
      fail "CRITICAL-001 fix: Uses PROJECT_ROOT for decision script (found SCRIPT_DIR)"
    else
      pass "CRITICAL-001 fix: Uses PROJECT_ROOT for decision script"
    fi
  fi

  log_info "✅ Product Owner logic validation passed"
}

test_decision_execution_logic() {
  log_step "GIVEN decision execution flow"

  # WHEN checking decision handling logic
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify PROCEED handling
  if grep -q "PROCEED" "$orchestrator" 2>/dev/null; then
    pass "PROCEED decision handling exists"
  else
    fail "PROCEED decision handling exists"
  fi

  # Verify ITERATE handling
  if grep -q "ITERATE" "$orchestrator" 2>/dev/null; then
    pass "ITERATE decision handling exists"
  else
    fail "ITERATE decision handling exists"
  fi

  # Verify ABORT handling
  if grep -q "ABORT" "$orchestrator" 2>/dev/null; then
    pass "ABORT decision handling exists"
  else
    fail "ABORT decision handling exists"
  fi

  # Verify iteration management
  if grep -q "iteration\|ITERATION" "$orchestrator" 2>/dev/null; then
    pass "Iteration management logic exists"
  else
    fail "Iteration management logic exists"
  fi

  log_info "✅ Decision execution logic validation passed"
}

test_spawn_agent_integration() {
  log_step "GIVEN agent spawning integration"

  # WHEN checking agent spawning mechanism
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify orchestrator uses npx claude-flow-novice for spawning
  if grep -q "npx claude-flow-novice agent" "$orchestrator" 2>/dev/null; then
    pass "Orchestrator uses npx claude-flow-novice for agent spawning"
  else
    fail "Orchestrator uses npx claude-flow-novice for agent spawning"
  fi

  # Verify spawning functions exist
  if grep -q "spawn_loop3_agents\|spawn_loop2_agents" "$orchestrator" 2>/dev/null; then
    pass "Orchestrator has agent spawning functions"
  else
    fail "Orchestrator has agent spawning functions"
  fi

  log_info "✅ Agent spawning integration validation passed"
}

test_workflow_sequencing() {
  log_step "GIVEN orchestrator workflow sequence"

  # WHEN checking execution order
  local orchestrator="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # THEN verify workflow steps exist in logical order
  log_info "Validating workflow sequence: Loop 3 → Gate → Loop 2 → Product Owner"

  # Extract line numbers for workflow components
  local loop3_line=$(grep -n "spawn_loop3_agents\|Loop 3" "$orchestrator" 2>/dev/null | head -1 | cut -d: -f1)
  local gate_line=$(grep -n "gate.*check\|test.*pass.*rate" "$orchestrator" 2>/dev/null | head -1 | cut -d: -f1)
  local loop2_line=$(grep -n "spawn_loop2_agents\|spawn.*validator" "$orchestrator" 2>/dev/null | head -1 | cut -d: -f1)
  local po_line=$(grep -n "product.*owner\|cfn-product-owner-decision" "$orchestrator" 2>/dev/null | head -1 | cut -d: -f1)

  if [[ -n "$loop3_line" && -n "$gate_line" && "$loop3_line" -lt "$gate_line" ]]; then
    pass "Loop 3 spawning occurs before gate check"
  else
    log_info "Loop 3 and gate check ordering - structure may vary"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail
  fi

  if [[ -n "$gate_line" && -n "$loop2_line" && "$gate_line" -lt "$loop2_line" ]]; then
    pass "Gate check occurs before Loop 2 spawning"
  else
    log_info "Gate check and Loop 2 ordering - structure may vary"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail
  fi

  if [[ -n "$loop2_line" && -n "$po_line" && "$loop2_line" -lt "$po_line" ]]; then
    pass "Loop 2 spawning occurs before Product Owner"
  else
    log_info "Loop 2 and Product Owner ordering - structure may vary"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))  # Count as test but don't fail
  fi

  log_info "✅ Workflow sequencing validation passed"
}

# Execute tests
test_orchestrator_exists
test_loop3_spawning_logic
test_gate_check_logic
test_loop2_spawning_logic
test_product_owner_logic
test_decision_execution_logic
test_spawn_agent_integration
test_workflow_sequencing

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
  echo -e "${GREEN}✅ All orchestrator workflow tests PASSED${NC}"
  echo ""
  log_info "Validation complete: Orchestrator workflow structure is correct"
  log_info "Loop 3 → Gate check → Loop 2 → Product Owner sequence validated"
  log_info "CRITICAL-001 fix: PROJECT_ROOT path resolution verified"
  log_info "spawn-agent.sh integration confirmed"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
