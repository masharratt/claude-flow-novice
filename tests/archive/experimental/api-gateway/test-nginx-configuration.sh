#!/bin/bash
# tests/api-gateway/test-nginx-configuration.sh
# Phase 1 :: Test Nginx reverse proxy configuration (Bug #21 validation)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # Clean up test containers
  docker stop nginx-test 2>/dev/null || true
  docker rm nginx-test 2>/dev/null || true
}
trap cleanup EXIT

test_nginx_config_exists() {
  log_step "GIVEN Nginx configuration directory exists"
  # WHEN checking for config files
  # THEN Nginx configuration should exist
  assert_file_exists "$PROJECT_ROOT/config/nginx/nginx.conf"
  assert_file_exists "$PROJECT_ROOT/config/nginx/conf.d/default.conf"
}

test_nginx_config_syntax() {
  log_step "GIVEN Nginx configuration is created"
  # WHEN validating syntax
  if command -v nginx >/dev/null 2>&1; then
    # THEN config should be syntactically valid
    assert_success "nginx -t -c $PROJECT_ROOT/config/nginx/nginx.conf"
  else
    log_info "Nginx not available, checking with Docker"
    
    # Create temporary container for validation
    if command -v docker >/dev/null 2>&1; then
      docker run --rm -v "$PROJECT_ROOT/config/nginx:/etc/nginx:ro" nginx:alpine nginx -t
    else
      log_info "Docker not available, skipping syntax validation"
    fi
  fi
}

test_nginx_upstream_servers() {
  log_step "GIVEN Nginx configuration includes upstream servers"
  # WHEN parsing nginx.conf
  # THEN upstream servers should be defined
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "upstream"
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "server"
  fi
}

test_nginx_rate_limiting() {
  log_step "GIVEN Nginx configuration includes rate limiting"
  # WHEN parsing nginx.conf
  # THEN rate limiting zones should be configured
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "limit_req_zone"
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "limit_req"
  fi
}

test_nginx_security_headers() {
  log_step "GIVEN Nginx configuration includes security headers"
  # WHEN parsing nginx.conf
  # THEN security headers should be configured
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "add_header"
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "Strict-Transport-Security"
  fi
}

test_nginx_ssl_configuration() {
  log_step "GIVEN Nginx configuration includes SSL"
  # WHEN parsing nginx.conf
  # THEN SSL settings should be configured
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "ssl_certificate"
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "ssl_protocols"
  fi
}

test_nginx_docker_setup() {
  log_step "GIVEN Docker compose file for Nginx"
  # WHEN checking for Docker setup
  # THEN Nginx Docker configuration should exist
  assert_file_exists "$PROJECT_ROOT/docker/docker-compose.nginx.yml"
  
  # Validate Docker compose syntax
  if command -v docker-compose >/dev/null 2>&1; then
    assert_success "docker-compose -f $PROJECT_ROOT/docker/docker-compose.nginx.yml config"
  else
    log_info "docker-compose not available, skipping validation"
  fi
}

test_nginx_cors_configuration() {
  log_step "GIVEN Nginx configuration includes CORS"
  # WHEN parsing nginx.conf
  # THEN CORS headers should be configured
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "Access-Control-Allow-Origin"
  fi
}

test_nginx_health_check() {
  log_step "GIVEN Nginx configuration includes health check"
  # WHEN parsing nginx.conf
  # THEN health endpoint should be configured
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "location /health"
  fi
}

# Run tests
test_nginx_config_exists
test_nginx_config_syntax
test_nginx_upstream_servers
test_nginx_rate_limiting
test_nginx_security_headers
test_nginx_ssl_configuration
test_nginx_docker_setup
test_nginx_cors_configuration
test_nginx_health_check

log_info "Nginx configuration tests completed"