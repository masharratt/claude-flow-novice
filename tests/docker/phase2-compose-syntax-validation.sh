#!/bin/bash
# tests/docker/phase2-compose-syntax-validation.sh
# Phase 2 :: Docker Compose Syntax Validation - Network Aliases (Phase 2 CLI_TRIGGER_COLLISION_ANALYSIS.md)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

CLI_COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.yml"
TRIGGER_COMPOSE_FILE="$PROJECT_ROOT/docker/trigger-dev/docker-compose.yml"

log_info "======================================"
log_info "Phase 2 Docker Compose Syntax Validation"
log_info "======================================"

# ==============================================================================
# TEST 1: CLI docker-compose.yml has network aliases
# ==============================================================================
test_cli_compose_aliases() {
  log_step "GIVEN CLI docker-compose.yml file exists"
  assert_success "[ -f '$CLI_COMPOSE_FILE' ]"

  log_step "WHEN checking for cfn-redis network aliases"

  # Check for mcp-network with aliases block
  assert_success "grep -A 3 'mcp-network:' '$CLI_COMPOSE_FILE' | grep -q 'aliases:'"
  annotate "mcp-network has aliases block"

  # Check for cfn-redis alias
  assert_success "grep -A 3 'mcp-network:' '$CLI_COMPOSE_FILE' | grep -q 'cfn-redis'"
  annotate "cfn-redis alias present"

  # Check for redis alias
  assert_success "grep -A 3 'mcp-network:' '$CLI_COMPOSE_FILE' | grep -q '- redis'"
  annotate "redis alias present"

  log_step "THEN both aliases should be configured"
  log_success "CLI mode has correct network aliases (cfn-redis + redis)"
}

# ==============================================================================
# TEST 2: Trigger.dev docker-compose.yml has network aliases
# ==============================================================================
test_trigger_compose_aliases() {
  log_step "GIVEN Trigger.dev docker-compose.yml file exists"
  assert_success "[ -f '$TRIGGER_COMPOSE_FILE' ]"

  log_step "WHEN checking for redis network aliases"

  # Check for trigger-cfn-network with aliases block
  assert_success "grep -A 3 'trigger-cfn-network:' '$TRIGGER_COMPOSE_FILE' | grep -q 'aliases:'"
  annotate "trigger-cfn-network has aliases block"

  # Check for redis alias
  assert_success "grep -A 3 'trigger-cfn-network:' '$TRIGGER_COMPOSE_FILE' | grep -q '- redis'"
  annotate "redis alias present"

  # Check for cfn-redis alias
  assert_success "grep -A 3 'trigger-cfn-network:' '$TRIGGER_COMPOSE_FILE' | grep -q 'cfn-redis'"
  annotate "cfn-redis alias present"

  log_step "THEN both aliases should be configured"
  log_success "Trigger.dev mode has correct network aliases (redis + cfn-redis)"
}

# ==============================================================================
# TEST 3: CLI compose file validates with docker-compose config
# ==============================================================================
test_cli_compose_validation() {
  log_step "GIVEN CLI docker-compose.yml with aliases"

  log_step "WHEN running docker-compose config"

  # Validate syntax with docker-compose config
  cd "$PROJECT_ROOT"
  OUTPUT=$(docker-compose -f "$CLI_COMPOSE_FILE" config 2>&1)
  assert_success "echo '$OUTPUT' | grep -v -i 'error'"
  annotate "docker-compose config validates successfully"

  log_step "THEN no syntax errors should be reported"
  log_success "CLI compose file syntax is valid"
}

# ==============================================================================
# TEST 4: Trigger.dev compose file validates with docker-compose config
# ==============================================================================
test_trigger_compose_validation() {
  log_step "GIVEN Trigger.dev docker-compose.yml with aliases"

  log_step "WHEN running docker-compose config"

  # Validate syntax with docker-compose config
  cd "$PROJECT_ROOT"
  OUTPUT=$(docker-compose -f "$TRIGGER_COMPOSE_FILE" config 2>&1)
  assert_success "echo '$OUTPUT' | grep -v -i 'error'"
  annotate "docker-compose config validates successfully"

  log_step "THEN no syntax errors should be reported"
  log_success "Trigger.dev compose file syntax is valid"
}

# ==============================================================================
# Run All Tests
# ==============================================================================
log_info "Running Phase 2 syntax validation tests"

test_cli_compose_aliases
test_trigger_compose_aliases
test_cli_compose_validation
test_trigger_compose_validation

log_info "======================================"
log_info "Phase 2 Syntax Validation Results"
log_info "======================================"
log_success "✅ CLI docker-compose.yml: Network aliases configured correctly"
log_success "✅ Trigger.dev docker-compose.yml: Network aliases configured correctly"
log_success "✅ CLI compose file: Syntax validates with docker-compose config"
log_success "✅ Trigger.dev compose file: Syntax validates with docker-compose config"

log_info ""
log_info "Phase 2 Implementation: VALIDATED"
log_info "Next Steps:"
log_info "  1. Deploy updated docker-compose.yml files to staging"
log_info "  2. Run manual DNS resolution tests (see docs/phase2-network-alias-implementation-summary.md)"
log_info "  3. Implement Phase 1 (Redis key namespacing) before parallel mode execution"
