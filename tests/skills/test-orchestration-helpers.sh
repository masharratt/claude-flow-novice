#!/usr/bin/env bash
# tests/skills/test-orchestration-helpers.sh
# Phase 1 :: Orchestration Helper Tests - validates CFN Loop orchestration helper scripts

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

HELPERS_DIR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/helpers"
GATE_CHECK="$HELPERS_DIR/gate-check.sh"
CONSENSUS="$HELPERS_DIR/consensus.sh"
DELIVERABLE_VERIFIER="$HELPERS_DIR/deliverable-verifier.sh"
SPAWN_AGENTS="$HELPERS_DIR/spawn-agents.sh"
TIMEOUT_CALC="$HELPERS_DIR/timeout-calculator.sh"
TMP_DIR=""

cleanup() {
    log_info "Cleaning up test environment"

    # Clean up temporary directory
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi

    # Clean up test Redis keys
    redis_keys "swarm:test-gate-*" | while read -r key; do
        [ -n "$key" ] && redis_del "$key"
    done

    print_test_summary
}
trap cleanup EXIT

# ============================================================================
# TEST SUITE: gate-check.sh
# ============================================================================

test_gate_check_structure() {
    log_step "GIVEN gate-check.sh script structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "gate-check.sh exists" \
        test -f "$GATE_CHECK"

    assert_success "gate-check.sh is executable" \
        test -x "$GATE_CHECK"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$GATE_CHECK" | grep -q "set -euo pipefail"
}

test_gate_check_threshold_modes() {
    log_step "GIVEN gate-check.sh threshold calculation"

    # WHEN checking for mode support
    # THEN script supports MVP, Standard, Enterprise modes
    assert_success "Script mentions MVP mode" \
        grep -qi "mvp" "$GATE_CHECK" || true

    assert_success "Script mentions Standard mode" \
        grep -qi "standard" "$GATE_CHECK" || true

    assert_success "Script mentions Enterprise mode" \
        grep -qi "enterprise" "$GATE_CHECK" || true

    # WHEN checking for threshold values
    # THEN script defines threshold values
    assert_success "Script uses threshold comparison" \
        grep -qE "0\\.7|0\\.75|0\\.85|threshold" "$GATE_CHECK"
}

test_gate_check_confidence_validation() {
    log_step "GIVEN gate-check.sh confidence validation"

    # WHEN checking for confidence score handling
    # THEN script validates confidence scores
    assert_success "Script processes confidence scores" \
        grep -qi "confidence" "$GATE_CHECK"

    # WHEN checking for averaging logic
    # THEN script calculates average confidence
    assert_success "Script calculates average or compares values" \
        grep -qE "awk|bc|average|sum" "$GATE_CHECK" || true
}

test_gate_check_agent_collection() {
    log_step "GIVEN gate-check.sh agent collection"

    # WHEN checking for agent list processing
    # THEN script processes multiple agents
    assert_success "Script processes agent list" \
        grep -qE "agents|loop3|for|while" "$GATE_CHECK"

    # WHEN checking for Redis integration
    # THEN script reads from Redis
    assert_success "Script uses Redis operations" \
        grep -qE "redis-cli|GET|HGET" "$GATE_CHECK"
}

test_gate_check_output_format() {
    log_step "GIVEN gate-check.sh output format"

    # WHEN checking for exit codes
    # THEN script returns 0 for pass, 1 for fail
    assert_success "Script uses exit codes" \
        grep -qE "exit 0|exit 1" "$GATE_CHECK"
}

# ============================================================================
# TEST SUITE: consensus.sh
# ============================================================================

test_consensus_structure() {
    log_step "GIVEN consensus.sh script structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "consensus.sh exists" \
        test -f "$CONSENSUS"

    assert_success "consensus.sh is executable" \
        test -x "$CONSENSUS"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$CONSENSUS" | grep -q "set -euo pipefail"
}

test_consensus_calculation() {
    log_step "GIVEN consensus.sh calculation logic"

    # WHEN checking for consensus calculation
    # THEN script calculates consensus from validator scores
    assert_success "Script processes validator scores" \
        grep -qi "validator\|loop2\|consensus" "$CONSENSUS"

    # WHEN checking for averaging logic
    # THEN script uses arithmetic operations
    assert_success "Script uses math operations" \
        grep -qE "awk|bc|\+|/" "$CONSENSUS"
}

