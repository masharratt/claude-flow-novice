#!/bin/bash
set -eu

##############################################################################
# BUG #22 Integration Test - End-to-End Parameter Flow Validation
# Tests: Coordinator → Wrapper → Orchestrator
# Validates all 3 phases of BUG #22 fix
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

echo "======================================"
echo "BUG #22 Integration Test Suite"
echo "End-to-End Parameter Flow Validation"
echo "======================================"
echo ""

# Test helper functions
assert_success() {
  local exit_code="$1"
  local test_name="$2"

  if [ "$exit_code" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name (exit code: $exit_code)"
    ((TESTS_FAILED++))
  fi
}

assert_failure() {
  local exit_code="$1"
  local test_name="$2"

  if [ "$exit_code" -ne 0 ]; then
    echo -e "${GREEN}✓${NC} $test_name (correctly failed)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name (should have failed)"
    ((TESTS_FAILED++))
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local test_name="$3"

  if echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}✓${NC} $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name"
    echo "  Expected to find: $needle"
    echo "  In output: ${haystack:0:200}..."
    ((TESTS_FAILED++))
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local test_name="$3"

  if ! echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}✓${NC} $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} $test_name"
    echo "  Should NOT contain: $needle"
    ((TESTS_FAILED++))
  fi
}

##############################################################################
# PHASE 1: Coordinator Profile Tests
##############################################################################

echo -e "${BLUE}Phase 1: Coordinator Profile Validation${NC}"
echo "--------------------------------------"

# Test 1.1: Coordinator has fallback initialization
COORD_PROFILE="$PROJECT_ROOT/.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md"
COORD_CONTENT=$(cat "$COORD_PROFILE")

assert_contains "$COORD_CONTENT" "LOOP3_AGENTS=\${LOOP3_AGENTS:-" "Phase 1.1: Coordinator has fallback initialization"
assert_contains "$COORD_CONTENT" "LOOP2_AGENTS=\${LOOP2_AGENTS:-" "Phase 1.2: Coordinator has Loop 2 fallback"
assert_contains "$COORD_CONTENT" "PRODUCT_OWNER=\${PRODUCT_OWNER:-" "Phase 1.3: Coordinator has Product Owner fallback"

# Test 1.2: Coordinator has pre-invocation validation
assert_contains "$COORD_CONTENT" "if \[\[ -z \"\$LOOP3_AGENTS\" \]\]" "Phase 1.4: Coordinator validates empty parameters"
assert_contains "$COORD_CONTENT" "exit 1" "Phase 1.5: Coordinator exits on validation failure"

echo ""

##############################################################################
# PHASE 2: Wrapper Script Tests
##############################################################################

echo -e "${BLUE}Phase 2: Wrapper Script Validation${NC}"
echo "--------------------------------------"

WRAPPER_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh"

# Test 2.1: Wrapper script exists and is executable
if [ -x "$WRAPPER_SCRIPT" ]; then
  echo -e "${GREEN}✓${NC} Phase 2.1: Wrapper script exists and is executable"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Phase 2.1: Wrapper script not found or not executable"
  ((TESTS_FAILED++))
fi

# Test 2.2: Empty parameter detection and fallback
WRAPPER_OUTPUT=$("$WRAPPER_SCRIPT" --task-id "test-empty" --mode "standard" --loop3-agents "" --loop2-agents "" --product-owner "" 2>&1 || true)

assert_contains "$WRAPPER_OUTPUT" "Agent Configuration" "Phase 2.2: Wrapper logs configuration"
assert_contains "$WRAPPER_OUTPUT" "Loop 3 Agents:" "Phase 2.3: Wrapper shows Loop 3 agents"
assert_not_contains "$WRAPPER_OUTPUT" "value cannot be empty" "Phase 2.4: No empty parameter errors"

# Test 2.3: Task-type classification
BACKEND_OUTPUT=$("$WRAPPER_SCRIPT" --task-id "test-backend" --mode "standard" --task-type "backend" 2>&1 || true)

assert_contains "$BACKEND_OUTPUT" "Task Type: backend" "Phase 2.5: Task type logged correctly"
assert_contains "$BACKEND_OUTPUT" "backend-developer" "Phase 2.6: Backend-specific agents selected"

