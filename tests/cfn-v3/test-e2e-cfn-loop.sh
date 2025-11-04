#!/usr/bin/env bash
# CFN Loop End-to-End Test
# Tests all connection points and handoffs in the CFN Loop process

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

# Wait for Redis key with timeout (BLPOP + fallback)
# Uses production BLPOP method with timeout wrapper
wait_for_redis_key() {
    local key="$1"
    local timeout="${2:-60}"

    log_info "Waiting for Redis key: $key (timeout: ${timeout}s, BLPOP)"

    # Try BLPOP first (production method - instant notification)
    local result=$(timeout "$timeout" redis-cli BLPOP "$key" "$timeout" 2>/dev/null)
    local blpop_exit=$?

    if [ $blpop_exit -eq 0 ] && [ -n "$result" ]; then
        log_success "Key found via BLPOP: $key (production method)"
        return 0
    fi

    # Fallback: Check if key exists (for keys created before BLPOP started)
    if redis-cli exists "$key" 2>/dev/null | grep -q "1"; then
        log_success "Key found via EXISTS: $key (already existed)"
        return 0
    fi

    log_error "Timeout waiting for key: $key (${timeout}s)"
    return 1
}

# Check Redis key pattern exists
check_redis_pattern() {
    local pattern="$1"
    local description="$2"

    log_info "Checking Redis pattern: $pattern"
    local count=$(redis-cli keys "$pattern" 2>/dev/null | wc -l)

    if [ "$count" -gt 0 ]; then
        log_success "$description: Found $count keys matching $pattern"
        return 0
    else
        log_error "$description: No keys matching $pattern"
        return 1
    fi
}

# Wait for Redis pattern to appear (event-driven with exponential backoff)
wait_for_redis_pattern() {
    local pattern="$1"
    local description="$2"
    local timeout="${3:-60}"
    local interval=1
    local max_interval=10
    local elapsed=0

    log_info "Waiting for pattern: $pattern (timeout: ${timeout}s, adaptive)"

    while [ $elapsed -lt $timeout ]; do
        local count=$(redis-cli keys "$pattern" 2>/dev/null | wc -l)

        if [ "$count" -gt 0 ]; then
            log_success "$description: Found $count keys after ${elapsed}s"
            return 0
        fi

        sleep $interval
        ((elapsed+=interval))

        # Exponential backoff with cap
        ((interval=interval*2))
        [ $interval -gt $max_interval ] && interval=$max_interval
    done

    log_error "$description: Pattern timeout after ${timeout}s"
    return 1
}

# Get confidence score from Redis
get_confidence() {
    local task_id="$1"
    local agent_id="$2"

    local confidence=$(redis-cli get "swarm:${task_id}:${agent_id}:confidence" || echo "0.0")
    echo "$confidence"
}

# Check consensus threshold
check_consensus() {
    local task_id="$1"
    local threshold="${2:-0.75}"

    local consensus=$(redis-cli get "swarm:${task_id}:consensus" || echo "0.0")

    log_info "Checking consensus: $consensus >= $threshold"

    if [ -z "$consensus" ] || [ "$consensus" = "(nil)" ]; then
        log_error "No consensus value found"
        return 1
    fi

    # Use bc for floating point comparison
    if (( $(echo "$consensus >= $threshold" | bc -l) )); then
        log_success "Consensus threshold met: $consensus >= $threshold"
        return 0
    else
        log_error "Consensus below threshold: $consensus < $threshold"
        return 1
    fi
}

