#!/bin/bash
# tests/skills/test-agent-spawning.sh
# Phase 1 :: Agent Spawning Tests - validates spawn-agent.sh functionality

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SPAWN_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"
TMP_DIR=""

cleanup() {
    log_info "Cleaning up test environment"

    # Clean up temporary directory
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi

    # Clean up any test Redis keys
    redis_keys "swarm:test-*" | while read -r key; do
        [ -n "$key" ] && redis_del "$key"
    done

    print_test_summary
}
trap cleanup EXIT

# ============================================================================
# TEST SUITE: Agent Spawning Functionality
# ============================================================================

test_dependency_checker() {
    log_step "GIVEN spawn-agent.sh with dependency checker"

    # WHEN checking for bash version requirement
    assert_success "Script contains bash version check" \
        grep -q "BASH_VERSINFO" "$SPAWN_SCRIPT"

    # WHEN checking for required tools
    assert_success "Script checks for npx" \
        grep -q "npx" "$SPAWN_SCRIPT"

    assert_success "Script checks for node" \
        grep -q "node" "$SPAWN_SCRIPT"

    # THEN dependency function exists
    assert_success "check_dependencies function exists" \
        grep -q "check_dependencies()" "$SPAWN_SCRIPT"
}

test_environment_sanitization() {
    log_step "GIVEN spawn-agent.sh with ANTI-023 protection"

    # WHEN checking for environment sanitization
    # THEN script sources sanitization module
    assert_success "Script sources sanitization module" \
        grep -q "sanitize-environment.sh" "$SPAWN_SCRIPT"

    # WHEN checking for Task Mode blocking
    # THEN script blocks Task Mode agents from using CLI
    assert_success "Script blocks Task Mode agents" \
        grep -q "TASK MODE DETECTED" "$SPAWN_SCRIPT"

    assert_success "Script requires TASK_ID" \
        grep -q "TASK_ID:-" "$SPAWN_SCRIPT"
}

test_logging_functions() {
    log_step "GIVEN spawn-agent.sh with logging capabilities"

    # WHEN checking for logging functions
    # THEN all required logging functions exist
    assert_success "log_error function exists" \
        grep -q "log_error()" "$SPAWN_SCRIPT"

    assert_success "log_warning function exists" \
        grep -q "log_warning()" "$SPAWN_SCRIPT"

    assert_success "log_info function exists" \
        grep -q "log_info()" "$SPAWN_SCRIPT"
}

test_spawn_agents_function() {
    log_step "GIVEN spawn_agents function"

    # WHEN checking function structure
    # THEN function accepts required parameters
    assert_success "spawn_agents function exists" \
        grep -q "spawn_agents()" "$SPAWN_SCRIPT"

    assert_success "Function accepts task parameter" \
        grep -A 20 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q 'task="$1"'

    assert_success "Function accepts agents parameter" \
        grep -A 20 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q 'agents="$2"'

    assert_success "Function accepts agent_id parameter" \
        grep -A 20 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q 'agent_id='

    assert_success "Function accepts provider parameter" \
        grep -A 20 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q 'provider='

    # WHEN checking for npx execution
    # THEN function uses npx claude-flow-spawn
    assert_success "Function uses npx claude-flow-spawn" \
        grep -A 30 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q "npx claude-flow-spawn"
}

test_provider_parameter_handling() {
    log_step "GIVEN spawn-agent.sh with provider support"

    # WHEN checking for provider parameter
    # THEN script supports multiple providers
    assert_success "Script accepts --provider argument" \
        grep -q "\\--provider" "$SPAWN_SCRIPT"

    assert_success "Default provider is zai" \
        grep -q 'provider="zai"' "$SPAWN_SCRIPT"

    # WHEN checking provider usage
    # THEN provider is passed to spawn command
    assert_success "Provider parameter passed to spawn command" \
        grep -A 30 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q "\\--provider=\$provider"
}

test_argument_parsing() {
    log_step "GIVEN spawn-agent.sh argument parser"

    # WHEN checking for command-line argument parsing
    # THEN script supports required arguments
    assert_success "Script supports --task argument" \
        grep -q "\\--task)" "$SPAWN_SCRIPT"

    assert_success "Script supports --agents argument" \
        grep -q "\\--agents)" "$SPAWN_SCRIPT"

    assert_success "Script supports --agent-id argument" \
        grep -q "\\--agent-id)" "$SPAWN_SCRIPT"

    assert_success "Script supports --redis-channel argument" \
        grep -q "\\--redis-channel)" "$SPAWN_SCRIPT"

    # WHEN checking for validation
    # THEN script validates required arguments
    assert_success "Script validates task and agents" \
        grep -A 50 "\\--task)" "$SPAWN_SCRIPT" | grep -q "Missing required arguments"
}