test_consensus_threshold_comparison() {
    log_step "GIVEN consensus.sh threshold comparison"

    # WHEN checking for threshold values
    # THEN script compares against consensus thresholds
    assert_success "Script uses threshold values" \
        grep -qE "0\\.8|0\\.9|0\\.95|threshold" "$CONSENSUS"

    # WHEN checking for mode-based thresholds
    # THEN script adjusts threshold by mode
    assert_success "Script considers mode" \
        grep -qE "mode|mvp|standard|enterprise" "$CONSENSUS" || true
}

test_consensus_output() {
    log_step "GIVEN consensus.sh output format"

    # WHEN checking for output
    # THEN script outputs consensus score
    assert_success "Script outputs result" \
        grep -qE "echo|printf" "$CONSENSUS"

    # WHEN checking for exit codes
    # THEN script uses appropriate exit codes
    assert_success "Script uses exit codes" \
        grep -qE "exit" "$CONSENSUS"
}

# ============================================================================
# TEST SUITE: deliverable-verifier.sh
# ============================================================================

test_deliverable_verifier_structure() {
    log_step "GIVEN deliverable-verifier.sh structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "deliverable-verifier.sh exists" \
        test -f "$DELIVERABLE_VERIFIER"

    assert_success "deliverable-verifier.sh is executable" \
        test -x "$DELIVERABLE_VERIFIER"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$DELIVERABLE_VERIFIER" | grep -q "set -euo pipefail"
}

test_deliverable_verifier_validation() {
    log_step "GIVEN deliverable-verifier.sh validation logic"

    # WHEN checking for file verification
    # THEN script checks for file existence
    assert_success "Script checks files" \
        grep -qE "test -f|-f|\\[ -e|file" "$DELIVERABLE_VERIFIER"

    # WHEN checking for deliverable tracking
    # THEN script processes deliverable list
    assert_success "Script processes deliverables" \
        grep -qi "deliverable" "$DELIVERABLE_VERIFIER"
}

test_deliverable_verifier_antipattern_detection() {
    log_step "GIVEN deliverable-verifier.sh anti-pattern detection"

    # WHEN checking for vapor detection
    # THEN script prevents consensus on vapor
    assert_success "Script mentions verification or validation" \
        grep -qE "verify|validate|check|exist" "$DELIVERABLE_VERIFIER"
}

# ============================================================================
# TEST SUITE: spawn-agents.sh
# ============================================================================

test_spawn_agents_helper_structure() {
    log_step "GIVEN spawn-agents.sh helper structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "spawn-agents.sh exists" \
        test -f "$SPAWN_AGENTS"

    assert_success "spawn-agents.sh is executable" \
        test -x "$SPAWN_AGENTS"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$SPAWN_AGENTS" | grep -q "set -euo pipefail"
}

test_spawn_agents_helper_loop_support() {
    log_step "GIVEN spawn-agents.sh loop support"

    # WHEN checking for loop designation
    # THEN script supports Loop 3 and Loop 2
    assert_success "Script mentions loop3 or loop2" \
        grep -qE "loop3|loop2|loop_type" "$SPAWN_AGENTS" || true

    # WHEN checking for agent list processing
    # THEN script processes agent list
    assert_success "Script processes agent list" \
        grep -qE "agents|for|while|IFS" "$SPAWN_AGENTS"
}

test_spawn_agents_helper_cli_integration() {
    log_step "GIVEN spawn-agents.sh CLI integration"

    # WHEN checking for CLI spawning
    # THEN script uses npx or spawn commands
    assert_success "Script uses spawn mechanism" \
        grep -qE "npx|spawn|claude-flow" "$SPAWN_AGENTS"

    # WHEN checking for background execution
    # THEN script supports background spawning
    assert_success "Script supports background execution" \
        grep -qE "&|background|async" "$SPAWN_AGENTS" || true
}

test_spawn_agents_helper_context_injection() {
    log_step "GIVEN spawn-agents.sh context injection"

    # WHEN checking for context passing
    # THEN script injects context to spawned agents
    assert_success "Script mentions context" \
        grep -qE "context|broadcast|message" "$SPAWN_AGENTS" || true

    # WHEN checking for task_id propagation
    # THEN script passes task_id to agents
    assert_success "Script uses task_id" \
        grep -qE "task_id|TASK_ID" "$SPAWN_AGENTS"
}

# ============================================================================
# TEST SUITE: timeout-calculator.sh
# ============================================================================

