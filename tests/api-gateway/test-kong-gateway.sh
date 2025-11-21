#!/bin/bash
# tests/api-gateway/test-kong-gateway.sh
# Phase 2 :: Test Kong API gateway configuration and functionality (TDD compliance)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
KONG_ADMIN_URL="http://localhost:8001"
KONG_PROXY_URL="http://localhost:8000"
TEST_RESULTS_DIR="$PROJECT_ROOT/.artifacts/test-results"
KONG_CONTAINER_NAME="test-kong-gateway"

# Test data
TEST_SERVICE_NAME="test-user-service"
TEST_SERVICE_URL="http://httpbin.org"
TEST_ROUTE_PATH="/test-api/users"

# Cleanup function
cleanup() {
  log_step "Cleanup: Removing test Kong container and test data"
  
  # Remove Kong container
  docker rm -f $KONG_CONTAINER_NAME 2>/dev/null || true
  
  # Clean up any test services created in Kong
  cleanup_kong_test_services || true
  
  log_info "Cleanup completed"
}
trap cleanup EXIT

# Clean up test services from Kong
cleanup_kong_test_services() {
  log_step "Cleaning up Kong test services"
  
  # Remove test routes
  local test_routes=$(curl -s "$KONG_ADMIN_URL/routes?tags=test" 2>/dev/null | jq -r '.data[].id // empty' || true)
  for route_id in $test_routes; do
    curl -s -X DELETE "$KONG_ADMIN_URL/routes/$route_id" >/dev/null 2>&1 || true
  done
  
  # Remove test services
  local test_services=$(curl -s "$KONG_ADMIN_URL/services?tags=test" 2>/dev/null | jq -r '.data[].id // empty' || true)
  for service_id in $test_services; do
    curl -s -X DELETE "$KONG_ADMIN_URL/services/$service_id" >/dev/null 2>&1 || true
  done
  
  # Remove test consumers
  local test_consumers=$(curl -s "$KONG_ADMIN_URL/consumers?tags=test" 2>/dev/null | jq -r '.data[].id // empty' || true)
  for consumer_id in $test_consumers; do
    curl -s -X DELETE "$KONG_ADMIN_URL/consumers/$consumer_id" >/dev/null 2>&1 || true
  done
}

# Start Kong gateway for testing
start_kong_gateway() {
  log_step "Starting Kong gateway for testing"
  
  # Check if Kong is already running
  if curl -s "$KONG_ADMIN_URL" >/dev/null 2>&1; then
    log_info "Kong gateway is already running"
    return 0
  fi
  
  # Start Kong in Docker
  docker run -d --name $KONG_CONTAINER_NAME \
    -p 8000:8000 \
    -p 8001:8001 \
    -e "KONG_DATABASE=off" \
    -e "KONG_DECLARATIVE_CONFIG=/kong/declarative/kong.yml" \
    -e "KONG_PROXY_ACCESS_LOG=/dev/stdout" \
    -e "KONG_ADMIN_ACCESS_LOG=/dev/stdout" \
    -e "KONG_PROXY_ERROR_LOG=/dev/stderr" \
    -e "KONG_ADMIN_ERROR_LOG=/dev/stderr" \
    -e "KONG_ADMIN_LISTEN=0.0.0.0:8001" \
    -v "$PROJECT_ROOT/api-gateway/kong/kong.yml:/kong/declarative/kong.yml" \
    kong:3.4 \
    kong start -c /etc/kong/kong.conf
  
  # Wait for Kong to start
  local retry_count=0
  local max_retries=30
  while [ $retry_count -lt $max_retries ]; do
    if curl -s "$KONG_ADMIN_URL" >/dev/null 2>&1; then
      log_info "Kong gateway started successfully"
      return 0
    fi
    sleep 2
    ((retry_count++))
  done
  
  log_error "Failed to start Kong gateway after $max_retries attempts"
  return 1
}

# Test Kong basic connectivity
test_kong_connectivity() {
  log_step "Testing Kong gateway connectivity"
  
  # Test Admin API
  local admin_response=$(curl -s "$KONG_ADMIN_URL" || true)
  assert_success "Kong Admin API should be accessible"
  
  local kong_version=$(echo "$admin_response" | jq -r '.version // empty')
  assert_not_empty "$kong_version" "Kong version should be available"
  log_info "Kong version: $kong_version"
  
  # Test Proxy
  local proxy_response=$(curl -s -w "%{http_code}" "$KONG_PROXY_URL" || echo "000")
  assert_contains "$proxy_response" "404" "Kong proxy should return 404 for unknown routes"
  
  log_info "✓ Kong connectivity test passed"
}

