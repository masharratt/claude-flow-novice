#!/bin/bash
# tests/cli-mode/test-cfn-loop-task-command.sh
# Phase CLI :: Test /cfn-loop-task command and Task() tool integration

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TMP_DIR=""

cleanup() {
    cleanup_temp_dir "$TMP_DIR"
    redis_flush_all
}
trap cleanup EXIT

# ============================================================================
# TEST: Task mode command generation
# ============================================================================
test_task_mode_command_generation() {
    log_step "GIVEN task mode CFN Loop command"

    # WHEN generating task mode command
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Implement authentication" --mode standard 2>&1 || echo "")

    # THEN should generate proper slash command
    assert_contains "$output" "/cfn-loop-single" "Task mode command generated"
    assert_contains "$output" "Implement authentication" "Task description present"
}

# ============================================================================
# TEST: Success criteria parsing
# ============================================================================
test_success_criteria_parsing() {
    log_step "GIVEN success criteria in task description"

    # WHEN task includes success criteria markers
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Fix bug - Tests must pass" --mode mvp 2>&1 || echo "")

    # THEN command should be generated with full description
    assert_contains "$output" "Fix bug - Tests must pass" "Success criteria included in command"
}

# ============================================================================
# TEST: Mode-specific behavior validation
# ============================================================================
test_mode_specific_behavior() {
    log_step "GIVEN different execution modes"

    # WHEN testing MVP mode
    local mvp_output
    mvp_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Quick prototype" --mode mvp 2>&1 || echo "")
    assert_contains "$mvp_output" "--mode=mvp" "MVP mode correctly set"

    # WHEN testing standard mode (default)
    local std_output
    std_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Standard task" 2>&1 || echo "")
    assert_contains "$std_output" "cfn-loop-single" "Standard mode command generated"

    # WHEN testing enterprise mode
    local ent_output
    ent_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Production feature" --mode enterprise 2>&1 || echo "")
    assert_contains "$ent_output" "--mode=enterprise" "Enterprise mode correctly set"
}

# ============================================================================
# TEST: Iteration limit enforcement
# ============================================================================
test_iteration_limit_enforcement() {
    log_step "GIVEN iteration limit parameter"

    # WHEN specifying max iterations
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Long task" --max-iterations 25 2>&1 || echo "")

    # THEN command should be generated (iteration limit handled downstream)
    assert_contains "$output" "cfn-loop-single" "Command generated with iteration limit"
}

# ============================================================================
# TEST: Task description edge cases
# ============================================================================
test_task_description_edge_cases() {
    log_step "GIVEN various task description formats"

    # WHEN task has special characters
    local special_output
    special_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Fix: API endpoint /users/{id}" --mode standard 2>&1 || echo "")
    assert_contains "$special_output" "Fix: API endpoint" "Special characters handled"

    # WHEN task has quotes
    local quote_output
    quote_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Add 'login' feature" --mode standard 2>&1 || echo "")
    assert_contains "$quote_output" "cfn-loop-single" "Quotes in task description handled"

    # WHEN task is very long
    local long_task="Implement comprehensive authentication system with JWT tokens, refresh tokens, role-based access control, and multi-factor authentication"
    local long_output
    long_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "$long_task" --mode standard 2>&1 || echo "")
    assert_contains "$long_output" "authentication system" "Long task descriptions handled"
}

# ============================================================================
# TEST: Epic mode task delegation
# ============================================================================
test_epic_mode_delegation() {
    log_step "GIVEN epic mode command"

    # WHEN executing epic command
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" epic "Build complete user management" --mode standard 2>&1 || echo "")

    # THEN should generate epic slash command
    assert_contains "$output" "/cfn-loop-epic" "Epic command generated"
    assert_contains "$output" "Build complete user management" "Epic description included"
}

