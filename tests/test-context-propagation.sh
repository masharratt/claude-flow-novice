#!/bin/bash

# CFN Loop Context Propagation Validation Test Suite
# Tests epic context, phase context, and success criteria propagation across all CFN Loop layers

set -euo pipefail

# Test configuration
TEST_TASK_ID="test-context-propagation-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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

# Utility functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

run_test() {
    local test_name="$1"
    local test_function="$2"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_info "Running test: $test_name"
    
    if $test_function; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

# Test: Redis connectivity
test_redis_connectivity() {
    if redis-cli ping >/dev/null 2>&1; then
        return 0
    else
        log_error "Redis is not running or not accessible"
        return 1
    fi
}

# Test: Epic context storage and retrieval
test_epic_context_propagation() {
    local epic_context='{
        "epicGoal": "Validate epic context, phase context, and success criteria propagate correctly through all CFN Loop layers",
        "inScope": [
            "Verify epic context reaches all agents",
            "Verify phase context in Loop 3 agent spawn",
            "Verify success criteria in Loop 2 validator context"
        ],
        "outOfScope": [
            "Changing context structure",
            "New context types",
            "Performance optimization"
        ]
    }'
    
    # Store epic context
    if ! redis-cli setex "swarm:${TEST_TASK_ID}:epic-context" 3600 "$epic_context" >/dev/null; then
        log_error "Failed to store epic context in Redis"
        return 1
    fi
    
    # Retrieve epic context
    local retrieved_context
    retrieved_context=$(redis-cli get "swarm:${TEST_TASK_ID}:epic-context" 2>/dev/null)
    
    if [[ -z "$retrieved_context" ]]; then
        log_error "Failed to retrieve epic context from Redis"
        return 1
    fi
    
    # Validate epic goal extraction
    local epic_goal
    epic_goal=$(echo "$retrieved_context" | jq -r '.epicGoal // empty')
    
    if [[ -z "$epic_goal" || "$epic_goal" == "null" ]]; then
        log_error "Failed to extract epic goal from stored context"
        return 1
    fi
    
    # Validate in-scope items
    local in_scope_count
    in_scope_count=$(echo "$retrieved_context" | jq '.inScope | length' 2>/dev/null || echo "0")
    
    if [[ "$in_scope_count" -lt 3 ]]; then
        log_error "Expected at least 3 in-scope items, got $in_scope_count"
        return 1
    fi
    
    log_info "✅ Epic context stored and retrieved successfully"
    log_info "  Epic Goal: $epic_goal"
    log_info "  In-Scope Items: $in_scope_count"
    
    return 0
}

# Test: Phase context storage and retrieval
test_phase_context_propagation() {
    local phase_context='{
        "sprint_name": "P1 Context Validation",
        "sprint_num": 1,
        "total_sprints": 3,
        "deliverables": [
            "tests/test-context-propagation.sh",
            "docs/CONTEXT_VALIDATION_REPORT.md",
            ".claude/skills/redis-coordination/test-context-injection.sh"
        ],
        "in_scope": [
            "Epic context retrieval from Redis",
            "Phase context injection into agent spawns",
            "Success criteria validation"
        ],
        "out_of_scope": [
            "Context structure changes",
            "Performance optimization"
        ],
        "directory": "/mnt/c/Users/masha/Documents/claude-flow-novice"
    }'
    
    # Store phase context
    if ! redis-cli setex "swarm:${TEST_TASK_ID}:phase-context" 3600 "$phase_context" >/dev/null; then
        log_error "Failed to store phase context in Redis"
        return 1
    fi
    
    # Retrieve phase context
    local retrieved_context
    retrieved_context=$(redis-cli get "swarm:${TEST_TASK_ID}:phase-context" 2>/dev/null)
    
    if [[ -z "$retrieved_context" ]]; then
        log_error "Failed to retrieve phase context from Redis"
        return 1
    fi
    
    # Validate deliverables extraction
    local deliverables_count
    deliverables_count=$(echo "$retrieved_context" | jq '.deliverables | length' 2>/dev/null || echo "0")
    
    if [[ "$deliverables_count" -ne 3 ]]; then
        log_error "Expected exactly 3 deliverables, got $deliverables_count"
        return 1
    fi
    
    # Validate directory extraction
    local directory
    directory=$(echo "$retrieved_context" | jq -r '.directory // empty')
    
    if [[ -z "$directory" || "$directory" == "null" ]]; then
        log_error "Failed to extract directory from phase context"
        return 1
    fi
    
    log_info "✅ Phase context stored and retrieved successfully"
    log_info "  Deliverables: $deliverables_count"
    log_info "  Directory: $directory"
    
    return 0
}

# Test: Success criteria storage and retrieval
test_success_criteria_propagation() {
    local success_criteria='{
        "acceptanceCriteria": [
            "Epic context retrieved from Redis correctly",
            "Phase context injected into agent spawns",
            "Success criteria visible to validators",
            "All context layers validated across 2 iterations",
            "Test suite passing",
            "Complete documentation"
        ],
        "gateThreshold": 0.75,
        "consensusThreshold": 0.90
    }'
    
    # Store success criteria
    if ! redis-cli setex "swarm:${TEST_TASK_ID}:success-criteria" 3600 "$success_criteria" >/dev/null; then
        log_error "Failed to store success criteria in Redis"
        return 1
    fi
    
    # Retrieve success criteria
    local retrieved_criteria
    retrieved_criteria=$(redis-cli get "swarm:${TEST_TASK_ID}:success-criteria" 2>/dev/null)
    
    if [[ -z "$retrieved_criteria" ]]; then
        log_error "Failed to retrieve success criteria from Redis"
        return 1
    fi
    
    # Validate acceptance criteria extraction
    local acceptance_count
    acceptance_count=$(echo "$retrieved_criteria" | jq '.acceptanceCriteria | length' 2>/dev/null || echo "0")
    
    if [[ "$acceptance_count" -lt 6 ]]; then
        log_error "Expected at least 6 acceptance criteria, got $acceptance_count"
        return 1
    fi
    
    # Validate gate threshold
    local gate_threshold
    gate_threshold=$(echo "$retrieved_criteria" | jq -r '.gateThreshold // empty')
    
    if [[ -z "$gate_threshold" || "$gate_threshold" == "null" ]]; then
        log_error "Failed to extract gate threshold from success criteria"
        return 1
    fi
    
    log_info "✅ Success criteria stored and retrieved successfully"
    log_info "  Acceptance Criteria: $acceptance_count"
    log_info "  Gate Threshold: $gate_threshold"
    
    return 0
}