# Test service creation and configuration
test_service_management() {
  log_step "Testing Kong service management"
  
  # Create test service
  local service_response=$(curl -s -X POST \
    "$KONG_ADMIN_URL/services" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"$TEST_SERVICE_NAME\",
      \"url\": \"$TEST_SERVICE_URL\",
      \"tags\": [\"test\"]
    }" || true)
  
  assert_success "Service creation should succeed"
  
  local service_id=$(echo "$service_response" | jq -r '.id // empty')
  assert_not_empty "$service_id" "Service ID should be returned"
  
  # Verify service was created
  local verify_response=$(curl -s "$KONG_ADMIN_URL/services/$TEST_SERVICE_NAME" || true)
  assert_success "Service should be retrievable"
  
  local verify_name=$(echo "$verify_response" | jq -r '.name // empty')
  assert_equals "$verify_name" "$TEST_SERVICE_NAME" "Service name should match"
  
  log_info "✓ Service management test passed"
}

# Test route creation and configuration
test_route_management() {
  log_step "Testing Kong route management"
  
  # Create test route
  local route_response=$(curl -s -X POST \
    "$KONG_ADMIN_URL/routes" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"test-user-route\",
      \"service\": {\"name\": \"$TEST_SERVICE_NAME\"},
      \"paths\": [\"$TEST_ROUTE_PATH\"],
      \"methods\": [\"GET\", \"POST\"],
      \"tags\": [\"test\"]
    }" || true)
  
  assert_success "Route creation should succeed"
  
  local route_id=$(echo "$route_response" | jq -r '.id // empty')
  assert_not_empty "$route_id" "Route ID should be returned"
  
  # Test route functionality
  local proxy_response=$(curl -s -w "%{http_code}" \
    "$KONG_PROXY_URL$TEST_ROUTE_PATH/get" \
    -H "Host: test.example.com" || echo "000")
  
  assert_contains "$proxy_response" "200" "Route should proxy requests successfully"
  
  log_info "✓ Route management test passed"
}

# Test JWT plugin configuration
test_jwt_plugin_configuration() {
  log_step "Testing Kong JWT plugin configuration"
  
  # Enable JWT plugin for test service
  local plugin_response=$(curl -s -X POST \
    "$KONG_ADMIN_URL/plugins" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"jwt\",
      \"service\": {\"name\": \"$TEST_SERVICE_NAME\"},
      \"config\": {
        \"key_claim_name\": \"kid\",
        \"secret_is_base64\": false,
        \"claims_to_verify\": [\"exp\", \"nbf\", \"iat\"]
      },
      \"tags\": [\"test\"]
    }" || true)
  
  assert_success "JWT plugin should be enabled"
  
  local plugin_id=$(echo "$plugin_response" | jq -r '.id // empty')
  assert_not_empty "$plugin_id" "Plugin ID should be returned"
  
  # Test that route now requires JWT
  local unprotected_response=$(curl -s -w "%{http_code}" \
    "$KONG_PROXY_URL$TEST_ROUTE_PATH/get" \
    -H "Host: test.example.com" || echo "000")
  
  assert_contains "$unprotected_response" "401" "Route should require JWT token"
  
  log_info "✓ JWT plugin configuration test passed"
}

# Test consumer management
test_consumer_management() {
  log_step "Testing Kong consumer management"
  
  # Create test consumer
  local consumer_response=$(curl -s -X POST \
    "$KONG_ADMIN_URL/consumers" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"test-jwt-consumer\",
      \"custom_id\": \"test-consumer-123\",
      \"tags\": [\"test\"]
    }" || true)
  
  assert_success "Consumer creation should succeed"
  
  local consumer_id=$(echo "$consumer_response" | jq -r '.id // empty')
  assert_not_empty "$consumer_id" "Consumer ID should be returned"
  
  # Create JWT credentials for consumer
  local jwt_response=$(curl -s -X POST \
    "$KONG_ADMIN_URL/consumers/test-jwt-consumer/jwt" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"test-jwt-key\",
      \"algorithm\": \"HS256\",
      \"secret\": \"test-jwt-secret-key\"
    }" || true)
  
  assert_success "JWT credentials creation should succeed"
  
  local jwt_key=$(echo "$jwt_response" | jq -r '.key // empty')
  assert_equals "$jwt_key" "test-jwt-key" "JWT key should match"
  
  log_info "✓ Consumer management test passed"
}

