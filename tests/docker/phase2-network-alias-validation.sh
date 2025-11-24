#!/bin/bash
# tests/docker/phase2-network-alias-validation.sh
# Phase 2 :: Network Alias Validation - CLI/Trigger.dev Service Discovery (Phase 2 CLI_TRIGGER_COLLISION_ANALYSIS.md)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
CLI_COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.yml"
TRIGGER_COMPOSE_FILE="$PROJECT_ROOT/docker/trigger-dev/docker-compose.yml"
CLI_NETWORK="mcp-network"
TRIGGER_NETWORK="trigger-cfn-network"

cleanup() {
  log_info "Cleaning up test containers and networks"
  docker-compose -f "$CLI_COMPOSE_FILE" down -v 2>/dev/null || true
  docker-compose -f "$TRIGGER_COMPOSE_FILE" down -v 2>/dev/null || true
  docker network prune -f 2>/dev/null || true
}
trap cleanup EXIT

log_info "======================================\nPhase 2 Network Alias Validation"

# ==============================================================================
# TEST 1: CLI Mode DNS Resolution (Both Aliases)
# ==============================================================================
test_cli_mode_dns_resolution() {
  log_step "GIVEN CLI mode services are running"

  cd "$PROJECT_ROOT"
  docker-compose -f "$CLI_COMPOSE_FILE" up -d cfn-redis
  sleep 5

  assert_success "docker-compose -f $CLI_COMPOSE_FILE ps cfn-redis | grep -q 'Up'"
  annotate "CLI redis service started successfully"

  log_step "WHEN testing DNS resolution in CLI network"

  # Test original service name (cfn-redis)
  CFN_REDIS_IP=$(docker run --rm --network "$CLI_NETWORK" alpine nslookup cfn-redis | grep -A1 "Name:" | tail -1 | awk '{print $3}')
  assert_success "[ -n '$CFN_REDIS_IP' ]"
  annotate "cfn-redis resolves to: $CFN_REDIS_IP"

  # Test alias (redis)
  REDIS_IP=$(docker run --rm --network "$CLI_NETWORK" alpine nslookup redis | grep -A1 "Name:" | tail -1 | awk '{print $3}')
  assert_success "[ -n '$REDIS_IP' ]"
  annotate "redis resolves to: $REDIS_IP"

  log_step "THEN both names should resolve to the same IP"
  assert_success "[ '$CFN_REDIS_IP' = '$REDIS_IP' ]"
  annotate "Both names resolve to same IP: $CFN_REDIS_IP"
}

# ==============================================================================
# TEST 2: Trigger.dev Mode DNS Resolution (Both Aliases)
# ==============================================================================
test_trigger_mode_dns_resolution() {
  log_step "GIVEN Trigger.dev mode services are running"

  cd "$PROJECT_ROOT"
  docker-compose -f "$TRIGGER_COMPOSE_FILE" up -d redis
  sleep 5

  assert_success "docker-compose -f $TRIGGER_COMPOSE_FILE ps redis | grep -q 'Up'"
  annotate "Trigger.dev redis service started successfully"

  log_step "WHEN testing DNS resolution in Trigger.dev network"

  # Test original service name (redis)
  REDIS_IP=$(docker run --rm --network "$TRIGGER_NETWORK" alpine nslookup redis | grep -A1 "Name:" | tail -1 | awk '{print $3}')
  assert_success "[ -n '$REDIS_IP' ]"
  annotate "redis resolves to: $REDIS_IP"

  # Test alias (cfn-redis)
  CFN_REDIS_IP=$(docker run --rm --network "$TRIGGER_NETWORK" alpine nslookup cfn-redis | grep -A1 "Name:" | tail -1 | awk '{print $3}')
  assert_success "[ -n '$CFN_REDIS_IP' ]"
  annotate "cfn-redis resolves to: $CFN_REDIS_IP"

  log_step "THEN both names should resolve to the same IP"
  assert_success "[ '$REDIS_IP' = '$CFN_REDIS_IP' ]"
  annotate "Both names resolve to same IP: $REDIS_IP"
}

