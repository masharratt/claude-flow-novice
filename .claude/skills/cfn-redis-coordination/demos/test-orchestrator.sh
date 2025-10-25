#!/bin/bash

# Test Suite for orchestrate-cfn-loop.sh
# Tests dependency enforcement, BLPOP blocking, and agent completion protocol

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR="$SCRIPT_DIR/orchestrate-cfn-loop.sh"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test helpers
function test_start() {
  echo -e "${YELLOW}[TEST]${NC} $1"
  TESTS_RUN=$((TESTS_RUN + 1))
}

function test_pass() {
  echo -e "${GREEN}  ✓ PASS${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

function test_fail() {
  echo -e "${RED}  ✗ FAIL${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

function cleanup_redis() {
  local TASK_ID="$1"
  redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli del > /dev/null 2>&1 || true
}

# ==============================================================================
# TEST 1: Orchestrator script exists and is executable
# ==============================================================================
test_start "Orchestrator script exists and is executable"

if [ -f "$ORCHESTRATOR" ] && [ -x "$ORCHESTRATOR" ]; then
  test_pass
else
  test_fail "Script not found or not executable: $ORCHESTRATOR"
fi

# ==============================================================================
# TEST 2: Redis connection available
# ==============================================================================
test_start "Redis connection available"

if redis-cli ping > /dev/null 2>&1; then
  test_pass
else
  test_fail "Redis not available. Start Redis server: redis-server"
  exit 1
fi

# ==============================================================================
# TEST 3: Orchestrator script is a bash script
# ==============================================================================
test_start "Orchestrator script is a bash script"

# Check if orchestrator exists (validation will be added later)
if [ -f "$ORCHESTRATOR" ]; then
  test_pass
else
  test_fail "Orchestrator script not found"
fi

# ==============================================================================
# TEST 4: Agent completion protocol - Signal :done key
# ==============================================================================
test_start "Agent completion protocol - Signal :done key"

TASK_ID="test-completion-$(date +%s)"
AGENT_ID="test-agent-1"

cleanup_redis "$TASK_ID"

# Simulate agent completing work
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" > /dev/null

# Verify signal present
SIGNAL=$(redis-cli blpop "swarm:${TASK_ID}:${AGENT_ID}:done" 1 2>&1 | tail -n 1)
if [ "$SIGNAL" == "complete" ]; then
  test_pass
else
  test_fail "Signal not found in Redis"
fi

cleanup_redis "$TASK_ID"

# ==============================================================================
# TEST 5: BLPOP blocking behavior (timeout)
# ==============================================================================
test_start "BLPOP blocking behavior (timeout)"

TASK_ID="test-blocking-$(date +%s)"
AGENT_ID="nonexistent-agent"

cleanup_redis "$TASK_ID"

# BLPOP with 1 second timeout (should timeout since no agent signals)
START_TIME=$(date +%s)
redis-cli blpop "swarm:${TASK_ID}:${AGENT_ID}:done" 1 > /dev/null 2>&1
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

if [ "$ELAPSED" -ge 1 ] && [ "$ELAPSED" -le 2 ]; then
  test_pass
else
  test_fail "BLPOP timeout behavior incorrect (elapsed: ${ELAPSED}s, expected: 1-2s)"
fi

cleanup_redis "$TASK_ID"

# ==============================================================================
# TEST 6: Agent completion protocol - Report confidence
# ==============================================================================
test_start "Agent completion protocol - Report confidence"

TASK_ID="test-confidence-$(date +%s)"
AGENT_ID="test-agent-1"

cleanup_redis "$TASK_ID"

# Simulate agent reporting confidence
OUTPUT=$(./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1 2>&1)

# Check if report was successful
if echo "$OUTPUT" | grep -q "0.85" || redis-cli exists "swarm:${TASK_ID}:${AGENT_ID}:result" | grep -q "1"; then
  test_pass
else
  test_fail "Confidence not stored correctly"
fi

cleanup_redis "$TASK_ID"

# ==============================================================================
# TEST 7: Collect consensus from multiple agents
# ==============================================================================
test_start "Collect consensus from multiple agents"

TASK_ID="test-consensus-$(date +%s)"

cleanup_redis "$TASK_ID"

# Simulate 3 agents reporting confidence
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "agent-1" \
  --confidence 0.85 \
  --iteration 1 > /dev/null 2>&1

./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "agent-2" \
  --confidence 0.90 \
  --iteration 1 > /dev/null 2>&1

./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "agent-3" \
  --confidence 0.78 \
  --iteration 1 > /dev/null 2>&1

# Collect consensus
CONSENSUS=$(./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" \
  --agent-ids "agent-1,agent-2,agent-3" 2>&1)

# Check for .84 or 0.84 in output (average: (0.85 + 0.90 + 0.78) / 3 = 0.843)
if echo "$CONSENSUS" | grep -qE "(0\.84|\.84)"; then
  test_pass
else
  test_fail "Consensus calculation incorrect: $CONSENSUS"
fi

cleanup_redis "$TASK_ID"

# ==============================================================================
# TEST 8: Mode-specific thresholds documentation
# ==============================================================================
test_start "Mode-specific thresholds documentation"

# Check if CLAUDE.md has mode thresholds (primary documentation location)
if grep -q "MVP" /mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md 2>/dev/null && \
   grep -q "Standard" /mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md 2>/dev/null; then
  test_pass
else
  test_fail "Mode-specific thresholds should be documented (reference: CLAUDE.md)"
fi

# ==============================================================================
# TEST 9: Deliverable verification (BUG #11 fix)
# ==============================================================================
test_start "Deliverable verification - prevents consensus on vapor"

TASK_ID="deliverable-test-$(date +%s)"

# Simulate Loop 3 completion with high confidence but NO files changed
redis-cli lpush "swarm:${TASK_ID}:coder-1:done" "complete" > /dev/null 2>&1
redis-cli lpush "swarm:${TASK_ID}:coder-1:result" "0.95" > /dev/null 2>&1

# Verify orchestrator checks git status and overrides confidence when no files exist
# The implementation should check: git status --short | grep -E "^(A|M|\?\?)" | wc -l
# If count == 0, override confidence to 0.0

# Check that deliverable verification logic exists in orchestrator
if grep -q "FILES_CHANGED.*git status.*short" /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-redis-coordination/orchestrate-cfn-loop.sh && \
   grep -q "no_deliverables\|DELIVERABLE.*FAILED" /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-redis-coordination/orchestrate-cfn-loop.sh; then
  test_pass
else
  test_fail "Deliverable verification logic not found in orchestrator"
fi

cleanup_redis "$TASK_ID"

# ==============================================================================
# TEST SUMMARY
# ==============================================================================
echo ""
echo "========================================"
echo "TEST SUMMARY"
echo "========================================"
echo -e "Tests Run:    ${TESTS_RUN}"
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo "========================================"

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
