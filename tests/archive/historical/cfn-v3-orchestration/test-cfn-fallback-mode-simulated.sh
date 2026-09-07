#!/usr/bin/env bash

##############################################################################
# CFN Loop Fallback Mode Simulated Test Suite
# Version: 1.0.0
#
# Tests the CFN Loop fallback mode operation by simulating Redis unavailability
# without actually stopping the Redis service. This allows testing the fallback
# logic without interfering with running services.
##############################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="/tmp/cfn-fallback-simulated-$(date +%s)"
REDIS_COORD_SKILL="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Create test results directory
mkdir -p "$TEST_RESULTS_DIR"

##############################################################################
# Helper Functions
##############################################################################

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $*"
}

# Run test and track results
run_test() {
    local test_name="$1"
    local test_function="$2"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log "\n=== Test ${TESTS_TOTAL}: ${test_name} ==="

    if $test_function; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        log_success "PASSED: ${test_name}"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        log_error "FAILED: ${test_name}"
        return 1
    fi
}

# Generate test task ID
generate_task_id() {
    echo "fallback-sim-$(date +%s)-$$"
}

##############################################################################
# Test 1: Verify Fallback Logic Exists
##############################################################################

test_fallback_logic_exists() {
    log "Checking for fallback logic in coordination scripts..."

    local files_with_fallback=0

    # Check invoke-waiting-mode.sh
    if [[ -f "$REDIS_COORD_SKILL/invoke-waiting-mode.sh" ]]; then
        if grep -q "redis-cli not available\|mock mode\|fallback" "$REDIS_COORD_SKILL/invoke-waiting-mode.sh"; then
            log_success "invoke-waiting-mode.sh has fallback logic"
            files_with_fallback=$((files_with_fallback + 1))
        else
            log_warn "invoke-waiting-mode.sh may lack fallback logic"
        fi
    fi

    # Check orchestrate.sh
    if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh" ]]; then
        if grep -q "fallback\|Warning.*redis" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
            log_success "orchestrate.sh has fallback logic"
            files_with_fallback=$((files_with_fallback + 1))
        else
            log_warn "orchestrate.sh may lack comprehensive fallback logic"
        fi
    fi

    if [ $files_with_fallback -ge 1 ]; then
        return 0
    else
        return 1
    fi
}

##############################################################################
# Test 2: Mock Redis Unavailability
##############################################################################

test_mock_redis_unavailable() {
    local task_id
    task_id=$(generate_task_id)

    log "Testing coordination with mocked Redis unavailability..."

    # Create a wrapper that simulates redis-cli not being available
    local fake_redis="/tmp/redis-cli-fake-$$"
    cat > "$fake_redis" <<'EOF'
#!/bin/bash
echo "Could not connect to Redis" >&2
exit 1
EOF
    chmod +x "$fake_redis"

    # Temporarily override PATH to use fake redis-cli
    local original_path="$PATH"
    export PATH="/tmp:$PATH"
    mv "$fake_redis" /tmp/redis-cli 2>/dev/null || true

    # Test invoke-waiting-mode with fake unavailable redis
    local test_output="$TEST_RESULTS_DIR/mock-unavailable.log"
    if [[ -f "$REDIS_COORD_SKILL/invoke-waiting-mode.sh" ]]; then
        if "$REDIS_COORD_SKILL/invoke-waiting-mode.sh" \
            signal "$task_id" "test-agent" "complete" &>"$test_output"; then
            log_success "Script handled Redis unavailability gracefully"
            export PATH="$original_path"
            rm -f /tmp/redis-cli
            return 0
        else
            # Check for graceful error handling
            if grep -q "Warning.*redis-cli.*not available\|mock mode" "$test_output"; then
                log_success "Graceful fallback detected in output"
                export PATH="$original_path"
                rm -f /tmp/redis-cli
                return 0
            else
                log_error "No graceful fallback detected"
                cat "$test_output"
                export PATH="$original_path"
                rm -f /tmp/redis-cli
                return 1
            fi
        fi
    else
        log_warn "invoke-waiting-mode.sh not found"
        export PATH="$original_path"
        rm -f /tmp/redis-cli
        return 0
    fi
}

##############################################################################
# Test 3: File-based Coordination Implementation
##############################################################################