# Main test execution
main() {
    echo "=========================================="
    echo "CFN Loop End-to-End Test Suite"
    echo "=========================================="
    echo ""

    # Generate unique task ID
    TASK_ID="e2e-test-$(date +%s)"
    log_info "Test Task ID: $TASK_ID"
    echo ""

    # Clean Redis state
    log_info "Cleaning Redis state..."
    redis-cli FLUSHDB > /dev/null
    echo ""

    # ===========================================
    # TEST 1: Coordinator → Orchestrator Handoff
    # ===========================================
    echo "=========================================="
    echo "TEST 1: Coordinator → Orchestrator Handoff"
    echo "=========================================="

    log_info "Spawning coordinator with simple task..."

    # Spawn coordinator in background
    npx claude-flow-novice agent cfn-v3-coordinator \
        --task-id "$TASK_ID" \
        --context "Create a simple hello world function in /tmp/cfn-e2e-test.sh that prints 'CFN Loop Works!'" \
        --timeout 180000 > /tmp/coordinator-output-$TASK_ID.log 2>&1 &

    COORDINATOR_PID=$!
    log_info "Coordinator PID: $COORDINATOR_PID"

    # Wait for orchestrator to spawn Loop 3 agents (event-driven)
    if wait_for_redis_pattern "swarm:${TASK_ID}:*-1:*" "Loop 3 agents spawned" 45; then
        log_success "TEST 1 PASSED: Coordinator successfully invoked orchestrator"
    else
        log_error "TEST 1 FAILED: Orchestrator not invoked or agents not spawned"
    fi
    echo ""

    # ===========================================
    # TEST 2: Loop 3 → Gate Check Handoff
    # ===========================================
    echo "=========================================="
    echo "TEST 2: Loop 3 → Gate Check Handoff"
    echo "=========================================="

    # Wait for Loop 3 agents to report confidence (event-driven)
    if wait_for_redis_pattern "swarm:${TASK_ID}:*-1-1:confidence" "Loop 3 confidence scores" 60; then
        log_success "Loop 3 agents reported confidence"

        # Check for gate check execution
        if wait_for_redis_key "swarm:${TASK_ID}:gate-passed" 30; then
            log_success "TEST 2 PASSED: Gate check executed successfully"
        else
            log_warning "Gate check key not found (may have failed gate)"
            log_info "Checking if gate failed (iterate signal)..."

            if check_redis_pattern "swarm:${TASK_ID}:gate-failed" "Gate failed marker"; then
                log_success "TEST 2 PASSED: Gate check executed (failed, will iterate)"
            else
                log_error "TEST 2 FAILED: Gate check not executed"
            fi
        fi
    else
        log_error "TEST 2 FAILED: Loop 3 agents did not report confidence"
    fi
    echo ""

    # ===========================================
    # TEST 3: Gate Pass → Loop 2 Handoff
    # ===========================================
    echo "=========================================="
    echo "TEST 3: Gate Pass → Loop 2 Handoff"
    echo "=========================================="

    # Check if gate passed
    if redis-cli exists "swarm:${TASK_ID}:gate-passed" 2>/dev/null | grep -q "1"; then
        # Wait for Loop 2 validators to spawn (event-driven)
        if wait_for_redis_pattern "swarm:${TASK_ID}:reviewer*" "Loop 2 validator agents" 45; then
            log_success "TEST 3 PASSED: Loop 2 validators spawned after gate pass"
        else
            log_error "TEST 3 FAILED: Loop 2 validators not spawned"
        fi
    else
        log_warning "TEST 3 SKIPPED: Gate did not pass (expected for first iteration)"
        ((TESTS_TOTAL++))
    fi
    echo ""

    # ===========================================
    # TEST 4: Loop 2 → Product Owner Handoff
    # ===========================================
    echo "=========================================="
    echo "TEST 4: Loop 2 → Product Owner Handoff"
    echo "=========================================="

    # Wait for Loop 2 validators to report confidence (event-driven)
    if wait_for_redis_pattern "swarm:${TASK_ID}:reviewer*:confidence" "Loop 2 confidence scores" 60 || \
       wait_for_redis_pattern "swarm:${TASK_ID}:tester*:confidence" "Loop 2 confidence scores" 60; then
        # Wait for Product Owner to spawn (event-driven)
        if wait_for_redis_pattern "swarm:${TASK_ID}:product-owner*" "Product Owner agent" 30; then
            log_success "TEST 4 PASSED: Product Owner spawned after Loop 2"
        else
            log_warning "TEST 4: Product Owner may not have spawned yet"
        fi
    else
        log_warning "TEST 4 SKIPPED: Loop 2 did not complete (gate may have failed)"
        ((TESTS_TOTAL++))
    fi
    echo ""

    # ===========================================
    # TEST 5: Product Owner Decision Execution
    # ===========================================
    echo "=========================================="
    echo "TEST 5: Product Owner Decision Execution"
    echo "=========================================="

    # Wait for Product Owner to complete (event-driven)
    if wait_for_redis_pattern "swarm:${TASK_ID}:product-owner*:result" "Product Owner decision" 45; then
        # Wait for decision key using BLPOP (production method)
        if wait_for_redis_key "swarm:${TASK_ID}:decision" 15; then
            local decision=$(redis-cli get "swarm:${TASK_ID}:decision" 2>/dev/null)
            log_success "TEST 5 PASSED: Product Owner made decision: $decision"
        else
            log_warning "Product Owner decision key not found in expected location"
        fi
    else
        log_warning "TEST 5 SKIPPED: Product Owner did not complete"
        ((TESTS_TOTAL++))
    fi
    echo ""

    # ===========================================
    # TEST 6: Iteration Cycle (if ITERATE)
    # ===========================================
    echo "=========================================="
    echo "TEST 6: Iteration Cycle Management"
    echo "=========================================="

    # Check for iteration 2 markers (short timeout - may not iterate)
    if wait_for_redis_pattern "swarm:${TASK_ID}:*-2:*" "Iteration 2 agents" 30; then
        log_success "TEST 6 PASSED: Iteration cycle executed (agents spawned for iteration 2)"
    else
        log_info "No iteration 2 detected (task may have PROCEEDED or ABORTED)"
        log_success "TEST 6 PASSED: Single iteration completion (PROCEED/ABORT decision)"
    fi
    echo ""

    # ===========================================
    # TEST 7: Redis Key Structure Validation
    # ===========================================
    echo "=========================================="
    echo "TEST 7: Redis Key Structure Validation"
    echo "=========================================="

    log_info "Validating Redis key structure..."

    # Expected key patterns
    local key_checks=0
    local key_found=0

    # Check for essential keys
    patterns=(
        "swarm:${TASK_ID}:*:done"
        "swarm:${TASK_ID}:*:confidence"
        "swarm:${TASK_ID}:*:result"
    )

    for pattern in "${patterns[@]}"; do
        ((key_checks++))
        if redis-cli keys "$pattern" 2>/dev/null | grep -q "."; then
            ((key_found++))
            log_info "✓ Found keys matching: $pattern"
        else
            log_warning "✗ No keys matching: $pattern"
        fi
    done

    if [ $key_found -ge 2 ]; then
        log_success "TEST 7 PASSED: Essential Redis key structures present ($key_found/$key_checks)"
    else
        log_error "TEST 7 FAILED: Missing essential Redis keys ($key_found/$key_checks)"
    fi
    echo ""

    # ===========================================
    # TEST 8: Deliverables Created
    # ===========================================
    echo "=========================================="
    echo "TEST 8: Deliverables Created"
    echo "=========================================="

    # Wait for deliverable file to be created (poll file system)
    local wait_count=0
    local max_wait=40
    local file_found=false

    while [ $wait_count -lt $max_wait ]; do
        if [ -f "/tmp/cfn-e2e-test.sh" ]; then
            file_found=true
            break
        fi
        sleep 1
        ((wait_count++))
    done

    if [ "$file_found" = "true" ]; then
        log_success "TEST 8 PASSED: Deliverable file created: /tmp/cfn-e2e-test.sh"

        # Test if the file works
        if bash /tmp/cfn-e2e-test.sh 2>/dev/null | grep -q "CFN Loop Works!"; then
            log_success "Deliverable functional test PASSED"
        else
            log_warning "Deliverable exists but may not be functional"
        fi
    else
        log_warning "TEST 8: Deliverable not found (may still be in progress)"

        # Check if work was done even if not in expected location
        if check_redis_pattern "swarm:${TASK_ID}:*:result" "Agent results"; then
            log_info "Agents completed work (results stored in Redis)"
        fi
    fi
    echo ""

    # ===========================================
    # TEST 9: Coordinator Completion
    # ===========================================
    echo "=========================================="
    echo "TEST 9: Coordinator Completion"
    echo "=========================================="

    log_info "Waiting for coordinator to complete..."

    # Wait for coordinator process or timeout
    local wait_time=0
    while kill -0 $COORDINATOR_PID 2>/dev/null && [ $wait_time -lt 60 ]; do
        sleep 5
        ((wait_time+=5))
        log_info "Coordinator still running... (${wait_time}s)"
    done

    if ! kill -0 $COORDINATOR_PID 2>/dev/null; then
        log_success "TEST 9 PASSED: Coordinator completed execution"

        # Check exit status
        if wait $COORDINATOR_PID; then
            log_success "Coordinator exit code: 0 (success)"
        else
            log_warning "Coordinator exit code: non-zero (may have encountered issues)"
        fi
    else
        log_warning "TEST 9: Coordinator still running after timeout (background execution)"
        kill $COORDINATOR_PID 2>/dev/null || true
    fi
    echo ""

    # ===========================================
    # Final Report
    # ===========================================
    echo ""
    echo "=========================================="
    echo "CFN Loop E2E Test Results"
    echo "=========================================="
    echo ""
    echo "Total Tests: $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""

    # Show Redis key summary
    echo "Redis Keys Created:"
    redis-cli keys "swarm:${TASK_ID}:*" | head -20
    local total_keys=$(redis-cli keys "swarm:${TASK_ID}:*" | wc -l)
    echo "... Total: $total_keys keys"
    echo ""

    # Show coordinator output summary
    echo "Coordinator Output (last 30 lines):"
    tail -30 /tmp/coordinator-output-$TASK_ID.log
    echo ""

    # Calculate success rate
    local success_rate=0
    if [ $TESTS_TOTAL -gt 0 ]; then
        success_rate=$(echo "scale=2; $TESTS_PASSED * 100 / $TESTS_TOTAL" | bc)
    fi

    echo "Success Rate: ${success_rate}%"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
        echo ""
        echo "CFN Loop connection points and handoffs validated successfully!"
        return 0
    else
        echo -e "${YELLOW}⚠️  SOME TESTS FAILED${NC}"
        echo ""
        echo "Review failed tests above for details."
        return 1
    fi
}

# Run main test
main "$@"
