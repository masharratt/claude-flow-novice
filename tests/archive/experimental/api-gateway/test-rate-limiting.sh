#!/bin/bash
# tests/api-gateway/test-rate-limiting.sh
# Phase 1 :: Test rate limiting configuration (Bug #21 validation)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

test_rate_limiting_kong_plugins() {
  log_step "GIVEN Kong rate limiting plugins"
  # WHEN checking Kong configuration
  # THEN rate limiting plugins should be configured
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/kong/kong.yml" "rate-limiting"
    assert_file_contains "$PROJECT_ROOT/config/kong/kong.yml" "minute"
    assert_file_contains "$PROJECT_ROOT/config/kong/kong.yml" "hour"
  fi
}

test_rate_limiting_nginx_zones() {
  log_step "GIVEN Nginx rate limiting zones"
  # WHEN checking Nginx configuration
  # THEN rate limiting zones should be defined
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "limit_req_zone"
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "rate="
  fi
}

test_rate_limiting_nginx_application() {
  log_step "GIVEN Nginx rate limiting application"
  # WHEN checking Nginx configuration
  # THEN rate limiting should be applied to routes
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "limit_req"
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "burst"
  fi
}

test_rate_limiting_config_values() {
  log_step "GIVEN rate limiting configuration values"
  # WHEN checking configuration
  # THEN reasonable limits should be set
  
  # Check Kong config
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    # Should have reasonable limits (not too high, not too low)
    if grep -q "minute:" "$PROJECT_ROOT/config/kong/kong.yml"; then
      local minute_limit
      minute_limit=$(grep -A 2 "minute:" "$PROJECT_ROOT/config/kong/kong.yml" | tail -1 | tr -d ' ')
      # Should be between 10 and 1000 requests per minute
      assert_true "$minute_limit -ge 10 && $minute_limit -le 1000" "Minute limit should be reasonable: $minute_limit"
    fi
  fi
  
  # Check Nginx config
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    # Should have rate limits defined
    assert_file_contains "$PROJECT_ROOT/config/nginx/nginx.conf" "10r/s\|5r/s\|20r/s"
  fi
}

test_rate_limiting_headers() {
  log_step "GIVEN rate limiting response headers"
  # WHEN checking configuration
  # THEN rate limiting headers should be configured
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    # Kong should configure headers
    if grep -q "rate-limiting" "$PROJECT_ROOT/config/kong/kong.yml"; then
      local config_section
      config_section=$(sed -n '/rate-limiting/,/^[[:space:]]*[^[:space:]]/p' "$PROJECT_ROOT/config/kong/kong.yml")
      assert_true "$(echo "$config_section" | grep -q "hide_client_headers" && echo "1" || echo "0")" "Should have hide_client_headers configured"
    fi
  fi
}

test_rate_limiting_distributed() {
  log_step "GIVEN distributed rate limiting"
  # WHEN checking production configuration
  # THEN cluster/Redis-based rate limiting should be configured
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    # Should use cluster strategy for production
    if grep -A 20 "rate-limiting-advanced" "$PROJECT_ROOT/config/kong/kong.yml" | grep -q "strategy:"; then
      assert_file_contains "$PROJECT_ROOT/config/kong/kong.yml" "strategy: cluster"
    fi
  fi
}

test_rate_limiting_tiers() {
  log_step "GIVEN tiered rate limiting"
  # WHEN checking advanced configuration
  # THEN multiple rate limit tiers should be configured
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    # Should have consumer-specific rate limiting
    if grep -A 30 "rate-limiting-advanced" "$PROJECT_ROOT/config/kong/kong.yml" | grep -q "limit:"; then
      local limits
      limits=$(grep -A 5 "limit:" "$PROJECT_ROOT/config/kong/kong.yml" | grep -c "-" || echo "0")
      assert_true "$limits -gt 1" "Should have multiple rate limit tiers"
    fi
  fi
}

test_rate_limiting_error_responses() {
  log_step "GIVEN rate limiting error responses"
  # WHEN checking configuration
  # THEN proper error responses should be configured
  if [[ -f "$PROJECT_ROOT/config/kong/kong.yml" ]]; then
    local rate_limit_section
    rate_limit_section=$(sed -n '/rate-limiting/,/^[[:space:]]*[^[:space:]]/p' "$PROJECT_ROOT/config/kong/kong.yml")
    
    # Should have error code and message
    assert_true "$(echo "$rate_limit_section" | grep -q "error_code" && echo "1" || echo "0")" "Should configure error_code"
    assert_true "$(echo "$rate_limit_section" | grep -q "error_message" && echo "1" || echo "0")" "Should configure error_message"
  fi
}

test_rate_limiting_health_check() {
  log_step "GIVEN rate limiting health check"
  # WHEN checking configuration
  # THEN health endpoints should bypass rate limiting
  if [[ -f "$PROJECT_ROOT/config/nginx/nginx.conf" ]]; then
    # Health check should not have rate limiting applied
    local health_section
    health_section=$(sed -n '/location \/health/,/^[[:space:]]*location/p' "$PROJECT_ROOT/config/nginx/nginx.conf")
    assert_true "$(echo "$health_section" | grep -qv "limit_req" && echo "1" || echo "0")" "Health endpoint should bypass rate limiting"
  fi
}

# Run tests
test_rate_limiting_kong_plugins
test_rate_limiting_nginx_zones
test_rate_limiting_nginx_application
test_rate_limiting_config_values
test_rate_limiting_headers
test_rate_limiting_distributed
test_rate_limiting_tiers
test_rate_limiting_error_responses
test_rate_limiting_health_check

log_info "Rate limiting tests completed"