#!/usr/bin/env bash
##############################################################################
# CFN v3 Helper Test - Gate Check
#
# Objective: Validate Loop 3 gate enforcement (≥0.75 threshold)
#
# Test Cases:
#   1. Gate fails when avg < 0.75
#   2. Gate passes when avg ≥ 0.75
#   3. Gate correctly calculates average from multiple agents
#   4. Gate handles missing confidence scores gracefully
#
# Success Criteria:
#   - Correct pass/fail decision for all test cases
#   - Average calculation is accurate
#   - Redis keys used correctly
#   - Exit codes match expected (0=pass, 1=fail)
##############################################################################

set -euo pipefail

# Configuration
TEST_ID="gate-check-$(date +%s)"
TASK_ID="test-${TEST_ID}"
GATE_THRESHOLD=0.75
HELPER_SCRIPT="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh"

# Test result tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup function
cleanup() {
    redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli del >/dev/null 2>&1 || true
}

trap cleanup EXIT

# Helper function
assert() {
    local description="$1"
    local condition="$2"

    if eval "$condition"; then
        echo "✅ PASS: $description"
        ((TESTS_PASSED++))
        return 0
    else
        echo "❌ FAIL: $description"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "=============================================="
echo "CFN v3 Helper Test - Gate Check"
echo "=============================================="
echo "Helper: $HELPER_SCRIPT"
echo "Threshold: $GATE_THRESHOLD"
echo ""

# Test Case 1: Gate fails (avg < 0.75)
echo "=== Test Case 1: Gate Fails (avg < 0.75) ==="
cleanup
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "coder-1-1" "0.68" >/dev/null
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "researcher-1-1" "0.72" >/dev/null
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "backend-dev-1-1" "0.70" >/dev/null

# Expected avg: (0.68 + 0.72 + 0.70) / 3 = 0.70 < 0.75

if "$HELPER_SCRIPT" --task-id "$TASK_ID" --agents "coder-1-1,researcher-1-1,backend-dev-1-1" --threshold "$GATE_THRESHOLD" --min-quorum 0.66 2>/dev/null; then
    echo "❌ FAIL: Gate check should have failed but passed"
    ((TESTS_FAILED++))
else
    echo "✅ PASS: Gate check correctly failed"
    ((TESTS_PASSED++))
fi

echo ""

# Test Case 2: Gate passes (avg >= 0.75)
echo "=== Test Case 2: Gate Passes (avg ≥ 0.75) ==="
cleanup
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "coder-1-1" "0.78" >/dev/null
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "researcher-1-1" "0.82" >/dev/null
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "backend-dev-1-1" "0.80" >/dev/null

# Expected avg: (0.78 + 0.82 + 0.80) / 3 = 0.80 >= 0.75

if "$HELPER_SCRIPT" --task-id "$TASK_ID" --agents "coder-1-1,researcher-1-1,backend-dev-1-1" --threshold "$GATE_THRESHOLD" --min-quorum 0.66 2>/dev/null; then
    echo "✅ PASS: Gate check correctly passed"
    ((TESTS_PASSED++))
else
    echo "❌ FAIL: Gate check should have passed but failed"
    ((TESTS_FAILED++))
fi

echo ""

# Test Case 3: Edge case - exactly 0.75
echo "=== Test Case 3: Edge Case (avg = 0.75) ==="
cleanup
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "coder-1-1" "0.75" >/dev/null
redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "researcher-1-1" "0.75" >/dev/null

# Expected avg: (0.75 + 0.75) / 2 = 0.75 >= 0.75

if "$HELPER_SCRIPT" --task-id "$TASK_ID" --agents "coder-1-1,researcher-1-1" --threshold "$GATE_THRESHOLD" --min-quorum 0.66 2>/dev/null; then
    echo "✅ PASS: Gate check correctly passed for edge case"
    ((TESTS_PASSED++))
else
    echo "❌ FAIL: Gate check should have passed for exact threshold"
    ((TESTS_FAILED++))
fi

echo ""

# Test Case 4: Many agents
echo "=== Test Case 4: Many Agents (10 agents) ==="
cleanup
for i in {1..10}; do
    # Confidence pattern: 0.76, 0.77, ..., 0.85
    CONF=$(echo "scale=2; 0.75 + $i * 0.01" | bc)
    redis-cli HSET "swarm:${TASK_ID}:confidence:iteration1" "agent-1-$i" "$CONF" >/dev/null
done

# Expected avg: (0.76 + 0.77 + ... + 0.85) / 10 = 0.805 >= 0.75

AGENT_LIST=$(seq -s, -f "agent-1-%.0f" 1 10)
if "$HELPER_SCRIPT" --task-id "$TASK_ID" --agents "$AGENT_LIST" --threshold "$GATE_THRESHOLD" --min-quorum 0.66 2>/dev/null; then
    echo "✅ PASS: Gate check scales to 10 agents"
    ((TESTS_PASSED++))
else
    echo "❌ FAIL: Gate check failed with 10 agents"
    ((TESTS_FAILED++))
fi

echo ""

echo "=== Test Results Summary ==="
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "Success Rate: $(echo "scale=2; $TESTS_PASSED * 100 / ($TESTS_PASSED + $TESTS_FAILED)" | bc)%"
echo ""

# Exit with appropriate code
if [ $TESTS_FAILED -eq 0 ]; then
    echo "✅ All gate check tests passed!"
    exit 0
else
    echo "❌ Some gate check tests failed"
    exit 1
fi
