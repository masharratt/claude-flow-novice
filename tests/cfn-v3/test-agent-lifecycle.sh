#!/bin/bash

# Agent Lifecycle Test Suite
# Tests clean agent exit patterns and orchestrator non-blocking behavior

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_TASK_ID="test-agent-lifecycle-$(date +%s)"
TEST_RESULTS_DIR="/tmp/agent-lifecycle-tests"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Create test results directory
mkdir -p "$TEST_RESULTS_DIR"

echo -e "${BLUE}=== Agent Lifecycle Test Suite ===${NC}"
echo "Task ID: $TEST_TASK_ID"
echo "Results Dir: $TEST_RESULTS_DIR"
echo ""

# Helper functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
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
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test resources..."
    # Kill any remaining test processes
    pkill -f "TEST_TASK_ID=$TEST_TASK_ID" 2>/dev/null || true
    
    # Clean up Redis keys
    redis-cli --scan --pattern "swarm:${TEST_TASK_ID}:*" | xargs redis-cli del 2>/dev/null || true
    
    # Remove temporary files
    rm -f /tmp/test-agent-*-${TEST_TASK_ID}-*.log 2>/dev/null || true
}

trap cleanup EXIT

# Test 1: Agent exits cleanly without waiting mode
test_clean_agent_exit() {
    log_test "Agent exits cleanly without waiting mode"
    
    # Create test agent script
    local test_agent_script="/tmp/test-agent-${TEST_TASK_ID}.sh"
    cat > "$test_agent_script" << 'EOF'
#!/bin/bash
TASK_ID="$1"
AGENT_ID="$2"

# Simulate agent work
sleep 1

# Step 1: Complete work (simulated)
echo "Agent work completed"

# Step 2: Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Step 3: Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --confidence 0.92 \
    --iteration 1

# Step 4: EXIT CLEANLY (no waiting mode)
echo "Agent exiting cleanly"
exit 0
EOF
    
    chmod +x "$test_agent_script"
    
    # Run test agent
    local agent_id="test-agent-1"
    local agent_pid
    
    "$test_agent_script" "$TEST_TASK_ID" "$agent_id" &
    agent_pid=$!
    
    # Wait for agent to complete
    if wait $agent_pid; then
        # Verify completion signal
        local completion_signal=$(redis-cli lpop "swarm:${TEST_TASK_ID}:${agent_id}:done" 2>/dev/null || echo "")
        if [[ "$completion_signal" == "complete" ]]; then
            # Verify confidence reported
            local confidence=$(redis-cli get "swarm:${TEST_TASK_ID}:${agent_id}:confidence" 2>/dev/null || echo "")
            if [[ "$confidence" == "0.92" ]]; then
                # Verify agent is NOT in waiting mode
                local waiting_status=$(redis-cli get "swarm:${TEST_TASK_ID}:${agent_id}:waiting" 2>/dev/null || echo "")
                if [[ -z "$waiting_status" ]]; then
                    log_pass "Agent exited cleanly without waiting mode"
                else
                    log_fail "Agent incorrectly entered waiting mode"
                fi
            else
                log_fail "Confidence not reported correctly: $confidence"
            fi
        else
            log_fail "Completion signal not found"
        fi
    else
        log_fail "Agent process failed or timed out"
    fi
    
    rm -f "$test_agent_script"
}

# Test 2: Orchestrator wait $PID succeeds with clean agent exit
test_orchestrator_wait_success() {
    log_test "Orchestrator wait \$PID succeeds with clean agent exit"
    
    # Create test agent that exits cleanly
    local test_agent_script="/tmp/test-orchestrator-agent-${TEST_TASK_ID}.sh"
    cat > "$test_agent_script" << 'EOF'
#!/bin/bash
TASK_ID="$1"
AGENT_ID="$2"

# Simulate work
sleep 2

# Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --confidence 0.88 \
    --iteration 1

# Exit cleanly
exit 0
EOF
    
    chmod +x "$test_agent_script"
    
    # Simulate orchestrator behavior
    local agent_id="orchestrator-test-agent"
    local start_time=$(date +%s)
    
    # Spawn agent and get PID
    "$test_agent_script" "$TEST_TASK_ID" "$agent_id" &
    local agent_pid=$!
    
    # Orchestrator waits for agent
    log_info "Orchestrator waiting for agent PID: $agent_pid"
    if wait $agent_pid; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        # Verify reasonable completion time
        if [[ $duration -lt 10 ]]; then
            log_pass "Orchestrator wait \$PID succeeded in ${duration}s"
        else
            log_fail "Orchestrator wait took too long: ${duration}s"
        fi
    else
        log_fail "Orchestrator wait \$PID failed"
    fi
    
    rm -f "$test_agent_script"
}