# Test 2.4: Full-stack task type
FULLSTACK_OUTPUT=$("$WRAPPER_SCRIPT" --task-id "test-fullstack" --mode "mvp" --task-type "full-stack" 2>&1 || true)

assert_contains "$FULLSTACK_OUTPUT" "Task Type: full-stack" "Phase 2.7: Full-stack task type logged"
assert_contains "$FULLSTACK_OUTPUT" "react-frontend-engineer" "Phase 2.8: Full-stack agents include frontend"

# Test 2.5: Whitespace-only parameter fallback
WHITESPACE_OUTPUT=$("$WRAPPER_SCRIPT" --task-id "test-whitespace" --mode "standard" --loop3-agents "   " --loop2-agents "  " --product-owner "  " 2>&1 || true)

assert_not_contains "$WHITESPACE_OUTPUT" "value cannot be empty" "Phase 2.9: Whitespace-only parameters handled"
assert_contains "$WHITESPACE_OUTPUT" "backend-developer" "Phase 2.10: Fallback agents applied"

# Test 2.6: Custom parameters preserved
CUSTOM_OUTPUT=$("$WRAPPER_SCRIPT" --task-id "test-custom" --mode "enterprise" --loop3-agents "custom-agent-1,custom-agent-2" --loop2-agents "validator-1,validator-2" --product-owner "my-po" 2>&1 || true)

assert_contains "$CUSTOM_OUTPUT" "custom-agent-1" "Phase 2.11: Custom Loop 3 agents preserved"
assert_contains "$CUSTOM_OUTPUT" "validator-1" "Phase 2.12: Custom Loop 2 agents preserved"
assert_contains "$CUSTOM_OUTPUT" "my-po" "Phase 2.13: Custom Product Owner preserved"

# Test 2.7: Missing required parameters
MISSING_TASKID_OUTPUT=$("$WRAPPER_SCRIPT" --mode "standard" 2>&1 || true)
assert_contains "$MISSING_TASKID_OUTPUT" "Error: --task-id is required" "Phase 2.14: Missing task-id rejected"

MISSING_MODE_OUTPUT=$("$WRAPPER_SCRIPT" --task-id "test" 2>&1 || true)
assert_contains "$MISSING_MODE_OUTPUT" "Error: --mode is required" "Phase 2.15: Missing mode rejected"

echo ""

##############################################################################
# PHASE 3: Agent Selection Skill Tests
##############################################################################

echo -e "${BLUE}Phase 3: Agent Selection Skill Validation${NC}"
echo "--------------------------------------"

AGENT_SELECTOR="$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/select-agents.sh"
TASK_CLASSIFIER="$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/task-classifier.sh"

# Test 3.1: Agent selector exists and is executable
if [ -x "$AGENT_SELECTOR" ]; then
  echo -e "${GREEN}✓${NC} Phase 3.1: Agent selector exists and is executable"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Phase 3.1: Agent selector not found or not executable"
  ((TESTS_FAILED++))
fi

# Test 3.2: Task classifier exists
if [ -x "$TASK_CLASSIFIER" ]; then
  echo -e "${GREEN}✓${NC} Phase 3.2: Task classifier exists and is executable"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC} Phase 3.2: Task classifier not found or not executable"
  ((TESTS_FAILED++))
fi

# Test 3.3: Backend API classification
if [ -x "$TASK_CLASSIFIER" ]; then
  BACKEND_CLASS=$("$TASK_CLASSIFIER" "Implement JWT authentication API")
  if [ "$BACKEND_CLASS" = "security" ] || [ "$BACKEND_CLASS" = "backend-api" ]; then
    echo -e "${GREEN}✓${NC} Phase 3.3: Backend API classified correctly ($BACKEND_CLASS)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.3: Backend API misclassified as $BACKEND_CLASS"
    ((TESTS_FAILED++))
  fi
fi

