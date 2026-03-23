#!/usr/bin/env bash

##############################################################################
# CFN Loop Orchestration Test Suite
# Version: 1.0.0
#
# Comprehensive tests for modular CFN Loop Orchestration skill
##############################################################################

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="$SCRIPT_DIR/helpers"
TEST_TASK_ID="test-cfn-$(date +%s)"
PASSED=0
FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

##############################################################################
# Test Helper Functions
##############################################################################

function test_passed() {
  local test_name="$1"
  echo -e "${GREEN}✓${NC} $test_name"
  PASSED=$((PASSED + 1))
}

function test_failed() {
  local test_name="$1"
  local reason="$2"
  echo -e "${RED}✗${NC} $test_name: $reason"
  FAILED=$((FAILED + 1))
}

function cleanup_test() {
  local task_id="$1"
  # Clean up Redis keys for test
  redis-cli --scan --pattern "swarm:${task_id}:*" | xargs -r redis-cli del > /dev/null 2>&1 || true
}

##############################################################################
# Test Cases
##############################################################################

echo "=============================================="
echo "CFN Loop Orchestration Test Suite"
echo "=============================================="
echo ""

# Test 1: Gate Check Helper - Pass
echo "Test 1: Gate Check - Pass Scenario"
cleanup_test "$TEST_TASK_ID"

# Simulate Loop 3 agents with high confidence
redis-cli lpush "swarm:${TEST_TASK_ID}:agent1:result" "0.85" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:agent2:result" "0.90" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:agent3:result" "0.88" > /dev/null

if "$HELPERS_DIR/gate-check.sh" \
     --task-id "$TEST_TASK_ID" \
     --agents "agent1,agent2,agent3" \
     --threshold "0.75" \
     --min-quorum "0.66" > /dev/null 2>&1; then
  # Check that gate-passed signal was sent
  if redis-cli --raw lrange "swarm:${TEST_TASK_ID}:gate-passed" 0 -1 | grep -q "1"; then
    test_passed "Gate check PASS with signal broadcast"
  else
    test_failed "Gate check PASS" "Signal not broadcast to Loop 2"
  fi
else
  test_failed "Gate check PASS" "Should have passed with 0.87 avg confidence"
fi

cleanup_test "$TEST_TASK_ID"
echo ""

# Test 2: Gate Check Helper - Fail
echo "Test 2: Gate Check - Fail Scenario"
cleanup_test "$TEST_TASK_ID"

# Simulate Loop 3 agents with low confidence
redis-cli lpush "swarm:${TEST_TASK_ID}:agent1:result" "0.65" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:agent2:result" "0.70" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:agent3:result" "0.68" > /dev/null

if ! "$HELPERS_DIR/gate-check.sh" \
       --task-id "$TEST_TASK_ID" \
       --agents "agent1,agent2,agent3" \
       --threshold "0.75" \
       --min-quorum "0.66" > /dev/null 2>&1; then
  test_passed "Gate check FAIL detection"
else
  test_failed "Gate check FAIL" "Should have failed with 0.67 avg confidence"
fi

cleanup_test "$TEST_TASK_ID"
echo ""

# Test 3: Consensus Check Helper - Pass
echo "Test 3: Consensus Check - Pass Scenario"
cleanup_test "$TEST_TASK_ID"

# Simulate Loop 2 validators with high consensus
redis-cli lpush "swarm:${TEST_TASK_ID}:reviewer1:result" "0.92" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:tester1:result" "0.95" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:security1:result" "0.91" > /dev/null

if "$HELPERS_DIR/consensus.sh" \
     --task-id "$TEST_TASK_ID" \
     --agents "reviewer1,tester1,security1" \
     --threshold "0.90" \
     --min-quorum "0.66" > /dev/null 2>&1; then
  test_passed "Consensus check PASS"
else
  test_failed "Consensus check PASS" "Should have passed with 0.93 avg consensus"
fi

cleanup_test "$TEST_TASK_ID"
echo ""

# Test 4: Consensus Check Helper - Fail
echo "Test 4: Consensus Check - Fail Scenario"
cleanup_test "$TEST_TASK_ID"

# Simulate Loop 2 validators with low consensus
redis-cli lpush "swarm:${TEST_TASK_ID}:reviewer1:result" "0.82" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:tester1:result" "0.85" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:security1:result" "0.88" > /dev/null

if ! "$HELPERS_DIR/consensus.sh" \
       --task-id "$TEST_TASK_ID" \
       --agents "reviewer1,tester1,security1" \
       --threshold "0.90" \
       --min-quorum "0.66" > /dev/null 2>&1; then
  test_passed "Consensus check FAIL detection"
else
  test_failed "Consensus check FAIL" "Should have failed with 0.85 avg consensus"
fi

cleanup_test "$TEST_TASK_ID"
echo ""

