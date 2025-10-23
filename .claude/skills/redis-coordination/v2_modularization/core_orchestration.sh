#!/usr/bin/env bash
# Core Orchestration Module for CFN Loop V2 Modularization

# Source required modules
source ./config_loader.sh
source ./context_manager.sh
source ./loop3_module.sh
source ./loop2_module.sh
source ./product_owner_module.sh
source ./metrics_logger.sh

# Main orchestration function
orchestrate_cfn_loop() {
    local task_id="$1"
    local mode="${2:-standard}"

    # Load configuration
    load_environment_config "$task_id"
    validate_configuration

    # Load epic context
    local context
    context=$(load_epic_context "$task_id")

    # Execute Loop 3
    local loop3_result
    loop3_result=$(execute_loop_3_agents "$context")

    if [[ $loop3_result -ne 0 ]]; then
        log_iteration_metrics "loop3_failed"
        return 3
    fi

    # Execute Loop 2 Validation
    local consensus_result
    consensus_result=$(execute_loop_2_validation "$loop3_result")

    if [[ $consensus_result -ne 0 ]]; then
        log_iteration_metrics "loop2_validation_failed"
        return 4
    fi

    # Product Owner Decision
    local final_decision
    final_decision=$(evaluate_deliverables "$consensus_result")

    case "$final_decision" in
        "proceed")
            log_iteration_metrics "successful_completion"
            export_iteration_report
            return 0
            ;;
        "iterate")
            log_iteration_metrics "iteration_required"
            return 2
            ;;
        "abort")
            log_iteration_metrics "aborted"
            return 1
            ;;
    esac
}

# Entry point
main() {
    local task_id="$1"
    local mode="${2:-standard}"

    orchestrate_cfn_loop "$task_id" "$mode"
    exit $?
}

# Only run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi