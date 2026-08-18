#!/usr/bin/env bash
# tests/cli-mode/test-threshold-enforcement.sh
# Phase 1 :: Validates gate thresholds match CLAUDE.md v3.0+ standards (CRITICAL-002)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # No resources to clean
  :
}
trap cleanup EXIT

test_orchestrate_thresholds() {
  log_step "GIVEN orchestrate.sh defines GATE_THRESHOLD array"

  local orchestrate_file="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"
  
  # Validate file exists
  if [[ ! -f "$orchestrate_file" ]]; then
    log_error "orchestrate.sh not found at: $orchestrate_file"
    return 1
  fi
  log_success "orchestrate.sh found at: $orchestrate_file"

  # WHEN reading threshold values
  log_info "Extracting threshold values from orchestrate.sh"

  # Extract mvp threshold
  local mvp_gate
  mvp_gate=$(grep -A 3 "declare -A GATE_THRESHOLD" "$orchestrate_file" | grep "\[mvp\]" | grep -oP '=\K[0-9.]+')

  # Extract standard threshold
  local standard_gate
  standard_gate=$(grep -A 3 "declare -A GATE_THRESHOLD" "$orchestrate_file" | grep "\[standard\]" | grep -oP '=\K[0-9.]+')

  # Extract enterprise threshold
  local enterprise_gate
  enterprise_gate=$(grep -A 3 "declare -A GATE_THRESHOLD" "$orchestrate_file" | grep "\[enterprise\]" | grep -oP '=\K[0-9.]+')

  # THEN thresholds should match v3.0+ test-driven standards
  log_info "Validating MVP threshold: $mvp_gate (expected: 0.70)"
  assert_success "MVP gate threshold" test "$mvp_gate" = "0.70"

  log_info "Validating Standard threshold: $standard_gate (expected: 0.95)"
  assert_success "Standard gate threshold" test "$standard_gate" = "0.95"

  log_info "Validating Enterprise threshold: $enterprise_gate (expected: 0.98)"
  assert_success "Enterprise gate threshold" test "$enterprise_gate" = "0.98"
}

test_consensus_thresholds() {
  log_step "GIVEN orchestrate.sh defines CONSENSUS_THRESHOLD array"

  local orchestrate_file="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

  # WHEN reading consensus threshold values
  log_info "Extracting consensus threshold values from orchestrate.sh"

  # Extract mvp consensus threshold
  local mvp_consensus
  mvp_consensus=$(grep -A 3 "declare -A CONSENSUS_THRESHOLD" "$orchestrate_file" | grep "\[mvp\]" | grep -oP '=\K[0-9.]+')

  # Extract standard consensus threshold
  local standard_consensus
  standard_consensus=$(grep -A 3 "declare -A CONSENSUS_THRESHOLD" "$orchestrate_file" | grep "\[standard\]" | grep -oP '=\K[0-9.]+')

  # Extract enterprise consensus threshold
  local enterprise_consensus
  enterprise_consensus=$(grep -A 3 "declare -A CONSENSUS_THRESHOLD" "$orchestrate_file" | grep "\[enterprise\]" | grep -oP '=\K[0-9.]+')

  # THEN consensus thresholds should match v3.0+ test-driven standards
  log_info "Validating MVP consensus threshold: $mvp_consensus (expected: 0.80)"
  assert_success "MVP consensus threshold" test "$mvp_consensus" = "0.80"

  log_info "Validating Standard consensus threshold: $standard_consensus (expected: 0.90)"
  assert_success "Standard consensus threshold" test "$standard_consensus" = "0.90"

  log_info "Validating Enterprise consensus threshold: $enterprise_consensus (expected: 0.95)"
  assert_success "Enterprise consensus threshold" test "$enterprise_consensus" = "0.95"
}

# Execute tests
test_orchestrate_thresholds
test_consensus_thresholds

log_info "✅ All threshold enforcement tests PASSED"
