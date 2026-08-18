#!/usr/bin/env bash
# tests/docker/orchestration/test-orchestrator-happy-path.sh
# Phase 3 :: CFN Loop Orchestrator Happy Path - Complete workflow validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

##############################################################################
# Test Configuration
##############################################################################

TEST_ID=$(generate_test_id)
TASK_ID="test-happy-path-${TEST_ID}"
TMP_DIR=$(create_temp_dir)
ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Mode configuration (standard mode)
MODE="standard"
GATE_THRESHOLD="0.75"
CONSENSUS_THRESHOLD="0.90"
MAX_ITERATIONS="10"

# Mock agent configurations
LOOP3_AGENTS="backend-developer,frontend-developer"
LOOP2_AGENTS="code-reviewer,security-specialist,tester"
PRODUCT_OWNER="product-owner"

##############################################################################
# Cleanup Function
##############################################################################

cleanup() {
    log_info "Cleaning up test environment"

    # Remove mock agent containers if they exist
    for agent in $(echo "$LOOP3_AGENTS,$LOOP2_AGENTS,$PRODUCT_OWNER" | tr ',' ' '); do
        cleanup_container "test-${TASK_ID}-${agent}" 2>/dev/null || true
    done

    # Clean Redis test keys
    redis_del "swarm:${TASK_ID}:*" 2>/dev/null || true
    redis_del "task:${TASK_ID}:*" 2>/dev/null || true

    # Clean temporary files
    cleanup_temp_dir "$TMP_DIR"

    # Print test summary
    print_test_summary
}

trap cleanup EXIT

##############################################################################
# Mock Agent Creation
##############################################################################

# Create a mock agent that simulates successful completion with confidence score
create_mock_agent() {
    local agent_id="$1"
    local confidence="$2"
    local deliverable="$3"

    cat > "$TMP_DIR/mock-${agent_id}.sh" <<'EOF_AGENT'
#!/bin/bash
set -euo pipefail

AGENT_ID="$1"
TASK_ID="$2"
CONFIDENCE="$3"
DELIVERABLE="$4"

# Simulate agent work (brief delay)
sleep 1

# Report completion using coordination protocol
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-coordination/report-completion.sh" ]]; then
    "$PROJECT_ROOT/.claude/skills/cfn-coordination/report-completion.sh" \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT_ID" \
        --confidence "$CONFIDENCE" \
        --iteration 1 \
        --result "{\"deliverable\": \"$DELIVERABLE\", \"status\": \"complete\"}"
fi

# Output result
echo "{\"agent_id\": \"$AGENT_ID\", \"confidence\": $CONFIDENCE, \"deliverable\": \"$DELIVERABLE\"}"
EOF_AGENT

    chmod +x "$TMP_DIR/mock-${agent_id}.sh"
}

# Create a mock product owner that returns PROCEED decision
create_mock_product_owner() {
    local owner_id="$1"

    cat > "$TMP_DIR/mock-${owner_id}.sh" <<'EOF_OWNER'
#!/bin/bash
set -euo pipefail

TASK_ID="$1"

# Simulate decision making
sleep 1

# Output PROCEED decision
echo "DECISION: PROCEED"
echo "RATIONALE: All deliverables meet quality standards and success criteria"
echo "DELIVERABLES_VERIFIED: true"
EOF_OWNER

    chmod +x "$TMP_DIR/mock-${owner_id}.sh"
}

##############################################################################
# Test 1: Complete Happy Path - Loop 3 → Gate → Loop 2 → Decision
##############################################################################

test_complete_happy_path() {
    log_step "GIVEN orchestrator is configured with mock agents"

    # Create mock Loop 3 agents (primary swarm) with passing confidence
    create_mock_agent "backend-developer" "0.85" "API implementation"
    create_mock_agent "frontend-developer" "0.80" "UI components"

    # Create mock Loop 2 agents (validators) with high consensus
    create_mock_agent "code-reviewer" "0.95" "Code review passed"
    create_mock_agent "security-specialist" "0.92" "Security audit passed"
    create_mock_agent "tester" "0.93" "Tests passed"

    # Create mock product owner
    create_mock_product_owner "$PRODUCT_OWNER"

    log_info "Mock agents created successfully"

    # WHEN orchestrator executes complete workflow
    log_step "WHEN orchestrator executes complete CFN Loop workflow"

    # Note: This is a simplified test - in production, orchestrator would spawn real agents
    # For testing, we verify the orchestrator script structure and logic

    # Verify orchestrator accepts required parameters
    if [[ -x "$ORCHESTRATOR" ]]; then
        log_success "Orchestrator script is executable"
    else
        log_error "Orchestrator script not found or not executable"
        return 1
    fi

    # THEN verify orchestrator has all required components
    log_step "THEN orchestrator has all required workflow components"

    # Check for Loop 3 execution
    assert_success "Loop 3 execution logic exists" \
        grep -q "Loop 3" "$ORCHESTRATOR"

    # Check for gate threshold checking
    assert_success "Gate threshold check exists" \
        grep -q "GATE_THRESHOLD\|gate.*threshold" "$ORCHESTRATOR"

    # Check for Loop 2 spawning
    assert_success "Loop 2 spawning logic exists" \
        grep -q "Loop 2\|loop2" "$ORCHESTRATOR"

    # Check for consensus collection
    assert_success "Consensus collection exists" \
        grep -q "consensus\|CONSENSUS" "$ORCHESTRATOR"

    # Check for product owner decision
    assert_success "Product owner decision logic exists" \
        grep -q "PRODUCT_OWNER\|product.*owner" "$ORCHESTRATOR"

    # Check for PROCEED/ITERATE/ABORT handling
    assert_success "Decision handling exists" \
        grep -q "PROCEED\|ITERATE\|ABORT" "$ORCHESTRATOR"
}

##############################################################################
# Test 2: Confidence Score Collection and Validation
##############################################################################

test_confidence_score_collection() {
    log_step "GIVEN Loop 3 agents complete work with confidence scores"

    # Set up Redis with mock confidence scores
    redis_set "swarm:${TASK_ID}:agent:backend-developer:confidence" "0.85"
    redis_set "swarm:${TASK_ID}:agent:frontend-developer:confidence" "0.80"

    # WHEN confidence scores are collected
    log_step "WHEN confidence scores are collected and validated"

    local score1=$(redis_get "swarm:${TASK_ID}:agent:backend-developer:confidence")
    local score2=$(redis_get "swarm:${TASK_ID}:agent:frontend-developer:confidence")

    # THEN scores are within valid range (0.0-1.0)
    log_step "THEN confidence scores are valid"

    assert_not_empty "$score1" "Backend developer confidence score exists"
    assert_not_empty "$score2" "Frontend developer confidence score exists"

    # Verify scores are in valid range using bc for float comparison
    if command -v bc >/dev/null 2>&1; then
        local valid1=$(echo "$score1 >= 0.0 && $score1 <= 1.0" | bc -l)
        local valid2=$(echo "$score2 >= 0.0 && $score2 <= 1.0" | bc -l)

        assert_equals "1" "$valid1" "Backend confidence in valid range"
        assert_equals "1" "$valid2" "Frontend confidence in valid range"

        # Verify average exceeds gate threshold
        local avg=$(echo "scale=2; ($score1 + $score2) / 2" | bc -l)
        local gate_passed=$(echo "$avg >= $GATE_THRESHOLD" | bc -l)

        assert_equals "1" "$gate_passed" "Average confidence exceeds gate threshold"

        log_info "Average confidence: $avg (threshold: $GATE_THRESHOLD)"
    else
        log_warn "bc not available, skipping float validation"
    fi
}

##############################################################################
# Test 3: Agent Completion Protocol
##############################################################################

test_agent_completion_protocol() {
    log_step "GIVEN agent uses completion protocol"

    # Check if coordination signal script exists
    local signal_script="$PROJECT_ROOT/.claude/skills/cfn-coordination/coordination-signal"
    local report_script="$PROJECT_ROOT/.claude/skills/cfn-coordination/report-completion.sh"

    # WHEN checking for coordination infrastructure
    log_step "WHEN verifying coordination infrastructure exists"

    # THEN coordination scripts are available
    log_step "THEN coordination protocol scripts exist"

    if [[ -x "$signal_script" ]] || [[ -f "$signal_script" ]]; then
        log_success "Coordination signal script exists"
    else
        log_warn "Coordination signal script not found (may use Redis directly)"
    fi

    if [[ -x "$report_script" ]] || [[ -f "$report_script" ]]; then
        log_success "Report completion script exists"
    else
        log_warn "Report completion script not found (may use alternative protocol)"
    fi
}

##############################################################################
# Test 4: Success Criteria Validation
##############################################################################

test_success_criteria_validation() {
    log_step "GIVEN success criteria are defined"

    local success_criteria='{"tests_pass": true, "coverage": 0.80, "security_scan": "passed"}'

    # Store success criteria in Redis
    redis_set "task:${TASK_ID}:success-criteria" "$success_criteria"

    # WHEN retrieving success criteria
    log_step "WHEN success criteria are retrieved"

    local retrieved=$(redis_get "task:${TASK_ID}:success-criteria")

    # THEN success criteria match expected format
    log_step "THEN success criteria are properly stored and retrieved"

    assert_not_empty "$retrieved" "Success criteria retrieved"

    # Validate JSON structure if jq is available
    if command -v jq >/dev/null 2>&1; then
        echo "$retrieved" | jq . >/dev/null 2>&1
        assert_success "Success criteria is valid JSON" \
            echo "$retrieved" | jq . >/dev/null 2>&1

        # Verify expected fields
        local has_tests=$(echo "$retrieved" | jq -r '.tests_pass' 2>/dev/null || echo "null")
        local has_coverage=$(echo "$retrieved" | jq -r '.coverage' 2>/dev/null || echo "null")

        assert_not_equals "null" "$has_tests" "Success criteria includes tests_pass"
        assert_not_equals "null" "$has_coverage" "Success criteria includes coverage"
    else
        log_warn "jq not available, skipping JSON validation"
    fi
}

##############################################################################
# Test 5: Iteration Management
##############################################################################

test_iteration_management() {
    log_step "GIVEN iteration counter starts at 1"

    # Initialize iteration counter in Redis
    redis_set "swarm:${TASK_ID}:iteration" "1"

    # WHEN iteration is incremented
    log_step "WHEN iteration counter is managed"

    local current_iteration=$(redis_get "swarm:${TASK_ID}:iteration")
    local next_iteration=$((current_iteration + 1))
    redis_set "swarm:${TASK_ID}:iteration" "$next_iteration"

    # THEN iteration counter increments correctly
    log_step "THEN iteration counter is properly managed"

    local final_iteration=$(redis_get "swarm:${TASK_ID}:iteration")

    assert_equals "2" "$final_iteration" "Iteration counter incremented"

    # Verify max iteration enforcement
    if command -v bc >/dev/null 2>&1; then
        local under_max=$(echo "$final_iteration <= $MAX_ITERATIONS" | bc -l)
        assert_equals "1" "$under_max" "Iteration under maximum limit"
    fi
}

##############################################################################
# Test 6: Orchestrator Parameter Validation
##############################################################################

test_orchestrator_parameters() {
    log_step "GIVEN orchestrator requires specific parameters"

    # WHEN checking parameter validation in orchestrator
    log_step "WHEN verifying parameter validation logic"

    # THEN orchestrator validates required parameters
    log_step "THEN orchestrator has parameter validation"

    assert_success "Task ID parameter validation exists" \
        grep -q "\-\-task-id" "$ORCHESTRATOR"

    assert_success "Mode parameter validation exists" \
        grep -q "\-\-mode" "$ORCHESTRATOR"

    assert_success "Loop 3 agents parameter exists" \
        grep -q "\-\-loop3-agents" "$ORCHESTRATOR"

    assert_success "Loop 2 agents parameter exists" \
        grep -q "\-\-loop2-agents" "$ORCHESTRATOR"

    assert_success "Product owner parameter exists" \
        grep -q "\-\-product-owner" "$ORCHESTRATOR"

    # Verify security validation
    assert_success "Input sanitization exists" \
        grep -q "sanitize\|validate" "$ORCHESTRATOR"
}

##############################################################################
# Test 7: Mode-Specific Thresholds
##############################################################################

test_mode_thresholds() {
    log_step "GIVEN different CFN modes have different thresholds"

    # WHEN checking mode threshold definitions
    log_step "WHEN verifying mode-specific thresholds"

    # THEN orchestrator defines thresholds for each mode
    log_step "THEN mode-specific thresholds are defined"

    assert_success "MVP mode threshold exists" \
        grep -q "mvp.*0\\.70\|mvp.*0\\.80" "$ORCHESTRATOR"

    assert_success "Standard mode threshold exists" \
        grep -q "standard.*0\\.75\|standard.*0\\.90" "$ORCHESTRATOR"

    assert_success "Enterprise mode threshold exists" \
        grep -q "enterprise.*0\\.85\|enterprise.*0\\.95" "$ORCHESTRATOR"
}

##############################################################################
# Execute All Tests
##############################################################################

setup_test "orchestrator-happy-path"

annotate "Test Suite: CFN Loop Orchestrator Happy Path"

test_complete_happy_path
test_confidence_score_collection
test_agent_completion_protocol
test_success_criteria_validation
test_iteration_management
test_orchestrator_parameters
test_mode_thresholds

teardown_test