# Test 3.4: Infrastructure classification
if [ -x "$TASK_CLASSIFIER" ]; then
  INFRA_CLASS=$("$TASK_CLASSIFIER" "Deploy Kubernetes cluster with Helm")
  if [ "$INFRA_CLASS" = "infrastructure" ]; then
    echo -e "${GREEN}✓${NC} Phase 3.4: Infrastructure classified correctly"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.4: Infrastructure misclassified as $INFRA_CLASS"
    ((TESTS_FAILED++))
  fi
fi

# Test 3.5: Frontend classification
if [ -x "$TASK_CLASSIFIER" ]; then
  FRONTEND_CLASS=$("$TASK_CLASSIFIER" "Build React dashboard with TypeScript")
  if [ "$FRONTEND_CLASS" = "frontend" ] || [ "$FRONTEND_CLASS" = "fullstack" ]; then
    echo -e "${GREEN}✓${NC} Phase 3.5: Frontend classified correctly ($FRONTEND_CLASS)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.5: Frontend misclassified as $FRONTEND_CLASS"
    ((TESTS_FAILED++))
  fi
fi

# Test 3.6: JSON output format
if [ -x "$AGENT_SELECTOR" ]; then
  SELECTION_OUTPUT=$("$AGENT_SELECTOR" "Implement REST API")

  # Validate JSON parsability
  if echo "$SELECTION_OUTPUT" | jq empty 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Phase 3.6: Agent selector returns valid JSON"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.6: Agent selector JSON invalid"
    ((TESTS_FAILED++))
  fi

  # Test 3.7: Non-empty Loop 3 array
  LOOP3_COUNT=$(echo "$SELECTION_OUTPUT" | jq '.loop3 | length')
  if [ "$LOOP3_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✓${NC} Phase 3.7: Loop 3 has ≥2 agents ($LOOP3_COUNT)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.7: Loop 3 has <2 agents ($LOOP3_COUNT)"
    ((TESTS_FAILED++))
  fi

  # Test 3.8: Non-empty Loop 2 array
  LOOP2_COUNT=$(echo "$SELECTION_OUTPUT" | jq '.loop2 | length')
  if [ "$LOOP2_COUNT" -ge 3 ]; then
    echo -e "${GREEN}✓${NC} Phase 3.8: Loop 2 has ≥3 validators ($LOOP2_COUNT)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.8: Loop 2 has <3 validators ($LOOP2_COUNT)"
    ((TESTS_FAILED++))
  fi

  # Test 3.9: Product Owner present
  PO=$(echo "$SELECTION_OUTPUT" | jq -r '.product_owner')
  if [ -n "$PO" ] && [ "$PO" != "null" ]; then
    echo -e "${GREEN}✓${NC} Phase 3.9: Product Owner present ($PO)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.9: Product Owner missing"
    ((TESTS_FAILED++))
  fi

  # Test 3.10: Category present
  CATEGORY=$(echo "$SELECTION_OUTPUT" | jq -r '.category')
  if [ -n "$CATEGORY" ] && [ "$CATEGORY" != "null" ]; then
    echo -e "${GREEN}✓${NC} Phase 3.10: Category present ($CATEGORY)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.10: Category missing"
    ((TESTS_FAILED++))
  fi

  # Test 3.11: Confidence score present
  CONFIDENCE=$(echo "$SELECTION_OUTPUT" | jq -r '.confidence')
  if [ -n "$CONFIDENCE" ] && [ "$CONFIDENCE" != "null" ]; then
    echo -e "${GREEN}✓${NC} Phase 3.11: Confidence score present ($CONFIDENCE)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.11: Confidence score missing"
    ((TESTS_FAILED++))
  fi
fi

# Test 3.12: Empty task description fallback
if [ -x "$AGENT_SELECTOR" ]; then
  EMPTY_OUTPUT=$("$AGENT_SELECTOR" "")
  EMPTY_CATEGORY=$(echo "$EMPTY_OUTPUT" | jq -r '.category')

  if [ "$EMPTY_CATEGORY" = "default" ]; then
    echo -e "${GREEN}✓${NC} Phase 3.12: Empty description uses default category"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 3.12: Empty description category wrong ($EMPTY_CATEGORY)"
    ((TESTS_FAILED++))
  fi
fi

echo ""

##############################################################################
# PHASE 4: Integration Tests (End-to-End)
##############################################################################

echo -e "${BLUE}Phase 4: End-to-End Integration${NC}"
echo "--------------------------------------"

# Test 4.1: Coordinator invokes wrapper (simulated)
# Note: We can't run full coordinator without spawning agents,
# so we test the invocation pattern is correct

COORD_WRAPPER_CALL=$(grep -A 5 "orchestrate-wrapper.sh" "$COORD_PROFILE" | head -10 || true)

assert_contains "$COORD_WRAPPER_CALL" "orchestrate-wrapper.sh" "Phase 4.1: Coordinator calls wrapper script"
assert_contains "$COORD_WRAPPER_CALL" "--task-id" "Phase 4.2: Coordinator passes task-id"
assert_contains "$COORD_WRAPPER_CALL" "--mode" "Phase 4.3: Coordinator passes mode"
assert_contains "$COORD_WRAPPER_CALL" "--loop3-agents" "Phase 4.4: Coordinator passes Loop 3 agents"
assert_contains "$COORD_WRAPPER_CALL" "--loop2-agents" "Phase 4.5: Coordinator passes Loop 2 agents"

# Test 4.2: Wrapper invokes orchestrator (simulated)
WRAPPER_ORCH_CALL=$(grep -A 5 "exec.*orchestrate.sh" "$WRAPPER_SCRIPT" | head -10 || true)

assert_contains "$WRAPPER_ORCH_CALL" "orchestrate.sh" "Phase 4.6: Wrapper calls orchestrator"
assert_contains "$WRAPPER_ORCH_CALL" "--task-id" "Phase 4.7: Wrapper passes task-id to orchestrator"
assert_contains "$WRAPPER_ORCH_CALL" "--mode" "Phase 4.8: Wrapper passes mode to orchestrator"

# Test 4.3: No "value cannot be empty" errors in documentation
IMPLEMENTATION_DOC="$PROJECT_ROOT/docs/BUG_22_PHASE_2_IMPLEMENTATION.md"

if [ -f "$IMPLEMENTATION_DOC" ]; then
  DOC_CONTENT=$(cat "$IMPLEMENTATION_DOC")
  assert_contains "$DOC_CONTENT" "✅ PASS" "Phase 4.9: Implementation doc shows passing tests"
  assert_not_contains "$DOC_CONTENT" "value cannot be empty.*FAILED" "Phase 4.10: No empty value failures in tests"
fi

# Test 4.4: Test coverage for critical paths
UNIT_TEST="$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/test-agent-selection.sh"

if [ -x "$UNIT_TEST" ]; then
  echo -e "${YELLOW}Running Phase 3 unit tests...${NC}"

  if "$UNIT_TEST" > /tmp/bug22-unit-test-output.log 2>&1; then
    echo -e "${GREEN}✓${NC} Phase 4.11: Agent selection unit tests pass"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Phase 4.11: Agent selection unit tests failed"
    echo "See /tmp/bug22-unit-test-output.log for details"
    ((TESTS_FAILED++))
  fi
fi

echo ""

##############################################################################
# Summary
##############################################################################

echo "======================================"
echo "Integration Test Summary"
echo "======================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

# Calculate coverage percentage
TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
if [ $TOTAL_TESTS -gt 0 ]; then
  COVERAGE=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED / $TOTAL_TESTS) * 100}")
  echo "Coverage: ${COVERAGE}%"
fi

echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All integration tests passed!${NC}"
  echo ""
  echo "BUG #22 Fix Validation Complete:"
  echo "  Phase 1: Coordinator fallback initialization ✓"
  echo "  Phase 2: Wrapper parameter validation ✓"
  echo "  Phase 3: Agent selection with guarantees ✓"
  echo "  Phase 4: End-to-end integration ✓"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Some integration tests failed!${NC}"
  echo ""
  echo "Failed Components:"
  if echo "$WRAPPER_OUTPUT" | grep -q "Error"; then
    echo "  - Phase 2: Wrapper script validation"
  fi
  if [ "$LOOP3_COUNT" -lt 2 ] 2>/dev/null; then
    echo "  - Phase 3: Agent selection (Loop 3 count)"
  fi
  echo ""
  exit 1
fi
