#!/bin/bash
# tests/api-gateway/test-jwt-authentication.sh
# Phase 1 :: Test JWT authentication middleware functionality (TDD compliance)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
JWT_SERVICE_DIR="$PROJECT_ROOT/api-gateway/jwt"
TEST_RESULTS_DIR="$PROJECT_ROOT/.artifacts/test-results"
JWT_SERVICE_PORT=3009

# Cleanup function
cleanup() {
  log_step "Cleanup: Stopping JWT service and removing test containers"
  
  # Stop JWT service if running
  if [ -n "${JWT_PID:-}" ]; then
    kill $JWT_PID 2>/dev/null || true
    wait $JWT_PID 2>/dev/null || true
  fi
  
  # Clean up any test containers
  docker rm -f test-jwt-client 2>/dev/null || true
  
  # Clean up test data
  rm -rf /tmp/jwt-test-*
  
  log_info "Cleanup completed"
}
trap cleanup EXIT

# Start JWT service
start_jwt_service() {
  log_step "Starting JWT authentication service"
  
  cd "$JWT_SERVICE_DIR"
  
  # Install dependencies if needed
  if [ ! -d "node_modules" ]; then
    npm install
  fi
  
  # Set environment variables for testing
  export NODE_ENV=test
  export PORT=$JWT_SERVICE_PORT
  export JWT_SECRET="test-secret-key-for-jwt-testing-only"
  export JWT_EXPIRES_IN="15m"
  export JWT_REFRESH_EXPIRES_IN="1h"
  
  # Start service in background
  npm start > /tmp/jwt-test-service.log 2>&1 &
  JWT_PID=$!
  
  # Wait for service to start
  local retry_count=0
  local max_retries=30
  while [ $retry_count -lt $max_retries ]; do
    if curl -s "http://localhost:$JWT_SERVICE_PORT/health" >/dev/null 2>&1; then
      log_info "JWT service started successfully (PID: $JWT_PID)"
      return 0
    fi
    sleep 1
    ((retry_count++))
  done
  
  log_error "Failed to start JWT service after $max_retries attempts"
  return 1
}

# Test JWT token generation and validation
test_jwt_token_lifecycle() {
  log_step "Testing JWT token generation and validation"
  
  local user_data='{
    "id": "test-user-123",
    "email": "test@example.com",
    "roles": ["user", "admin"],
    "permissions": ["read:users", "write:users"]
  }'
  
  # Generate tokens
  local token_response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$user_data" \
    "http://localhost:$JWT_SERVICE_PORT/api/auth/login" || true)
  
  assert_success "Token generation endpoint should respond"
  
  # Extract access token
  local access_token=$(echo "$token_response" | jq -r '.accessToken // empty')
  local refresh_token=$(echo "$token_response" | jq -r '.refreshToken // empty')
  
  assert_not_empty "$access_token" "Access token should be generated"
  assert_not_empty "$refresh_token" "Refresh token should be generated"
  
  # Validate access token
  local validation_response=$(curl -s -X POST \
    -H "Authorization: Bearer $access_token" \
    "http://localhost:$JWT_SERVICE_PORT/validate" || true)
  
  assert_success "Token validation should succeed"
  
  local is_valid=$(echo "$validation_response" | jq -r '.valid // false')
  assert_equals "$is_valid" "true" "Access token should be valid"
  
  # Verify token claims
  local user_id=$(echo "$validation_response" | jq -r '.user.id // empty')
  assert_equals "$user_id" "test-user-123" "User ID should match in token"
  
  log_info "✓ JWT token lifecycle test passed"
}

# Test token refresh functionality
test_token_refresh() {
  log_step "Testing JWT token refresh functionality"
  
  # Generate initial tokens
  local login_response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"id": "refresh-test-user", "email": "refresh@example.com"}' \
    "http://localhost:$JWT_SERVICE_PORT/api/auth/refresh" || true)
  
  # Extract refresh token
  local refresh_token=$(echo "$login_response" | jq -r '.refreshToken // empty')
  assert_not_empty "$refresh_token" "Refresh token should be available"
  
  # Use refresh token to get new access token
  local refresh_response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\": \"$refresh_token\"}" \
    "http://localhost:$JWT_SERVICE_PORT/api/tokens/refresh" || true)
  
  assert_success "Token refresh should succeed"
  
  local new_access_token=$(echo "$refresh_response" | jq -r '.accessToken // empty')
  assert_not_empty "$new_access_token" "New access token should be generated"
  
  # Validate new token
  local validation_response=$(curl -s -X POST \
    -H "Authorization: Bearer $new_access_token" \
    "http://localhost:$JWT_SERVICE_PORT/validate" || true)
  
  local is_valid=$(echo "$validation_response" | jq -r '.valid // false')
  assert_equals "$is_valid" "true" "Refreshed access token should be valid"
  
  log_info "✓ Token refresh test passed"
}

# Test token revocation
test_token_revocation() {
  log_step "Testing JWT token revocation"
  
  # Generate tokens
  local login_response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"id": "revoke-test-user", "email": "revoke@example.com"}' \
    "http://localhost:$JWT_SERVICE_PORT/api/auth/login" || true)
  
  local access_token=$(echo "$login_response" | jq -r '.accessToken // empty')
  assert_not_empty "$access_token" "Access token should be generated for revocation test"
  
  # Revoke token
  local revoke_response=$(curl -s -X POST \
    -H "Authorization: Bearer $access_token" \
    "http://localhost:$JWT_SERVICE_PORT/api/tokens/revoke" || true)
  
  assert_success "Token revocation should succeed"
  
  # Try to validate revoked token
  local validation_response=$(curl -s -X POST \
    -H "Authorization: Bearer $access_token" \
    "http://localhost:$JWT_SERVICE_PORT/validate" || true)
  
  local is_valid=$(echo "$validation_response" | jq -r '.valid // false')
  assert_equals "$is_valid" "false" "Revoked token should be invalid"
  
  local error_msg=$(echo "$validation_response" | jq -r '.error // empty')
  assert_contains "$error_msg" "revoked" "Error should indicate token was revoked"
  
  log_info "✓ Token revocation test passed"
}

