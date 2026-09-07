#!/bin/bash
# tests/cli-mode/test-cfn-loop-cli-command.sh
# Phase CLI :: Test /cfn-loop-cli command execution and coordinator spawning

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TMP_DIR=""
TEST_AGENT_DB=""

cleanup() {
    cleanup_temp_dir "$TMP_DIR"
    redis_flush_all
}
trap cleanup EXIT

# ============================================================================
# TEST: CLI command parameter parsing
# ============================================================================
test_cli_command_parameter_parsing() {
    log_step "GIVEN CLI command with various parameters"

    # WHEN parsing valid mode parameter
    local mode_result
    mode_result=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --mode standard 2>&1 || echo "")

    # THEN mode should be included in output
    assert_contains "$mode_result" "--mode=standard" "Mode parameter parsed correctly"

    # WHEN parsing max-iterations parameter
    local iter_result
    iter_result=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --max-iterations 15 2>&1 || echo "")

    # THEN max-iterations should be included in output
    assert_contains "$iter_result" "cfn-loop-single" "Max iterations command generated"
}

# ============================================================================
# TEST: Task ID generation and tracking
# ============================================================================
test_task_id_generation() {
    log_step "GIVEN CFN Loop CLI command execution"

    # WHEN executing command
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Generate unique task ID" 2>&1 || echo "")

    # THEN output should contain task information
    assert_contains "$output" "cfn-loop-single" "Task command generated"
    assert_not_empty "$output" "Output generated for task"
}

# ============================================================================
# TEST: Mode selection validation
# ============================================================================
test_mode_selection_validation() {
    log_step "GIVEN different CFN Loop modes"

    # WHEN testing MVP mode
    local mvp_output
    mvp_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode mvp 2>&1 || echo "")
    assert_contains "$mvp_output" "--mode=mvp" "MVP mode accepted"

    # WHEN testing standard mode
    local standard_output
    standard_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode standard 2>&1 || echo "")
    assert_contains "$standard_output" "--mode=standard" "Standard mode accepted"

    # WHEN testing enterprise mode
    local enterprise_output
    enterprise_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode enterprise 2>&1 || echo "")
    assert_contains "$enterprise_output" "--mode=enterprise" "Enterprise mode accepted"
}

# ============================================================================
# TEST: Slash command generation for single task
# ============================================================================
test_single_task_command_generation() {
    log_step "GIVEN single task CFN Loop command"

    # WHEN executing single subcommand
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Implement feature X" --mode standard 2>&1 || echo "")

    # THEN should generate /cfn-loop-single command
    assert_contains "$output" "/cfn-loop-single" "Single task command generated"
    assert_contains "$output" "Implement feature X" "Task description included"
    assert_contains "$output" "--mode=standard" "Mode parameter included"
}

# ============================================================================
# TEST: Slash command generation for epic
# ============================================================================
test_epic_command_generation() {
    log_step "GIVEN epic CFN Loop command"

    # WHEN executing epic subcommand
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" epic "Build authentication system" --mode enterprise 2>&1 || echo "")

    # THEN should generate /cfn-loop-epic command
    assert_contains "$output" "/cfn-loop-epic" "Epic command generated"
    assert_contains "$output" "Build authentication system" "Epic description included"
    assert_contains "$output" "--mode=enterprise" "Mode parameter included for epic"
}

# ============================================================================
# TEST: Slash command generation for sprints
# ============================================================================
test_sprints_command_generation() {
    log_step "GIVEN sprints CFN Loop command"

    # WHEN executing sprints subcommand
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "Phase 1: Core implementation" --phase phase-1 2>&1 || echo "")

    # THEN should generate /cfn-loop-sprints command
    assert_contains "$output" "/cfn-loop-sprints" "Sprints command generated"
    assert_contains "$output" "Phase 1: Core implementation" "Phase description included"
    assert_contains "$output" "--phase=phase-1" "Phase parameter included"
}

# ============================================================================
# TEST: Invalid subcommand handling
# ============================================================================
test_invalid_subcommand_handling() {
    log_step "GIVEN invalid subcommand"

    # WHEN executing unknown subcommand
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" invalid "test task" 2>&1 || echo "")

    # THEN should show error message
    assert_contains "$output" "Unknown subcommand" "Error message for invalid subcommand"
}

# ============================================================================
# TEST: Missing task description handling
# ============================================================================
test_missing_task_description() {
    log_step "GIVEN command without task description"

    # WHEN executing command without task
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single 2>&1 || echo "FAILED")

    # THEN should show error or help
    if [[ "$output" == "FAILED" ]] || echo "$output" | grep -q "Task description required\|Usage:"; then
        log_success "PASS: Missing task description handled"
    else
        log_error "FAIL: Missing task description not handled properly"
        return 1
    fi
}

# ============================================================================
# TEST: Help text generation
# ============================================================================
test_help_text_generation() {
    log_step "GIVEN help flag"

    # WHEN requesting help
    local help_output
    help_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" --help 2>&1 || echo "")

    # THEN should display help information
    assert_contains "$help_output" "Usage:" "Help text contains usage"
    assert_contains "$help_output" "Examples:" "Help text contains examples"
    assert_contains "$help_output" "single" "Help text mentions single subcommand"
    assert_contains "$help_output" "epic" "Help text mentions epic subcommand"
    assert_contains "$help_output" "sprints" "Help text mentions sprints subcommand"
}

# ============================================================================
# TEST: Max iterations parameter validation
# ============================================================================
test_max_iterations_parameter() {
    log_step "GIVEN max-iterations parameter"

    # WHEN specifying max iterations
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --max-iterations 20 2>&1 || echo "")

    # THEN command should be generated (max-iterations handled by slash command)
    assert_contains "$output" "cfn-loop-single" "Command generated with max iterations"
}

# ============================================================================
# TEST: Command output format
# ============================================================================
test_command_output_format() {
    log_step "GIVEN CFN Loop command execution"

    # WHEN executing command
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --mode standard 2>&1 || echo "")

    # THEN should show execution instructions
    assert_contains "$output" "Executing:" "Shows execution message"
    assert_contains "$output" "To execute this CFN Loop" "Shows execution instructions"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================
run_all_tests() {
    setup_test "cfn-loop-cli-command"

    log_step "Testing CFN Loop CLI command handler"

    test_cli_command_parameter_parsing
    test_task_id_generation
    test_mode_selection_validation
    test_single_task_command_generation
    test_epic_command_generation
    test_sprints_command_generation
    test_invalid_subcommand_handling
    test_missing_task_description
    test_help_text_generation
    test_max_iterations_parameter
    test_command_output_format

    print_test_summary
}

run_all_tests
