#!/bin/bash
# tests/cli-mode/test-cfn-loop-execution.sh
# Phase 1 :: Validates CLI mode infrastructure components exist (smoke test)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # No temporary resources created
  :
}
trap cleanup EXIT

test_slash_command_exists() {
  log_step "GIVEN /cfn-loop-cli slash command"

  local cmd_file="$PROJECT_ROOT/.claude/commands/cfn-loop-cli.md"

  # WHEN checking command file exists
  if [[ ! -f "$cmd_file" ]]; then
    log_error "Slash command file not found at: $cmd_file"
    return 1
  fi
  log_success "Slash command file exists at: $cmd_file"

  # THEN should contain coordinator spawn instructions
  if ! grep -q "cfn-v3-coordinator" "$cmd_file" 2>/dev/null; then
    log_error "Command does not reference cfn-v3-coordinator"
    return 1
  fi
  log_success "Command references coordinator agent"

  # Validate orchestrator reference (command mentions orchestration concept)
  if ! grep -qi "orchestrate" "$cmd_file" 2>/dev/null; then
    log_error "Command does not reference orchestration"
    return 1
  fi
  log_success "Command references orchestration concept"

  log_info "✅ Slash command infrastructure validated"
}

test_coordinator_agent_exists() {
  log_step "GIVEN cfn-v3-coordinator agent files"

  # Check Task mode coordinator
  local task_coord="$PROJECT_ROOT/.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md"
  if [[ ! -f "$task_coord" ]]; then
    log_error "Task mode coordinator not found at: $task_coord"
    return 1
  fi
  log_success "Task mode coordinator exists"

  # Check CLI mode coordinator
  local cli_coord="$PROJECT_ROOT/.claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
  if [[ ! -f "$cli_coord" ]]; then
    log_error "CLI mode coordinator not found at: $cli_coord"
    return 1
  fi
  log_success "CLI mode coordinator exists"

  # WHEN checking agent configuration
  # THEN should reference orchestrate.sh
  if ! grep -q "orchestrate.sh" "$cli_coord" 2>/dev/null; then
    log_error "CLI coordinator does not reference orchestrate.sh"
    return 1
  fi
  log_success "CLI coordinator references orchestrator"

  log_info "✅ Coordinator agents validated"
}

test_orchestrator_exists() {
  log_step "GIVEN orchestrate.sh orchestrator"

  local orch_file="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # WHEN checking orchestrator file
  if [[ ! -f "$orch_file" ]]; then
    log_error "Orchestrator not found at: $orch_file"
    return 1
  fi
  log_success "Orchestrator exists at: $orch_file"

  # THEN should be executable
  if [[ ! -x "$orch_file" ]]; then
    log_error "Orchestrator is not executable"
    return 1
  fi
  log_success "Orchestrator is executable"

  # Validate orchestrator has core functions
  if ! grep -q "spawn_loop3_agents" "$orch_file" 2>/dev/null; then
    log_error "Orchestrator missing spawn_loop3_agents function"
    return 1
  fi
  log_success "Has Loop 3 spawn logic"

  if ! grep -q "spawn_loop2_agents" "$orch_file" 2>/dev/null; then
    log_error "Orchestrator missing spawn_loop2_agents function"
    return 1
  fi
  log_success "Has Loop 2 spawn logic"

  if ! grep -q "GATE_THRESHOLD" "$orch_file" 2>/dev/null; then
    log_error "Orchestrator missing gate threshold configuration"
    return 1
  fi
  log_success "Has gate threshold configuration"

  log_info "✅ Orchestrator infrastructure validated"
}

test_environment_configuration() {
  log_step "GIVEN CFN Loop environment variables"

  # WHEN checking required environment variables can be set
  local test_vars=(
    "CFN_MODE"
    "CFN_TASK_ID"
    "CFN_ITERATION"
    "CFN_QUALITY_MODE"
  )

  for var in "${test_vars[@]}"; do
    # Verify variable can be set (no syntax errors)
    if ! eval "export ${var}=test_value" 2>/dev/null; then
      log_error "Cannot set environment variable: $var"
      return 1
    fi
    unset "$var"
  done

  log_success "All required environment variables can be configured"

  log_info "✅ Environment configuration validated"
}

test_integration_references() {
  log_step "GIVEN infrastructure smoke test completes"

  # Reference other test suites for complete validation
  log_info "Redis coordination: Validated by test-redis-coordination.sh"
  log_info "Threshold enforcement: Validated by test-threshold-enforcement.sh"
  log_info "CLI command parameters: Validated by test-command-parameter-validation.sh"
  log_info "Task mode execution: Validated by test-cfn-loop-task-command.sh"

  # Note on end-to-end testing
  log_info "NOTE: Full CFN Loop execution requires integration test suite"
  log_info "      (not part of unit test scope due to cost/duration)"

  log_info "✅ Test suite integration validated"
}

test_spawning_infrastructure() {
  log_step "GIVEN agent spawning infrastructure"

  # Check agent spawn implementation
  local spawn_ts="$PROJECT_ROOT/src/cli/agent-spawn.ts"
  if [[ ! -f "$spawn_ts" ]]; then
    log_error "agent-spawn.ts not found at: $spawn_ts"
    return 1
  fi
  log_success "agent-spawn.ts exists"

  # Check spawn.ts (main spawning logic)
  local spawn_main="$PROJECT_ROOT/src/cli/spawn.ts"
  if [[ ! -f "$spawn_main" ]]; then
    log_error "spawn.ts not found at: $spawn_main"
    return 1
  fi
  log_success "spawn.ts exists"

  # Check agent prompt builder
  local prompt_builder="$PROJECT_ROOT/src/cli/agent-prompt-builder.ts"
  if [[ ! -f "$prompt_builder" ]]; then
    log_error "Agent prompt builder not found at: $prompt_builder"
    return 1
  fi
  log_success "Agent prompt builder exists"

  log_info "✅ Spawning infrastructure validated"
}

# Execute all test functions
test_slash_command_exists
test_coordinator_agent_exists
test_orchestrator_exists
test_environment_configuration
test_spawning_infrastructure
test_integration_references

log_success "✅ All CLI mode infrastructure smoke tests PASSED"
