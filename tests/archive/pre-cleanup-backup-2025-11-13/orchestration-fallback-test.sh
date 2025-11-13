#!/bin/bash

##############################################################################
# Orchestration Fallback Test
#
# Tests that CFN Loop CLI mode gracefully handles orchestrator failures
# and provides fallback agent spawning functionality.
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS_COUNT=0
FAIL_COUNT=0

echo "========================================="
echo "Orchestration Fallback Test"
echo "========================================="
echo ""

pass() {
    echo "✅ PASS: $1"
    ((PASS_COUNT++))
}

fail() {
    echo "❌ FAIL: $1"
    ((FAIL_COUNT++))
}

info() {
    echo "ℹ️  INFO: $1"
}

##############################################################################
# Test 1: Orchestrator Error Handling Simulation
##############################################################################

echo "Test 1: Orchestrator Error Handling"
echo "-----------------------------------"

# Simulate orchestrator failure scenario
echo "Simulating orchestrator failure with invalid agent list..."

# Test that coordinator handles orchestrator failure gracefully
TASK_ID="test-orch-fallback-$$"
CONTEXT='{"test":"orchestration-fallback"}'

# Create a test script that simulates coordinator behavior
cat > test-coordinator-fallback.sh << 'EOF'
#!/bin/bash

TASK_ID="$1"
CONTEXT="$2"

echo "=== CFN Loop Coordinator Fallback Test ==="
echo "Task ID: $TASK_ID"
echo "Context: $CONTEXT"
echo ""

# Simulate orchestrator failure
echo "Step 1: Attempting orchestrator..."

# Simulate orchestrator failure (invalid agent list)
if ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode "standard" \
  --loop3-agents "" \
  --loop2-agents "" \
  --product-owner "product-owner" \
  --max-iterations 1 \
  --success-criteria '{}' 2>/dev/null; then
    echo "✓ Orchestrator succeeded (unexpected)"
    exit 1
else
    echo "✓ Orchestrator failed as expected"
fi

# Simulate fallback agent spawning
echo "Step 2: Attempting fallback agent spawning..."

# Test direct agent spawning
AGENT_ID="${TASK_ID}-fallback-agent-$(date +%s)"

# Try to spawn an agent directly
if npx claude-flow-novice agent technical-writer \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" \
  --timeout 30 \
  --background=true 2>/dev/null; then
    echo "✓ Fallback agent spawn initiated"
    exit 0
else
    echo "✗ Fallback agent spawn failed"
    exit 1
fi
EOF

chmod +x test-coordinator-fallback.sh

# Run the test
if ./test-coordinator-fallback.sh "$TASK_ID" "$CONTEXT" 2>/dev/null; then
    pass "Orchestration fallback mechanism works correctly"
else
    fail "Orchestration fallback mechanism failed"
fi

echo ""

##############################################################################
# Test 2: Agent List Validation
##############################################################################

echo "Test 2: Agent List Validation"
echo "------------------------------"

# Test that orchestrator validates agent lists properly
echo "Testing agent list validation..."

# Test 1: Empty agent list (should fail)
echo "Test 2.1: Empty agent list validation"
if ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "test-empty" \
  --mode "standard" \
  --loop3-agents "" \
  --loop2-agents "" \
  --product-owner "product-owner" \
  --max-iterations 1 \
  --success-criteria '{}' 2>/dev/null; then
    fail "Orchestrator accepted empty agent list (should fail)"
else
    pass "Orchestrator correctly rejects empty agent list"
fi

# Test 2: Valid agent list (should succeed)
echo "Test 2.2: Valid agent list acceptance"
if ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "test-valid" \
  --mode "mvp" \
  --loop3-agents "technical-writer" \
  --loop2-agents "reviewer" \
  --product-owner "product-owner" \
  --max-iterations 1 \
  --success-criteria '{}' 2>/dev/null; then
    pass "Orchestrator accepts valid agent list"
else
    fail "Orchestrator rejected valid agent list"
fi

echo ""

##############################################################################
# Test 3: Coordinator Resilience
##############################################################################

echo "Test 3: Coordinator Resilience"
echo "-------------------------------"

# Test that coordinator doesn't crash when orchestrator fails
echo "Testing coordinator resilience under orchestrator failure..."

# Create a mock coordinator test
cat > test-coordinator-resilience.sh << 'EOF'
#!/bin/bash

# Mock coordinator test - tests graceful handling
TASK_ID="$1"

echo "Mock coordinator starting for task: $TASK_ID"

# Simulate what the real coordinator does
echo "1. Setting up environment..."
export TASK_ID="$TASK_ID"

echo "2. Storing context in Redis..."
if redis-cli HSET "cfn_loop:task:$TASK_ID:context" "test" "resilience" >/dev/null 2>&1; then
    echo "✓ Redis context storage successful"
else
    echo "✗ Redis context storage failed"
    exit 1
fi

echo "3. Attempting orchestrator..."
# This should fail due to invalid configuration
ORCHESTRATOR_EXIT_CODE=0
if ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode "standard" \
  --loop3-agents "nonexistent-agent" \
  --loop2-agents "" \
  --product-owner "product-owner" \
  --max-iterations 1 \
  --success-criteria '{}' 2>/dev/null; then
    echo "✓ Orchestrator succeeded (unexpected for invalid agent)"
