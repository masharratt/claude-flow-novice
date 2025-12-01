#!/bin/bash
# tests/api-gateway/test-kong-configuration.sh
# Phase 1 :: Test Kong API gateway configuration (Bug #21 validation)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # Clean up test containers and networks
  docker stop kong-test-db 2>/dev/null || true
  docker rm kong-test-db 2>/dev/null || true
  docker stop kong-test 2>/dev/null || true
  docker rm kong-test 2>/dev/null || true
  docker network rm kong-test-net 2>/dev/null || true
}
trap cleanup EXIT

test_kong_configuration_exists() {
  log_step "GIVEN Kong configuration directory exists"
  # WHEN checking for config files
  # THEN Kong configuration should exist
  assert_file_exists "$PROJECT_ROOT/config/kong/kong.yml"
  assert_file_exists "$PROJECT_ROOT/config/kong/kong.conf"
}

test_kong_config_validation() {
  log_step "GIVEN Kong configuration is created"
  # WHEN validating Kong configuration
  if command -v kong >/dev/null 2>&1; then
    # THEN config should be valid
    assert_success "kong check $PROJECT_ROOT/config/kong/kong.yml"
  else
    log_info "Kong CLI not available, skipping validation"
  fi
}

test_kong_services_defined() {
  log_step "GIVEN Kong configuration includes services"
  # WHEN parsing kong.yml
  # THEN required services should be defined
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    local services
    services=$(grep -A 5 "services:" "$PROJECT_ROOT/config/kong/kong.yml" | grep -c "name:" || echo "0")
    assert_true "$services -gt 0" "At least one service should be defined"
  fi
}

test_kong_routes_defined() {
  log_step "GIVEN Kong configuration includes routes"
  # WHEN parsing kong.yml
  # THEN required routes should be defined
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    local routes
    routes=$(grep -A 20 "routes:" "$PROJECT_ROOT/config/kong/kong.yml" | grep -c "name:" || echo "0")
    assert_true "$routes -gt 0" "At least one route should be defined"
  fi
}

test_kong_plugins_configured() {
  log_step "GIVEN Kong configuration includes plugins"
  # WHEN parsing kong.yml
  # THEN security plugins should be configured
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    local plugins
    plugins=$(grep -A 50 "plugins:" "$PROJECT_ROOT/config/kong/kong.yml" | grep -c "name:" || echo "0")
    assert_true "$plugins -gt 0" "At least one plugin should be configured"
  fi
}

test_kong_docker_setup() {
  log_step "GIVEN Docker compose file for Kong"
  # WHEN checking for Docker setup
  # THEN Kong Docker configuration should exist
  assert_file_exists "$PROJECT_ROOT/docker/docker-compose.kong.yml"
  
  # Validate Docker compose syntax
  if command -v docker-compose >/dev/null 2>&1; then
    assert_success "docker-compose -f $PROJECT_ROOT/docker/docker-compose.kong.yml config"
  else
    log_info "docker-compose not available, skipping validation"
  fi
}

# Run tests
test_kong_configuration_exists
test_kong_config_validation
test_kong_services_defined
test_kong_routes_defined
test_kong_plugins_configured
test_kong_docker_setup

log_info "Kong configuration tests completed"