# Test 5: Deliverable Verifier - File Exists
echo "Test 5: Deliverable Verifier - File Exists"

# Create test file
TEST_FILE="/tmp/test-deliverable-$$.txt"
echo "test content" > "$TEST_FILE"

if "$HELPERS_DIR/deliverable-verifier.sh" \
     --expected-files "$TEST_FILE" \
     --task-type "implement feature" > /dev/null 2>&1; then
  test_passed "Deliverable verification - file exists"
else
  test_failed "Deliverable verification" "Should have passed with existing file"
fi

# Cleanup
rm -f "$TEST_FILE"
echo ""

# Test 6: Deliverable Verifier - Missing File
echo "Test 6: Deliverable Verifier - Missing File"

# Reference non-existent file
TEST_FILE="/tmp/nonexistent-file-$$.txt"

if ! "$HELPERS_DIR/deliverable-verifier.sh" \
       --expected-files "$TEST_FILE" \
       --task-type "create component" > /dev/null 2>&1; then
  test_passed "Deliverable verification - missing file detection"
else
  test_failed "Deliverable verification" "Should have failed with missing file"
fi

echo ""

# Test 7: Timeout Calculator - Phase-Specific
echo "Test 7: Timeout Calculator - Phase-Specific"

PHASE1_TIMEOUT=$("$HELPERS_DIR/timeout-calculator.sh" --phase-id "phase-1")
PHASE2_TIMEOUT=$("$HELPERS_DIR/timeout-calculator.sh" --phase-id "phase-2")
UNKNOWN_TIMEOUT=$("$HELPERS_DIR/timeout-calculator.sh" --phase-id "unknown-phase")

if [ "$PHASE1_TIMEOUT" = "900" ] && [ "$PHASE2_TIMEOUT" = "3600" ] && [ "$UNKNOWN_TIMEOUT" = "3600" ]; then
  test_passed "Timeout calculator - phase-specific values"
else
  test_failed "Timeout calculator" "Expected 900, 3600, 3600 but got $PHASE1_TIMEOUT, $PHASE2_TIMEOUT, $UNKNOWN_TIMEOUT"
fi

echo ""

# Test 8: Iteration Manager - Wake Agents
echo "Test 8: Iteration Manager - Agent Wake"
cleanup_test "$TEST_TASK_ID"

# Simulate agents in waiting mode
redis-cli lpush "swarm:${TEST_TASK_ID}:agent1:wake" "" > /dev/null
redis-cli lpush "swarm:${TEST_TASK_ID}:agent2:wake" "" > /dev/null

# Store feedback
redis-cli set "swarm:${TEST_TASK_ID}:feedback:agent1" "Improve test coverage" > /dev/null
redis-cli set "swarm:${TEST_TASK_ID}:feedback:agent2" "Add error handling" > /dev/null

if "$HELPERS_DIR/iteration-manager.sh" \
     --task-id "$TEST_TASK_ID" \
     --iteration "2" \
     --agents "agent1,agent2" \
     --feedback-source "swarm:${TEST_TASK_ID}:feedback" > /dev/null 2>&1; then
  test_passed "Iteration manager - agent wake"
else
  test_failed "Iteration manager" "Failed to wake agents"
fi

cleanup_test "$TEST_TASK_ID"
echo ""

# Test 9: Helper Script Parameter Validation
echo "Test 9: Parameter Validation"

# Test gate-check.sh without required params
if ! "$HELPERS_DIR/gate-check.sh" > /dev/null 2>&1; then
  test_passed "Parameter validation - gate-check.sh"
else
  test_failed "Parameter validation" "gate-check.sh should fail without params"
fi

# Test consensus.sh without required params
if ! "$HELPERS_DIR/consensus.sh" > /dev/null 2>&1; then
  test_passed "Parameter validation - consensus.sh"
else
  test_failed "Parameter validation" "consensus.sh should fail without params"
fi

echo ""

# Test 10: SKILL.md Metadata Validation
echo "Test 10: SKILL.md Metadata Validation"

if [ -f "$SCRIPT_DIR/SKILL.md" ]; then
  # Check for required metadata fields
  if grep -q "Skill ID:" "$SCRIPT_DIR/SKILL.md" && \
     grep -q "Version:" "$SCRIPT_DIR/SKILL.md" && \
     grep -q "Dependencies:" "$SCRIPT_DIR/SKILL.md" && \
     grep -q "Purpose" "$SCRIPT_DIR/SKILL.md"; then
    test_passed "SKILL.md metadata completeness"
  else
    test_failed "SKILL.md metadata" "Missing required fields"
  fi
else
  test_failed "SKILL.md" "File not found"
fi

echo ""

##############################################################################
# Test Summary
##############################################################################

echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo "Total: $((PASSED + FAILED))"
echo "=============================================="

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed${NC}"
  exit 1
fi