test_stop_agent_functionality() {
    log_step "GIVEN stop_agent function"

    # WHEN checking function structure
    # THEN function exists and accepts task_id
    assert_success "stop_agent function exists" \
        grep -q "stop_agent()" "$SPAWN_SCRIPT"

    assert_success "Function accepts task_id parameter" \
        grep -A 10 "stop_agent()" "$SPAWN_SCRIPT" | grep -q 'task_id="$1"'

    # WHEN checking for stop command
    # THEN function uses npx with --stop flag
    assert_success "Function uses --stop flag" \
        grep -A 15 "stop_agent()" "$SPAWN_SCRIPT" | grep -q "\\--stop"

    # WHEN checking for stop-all functionality
    # THEN stop_all_agents function exists
    assert_success "stop_all_agents function exists" \
        grep -q "stop_all_agents()" "$SPAWN_SCRIPT"

    assert_success "Function uses --stop-all flag" \
        grep -A 10 "stop_all_agents()" "$SPAWN_SCRIPT" | grep -q "\\--stop-all"
}

test_config_handling() {
    log_step "GIVEN handle_config function"

    # WHEN checking function structure
    # THEN function supports list, get, set actions
    assert_success "handle_config function exists" \
        grep -q "handle_config()" "$SPAWN_SCRIPT"

    assert_success "Function supports list action" \
        grep -A 30 "handle_config()" "$SPAWN_SCRIPT" | grep -q "list)"

    assert_success "Function supports get action" \
        grep -A 30 "handle_config()" "$SPAWN_SCRIPT" | grep -q "get)"

    assert_success "Function supports set action" \
        grep -A 30 "handle_config()" "$SPAWN_SCRIPT" | grep -q "set)"
}

test_error_handling() {
    log_step "GIVEN spawn-agent.sh error handling"

    # WHEN checking for error conditions
    # THEN script handles errors properly
    assert_success "Script checks exit codes" \
        grep -q "exit_code=\$?" "$SPAWN_SCRIPT"

    assert_success "Script exits on errors" \
        grep -q "exit 1" "$SPAWN_SCRIPT"

    assert_success "Script logs errors before exit" \
        grep -B 2 "exit 1" "$SPAWN_SCRIPT" | grep -q "log_error"
}

test_main_function_structure() {
    log_step "GIVEN main function"

    # WHEN checking main function structure
    # THEN main function exists and calls dependency check
    assert_success "main function exists" \
        grep -q "main()" "$SPAWN_SCRIPT"

    assert_success "main calls check_dependencies" \
        grep -A 5 "main()" "$SPAWN_SCRIPT" | grep -q "check_dependencies"

    # WHEN checking for usage message
    # THEN script provides usage information on error
    assert_success "Script provides usage information" \
        grep -q "Usage:" "$SPAWN_SCRIPT"
}

test_redis_channel_support() {
    log_step "GIVEN Redis channel coordination support"

    # WHEN checking for Redis channel parameter
    # THEN script supports optional Redis channel
    assert_success "Script supports redis-channel parameter" \
        grep -A 40 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q "redis_channel"

    assert_success "Redis channel is optional" \
        grep -A 50 "spawn_agents()" "$SPAWN_SCRIPT" | grep -q "if.*redis_channel"
}

test_strict_mode_enabled() {
    log_step "GIVEN shell script best practices"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script enables strict mode" \
        head -20 "$SPAWN_SCRIPT" | grep -q "set -euo pipefail"
}

test_script_permissions() {
    log_step "GIVEN spawn-agent.sh file permissions"

    # WHEN checking file permissions
    # THEN script is executable
    assert_success "Script is executable" \
        test -x "$SPAWN_SCRIPT"
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

setup_test "agent-spawning"

test_dependency_checker
test_environment_sanitization
test_logging_functions
test_spawn_agents_function
test_provider_parameter_handling
test_argument_parsing
test_stop_agent_functionality
test_config_handling
test_error_handling
test_main_function_structure
test_redis_channel_support
test_strict_mode_enabled
test_script_permissions

# Test summary printed by cleanup trap