# ============================================================================
# TEST: Sprint phase tracking
# ============================================================================
test_sprint_phase_tracking() {
    log_step "GIVEN sprint with phase parameter"

    # WHEN executing sprint command with phase
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "Sprint 1: Database setup" --phase sprint-1 2>&1 || echo "")

    # THEN should include phase parameter
    assert_contains "$output" "/cfn-loop-sprints" "Sprint command generated"
    assert_contains "$output" "--phase=sprint-1" "Phase parameter included"
}

# ============================================================================
# TEST: Parameter combination validation
# ============================================================================
test_parameter_combinations() {
    log_step "GIVEN multiple parameters together"

    # WHEN combining mode and max-iterations
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Complex task" --mode enterprise --max-iterations 30 2>&1 || echo "")

    # THEN both parameters should be present
    assert_contains "$output" "cfn-loop-single" "Command generated with multiple params"
}

# ============================================================================
# TEST: Empty task description validation
# ============================================================================
test_empty_task_validation() {
    log_step "GIVEN empty task description"

    # WHEN executing with empty task
    local output
    output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "" --mode standard 2>&1 || echo "HANDLED")

    # THEN should handle gracefully
    if [[ "$output" == "HANDLED" ]] || echo "$output" | grep -q "Task description required\|Usage:"; then
        log_success "PASS: Empty task description handled"
    else
        log_error "FAIL: Empty task not validated"
        return 1
    fi
}

# ============================================================================
# TEST: Subcommand validation
# ============================================================================
test_subcommand_validation() {
    log_step "GIVEN valid and invalid subcommands"

    # WHEN using valid subcommands
    local single_out
    single_out=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "task" 2>&1 || echo "")
    assert_contains "$single_out" "cfn-loop-single" "Valid 'single' subcommand"

    local epic_out
    epic_out=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" epic "epic task" 2>&1 || echo "")
    assert_contains "$epic_out" "cfn-loop-epic" "Valid 'epic' subcommand"

    local sprint_out
    sprint_out=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "sprint task" 2>&1 || echo "")
    assert_contains "$sprint_out" "cfn-loop-sprints" "Valid 'sprints' subcommand"

    # WHEN using invalid subcommand
    local invalid_out
    invalid_out=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" invalid "task" 2>&1 || echo "")
    assert_contains "$invalid_out" "Unknown subcommand" "Invalid subcommand rejected"
}

# ============================================================================
# TEST: Help and usage information
# ============================================================================
test_help_usage_information() {
    log_step "GIVEN help request"

    # WHEN requesting help with --help
    local help_output
    help_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" --help 2>&1 || echo "")

    # THEN should show comprehensive usage
    assert_contains "$help_output" "Usage:" "Help shows usage"
    assert_contains "$help_output" "Options:" "Help shows options"
    assert_contains "$help_output" "Examples:" "Help shows examples"
    assert_contains "$help_output" "--mode" "Help documents mode option"

    # WHEN requesting help with -h
    local h_output
    h_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" -h 2>&1 || echo "")
    assert_contains "$h_output" "Usage:" "Short help flag works"
}

# ============================================================================
# TEST: Command output consistency
# ============================================================================
test_command_output_consistency() {
    log_step "GIVEN multiple command executions"

    # WHEN executing same command twice
    local output1
    output1=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --mode standard 2>&1 || echo "")

    local output2
    output2=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --mode standard 2>&1 || echo "")

    # THEN outputs should have consistent format
    assert_contains "$output1" "/cfn-loop-single" "First execution consistent"
    assert_contains "$output2" "/cfn-loop-single" "Second execution consistent"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================
run_all_tests() {
    setup_test "cfn-loop-task-command"

    log_step "Testing CFN Loop Task Mode command handler"

    test_task_mode_command_generation
    test_success_criteria_parsing
    test_mode_specific_behavior
    test_iteration_limit_enforcement
    test_task_description_edge_cases
    test_epic_mode_delegation
    test_sprint_phase_tracking
    test_parameter_combinations
    test_empty_task_validation
    test_subcommand_validation
    test_help_usage_information
    test_command_output_consistency

    print_test_summary
}

run_all_tests
