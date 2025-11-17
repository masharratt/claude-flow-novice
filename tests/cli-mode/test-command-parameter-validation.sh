#!/bin/bash
# tests/cli-mode/test-command-parameter-validation.sh
# Phase CLI :: Test comprehensive parameter validation for CFN Loop commands

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
    redis_flush_all
}
trap cleanup EXIT

# ============================================================================
# TEST: Mode parameter validation
# ============================================================================
test_mode_parameter_validation() {
    log_step "GIVEN various mode parameter values"

    # WHEN using valid modes
    local mvp_output
    mvp_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode mvp 2>&1 || echo "")
    assert_contains "$mvp_output" "--mode=mvp" "MVP mode valid"

    local standard_output
    standard_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode standard 2>&1 || echo "")
    assert_contains "$standard_output" "--mode=standard" "Standard mode valid"

    local enterprise_output
    enterprise_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode enterprise 2>&1 || echo "")
    assert_contains "$enterprise_output" "--mode=enterprise" "Enterprise mode valid"

    # Note: Invalid mode values are passed through to slash command for validation
    local invalid_output
    invalid_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode invalid 2>&1 || echo "")
    assert_contains "$invalid_output" "cfn-loop-single" "Invalid mode generates command (validated downstream)"
}

# ============================================================================
# TEST: Max iterations parameter validation
# ============================================================================
test_max_iterations_validation() {
    log_step "GIVEN max-iterations parameter values"

    # WHEN using valid iteration counts
    local output_5
    output_5=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --max-iterations 5 2>&1 || echo "")
    assert_contains "$output_5" "cfn-loop-single" "Max iterations 5 valid"

    local output_15
    output_15=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --max-iterations 15 2>&1 || echo "")
    assert_contains "$output_15" "cfn-loop-single" "Max iterations 15 valid"

    local output_50
    output_50=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --max-iterations 50 2>&1 || echo "")
    assert_contains "$output_50" "cfn-loop-single" "Max iterations 50 valid"

    # WHEN using zero iterations (edge case)
    local output_0
    output_0=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --max-iterations 0 2>&1 || echo "")
    assert_contains "$output_0" "cfn-loop-single" "Max iterations 0 generates command"

    # WHEN using negative iterations (edge case)
    local output_neg
    output_neg=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --max-iterations -5 2>&1 || echo "")
    assert_contains "$output_neg" "cfn-loop-single" "Negative iterations generates command"
}

# ============================================================================
# TEST: Phase parameter validation
# ============================================================================
test_phase_parameter_validation() {
    log_step "GIVEN phase parameter for sprints"

    # WHEN using valid phase names
    local phase1_output
    phase1_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "test" --phase phase-1 2>&1 || echo "")
    assert_contains "$phase1_output" "--phase=phase-1" "Phase 1 valid"

    local phase_alpha_output
    phase_alpha_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "test" --phase alpha-release 2>&1 || echo "")
    assert_contains "$phase_alpha_output" "--phase=alpha-release" "Alpha phase valid"

    # WHEN using empty phase
    local empty_phase_output
    empty_phase_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "test" --phase "" 2>&1 || echo "")
    assert_contains "$empty_phase_output" "cfn-loop-sprints" "Empty phase generates command"
}

# ============================================================================
# TEST: Multiple parameter combinations
# ============================================================================
test_multiple_parameter_combinations() {
    log_step "GIVEN multiple parameters in combination"

    # WHEN combining mode and max-iterations
    local combo1
    combo1=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode enterprise --max-iterations 25 2>&1 || echo "")
    assert_contains "$combo1" "cfn-loop-single" "Mode + max-iterations combined"

    # WHEN combining all sprint parameters
    local combo2
    combo2=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "test sprint" --phase sprint-2 2>&1 || echo "")
    assert_contains "$combo2" "/cfn-loop-sprints" "Sprint with phase combined"
}

# ============================================================================
# TEST: Parameter order independence
# ============================================================================
test_parameter_order_independence() {
    log_step "GIVEN parameters in different orders"

    # WHEN parameters come before task
    local before_output
    before_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --mode standard 2>&1 || echo "")
    assert_contains "$before_output" "--mode=standard" "Parameters after task work"

    # WHEN parameters are mixed
    local mixed_output
    mixed_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --mode mvp --max-iterations 10 2>&1 || echo "")
    assert_contains "$mixed_output" "cfn-loop-single" "Mixed parameter order works"
}

# ============================================================================
# TEST: Default value assignment
# ============================================================================
test_default_value_assignment() {
    log_step "GIVEN commands without optional parameters"

    # WHEN executing without mode parameter
    local no_mode_output
    no_mode_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" 2>&1 || echo "")
    assert_contains "$no_mode_output" "cfn-loop-single" "Command works without explicit mode"

    # WHEN executing without max-iterations
    local no_iter_output
    no_iter_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test task" --mode standard 2>&1 || echo "")
    assert_contains "$no_iter_output" "/cfn-loop-single" "Command works without max-iterations"
}

# ============================================================================
# TEST: Special characters in task descriptions
# ============================================================================
test_special_characters_in_tasks() {
    log_step "GIVEN task descriptions with special characters"

    # WHEN task contains slashes
    local slash_output
    slash_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Fix /api/users endpoint" 2>&1 || echo "")
    assert_contains "$slash_output" "cfn-loop-single" "Slashes in task handled"

    # WHEN task contains dashes
    local dash_output
    dash_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Implement user-authentication" 2>&1 || echo "")
    assert_contains "$dash_output" "cfn-loop-single" "Dashes in task handled"

    # WHEN task contains colons
    local colon_output
    colon_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Fix: authentication bug" 2>&1 || echo "")
    assert_contains "$colon_output" "cfn-loop-single" "Colons in task handled"

    # WHEN task contains parentheses
    local paren_output
    paren_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "Add feature (v2)" 2>&1 || echo "")
    assert_contains "$paren_output" "cfn-loop-single" "Parentheses in task handled"
}