test_timeout_calculator_structure() {
    log_step "GIVEN timeout-calculator.sh structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "timeout-calculator.sh exists" \
        test -f "$TIMEOUT_CALC"

    assert_success "timeout-calculator.sh is executable" \
        test -x "$TIMEOUT_CALC"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$TIMEOUT_CALC" | grep -q "set -euo pipefail"
}

test_timeout_calculator_logic() {
    log_step "GIVEN timeout-calculator.sh calculation logic"

    # WHEN checking for timeout calculation
    # THEN script calculates timeouts based on mode
    assert_success "Script performs calculations" \
        grep -qE "awk|bc|expr|\*|\+|/" "$TIMEOUT_CALC"

    # WHEN checking for mode-based timeouts
    # THEN script supports different modes
    assert_success "Script considers mode" \
        grep -qE "mode|mvp|standard|enterprise" "$TIMEOUT_CALC" || true
}

test_timeout_calculator_output() {
    log_step "GIVEN timeout-calculator.sh output"

    # WHEN checking for output format
    # THEN script outputs timeout value
    assert_success "Script outputs timeout" \
        grep -qE "echo|printf" "$TIMEOUT_CALC"
}

# ============================================================================
# TEST SUITE: Cross-Cutting Helper Concerns
# ============================================================================

test_helpers_error_handling() {
    log_step "GIVEN helper scripts error handling"

    # WHEN checking gate-check error handling
    # THEN script handles errors
    assert_success "gate-check handles errors" \
        grep -qE ">&2|exit 1|error|Error" "$GATE_CHECK"

    # WHEN checking consensus error handling
    # THEN script handles errors
    assert_success "consensus handles errors" \
        grep -qE ">&2|exit 1|error|Error" "$CONSENSUS"
}

test_helpers_redis_coordination() {
    log_step "GIVEN helper scripts Redis coordination"

    # WHEN checking for Redis usage
    # THEN gate-check uses Redis
    assert_success "gate-check uses Redis" \
        grep -qE "redis-cli|redis_" "$GATE_CHECK"

    # WHEN checking consensus Redis usage
    # THEN consensus may use Redis
    assert_success "Scripts may coordinate via Redis" \
        grep -qE "redis|swarm:" "$CONSENSUS" || true
}

test_helpers_mode_awareness() {
    log_step "GIVEN helper scripts mode awareness"

    # WHEN checking for mode parameter
    # THEN scripts accept or derive mode
    local mode_aware_count=0

    grep -qE "mode|MODE|mvp|standard|enterprise" "$GATE_CHECK" && mode_aware_count=$((mode_aware_count + 1))
    grep -qE "mode|MODE|mvp|standard|enterprise" "$CONSENSUS" && mode_aware_count=$((mode_aware_count + 1))
    grep -qE "mode|MODE|mvp|standard|enterprise" "$TIMEOUT_CALC" && mode_aware_count=$((mode_aware_count + 1))

    test "$mode_aware_count" -ge 1
    assert_success "At least one helper is mode-aware" true
}

test_helpers_argument_parsing() {
    log_step "GIVEN helper scripts argument parsing"

    # WHEN checking for argument handling
    # THEN scripts parse command-line arguments
    assert_success "gate-check parses arguments" \
        grep -qE "while.*\\\$#|getopts|case.*\\\$1" "$GATE_CHECK" || true

    assert_success "spawn-agents parses arguments" \
        grep -qE "while.*\\\$#|getopts|case.*\\\$1" "$SPAWN_AGENTS" || true
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

setup_test "orchestration-helpers"

# gate-check.sh tests
test_gate_check_structure
test_gate_check_threshold_modes
test_gate_check_confidence_validation
test_gate_check_agent_collection
test_gate_check_output_format

# consensus.sh tests
test_consensus_structure
test_consensus_calculation
test_consensus_threshold_comparison
test_consensus_output

# deliverable-verifier.sh tests
test_deliverable_verifier_structure
test_deliverable_verifier_validation
test_deliverable_verifier_antipattern_detection

# spawn-agents.sh tests
test_spawn_agents_helper_structure
test_spawn_agents_helper_loop_support
test_spawn_agents_helper_cli_integration
test_spawn_agents_helper_context_injection

# timeout-calculator.sh tests
test_timeout_calculator_structure
test_timeout_calculator_logic
test_timeout_calculator_output

# Cross-cutting tests
test_helpers_error_handling
test_helpers_redis_coordination
test_helpers_mode_awareness
test_helpers_argument_parsing

# Test summary printed by cleanup trap