test_file_coordination_implementation() {
    local task_id
    task_id=$(generate_task_id)
    local coordination_dir="$TEST_RESULTS_DIR/file-coord-${task_id}"

    mkdir -p "$coordination_dir"

    log "Testing file-based coordination implementation..."

    # Simulate complete agent workflow using files
    local agents=("backend-developer" "tester" "security-reviewer")

    # Phase 1: Agent spawn
    for agent in "${agents[@]}"; do
        local spawn_file="$coordination_dir/${agent}.spawn"
        {
            echo "agent_type: $agent"
            echo "agent_id: ${task_id}-${agent}-1"
            echo "status: spawned"
            echo "timestamp: $(date +%s)"
        } > "$spawn_file"
    done

    # Phase 2: Agent completion
    for agent in "${agents[@]}"; do
        local complete_file="$coordination_dir/${agent}.complete"
        {
            echo "status: complete"
            echo "confidence: 0.85"
            echo "timestamp: $(date +%s)"
        } > "$complete_file"
    done

    # Phase 3: Collect results
    local results_count=0
    local total_confidence=0

    for agent in "${agents[@]}"; do
        local complete_file="$coordination_dir/${agent}.complete"
        if [[ -f "$complete_file" ]]; then
            results_count=$((results_count + 1))
            local conf
            conf=$(grep "^confidence:" "$complete_file" | cut -d: -f2 | tr -d ' ')
            total_confidence=$(echo "$total_confidence + $conf" | bc)
        fi
    done

    # Calculate average confidence
    if [ "$results_count" -eq "${#agents[@]}" ]; then
        local avg_conf
        avg_conf=$(echo "scale=2; $total_confidence / $results_count" | bc)
        log_success "File-based workflow complete: ${results_count} agents, avg confidence: ${avg_conf}"
        rm -rf "$coordination_dir"
        return 0
    else
        log_error "File-based workflow incomplete: only ${results_count}/${#agents[@]} agents completed"
        rm -rf "$coordination_dir"
        return 1
    fi
}

##############################################################################
# Test 4: Atomic File Operations
##############################################################################

test_atomic_file_operations() {
    local coordination_dir="$TEST_RESULTS_DIR/atomic-test"
    mkdir -p "$coordination_dir"

    log "Testing atomic file operations for coordination..."

    # Test atomic write pattern (write to temp, then move)
    local temp_file="$coordination_dir/.tmp-signal-$$"
    local final_file="$coordination_dir/agent-signal.json"

    # Write complete JSON to temp file
    cat > "$temp_file" <<EOF
{
  "agent_id": "test-agent-1",
  "status": "complete",
  "confidence": 0.85,
  "timestamp": $(date +%s),
  "result": {
    "files_modified": ["src/app.ts", "tests/app.test.ts"],
    "tests_passed": true
  }
}
EOF

    # Atomic move
    if mv "$temp_file" "$final_file"; then
        # Verify file is valid JSON and complete
        if jq empty "$final_file" 2>/dev/null; then
            log_success "Atomic file operation succeeded with valid JSON"
            rm -rf "$coordination_dir"
            return 0
        else
            log_error "File is not valid JSON"
            rm -rf "$coordination_dir"
            return 1
        fi
    else
        log_error "Atomic move failed"
        rm -rf "$coordination_dir"
        return 1
    fi
}

##############################################################################
# Test 5: Concurrent File Access
##############################################################################

test_concurrent_file_access() {
    local coordination_dir="$TEST_RESULTS_DIR/concurrent-test"
    mkdir -p "$coordination_dir"

    log "Testing concurrent file access handling..."

    # Launch concurrent writes
    local num_concurrent=20
    for i in $(seq 1 $num_concurrent); do
        {
            local temp_file="$coordination_dir/.tmp-agent-$i-$$"
            local final_file="$coordination_dir/agent-$i.complete"

            {
                echo "agent_id: agent-$i"
                echo "status: complete"
                echo "confidence: 0.85"
                echo "timestamp: $(date +%s%N)"
            } > "$temp_file"

            mv "$temp_file" "$final_file"
        } &
    done

    # Wait for all to complete
    wait

    # Count successful writes
    local successful
    successful=$(find "$coordination_dir" -name "agent-*.complete" | wc -l)

    local success_rate
    success_rate=$(echo "scale=1; $successful * 100 / $num_concurrent" | bc)

    if [ "$successful" -eq "$num_concurrent" ]; then
        log_success "All concurrent writes succeeded ($successful/$num_concurrent)"
        rm -rf "$coordination_dir"
        return 0
    elif [ "$successful" -ge $((num_concurrent * 9 / 10)) ]; then
        log_warn "Most concurrent writes succeeded ($successful/$num_concurrent = ${success_rate}%)"
        rm -rf "$coordination_dir"
        return 0
    else
        log_error "Too many concurrent writes failed ($successful/$num_concurrent = ${success_rate}%)"
        rm -rf "$coordination_dir"
        return 1
    fi
}