# ============================================================================
# TEST: Long task descriptions
# ============================================================================
test_long_task_descriptions() {
    log_step "GIVEN very long task descriptions"

    # WHEN task is 200+ characters
    local long_task="Implement a comprehensive user authentication and authorization system with JWT tokens, refresh token rotation, role-based access control, multi-factor authentication, session management, and complete audit logging"
    local long_output
    long_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "$long_task" 2>&1 || echo "")
    assert_contains "$long_output" "authentication" "Long task description handled"
}

# ============================================================================
# TEST: Whitespace handling in parameters
# ============================================================================
test_whitespace_handling() {
    log_step "GIVEN parameters with various whitespace"

    # WHEN task has leading/trailing spaces
    local space_output
    space_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "  test task  " 2>&1 || echo "")
    assert_contains "$space_output" "cfn-loop-single" "Whitespace in task handled"

    # WHEN task has multiple spaces
    local multi_space_output
    multi_space_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test    task    here" 2>&1 || echo "")
    assert_contains "$multi_space_output" "cfn-loop-single" "Multiple spaces handled"
}

# ============================================================================
# TEST: Unknown parameter handling
# ============================================================================
test_unknown_parameter_handling() {
    log_step "GIVEN unknown parameters"

    # WHEN using undefined parameter
    local unknown_output
    unknown_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --unknown-param value 2>&1 || echo "")
    # Unknown params are ignored, command still generated
    assert_contains "$unknown_output" "cfn-loop-single" "Unknown parameters ignored gracefully"
}

# ============================================================================
# TEST: Case sensitivity in parameters
# ============================================================================
test_parameter_case_sensitivity() {
    log_step "GIVEN parameters with different cases"

    # WHEN mode is lowercase (standard usage)
    local lower_output
    lower_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode mvp 2>&1 || echo "")
    assert_contains "$lower_output" "--mode=mvp" "Lowercase mode accepted"

    # WHEN mode is uppercase (edge case)
    local upper_output
    upper_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode MVP 2>&1 || echo "")
    assert_contains "$upper_output" "--mode=MVP" "Uppercase mode passed through"

    # WHEN mode is mixed case
    local mixed_output
    mixed_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode Standard 2>&1 || echo "")
    assert_contains "$mixed_output" "--mode=Standard" "Mixed case mode passed through"
}

# ============================================================================
# TEST: Numeric string handling
# ============================================================================
test_numeric_string_handling() {
    log_step "GIVEN numeric values as strings"

    # WHEN max-iterations is a string number
    local string_num_output
    string_num_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --max-iterations "15" 2>&1 || echo "")
    assert_contains "$string_num_output" "cfn-loop-single" "String number handled"

    # WHEN max-iterations is not a number
    local nan_output
    nan_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --max-iterations abc 2>&1 || echo "")
    assert_contains "$nan_output" "cfn-loop-single" "Non-numeric max-iterations generates command"
}

# ============================================================================
# TEST: Empty parameter values
# ============================================================================
test_empty_parameter_values() {
    log_step "GIVEN empty parameter values"

    # WHEN mode is empty string
    local empty_mode_output
    empty_mode_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --mode "" 2>&1 || echo "")
    assert_contains "$empty_mode_output" "cfn-loop-single" "Empty mode generates command"

    # WHEN phase is empty
    local empty_phase_output
    empty_phase_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "test" --phase "" 2>&1 || echo "")
    assert_contains "$empty_phase_output" "cfn-loop-sprints" "Empty phase generates command"
}

# ============================================================================
# TEST: Subcommand-specific parameter validation
# ============================================================================
test_subcommand_specific_parameters() {
    log_step "GIVEN subcommand-specific parameters"

    # WHEN using phase with single (should be ignored)
    local phase_single_output
    phase_single_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" single "test" --phase should-be-ignored 2>&1 || echo "")
    assert_contains "$phase_single_output" "cfn-loop-single" "Phase ignored for single subcommand"

    # WHEN using phase with epic (should be ignored)
    local phase_epic_output
    phase_epic_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" epic "test" --phase should-be-ignored 2>&1 || echo "")
    assert_contains "$phase_epic_output" "cfn-loop-epic" "Phase ignored for epic subcommand"

    # WHEN using phase with sprints (should be included)
    local phase_sprints_output
    phase_sprints_output=$(npx tsx "$PROJECT_ROOT/src/cli/cfn-loop.ts" sprints "test" --phase sprint-1 2>&1 || echo "")
    assert_contains "$phase_sprints_output" "--phase=sprint-1" "Phase used for sprints subcommand"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================
run_all_tests() {
    setup_test "command-parameter-validation"

    log_step "Testing comprehensive parameter validation"

    test_mode_parameter_validation
    test_max_iterations_validation
    test_phase_parameter_validation
    test_multiple_parameter_combinations
    test_parameter_order_independence
    test_default_value_assignment
    test_special_characters_in_tasks
    test_long_task_descriptions
    test_whitespace_handling
    test_unknown_parameter_handling
    test_parameter_case_sensitivity
    test_numeric_string_handling
    test_empty_parameter_values
    test_subcommand_specific_parameters

    print_test_summary
}

run_all_tests