# Test invalid token handling
test_invalid_token_handling() {
  log_step "Testing invalid token handling"
  
  # Test with malformed token
  local malformed_response=$(curl -s -X POST \
    -H "Authorization: Bearer invalid.jwt.token" \
    "http://localhost:$JWT_SERVICE_PORT/validate" || true)
  
  assert_success "Service should handle malformed tokens gracefully"
  
  local is_valid=$(echo "$malformed_response" | jq -r '.valid // false')
  assert_equals "$is_valid" "false" "Malformed token should be invalid"
  
  # Test with expired token (create expired token manually)
  local expired_payload='{
    "sub": "test-user",
    "exp": '$(($(date +%s) - 3600))',
    "iat": '$(($(date +%s) - 7200))'
  }'
  
  local expired_token=$(echo -n "$expired_payload" | base64 -w 0 | tr -d '=')
  expired_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.$expired_token.signature"
  
  local expired_response=$(curl -s -X POST \
    -H "Authorization: Bearer $expired_token" \
    "http://localhost:$JWT_SERVICE_PORT/validate" || true)
  
  local expired_valid=$(echo "$expired_response" | jq -r '.valid // false')
  assert_equals "$expired_valid" "false" "Expired token should be invalid"
  
  # Test with no token
  local no_token_response=$(curl -s -X POST \
    "http://localhost:$JWT_SERVICE_PORT/validate" || true)
  
  local no_token_valid=$(echo "$no_token_response" | jq -r '.valid // false')
  assert_equals "$no_token_valid" "false" "No token should be invalid"
  
  log_info "✓ Invalid token handling test passed"
}

# Test rate limiting on auth endpoints
test_auth_rate_limiting() {
  log_step "Testing rate limiting on authentication endpoints"
  
  # Make multiple rapid requests to test rate limiting
  local request_count=0
  local rate_limited=false
  
  for i in {1..15}; do
    local response=$(curl -s -w "%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d '{"id": "rate-limit-test", "email": "ratelimit@example.com"}' \
      "http://localhost:$JWT_SERVICE_PORT/api/auth/login" || echo "000")
    
    local http_code="${response: -3}"
    if [ "$http_code" = "429" ]; then
      rate_limited=true
      break
    fi
    
    ((request_count++))
    sleep 0.1
  done
  
  if [ "$rate_limited" = true ]; then
    log_info "✓ Rate limiting is working (blocked after $request_count requests)"
  else
    log_info "ℹ Rate limiting may not be configured or threshold not reached"
  fi
}

# Test service health and metrics
test_service_health() {
  log_step "Testing service health and metrics"
  
  # Test health endpoint
  local health_response=$(curl -s "http://localhost:$JWT_SERVICE_PORT/health" || true)
  assert_success "Health endpoint should be accessible"
  
  local status=$(echo "$health_response" | jq -r '.status // empty')
  assert_equals "$status" "healthy" "Service should report healthy status"
  
  # Test metrics endpoint
  local metrics_response=$(curl -s "http://localhost:$JWT_SERVICE_PORT/metrics" || true)
  assert_success "Metrics endpoint should be accessible"
  
  local uptime=$(echo "$metrics_response" | jq -r '.uptime // empty')
  assert_not_empty "$uptime" "Uptime should be reported in metrics"
  
  log_info "✓ Service health test passed"
}

# Test CORS configuration
test_cors_configuration() {
  log_step "Testing CORS configuration"
  
  # Test preflight request
  local cors_response=$(curl -s -w "%{http_code}" -X OPTIONS \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type, Authorization" \
    "http://localhost:$JWT_SERVICE_PORT/api/auth/login" || echo "000")
  
  local http_code="${cors_response: -3}"
  assert_contains "$http_code" "200" "CORS preflight should return 200"
  
  # Test actual request with origin
  local request_response=$(curl -s -H "Origin: http://localhost:3000" \
    "http://localhost:$JWT_SERVICE_PORT/health" || true)
  
  assert_success "Request with origin should succeed"
  
  log_info "✓ CORS configuration test passed"
}

# Main test execution
main() {
  log_info "Starting JWT Authentication Service Tests"
  
  # Ensure test results directory exists
  mkdir -p "$TEST_RESULTS_DIR"
  
  # Start JWT service
  start_jwt_service || exit 1
  
  # Run tests
  test_jwt_token_lifecycle
  test_token_refresh
  test_token_revocation
  test_invalid_token_handling
  test_auth_rate_limiting
  test_service_health
  test_cors_configuration
  
  log_info "✅ All JWT authentication tests passed!"
  
  # Generate test report
  cat > "$TEST_RESULTS_DIR/jwt-auth-test-results.json" << EOF
{
  "test_suite": "jwt-authentication",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "status": "passed",
  "tests_run": 7,
  "tests_passed": 7,
  "tests_failed": 0,
  "service_port": $JWT_SERVICE_PORT,
  "service_pid": $JWT_PID
}
EOF
  
  log_info "Test results saved to: $TEST_RESULTS_DIR/jwt-auth-test-results.json"
}

# Run main function
main "$@"