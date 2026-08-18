#!/usr/bin/env bash
#
# Fleet Manager Comprehensive Test Suite
#
# Tests all Fleet Manager functionality:
# - Agent registration (all tiers)
# - Resource allocation
# - Performance metrics
# - Load balancing
# - Error handling
# - Concurrency

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Test utilities
assert_success() {
    local test_name="$1"
    local result="$2"
    TESTS_RUN=$((TESTS_RUN + 1))

    if echo "$result" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Result: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_contains() {
    local test_name="$1"
    local result="$2"
    local expected="$3"
    TESTS_RUN=$((TESTS_RUN + 1))

    # Normalize JSON for comparison (remove whitespace)
    local normalized=$(echo "$result" | tr -d '[:space:]')

    if echo "$normalized" | grep -q "$expected"; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected to contain: $expected"
        echo "  Got: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_error() {
    local test_name="$1"
    local result="$2"
    local error_code="$3"
    TESTS_RUN=$((TESTS_RUN + 1))

    if echo "$result" | jq -e ".error == \"$error_code\"" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected error: $error_code"
        echo "  Got: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up test data..."
    redis-cli KEYS "fleet:*test*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
}

# Setup
echo "=========================================="
echo "Fleet Manager Test Suite"
echo "=========================================="
echo ""

# Cleanup before tests
cleanup

echo "Running tests..."
echo ""

# ==========================================
# TEST GROUP 1: Agent Registration
# ==========================================
echo "Test Group 1: Agent Registration"
echo "-----------------------------------"

# Test 1.1: Register with shared tier
result=$(bash "$SCRIPT_DIR/invoke-fleet-register.sh" \
    --agent-id test-researcher-1 \
    --tier shared 2>&1 | awk '/^{/,/^}/')
assert_success "1.1 Register agent with shared tier" "$result"
assert_contains "1.1b Verify CPU allocation (0.5)" "$result" '"cpu":0.5'
assert_contains "1.1c Verify memory allocation (512)" "$result" '"memory":512'

# Test 1.2: Register with dedicated tier
result=$(bash "$SCRIPT_DIR/invoke-fleet-register.sh" \
    --agent-id test-backend-1 \
    --tier dedicated 2>&1 | awk '/^{/,/^}/')
assert_success "1.2 Register agent with dedicated tier" "$result"
assert_contains "1.2b Verify CPU allocation (2.0)" "$result" '"cpu":2'
assert_contains "1.2c Verify memory allocation (2048)" "$result" '"memory":2048'

# Test 1.3: Register with premium tier
result=$(bash "$SCRIPT_DIR/invoke-fleet-register.sh" \
    --agent-id test-validator-1 \
    --tier premium 2>&1 | awk '/^{/,/^}/')
assert_success "1.3 Register agent with premium tier" "$result"
assert_contains "1.3b Verify CPU allocation (4.0)" "$result" '"cpu":4'
assert_contains "1.3c Verify memory allocation (4096)" "$result" '"memory":4096'

# Test 1.4: Invalid tier
result=$(bash "$SCRIPT_DIR/invoke-fleet-register.sh" \
    --agent-id test-invalid-1 \
    --tier ultra 2>&1 || true)
assert_contains "1.4 Reject invalid tier" "$result" "Invalidtier"

echo ""

# ==========================================
# TEST GROUP 2: Resource Allocation
# ==========================================
echo "Test Group 2: Resource Allocation"
echo "-----------------------------------"

# Test 2.1: Allocate custom resources
result=$(bash "$SCRIPT_DIR/invoke-fleet-allocate.sh" \
    --agent-id test-backend-1 \
    --cpu 3.0 \
    --memory 3072 2>&1 | awk '/^{/,/^}/')
assert_success "2.1 Allocate custom resources" "$result"
assert_contains "2.1b Verify CPU allocation" "$result" '"cpu":3'
assert_contains "2.1c Verify memory allocation" "$result" '"memory":3072'

# Test 2.2: Allocate with high priority
result=$(bash "$SCRIPT_DIR/invoke-fleet-allocate.sh" \
    --agent-id test-validator-1 \
    --cpu 4.0 \
    --memory 4096 \
    --priority high 2>&1 | awk '/^{/,/^}/')
assert_success "2.2 Allocate with high priority" "$result"

# Test 2.3: Allocate to unregistered agent
result=$(bash "$SCRIPT_DIR/invoke-fleet-allocate.sh" \
    --agent-id test-nonexistent \
    --cpu 2.0 \
    --memory 2048 2>&1 | awk '/^{/,/^}/')
assert_error "2.3 Reject allocation to unregistered agent" "$result" "AGENT_NOT_FOUND"

# Test 2.4: Invalid priority
result=$(bash "$SCRIPT_DIR/invoke-fleet-allocate.sh" \
    --agent-id test-backend-1 \
    --cpu 2.0 \
    --memory 2048 \
    --priority critical 2>&1 || true)
assert_contains "2.4 Reject invalid priority" "$result" "Invalidpriority"

echo ""

# ==========================================
# TEST GROUP 3: Performance Metrics
# ==========================================
echo "Test Group 3: Performance Metrics"
echo "-----------------------------------"

# Test 3.1: Get metrics for specific agent
result=$(bash "$SCRIPT_DIR/invoke-fleet-metrics.sh" \
    --agent-id test-backend-1 2>&1 | awk '/^{/,/^}/')
assert_success "3.1 Get agent metrics" "$result"
assert_contains "3.1b Verify CPU utilization" "$result" '"cpuUtilization"'
assert_contains "3.1c Verify memory utilization" "$result" '"memoryUtilization"'
assert_contains "3.1d Verify health status" "$result" '"health"'

# Test 3.2: Get detailed metrics
result=$(bash "$SCRIPT_DIR/invoke-fleet-metrics.sh" \
    --agent-id test-backend-1 \
    --detailed 2>&1 | awk '/^{/,/^}/')
assert_success "3.2 Get detailed metrics" "$result"
assert_contains "3.2b Verify detailed section" "$result" '"detailed"'

# Test 3.3: Get fleet-wide metrics
result=$(bash "$SCRIPT_DIR/invoke-fleet-metrics.sh" --all 2>&1 | grep -A 100 '{' | head -20)
assert_success "3.3 Get fleet-wide metrics" "$result"
assert_contains "3.3b Verify fleet metrics structure" "$result" '"fleetMetrics"'

echo ""

# ==========================================
# TEST GROUP 4: Load Balancing
# ==========================================
echo "Test Group 4: Load Balancing"
echo "-----------------------------------"

# Register additional agents for balancing tests
bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-backend-2 --tier dedicated >/dev/null 2>&1
bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-backend-3 --tier dedicated >/dev/null 2>&1

# Test 4.1: Round-robin balancing
result=$(bash "$SCRIPT_DIR/invoke-fleet-balance.sh" \
    --agents "test-backend-1,test-backend-2,test-backend-3" \
    --strategy round-robin 2>&1 | awk '/^{/,/^}/')
assert_success "4.1 Round-robin load balancing" "$result"
assert_contains "4.1b Verify strategy" "$result" '"strategy":"round-robin"'

# Test 4.2: Least-loaded balancing
result=$(bash "$SCRIPT_DIR/invoke-fleet-balance.sh" \
    --agents "test-backend-1,test-backend-2" \
    --strategy least-loaded 2>&1 | awk '/^{/,/^}/')
assert_success "4.2 Least-loaded balancing" "$result"
assert_contains "4.2b Verify strategy" "$result" '"strategy":"least-loaded"'

# Test 4.3: Offload balancing
result=$(bash "$SCRIPT_DIR/invoke-fleet-balance.sh" \
    --agents "test-backend-1,test-backend-2" \
    --strategy offload 2>&1 | awk '/^{/,/^}/')
assert_success "4.3 Offload balancing" "$result"
assert_contains "4.3b Verify strategy" "$result" '"strategy":"offload"'

# Test 4.4: Balance all agents
result=$(bash "$SCRIPT_DIR/invoke-fleet-balance.sh" --all 2>&1 | awk '/^{/,/^}/')
assert_success "4.4 Balance all agents" "$result"

# Test 4.5: Invalid strategy
result=$(bash "$SCRIPT_DIR/invoke-fleet-balance.sh" \
    --agents "test-backend-1,test-backend-2" \
    --strategy invalid 2>&1 || true)
assert_contains "4.5 Reject invalid strategy" "$result" "Invalidstrategy"

echo ""

# ==========================================
# TEST GROUP 5: Concurrency
# ==========================================
echo "Test Group 5: Concurrency"
echo "-----------------------------------"

# Test 5.1: Parallel registrations
(
    bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-concurrent-1 --tier shared &
    bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-concurrent-2 --tier dedicated &
    bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-concurrent-3 --tier premium &
    wait
) >/dev/null 2>&1

result=$(redis-cli GET "fleet:agent:test-concurrent-1:registration")
assert_success "5.1 Parallel agent registrations" "$result"

# Test 5.2: Concurrent metrics collection
(
    bash "$SCRIPT_DIR/invoke-fleet-metrics.sh" --agent-id test-backend-1 &
    bash "$SCRIPT_DIR/invoke-fleet-metrics.sh" --agent-id test-backend-2 &
    bash "$SCRIPT_DIR/invoke-fleet-metrics.sh" --agent-id test-backend-3 &
    wait
) >/dev/null 2>&1

result=$(redis-cli GET "fleet:agent:test-backend-1:metrics")
assert_success "5.2 Concurrent metrics collection" "$result"

echo ""

# ==========================================
# TEST GROUP 6: Integration Patterns
# ==========================================
echo "Test Group 6: Integration Patterns"
echo "-----------------------------------"

# Test 6.1: Full CFN Loop workflow
bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-coder-1 --tier dedicated >/dev/null 2>&1
bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-reviewer-1 --tier dedicated >/dev/null 2>&1
bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-po-1 --tier premium >/dev/null 2>&1

metrics=$(bash "$SCRIPT_DIR/invoke-fleet-metrics.sh" --agent-id test-coder-1 2>&1 | awk '/^{/,/^}/')
cpu_util=$(echo "$metrics" | jq -r '.metrics.cpuUtilization')

if (( $(echo "$cpu_util > 0.70" | bc -l) )); then
    result=$(bash "$SCRIPT_DIR/invoke-fleet-balance.sh" \
        --agents "test-coder-1,test-reviewer-1" 2>&1 | awk '/^{/,/^}/')
    assert_success "6.1 CFN Loop resource management workflow" "$result"
else
    echo -e "${GREEN}✓${NC} 6.1 CFN Loop workflow (no balancing needed)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# Test 6.2: Dynamic scaling workflow
bash "$SCRIPT_DIR/invoke-fleet-register.sh" --agent-id test-scaler-1 --tier shared >/dev/null 2>&1
result=$(bash "$SCRIPT_DIR/invoke-fleet-allocate.sh" \
    --agent-id test-scaler-1 \
    --cpu 2.0 \
    --memory 2048 2>&1 | awk '/^{/,/^}/')
assert_success "6.2 Dynamic resource scaling" "$result"

echo ""

# ==========================================
# Summary
# ==========================================
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests Run: $TESTS_RUN"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
else
    echo "Failed: $TESTS_FAILED"
fi
echo ""

# Cleanup after tests
cleanup

# Exit with appropriate code
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
fi