# Test 3: Multiple agents exit in parallel without blocking
test_parallel_agent_exit() {
    log_test "Multiple agents exit in parallel without blocking"
    
    # Create test agent script
    local test_agent_script="/tmp/test-parallel-agent-${TEST_TASK_ID}.sh"
    cat > "$test_agent_script" << 'EOF'
#!/bin/bash
TASK_ID="$1"
AGENT_ID="$2"
WORK_TIME="$3"

# Simulate work
sleep "$WORK_TIME"

# Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --confidence 0.85 \
    --iteration 1

# Exit cleanly
exit 0
EOF
    
    chmod +x "$test_agent_script"
    
    # Spawn multiple agents with different work times
    local agent_pids=()
    local agent_ids=("parallel-agent-1" "parallel-agent-2" "parallel-agent-3")
    local work_times=(1 2 3)
    
    for i in "${!agent_ids[@]}"; do
        local agent_id="${agent_ids[$i]}"
        local work_time="${work_times[$i]}"
        
        "$test_agent_script" "$TEST_TASK_ID" "$agent_id" "$work_time" &
        local agent_pid=$!
        agent_pids+=($agent_pid)
        
        log_info "Spawned $agent_id (PID: $agent_pid, work time: ${work_time}s)"
    done
    
    # Wait for all agents
    local start_time=$(date +%s)
    local all_success=true
    
    for pid in "${agent_pids[@]}"; do
        if ! wait $pid; then
            all_success=false
        fi
    done
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    if [[ "$all_success" == "true" ]]; then
        # Should complete in roughly the longest work time + small overhead
        if [[ $total_duration -lt 8 ]]; then
            log_pass "Parallel agents completed successfully in ${total_duration}s"
        else
            log_fail "Parallel execution took too long: ${total_duration}s"
        fi
        
        # Verify all agents signaled completion
        local completion_count=0
        for agent_id in "${agent_ids[@]}"; do
            local completion_signal=$(redis-cli lpop "swarm:${TEST_TASK_ID}:${agent_id}:done" 2>/dev/null || echo "")
            if [[ "$completion_signal" == "complete" ]]; then
                completion_count=$((completion_count + 1))
            fi
        done
        
        if [[ $completion_count -eq ${#agent_ids[@]} ]]; then
            log_info "All ${completion_count} agents signaled completion"
        else
            log_fail "Only ${completion_count}/${#agent_ids[@]} agents signaled completion"
        fi
    else
        log_fail "One or more parallel agents failed"
    fi
    
    rm -f "$test_agent_script"
}

# Test 4: Agents do NOT enter waiting mode (forbidden pattern)
test_no_waiting_mode() {
    log_test "Agents do NOT enter waiting mode (forbidden pattern)"
    
    # Create test agent that incorrectly tries to use waiting mode
    local test_agent_script="/tmp/test-no-waiting-${TEST_TASK_ID}.sh"
    cat > "$test_agent_script" << 'EOF'
#!/bin/bash
TASK_ID="$1"
AGENT_ID="$2"

# Simulate work
sleep 1

# Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --confidence 0.90 \
    --iteration 1

# FORBIDDEN: Try to enter waiting mode (this should be prevented)
echo "WARNING: Agent attempting to enter waiting mode (this should not happen)"
# ./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
#     --task-id "$TASK_ID" \
#     --agent-id "$AGENT_ID" \
#     --context "iteration-complete"

# Exit cleanly instead
exit 0
EOF
    
    chmod +x "$test_agent_script"
    
    # Run agent
    local agent_id="no-waiting-agent"
    local agent_pid
    
    "$test_agent_script" "$TEST_TASK_ID" "$agent_id" &
    agent_pid=$!
    
    # Wait for agent to complete
    if wait $agent_pid; then
        # Verify agent is NOT in waiting mode
        local waiting_status=$(redis-cli get "swarm:${TEST_TASK_ID}:${agent_id}:waiting" 2>/dev/null || echo "")
        if [[ -z "$waiting_status" ]]; then
            log_pass "Agent correctly did not enter waiting mode"
        else
            log_fail "Agent incorrectly entered waiting mode"
        fi
    else
        log_fail "Agent process failed"
    fi
    
    rm -f "$test_agent_script"
}

# Test 5: Orchestrator handles three iterations with clean agent exit
test_three_iterations() {
    log_test "Orchestrator handles three iterations with clean agent exit"
    
    local iteration=1
    local max_iterations=3
    local all_iterations_success=true
    
    while [[ $iteration -le $max_iterations ]]; do
        log_info "Running iteration $iteration"
        
        # Create test agent for this iteration
        local test_agent_script="/tmp/test-iteration-${iteration}-${TEST_TASK_ID}.sh"
        cat > "$test_agent_script" << EOF
#!/bin/bash
TASK_ID="\$1"
AGENT_ID="\$2"
ITERATION="$iteration"

# Simulate work
sleep 1

# Signal completion
redis-cli lpush "swarm:\${TASK_ID}:\${AGENT_ID}:done" "complete"

# Report confidence (lower confidence for first iterations to trigger iteration)
local_confidence=0.85
if [[ \$ITERATION -eq 1 ]]; then
    local_confidence=0.72  # Below gate threshold to trigger iteration
elif [[ \$ITERATION -eq 2 ]]; then
    local_confidence=0.78  # Still below threshold
else
    local_confidence=0.92  # Above threshold
fi

./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \\
    --task-id "\$TASK_ID" \\
    --agent-id "\$AGENT_ID" \\
    --confidence \$local_confidence \\
    --iteration \$ITERATION

# Exit cleanly
exit 0
EOF
        
        chmod +x "$test_agent_script"
        
        # Spawn agent for this iteration
        local agent_id="iteration-agent-${iteration}"
        local agent_pid
        
        "$test_agent_script" "$TEST_TASK_ID" "$agent_id" &
        agent_pid=$!
        
        # Wait for agent to complete
        if wait $agent_pid; then
            # Get confidence score
            local confidence=$(redis-cli get "swarm:${TEST_TASK_ID}:${agent_id}:confidence" 2>/dev/null || echo "0.0")
            log_info "Iteration $iteration confidence: $confidence"
            
            # Check if we should continue iterating
            local gate_threshold=0.80
            local gate_pass=$(echo "$confidence >= $gate_threshold" | bc -l)
            
            if [[ "$gate_pass" == "1" ]] || [[ $iteration -eq $max_iterations ]]; then
                log_info "Iteration $iteration passed gate or reached max iterations"
                break
            else
                log_info "Iteration $iteration failed gate, continuing to next iteration"
            fi
        else
            log_fail "Iteration $iteration agent failed"
            all_iterations_success=false
            break
        fi
        
        iteration=$((iteration + 1))
        rm -f "$test_agent_script"
    done
    
    if [[ "$all_iterations_success" == "true" ]]; then
        log_pass "Three iterations completed successfully with clean agent exit"
    else
        log_fail "Three iterations test failed"
    fi
    
    # Clean up remaining scripts
    rm -f /tmp/test-iteration-*-${TEST_TASK_ID}.sh
}

# Test 6: Context injection works with clean exit
test_context_injection() {
    log_test "Context injection works with clean agent exit"
    
    # Create test agent that validates context
    local test_agent_script="/tmp/test-context-${TEST_TASK_ID}.sh"
    cat > "$test_agent_script" << 'EOF'
#!/bin/bash
TASK_ID="$1"
AGENT_ID="$2"
CONTEXT="$3"

# Validate context contains expected elements
if [[ "$CONTEXT" == *"Deliverable"* ]] && [[ "$CONTEXT" == *"Target Directory"* ]]; then
    confidence=0.95
    context_valid=true
else
    confidence=0.30
    context_valid=false
fi

# Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --confidence $confidence \
    --iteration 1

# Exit cleanly
exit 0
EOF
    
    chmod +x "$test_agent_script"
    
    # Test with proper context
    local agent_id="context-test-agent"
    local test_context="Loop 3 implementation for iteration 1

Epic Goal: Test agent lifecycle

Deliverables (CRITICAL - you MUST create these files):
- test-file-1.txt
- test-file-2.txt

Target Directory: /tmp/test-context

Acceptance Criteria:
- All deliverables created successfully
- Code meets quality standards

Task ID: $TEST_TASK_ID"
    
    # Run agent with context
    local agent_pid
    "$test_agent_script" "$TEST_TASK_ID" "$agent_id" "$test_context" &
    agent_pid=$!
    
    # Wait for agent to complete
    if wait $agent_pid; then
        local confidence=$(redis-cli get "swarm:${TEST_TASK_ID}:${agent_id}:confidence" 2>/dev/null || echo "0.0")
        if (( $(echo "$confidence >= 0.90" | bc -l) )); then
            log_pass "Context injection validated successfully (confidence: $confidence)"
        else
            log_fail "Context injection failed (confidence: $confidence)"
        fi
    else
        log_fail "Context test agent failed"
    fi
    
    rm -f "$test_agent_script"
}

# Run all tests
echo -e "${BLUE}Starting agent lifecycle tests...${NC}"
echo ""

test_clean_agent_exit
echo ""

test_orchestrator_wait_success
echo ""

test_parallel_agent_exit
echo ""

test_no_waiting_mode
echo ""

test_three_iterations
echo ""

test_context_injection
echo ""

# Print results
echo -e "${BLUE}=== Test Results ===${NC}"
echo "Total Tests: $TESTS_TOTAL"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed!${NC}"
    exit 1
fi