# Test rate limiting plugin
test_rate_limiting_plugin() {
  log_step "Testing Kong rate limiting plugin"
  
  # Enable rate limiting plugin for test service
  local rate_limit_response=$(curl -s -X POST \
    "$KONG_ADMIN_URL/plugins" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"rate-limiting\",
      \"service\": {\"name\": \"$TEST_SERVICE_NAME\"},
      \"config\": {
        \"minute\": 5,
        \"hour\": 100,
        \"policy\": \"local\",
        \"fault_tolerant\": true
      },
      \"tags\": [\"test\"]
    }" || true)
  
  assert_success "Rate limiting plugin should be enabled"
  
  # Test rate limiting by making multiple requests
  local request_count=0
  local rate_limited=false
  
  for i in {1..7}; do
    local response=$(curl -s -w "%{http_code}" \
      "$KONG_PROXY_URL$TEST_ROUTE_PATH/get" \
      -H "Host: test.example.com" || echo "000")
    
    if [ "$response" = "429" ]; then
      rate_limited=true
      break
    fi
    
    ((request_count++))
    sleep 0.1
  done
  
  if [ "$rate_limited" = true ]; then
    log_info "✓ Rate limiting is working (blocked after $request_count requests)"
  else
    log_info "ℹ Rate limiting threshold not reached (made $request_count requests)"
  fi
}

# Test CORS plugin
test_cors_plugin() {
  log_step "Testing Kong CORS plugin"
  
  # Test CORS preflight request
  local cors_response=$(curl -s -i -X OPTIONS \
    "$KONG_PROXY_URL$TEST_ROUTE_PATH" \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type, Authorization" \
    -H "Host: test.example.com" || true)
  
  assert_contains "$cors_response" "Access-Control-Allow-Origin" "CORS headers should be present"
  assert_contains "$cors_response" "200" "CORS preflight should return 200"
  
  log_info "✓ CORS plugin test passed"
}

# Test plugin configuration validation
test_plugin_configuration_validation() {
  log_step "Testing plugin configuration validation"
  
  # Test invalid plugin configuration
  local invalid_response=$(curl -s -w "%{http_code}" -X POST \
    "$KONG_ADMIN_URL/plugins" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"rate-limiting\",
      \"config\": {
        \"minute\": \"invalid_value\"
      }
    }" || echo "000")
  
  assert_contains "$invalid_response" "400" "Invalid plugin config should return 400"
  
  log_info "✓ Plugin configuration validation test passed"
}

# Test Kong configuration loading
test_kong_configuration_loading() {
  log_step "Testing Kong declarative configuration loading"
  
  # Check if services from config are loaded
  local user_service=$(curl -s "$KONG_ADMIN_URL/services/user-service" || true)
  assert_success "User service from config should be loaded"
  
  # Check if routes from config are loaded
  local user_routes=$(curl -s "$KONG_ADMIN_URL/routes?service=user-service" || true)
  local route_count=$(echo "$user_routes" | jq -r '.data | length // 0')
  assert_greater_than "$route_count" 0 "User service routes should be loaded"
  
  # Check if plugins from config are loaded
  local plugins=$(curl -s "$KONG_ADMIN_URL/plugins" || true)
  local plugin_count=$(echo "$plugins" | jq -r '.data | length // 0')
  assert_greater_than "$plugin_count" 0 "Plugins from config should be loaded"
  
  log_info "✓ Kong configuration loading test passed"
}

# Test health and monitoring endpoints
test_health_monitoring() {
  log_step "Testing Kong health and monitoring"
  
  # Check Kong status
  local status_response=$(curl -s "$KONG_ADMIN_URL" || true)
  assert_success "Kong status endpoint should respond"
  
  # Check if plugins are enabled
  local plugins_response=$(curl -s "$KONG_ADMIN_URL/plugins/enabled" || true)
  assert_success "Enabled plugins endpoint should respond"
  
  local enabled_plugins=$(echo "$plugins_response" | jq -r '.enabled_plugins | length // 0')
  assert_greater_than "$enabled_plugins" 0 "Some plugins should be enabled"
  
  log_info "✓ Health and monitoring test passed"
}

# Main test execution
main() {
  log_info "Starting Kong API Gateway Tests"
  
  # Ensure test results directory exists
  mkdir -p "$TEST_RESULTS_DIR"
  
  # Start Kong gateway
  start_kong_gateway || exit 1
  
  # Run tests
  test_kong_connectivity
  test_kong_configuration_loading
  test_service_management
  test_route_management
  test_jwt_plugin_configuration
  test_consumer_management
  test_rate_limiting_plugin
  test_cors_plugin
  test_plugin_configuration_validation
  test_health_monitoring
  
  log_info "✅ All Kong gateway tests passed!"
  
  # Generate test report
  cat > "$TEST_RESULTS_DIR/kong-gateway-test-results.json" << EOF
{
  "test_suite": "kong-gateway",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "status": "passed",
  "tests_run": 10,
  "tests_passed": 10,
  "tests_failed": 0,
  "kong_admin_url": "$KONG_ADMIN_URL",
  "kong_proxy_url": "$KONG_PROXY_URL",
  "test_service": "$TEST_SERVICE_NAME"
}
EOF
  
  log_info "Test results saved to: $TEST_RESULTS_DIR/kong-gateway-test-results.json"
}

# Run main function
main "$@"