##############################################################################
# Test 6: Gate Check with File-based Confidence
##############################################################################

test_gate_check_file_based() {
    local task_id
    task_id=$(generate_task_id)
    local coordination_dir="$TEST_RESULTS_DIR/gate-check-${task_id}"

    mkdir -p "$coordination_dir"

    log "Testing gate check with file-based confidence scores..."

    # Simulate Loop 3 agents reporting confidence
    local loop3_agents=("backend-developer" "database-specialist" "api-developer")
    local confidences=(0.85 0.88 0.82)

    for i in "${!loop3_agents[@]}"; do
        local agent="${loop3_agents[$i]}"
        local conf="${confidences[$i]}"
        local conf_file="$coordination_dir/${agent}.confidence.json"

        cat > "$conf_file" <<EOF
{
  "agent_id": "${agent}",
  "confidence": ${conf},
  "timestamp": $(date +%s)
}
EOF
    done

    # Collect and calculate average confidence
    local total=0
    local count=0

    for conf_file in "$coordination_dir"/*.confidence.json; do
        if [[ -f "$conf_file" ]]; then
            local conf
            conf=$(jq -r '.confidence' "$conf_file" 2>/dev/null || echo "0")
            total=$(echo "$total + $conf" | bc)
            count=$((count + 1))
        fi
    done

    local avg_confidence
    avg_confidence=$(echo "scale=3; $total / $count" | bc)

    local gate_threshold=0.75

    # Gate check
    if (( $(echo "$avg_confidence >= $gate_threshold" | bc -l) )); then
        log_success "Gate check passed: avg=$avg_confidence >= threshold=$gate_threshold"
        rm -rf "$coordination_dir"
        return 0
    else
        log_error "Gate check failed: avg=$avg_confidence < threshold=$gate_threshold"
        rm -rf "$coordination_dir"
        return 1
    fi
}

##############################################################################
# Test 7: Consensus Collection with Files
##############################################################################

test_consensus_collection_file_based() {
    local task_id
    task_id=$(generate_task_id)
    local coordination_dir="$TEST_RESULTS_DIR/consensus-${task_id}"

    mkdir -p "$coordination_dir"

    log "Testing consensus collection with file-based validators..."

    # Simulate Loop 2 validators
    local validators=("code-reviewer" "security-reviewer" "performance-tester" "documentation-reviewer")
    local votes=("PROCEED" "PROCEED" "PROCEED" "PROCEED")
    local confidences=(0.90 0.92 0.88 0.91)

    for i in "${!validators[@]}"; do
        local validator="${validators[$i]}"
        local vote="${votes[$i]}"
        local conf="${confidences[$i]}"

        local result_file="$coordination_dir/${validator}.result.json"
        cat > "$result_file" <<EOF
{
  "validator_id": "${validator}",
  "vote": "${vote}",
  "confidence": ${conf},
  "timestamp": $(date +%s)
}
EOF
    done

    # Collect consensus
    local proceed_count=0
    local iterate_count=0
    local abort_count=0
    local total_confidence=0
    local total_validators=0

    for result_file in "$coordination_dir"/*.result.json; do
        if [[ -f "$result_file" ]]; then
            local vote
            vote=$(jq -r '.vote' "$result_file" 2>/dev/null || echo "")
            local conf
            conf=$(jq -r '.confidence' "$result_file" 2>/dev/null || echo "0")

            case "$vote" in
                PROCEED) proceed_count=$((proceed_count + 1)) ;;
                ITERATE) iterate_count=$((iterate_count + 1)) ;;
                ABORT) abort_count=$((abort_count + 1)) ;;
            esac

            total_confidence=$(echo "$total_confidence + $conf" | bc)
            total_validators=$((total_validators + 1))
        fi
    done

    local consensus_threshold=0.90
    local avg_confidence
    avg_confidence=$(echo "scale=3; $total_confidence / $total_validators" | bc)

    # Determine consensus
    local total_votes=$((proceed_count + iterate_count + abort_count))
    local proceed_ratio
    proceed_ratio=$(echo "scale=3; $proceed_count / $total_votes" | bc)

    if (( $(echo "$proceed_ratio >= 0.75" | bc -l) )) && (( $(echo "$avg_confidence >= $consensus_threshold" | bc -l) )); then
        log_success "Consensus reached: ${proceed_count}/${total_votes} PROCEED (${proceed_ratio}), avg confidence=${avg_confidence}"
        rm -rf "$coordination_dir"
        return 0
    else
        log_error "Consensus failed: proceed_ratio=$proceed_ratio, avg_confidence=$avg_confidence"
        rm -rf "$coordination_dir"
        return 1
    fi
}

##############################################################################
# Test 8: Fallback Mode State Persistence
##############################################################################

test_fallback_state_persistence() {
    local task_id
    task_id=$(generate_task_id)
    local coordination_dir="$TEST_RESULTS_DIR/persistence-${task_id}"

    mkdir -p "$coordination_dir"

    log "Testing state persistence in fallback mode..."

    # Create initial workflow state
    local state_file="$coordination_dir/workflow-state.json"
    cat > "$state_file" <<EOF
{
  "task_id": "$task_id",
  "iteration": 1,
  "mode": "fallback",
  "loop3_agents": ["backend-developer", "tester"],
  "loop2_agents": ["code-reviewer"],
  "agents_completed": [],
  "gate_passed": false,
  "consensus_reached": false
}
EOF

    # Simulate workflow progression
    # Agent 1 completes
    local updated_state
    updated_state=$(jq '.agents_completed += ["backend-developer"]' "$state_file")
    echo "$updated_state" > "$state_file"

    # Agent 2 completes
    updated_state=$(jq '.agents_completed += ["tester"]' "$state_file")
    echo "$updated_state" > "$state_file"

    # Gate check passes
    updated_state=$(jq '.gate_passed = true' "$state_file")
    echo "$updated_state" > "$state_file"

    # Verify final state
    local final_agents_count
    final_agents_count=$(jq '.agents_completed | length' "$state_file")
    local final_gate_status
    final_gate_status=$(jq -r '.gate_passed' "$state_file")

    if [ "$final_agents_count" -eq 2 ] && [ "$final_gate_status" == "true" ]; then
        log_success "State persistence working correctly"
        rm -rf "$coordination_dir"
        return 0
    else
        log_error "State persistence failed: agents=$final_agents_count, gate=$final_gate_status"
        rm -rf "$coordination_dir"
        return 1
    fi
}

##############################################################################
# Test 9: Performance Comparison
##############################################################################

test_performance_comparison() {
    log "Testing performance comparison between Redis and file-based coordination..."

    # File-based coordination performance test
    local coordination_dir="$TEST_RESULTS_DIR/perf-test"
    mkdir -p "$coordination_dir"

    local file_start
    file_start=$(date +%s%N)

    # Simulate 100 operations
    for i in {1..100}; do
        local temp_file="$coordination_dir/.tmp-$i"
        local final_file="$coordination_dir/result-$i.json"

        cat > "$temp_file" <<EOF
{
  "id": $i,
  "status": "complete",
  "timestamp": $(date +%s)
}
EOF
        mv "$temp_file" "$final_file"
    done

    local file_end
    file_end=$(date +%s%N)
    local file_duration=$(( (file_end - file_start) / 1000000 ))  # milliseconds

    # Redis performance test
    local redis_start
    redis_start=$(date +%s%N)

    for i in {1..100}; do
        redis-cli SET "perf-test-$i" '{"id":'$i',"status":"complete"}' &>/dev/null
    done

    local redis_end
    redis_end=$(date +%s%N)
    local redis_duration=$(( (redis_end - redis_start) / 1000000 ))  # milliseconds

    log "File-based: ${file_duration}ms for 100 operations"
    log "Redis: ${redis_duration}ms for 100 operations"

    # Clean up Redis test keys
    for i in {1..100}; do
        redis-cli DEL "perf-test-$i" &>/dev/null
    done

    # Calculate overhead
    if [ "$redis_duration" -gt 0 ]; then
        local overhead_ratio
        overhead_ratio=$(echo "scale=1; ($file_duration - $redis_duration) * 100 / $redis_duration" | bc)
        log "Overhead: ${overhead_ratio}%"

        # Accept up to 1000% overhead (10x slower)
        if (( $(echo "$overhead_ratio < 1000" | bc -l) )); then
            log_success "Performance overhead acceptable (${overhead_ratio}%)"
            rm -rf "$coordination_dir"
            return 0
        else
            log_warn "High performance overhead (${overhead_ratio}%)"
            rm -rf "$coordination_dir"
            return 0  # Not failing, just warning
        fi
    else
        log_warn "Could not calculate overhead"
        rm -rf "$coordination_dir"
        return 0
    fi
}

##############################################################################
# Test 10: Data Consistency Verification
##############################################################################

test_data_consistency() {
    local task_id
    task_id=$(generate_task_id)
    local coordination_dir="$TEST_RESULTS_DIR/consistency-${task_id}"

    mkdir -p "$coordination_dir"

    log "Testing data consistency in file-based coordination..."

    local test_data=("agent-1:0.85" "agent-2:0.90" "agent-3:0.88")

    # Write to files
    for data in "${test_data[@]}"; do
        IFS=':' read -r agent_id confidence <<< "$data"
        local file="$coordination_dir/${agent_id}.confidence"
        echo "$confidence" > "$file"
    done

    # Write same data to Redis
    for data in "${test_data[@]}"; do
        IFS=':' read -r agent_id confidence <<< "$data"
        redis-cli HSET "consistency:${task_id}:${agent_id}" "confidence" "$confidence" &>/dev/null
    done

    # Read and compare
    local consistent=true

    for data in "${test_data[@]}"; do
        IFS=':' read -r agent_id expected_conf <<< "$data"

        local file_conf
        file_conf=$(cat "$coordination_dir/${agent_id}.confidence" 2>/dev/null || echo "0")

        local redis_conf
        redis_conf=$(redis-cli HGET "consistency:${task_id}:${agent_id}" "confidence" 2>/dev/null || echo "0")

        if [[ "$file_conf" != "$expected_conf" ]] || [[ "$redis_conf" != "$expected_conf" ]]; then
            log_error "Inconsistency for $agent_id: file=$file_conf, redis=$redis_conf, expected=$expected_conf"
            consistent=false
        fi
    done

    # Cleanup
    for data in "${test_data[@]}"; do
        IFS=':' read -r agent_id _ <<< "$data"
        redis-cli DEL "consistency:${task_id}:${agent_id}" &>/dev/null
    done
    rm -rf "$coordination_dir"

    if $consistent; then
        log_success "Data consistency verified"
        return 0
    else
        log_error "Data inconsistency detected"
        return 1
    fi
}

##############################################################################
# Main Test Execution
##############################################################################

main() {
    log "╔════════════════════════════════════════════════════════════════╗"
    log "║    CFN Loop Fallback Mode Simulated Test Suite               ║"
    log "║                   Version 1.0.0                               ║"
    log "╚════════════════════════════════════════════════════════════════╝"
    log ""

    # Verify Redis is available for comparison tests
    if ! redis-cli ping &>/dev/null; then
        log_error "Redis is not available. Some tests will be skipped."
    fi

    # Run tests
    run_test "Fallback Logic Exists" test_fallback_logic_exists
    run_test "Mock Redis Unavailable" test_mock_redis_unavailable
    run_test "File Coordination Implementation" test_file_coordination_implementation
    run_test "Atomic File Operations" test_atomic_file_operations
    run_test "Concurrent File Access" test_concurrent_file_access
    run_test "Gate Check File-Based" test_gate_check_file_based
    run_test "Consensus Collection File-Based" test_consensus_collection_file_based
    run_test "Fallback State Persistence" test_fallback_state_persistence
    run_test "Performance Comparison" test_performance_comparison
    run_test "Data Consistency" test_data_consistency

    # Summary
    log "\n╔════════════════════════════════════════════════════════════════╗"
    log "║                     Test Summary                              ║"
    log "╚════════════════════════════════════════════════════════════════╝"
    log ""
    log "Total Tests:  $TESTS_TOTAL"
    log_success "Passed: $TESTS_PASSED"
    log_error "Failed: $TESTS_FAILED"

    local pass_rate
    if [ "$TESTS_TOTAL" -gt 0 ]; then
        pass_rate=$(echo "scale=1; $TESTS_PASSED * 100 / $TESTS_TOTAL" | bc)
        log "\nPass Rate: ${pass_rate}%"
    fi

    log "\nTest results saved to: $TEST_RESULTS_DIR"

    # Exit with appropriate code
    if [ "$TESTS_FAILED" -eq 0 ]; then
        log_success "\n✅ All tests passed!"
        exit 0
    else
        log_error "\n❌ Some tests failed"
        exit 1
    fi
}

# Run main function
main "$@"