# ==============================================================================
# TEST 3: CLI Mode Redis Connectivity (Both Aliases)
# ==============================================================================
test_cli_mode_redis_connectivity() {
  log_step "GIVEN CLI mode Redis is running"

  cd "$PROJECT_ROOT"
  docker-compose -f "$CLI_COMPOSE_FILE" up -d cfn-redis
  sleep 5

  log_step "WHEN connecting via both service names"

  # Test connection via original name (cfn-redis)
  CFN_REDIS_PING=$(docker run --rm --network "$CLI_NETWORK" redis:7-alpine redis-cli -h cfn-redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$CFN_REDIS_PING' = 'PONG' ]"
  annotate "cfn-redis connection: $CFN_REDIS_PING"

  # Test connection via alias (redis)
  REDIS_PING=$(docker run --rm --network "$CLI_NETWORK" redis:7-alpine redis-cli -h redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$REDIS_PING' = 'PONG' ]"
  annotate "redis connection: $REDIS_PING"

  log_step "THEN both connections should succeed"
  assert_success "[ '$CFN_REDIS_PING' = 'PONG' ] && [ '$REDIS_PING' = 'PONG' ]"
  annotate "Both service names are functional"
}

# ==============================================================================
# TEST 4: Trigger.dev Mode Redis Connectivity (Both Aliases)
# ==============================================================================
test_trigger_mode_redis_connectivity() {
  log_step "GIVEN Trigger.dev mode Redis is running"

  cd "$PROJECT_ROOT"
  docker-compose -f "$TRIGGER_COMPOSE_FILE" up -d redis
  sleep 5

  log_step "WHEN connecting via both service names"

  # Test connection via original name (redis)
  REDIS_PING=$(docker run --rm --network "$TRIGGER_NETWORK" redis:7-alpine redis-cli -h redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$REDIS_PING' = 'PONG' ]"
  annotate "redis connection: $REDIS_PING"

  # Test connection via alias (cfn-redis)
  CFN_REDIS_PING=$(docker run --rm --network "$TRIGGER_NETWORK" redis:7-alpine redis-cli -h cfn-redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$CFN_REDIS_PING' = 'PONG' ]"
  annotate "cfn-redis connection: $CFN_REDIS_PING"

  log_step "THEN both connections should succeed"
  assert_success "[ '$REDIS_PING' = 'PONG' ] && [ '$CFN_REDIS_PING' = 'PONG' ]"
  annotate "Both service names are functional"
}

# ==============================================================================
# TEST 5: Backward Compatibility Verification (Existing Names)
# ==============================================================================
test_backward_compatibility() {
  log_step "GIVEN both modes are running"

  cd "$PROJECT_ROOT"
  docker-compose -f "$CLI_COMPOSE_FILE" up -d cfn-redis
  docker-compose -f "$TRIGGER_COMPOSE_FILE" up -d redis
  sleep 5

  log_step "WHEN using original service names (pre-alias)"

  # CLI mode original name (cfn-redis)
  CLI_ORIGINAL=$(docker run --rm --network "$CLI_NETWORK" redis:7-alpine redis-cli -h cfn-redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$CLI_ORIGINAL' = 'PONG' ]"
  annotate "CLI original name (cfn-redis): $CLI_ORIGINAL"

  # Trigger.dev original name (redis)
  TRIGGER_ORIGINAL=$(docker run --rm --network "$TRIGGER_NETWORK" redis:7-alpine redis-cli -h redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$TRIGGER_ORIGINAL' = 'PONG' ]"
  annotate "Trigger.dev original name (redis): $TRIGGER_ORIGINAL"

  log_step "THEN original names should still work (no breaking changes)"
  assert_success "[ '$CLI_ORIGINAL' = 'PONG' ] && [ '$TRIGGER_ORIGINAL' = 'PONG' ]"
  annotate "Backward compatibility maintained"
}

# ==============================================================================
# TEST 6: Cross-Mode Alias Validation (New Names)
# ==============================================================================
test_cross_mode_aliases() {
  log_step "GIVEN both modes are running"

  cd "$PROJECT_ROOT"
  docker-compose -f "$CLI_COMPOSE_FILE" up -d cfn-redis
  docker-compose -f "$TRIGGER_COMPOSE_FILE" up -d redis
  sleep 5

  log_step "WHEN using cross-mode aliases"

  # CLI mode using Trigger.dev naming (redis)
  CLI_ALIAS=$(docker run --rm --network "$CLI_NETWORK" redis:7-alpine redis-cli -h redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$CLI_ALIAS' = 'PONG' ]"
  annotate "CLI mode using 'redis' alias: $CLI_ALIAS"

  # Trigger.dev mode using CLI naming (cfn-redis)
  TRIGGER_ALIAS=$(docker run --rm --network "$TRIGGER_NETWORK" redis:7-alpine redis-cli -h cfn-redis ping 2>/dev/null || echo "FAIL")
  assert_success "[ '$TRIGGER_ALIAS' = 'PONG' ]"
  annotate "Trigger.dev mode using 'cfn-redis' alias: $TRIGGER_ALIAS"

  log_step "THEN cross-mode aliases should work (Phase 2 goal)"
  assert_success "[ '$CLI_ALIAS' = 'PONG' ] && [ '$TRIGGER_ALIAS' = 'PONG' ]"
  annotate "Cross-mode service discovery enabled"
}

# ==============================================================================
# Run All Tests
# ==============================================================================
log_info "Running Phase 2 network alias validation tests"

test_cli_mode_dns_resolution
test_trigger_mode_dns_resolution
test_cli_mode_redis_connectivity
test_trigger_mode_redis_connectivity
test_backward_compatibility
test_cross_mode_aliases

log_info "======================================\nPhase 2 Validation Results"
log_info "✅ DNS Resolution: CLI mode supports both 'cfn-redis' and 'redis'"
log_info "✅ DNS Resolution: Trigger.dev mode supports both 'redis' and 'cfn-redis'"
log_info "✅ Redis Connectivity: CLI mode agents can connect via both names"
log_info "✅ Redis Connectivity: Trigger.dev agents can connect via both names"
log_info "✅ Backward Compatibility: Original service names still work"
log_info "✅ Cross-Mode Aliases: New aliases enable cross-mode service discovery"

log_info "Phase 2 Implementation: SUCCESS"
log_info "Benefits:"
log_info "  - Zero breaking changes (existing names preserved)"
log_info "  - Cross-mode compatibility (agents can use either naming convention)"
log_info "  - Simplified configuration (no hardcoded service name checks)"
log_info "  - Infrastructure convergence (CLI and Trigger.dev interoperable)"