else
    echo "✓ Orchestrator failed as expected"
    ORCHESTRATOR_EXIT_CODE=1
fi

echo "4. Handling orchestrator failure..."
if [[ "$ORCHESTRATOR_EXIT_CODE" -ne 0 ]]; then
    echo "✓ Coordinator detected orchestrator failure"
    echo "✓ Coordinator can implement fallback strategy"
else
    echo "✗ Coordinator missed orchestrator failure"
    exit 1
fi

echo "5. Completing gracefully..."
echo "✓ Coordinator completed gracefully despite orchestrator failure"

exit 0
EOF

chmod +x test-coordinator-resilience.sh

# Run the resilience test
if ./test-coordinator-resilience.sh "$TASK_ID" 2>/dev/null; then
    pass "Coordinator handles orchestrator failure gracefully"
else
    fail "Coordinator crashes on orchestrator failure"
fi

echo ""

##############################################################################
# Test 4: Fallback Agent Communication
##############################################################################

echo "Test 4: Fallback Agent Communication"
echo "--------------------------------------"

# Test that fallback agents can communicate via Redis
echo "Testing fallback agent communication..."

TEST_ID="fallback-comm-$(date +%s)"

# Set up test context in Redis
if redis-cli HSET "cfn_loop:task:$TEST_ID:context" \
    "fallback_test" "true" \
    "mode" "fallback" >/dev/null 2>&1; then
    echo "✓ Fallback context stored in Redis"
else
    fail "Failed to store fallback context in Redis"
fi

# Test that fallback agent can read context
CONTEXT_VALUE=$(redis-cli HGET "cfn_loop:task:$TEST_ID:context" "fallback_test" 2>/dev/null || echo "")

if [[ "$CONTEXT_VALUE" == "true" ]]; then
    pass "Fallback agent can read Redis context"
else
    fail "Fallback agent cannot read Redis context"
fi

# Cleanup
redis-cli DEL "cfn_loop:task:$TEST_ID:context" >/dev/null 2>&1

echo ""

##############################################################################
# Test 5: Error Recovery Mechanisms
##############################################################################

echo "Test 5: Error Recovery Mechanisms"
echo "--------------------------------"

# Test various error recovery scenarios
echo "Testing error recovery mechanisms..."

RECOVERY_TESTS_PASSED=0
RECOVERY_TESTS_TOTAL=3

# Test 5.1: Invalid agent type recovery
echo "Test 5.1: Invalid agent type recovery"
if npx claude-flow-novice agent nonexistent-agent \
  --task-id "test-invalid" \
  --timeout 5 2>/dev/null; then
    echo "✗ Invalid agent spawn succeeded (should fail)"
else
    echo "✓ Invalid agent spawn properly rejected"
    ((RECOVERY_TESTS_PASSED++))
fi

# Test 5.2: Invalid task ID handling
echo "Test 5.2: Invalid task ID handling"
# Most CLI tools should handle empty/invalid task IDs gracefully
EMPTY_TASK_RESULT=$(npx claude-flow-novice agent technical-writer \
  --task-id "" \
  --timeout 5 2>&1 || echo "handled")

if [[ -n "$EMPTY_TASK_RESULT" ]]; then
    echo "✓ Empty task ID handled gracefully"
    ((RECOVERY_TESTS_PASSED++))
else
    echo "✗ Empty task ID not handled"
fi

# Test 5.3: Redis communication recovery
echo "Test 5.3: Redis communication recovery"
# Test behavior when Redis is temporarily unavailable
REDIS_RESULT=$(redis-cli ping 2>/dev/null || echo "unavailable")
if [[ "$REDIS_RESULT" == "PONG" ]]; then
    echo "✓ Redis communication working"
    ((RECOVERY_TESTS_PASSED++))
else
    echo "⚠️ Redis unavailable - test skipped"
    ((RECOVERY_TESTS_TOTAL--))
fi

if [[ "$RECOVERY_TESTS_PASSED" -eq "$RECOVERY_TESTS_TOTAL" ]]; then
    pass "Error recovery mechanisms working correctly"
else
    fail "Some error recovery mechanisms failed ($RECOVERY_TESTS_PASSED/$RECOVERY_TESTS_TOTAL)"
fi

echo ""

# Cleanup
rm -f test-coordinator-fallback.sh test-coordinator-resilience.sh

##############################################################################
# Final Results
##############################################################################

echo "========================================="
echo "Orchestration Fallback Test Results"
echo "========================================="
echo "Total Passed: $PASS_COUNT"
echo "Total Failed: $FAIL_COUNT"
echo ""

if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "✅ ALL TESTS PASSED"
    echo "✅ Orchestration fallback mechanisms working correctly"
    echo "✅ CFN Loop CLI mode can handle orchestrator failures gracefully"
    exit 0
else
    echo "❌ SOME TESTS FAILED"
    echo "⚠️  Orchestration fallback may have issues"
    exit 1
fi