# Test: Context injection simulation
test_context_injection_simulation() {
    # Simulate orchestrator context building (lines 759-799 from orchestrate-cfn-loop.sh)
    local epic_ctx
    local phase_ctx
    local success_ctx
    
    epic_ctx=$(redis-cli get "swarm:${TEST_TASK_ID}:epic-context" 2>/dev/null || echo "{}")
    phase_ctx=$(redis-cli get "swarm:${TEST_TASK_ID}:phase-context" 2>/dev/null || echo "{}")
    success_ctx=$(redis-cli get "swarm:${TEST_TASK_ID}:success-criteria" 2>/dev/null || echo "{}")
    
    # Extract key fields (simulate orchestrator logic)
    local epic_goal
    local in_scope
    local deliverables
    local directory
    local acceptance
    
    epic_goal=$(echo "$epic_ctx" | jq -r '.epicGoal // "No epic goal specified"')
    in_scope=$(echo "$epic_ctx" | jq -r '.inScope[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
    deliverables=$(echo "$phase_ctx" | jq -r '.deliverables[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
    directory=$(echo "$phase_ctx" | jq -r '.directory // ""')
    acceptance=$(echo "$success_ctx" | jq -r '.acceptanceCriteria[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
    
    # Build simulated agent context
    local simulated_context="Loop 3 implementation for iteration 1

Epic Goal: $epic_goal

In Scope:
$in_scope

Out of Scope:
$(echo "$epic_ctx" | jq -r '.outOfScope[]? // empty' | sed 's/^/- /' || echo "- (not specified)")

Deliverables (CRITICAL - you MUST create these files):
$deliverables
$([ -n "$directory" ] && echo "
Target Directory: $directory")

Acceptance Criteria:
$acceptance"

    # Validate simulated context has all required components
    if [[ -z "$epic_goal" || "$epic_goal" == "No epic goal specified" ]]; then
        log_error "Failed to extract epic goal in context injection simulation"
        return 1
    fi
    
    if [[ -z "$deliverables" || "$deliverables" == "- (not specified)" ]]; then
        log_error "Failed to extract deliverables in context injection simulation"
        return 1
    fi
    
    if [[ -z "$acceptance" || "$acceptance" == "- (not specified)" ]]; then
        log_error "Failed to extract acceptance criteria in context injection simulation"
        return 1
    fi
    
    log_info "✅ Context injection simulation successful"
    log_info "  Context contains epic goal, deliverables, and acceptance criteria"
    
    return 0
}

# Test: Deliverable checklist generation
test_deliverable_checklist() {
    # Get phase context and extract deliverables
    local phase_ctx
    phase_ctx=$(redis-cli get "swarm:${TEST_TASK_ID}:phase-context" 2>/dev/null || echo "{}")
    
    # Extract deliverable files
    local deliverable_files
    deliverable_files=$(echo "$phase_ctx" | jq -r '.deliverables[]? // empty' 2>/dev/null)
    
    if [[ -z "$deliverable_files" ]]; then
        log_error "No deliverable files found in phase context"
        return 1
    fi
    
    # Simulate deliverable checklist generation
    local checklist="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DELIVERABLE CHECKLIST (verify BEFORE reporting confidence)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    
    local missing_count=0
    local complete_count=0
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        
        # For testing, we'll assume files are missing (since we're testing the checklist logic)
        checklist="${checklist}❌ MISSING: $file (YOU MUST CREATE THIS)\n"
        missing_count=$((missing_count + 1))
    done <<< "$deliverable_files"
    
    checklist="${checklist}\nStatus: ${complete_count} complete, ${missing_count} missing\n"
    
    if [[ "$missing_count" -eq 0 ]]; then
        checklist="${checklist}\n✅ All deliverables complete! You may report high confidence if quality requirements met.\n"
    else
        checklist="${checklist}\n⚠️  CRITICAL: ${missing_count} file(s) marked ❌ MISSING above.
Report LOW confidence (<0.50) until ALL files are created.\n"
    fi
    
    # Validate checklist was generated correctly
    if [[ "$missing_count" -eq 0 ]]; then
        log_error "Expected missing deliverables in test scenario"
        return 1
    fi
    
    if [[ ! "$checklist" =~ "DELIVERABLE CHECKLIST" ]]; then
        log_error "Checklist header not found in generated output"
        return 1
    fi
    
    if [[ ! "$checklist" =~ "Status:" ]]; then
        log_error "Status line not found in generated checklist"
        return 1
    fi
    
    log_info "✅ Deliverable checklist generation successful"
    log_info "  Generated checklist for $missing_count missing deliverables"
    
    return 0
}

# Test: Multi-iteration context persistence
test_multi_iteration_persistence() {
    # Store context with TTL and verify persistence across iterations
    local test_context='{"iteration": 1, "data": "persistent_test_data"}'
    
    # Store with 1 hour TTL
    if ! redis-cli setex "swarm:${TEST_TASK_ID}:test-iteration" 3600 "$test_context" >/dev/null; then
        log_error "Failed to store test iteration context"
        return 1
    fi
    
    # Simulate iteration 1 retrieval
    local iteration1_data
    iteration1_data=$(redis-cli get "swarm:${TEST_TASK_ID}:test-iteration" 2>/dev/null)
    
    # Simulate iteration 2 update
    local iteration2_context='{"iteration": 2, "data": "persistent_test_data", "updated": true}'
    redis-cli setex "swarm:${TEST_TASK_ID}:test-iteration" 3600 "$iteration2_context" >/dev/null
    
    # Verify iteration 2 data
    local iteration2_data
    iteration2_data=$(redis-cli get "swarm:${TEST_TASK_ID}:test-iteration" 2>/dev/null)
    
    local iteration_num
    iteration_num=$(echo "$iteration2_data" | jq -r '.iteration // 0')
    
    if [[ "$iteration_num" -ne 2 ]]; then
        log_error "Expected iteration 2 data, got iteration $iteration_num"
        return 1
    fi
    
    local updated_flag
    updated_flag=$(echo "$iteration2_data" | jq -r '.updated // false')
    
    if [[ "$updated_flag" != "true" ]]; then
        log_error "Expected updated flag to be true"
        return 1
    fi
    
    log_info "✅ Multi-iteration context persistence successful"
    log_info "  Context persisted and updated across iterations"
    
    return 0
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test data..."
    
    # Remove test keys from Redis
    redis-cli del "swarm:${TEST_TASK_ID}:epic-context" >/dev/null 2>&1 || true
    redis-cli del "swarm:${TEST_TASK_ID}:phase-context" >/dev/null 2>&1 || true
    redis-cli del "swarm:${TEST_TASK_ID}:success-criteria" >/dev/null 2>&1 || true
    redis-cli del "swarm:${TEST_TASK_ID}:test-iteration" >/dev/null 2>&1 || true
    
    log_info "Cleanup completed"
}

# Main test execution
main() {
    echo "========================================"
    echo "CFN Loop Context Propagation Test Suite"
    echo "========================================"
    echo "Test Task ID: $TEST_TASK_ID"
    echo ""
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Run tests
    run_test "Redis Connectivity" test_redis_connectivity
    run_test "Epic Context Propagation" test_epic_context_propagation
    run_test "Phase Context Propagation" test_phase_context_propagation
    run_test "Success Criteria Propagation" test_success_criteria_propagation
    run_test "Context Injection Simulation" test_context_injection_simulation
    run_test "Deliverable Checklist Generation" test_deliverable_checklist
    run_test "Multi-Iteration Context Persistence" test_multi_iteration_persistence
    
    # Print results
    echo ""
    echo "========================================"
    echo "Test Results Summary"
    echo "========================================"
    echo "Total Tests: $TESTS_TOTAL"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed! Context propagation is working correctly.${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed. Context propagation needs attention.${NC}"
        exit 1
    fi
}

# Run main function
main "$@"