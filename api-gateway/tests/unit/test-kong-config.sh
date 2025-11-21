#!/usr/bin/env bash
# tests/unit/test-kong-config.sh
# Unit tests for Kong API Gateway configuration

set -euo pipefail

# Source test utilities
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/../test-setup.sh"

# Test configuration file paths
KONG_CONFIG_DIR=$(cd "$SCRIPT_DIR/../../kong" && pwd)
KONG_CONFIG_FILE="$KONG_CONFIG_DIR/kong.yml"
TEST_RESULTS_FILE="$GATEWAY_ROOT/.test-data/kong-config-test-results.txt"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Run a single test case
run_test() {
    local test_name=$1
    local test_command=$2
    
    ((TOTAL_TESTS++))
    
    echo -n "Testing: $test_name ... "
    
    if eval "$test_command" >/dev/null 2>&1; then
        echo "PASS"
        ((PASSED_TESTS++))
        echo "PASS: $test_name" >> "$TEST_RESULTS_FILE"
    else
        echo "FAIL"
        ((FAILED_TESTS++))
        echo "FAIL: $test_name" >> "$TEST_RESULTS_FILE"
        echo "Command failed: $test_command" >> "$TEST_RESULTS_FILE"
    fi
}

# Test Kong configuration file structure
test_kong_config_structure() {
    log_info "Testing Kong configuration file structure..."
    
    # Test if configuration file exists
    run_test "Kong config file exists" "[[ -f '$KONG_CONFIG_FILE' ]]"
    
    # Test YAML syntax
    if command -v yamllint >/dev/null 2>&1; then
        run_test "YAML syntax validation" "yamllint '$KONG_CONFIG_FILE'"
    else
        run_test "Basic YAML structure" "grep -q '_format_version.*3.0' '$KONG_CONFIG_FILE'"
    fi
    
    # Test required sections
    run_test "Services section exists" "grep -q '^services:' '$KONG_CONFIG_FILE'"
    run_test "Routes section exists" "grep -q '^routes:' '$KONG_CONFIG_FILE'"
    run_test "Plugins section exists" "grep -q '^plugins:' '$KONG_CONFIG_FILE'"
    run_test "Consumers section exists" "grep -q '^consumers:' '$KONG_CONFIG_FILE'"
    run_test "Upstreams section exists" "grep -q '^upstreams:' '$KONG_CONFIG_FILE'"
}

# Test service configurations
test_service_configs() {
    log_info "Testing service configurations..."
    
    # Test user service
    run_test "User service configured" "grep -q 'name: user-service' '$KONG_CONFIG_FILE'"
    run_test "User service URL configured" "grep -q 'url: http://user-api:3000' '$KONG_CONFIG_FILE'"
    run_test "User service timeouts configured" "grep -q 'connect_timeout: 60000' '$KONG_CONFIG_FILE'"
    
    # Test order service
    run_test "Order service configured" "grep -q 'name: order-service' '$KONG_CONFIG_FILE'"
    run_test "Order service URL configured" "grep -q 'url: http://order-api:4000' '$KONG_CONFIG_FILE'"
    
    # Test payment service
    run_test "Payment service configured" "grep -q 'name: payment-service' '$KONG_CONFIG_FILE'"
    run_test "Payment service uses HTTPS" "grep -q 'protocol: https' '$KONG_CONFIG_FILE'"
    run_test "Payment service has client certificate" "grep -q 'client_certificate:' '$KONG_CONFIG_FILE'"
    
    # Test notification service
    run_test "Notification service configured" "grep -q 'name: notification-service' '$KONG_CONFIG_FILE'"
}

# Test route configurations
test_route_configs() {
    log_info "Testing route configurations..."
    
    # Test user routes
    run_test "User routes configured" "grep -q 'name: user-routes' '$KONG_CONFIG_FILE'"
    run_test "User service routes include users endpoint" "grep -q '/api/v1/users' '$KONG_CONFIG_FILE'"
    run_test "User service routes include profiles endpoint" "grep -q '/api/v1/profiles' '$KONG_CONFIG_FILE'"
    run_test "User service routes include auth endpoint" "grep -q '/api/v1/auth' '$KONG_CONFIG_FILE'"
    
    # Test order routes
    run_test "Order routes configured" "grep -q 'name: order-routes' '$KONG_CONFIG_FILE'"
    run_test "Order service routes include orders endpoint" "grep -q '/api/v1/orders' '$KONG_CONFIG_FILE'"
    run_test "Order service routes include cart endpoint" "grep -q '/api/v1/cart' '$KONG_CONFIG_FILE'"
    run_test "Order routes require HTTPS" "grep -q 'protocols:' -A 5 '$KONG_CONFIG_FILE' | grep -q 'https'"
    
    # Test payment routes
    run_test "Payment routes configured" "grep -q 'name: payment-routes' '$KONG_CONFIG_FILE'"
    run_test "Payment routes include payments endpoint" "grep -q '/api/v1/payments' '$KONG_CONFIG_FILE'"
    run_test "Payment routes include billing endpoint" "grep -q '/api/v1/billing' '$KONG_CONFIG_FILE'"
    
    # Test health check routes
    run_test "Health check routes configured" "grep -q 'name: health-check' '$KONG_CONFIG_FILE'"
    run_test "Health endpoint configured" "grep -q '/health' '$KONG_CONFIG_FILE'"
}

# Test plugin configurations
test_plugin_configs() {
    log_info "Testing plugin configurations..."
    
    # Test global plugins
    run_test "Rate limiting plugin configured" "grep -q 'name: rate-limiting' '$KONG_CONFIG_FILE'"
    run_test "CORS plugin configured" "grep -q 'name: cors' '$KONG_CONFIG_FILE'"
    run_test "Request ID plugin configured" "grep -q 'name: request-id' '$KONG_CONFIG_FILE'"
    run_test "Prometheus metrics plugin configured" "grep -q 'name: prometheus' '$KONG_CONFIG_FILE'"
    
    # Test authentication plugins
    run_test "JWT plugin configured" "grep -q 'name: jwt' '$KONG_CONFIG_FILE'"
    run_test "OAuth2 plugin configured" "grep -q 'name: oauth2' '$KONG_CONFIG_FILE'"
    
    # Test security plugins
    run_test "IP restriction plugin configured" "grep -q 'name: ip-restriction' '$KONG_CONFIG_FILE'"
    run_test "ACL plugin configured" "grep -q 'name: acl' '$KONG_CONFIG_FILE'"
    run_test "Request size limiting plugin configured" "grep -q 'name: request-size-limiting' '$KONG_CONFIG_FILE'"
    
    # Test performance plugins
    run_test "Proxy cache plugin configured" "grep -q 'name: proxy-cache' '$KONG_CONFIG_FILE'"
    run_test "Request transformer plugin configured" "grep -q 'name: request-transformer' '$KONG_CONFIG_FILE'"
    run_test "Response transformer plugin configured" "grep -q 'name: response-transformer' '$KONG_CONFIG_FILE'"
}

# Test consumer configurations
test_consumer_configs() {
    log_info "Testing consumer configurations..."
    
    # Test mobile app consumer
    run_test "Mobile app consumer configured" "grep -q 'username: mobile-app' '$KONG_CONFIG_FILE'"
    run_test "Mobile app has JWT secrets" "grep -q 'jwt_secrets:' '$KONG_CONFIG_FILE'"
    run_test "Mobile app has rate limiting quota" "grep -q 'rate_limiting_quota:' '$KONG_CONFIG_FILE'"
    
    # Test web app consumer
    run_test "Web app consumer configured" "grep -q 'username: web-app' '$KONG_CONFIG_FILE'"
    run_test "Web app has API key credentials" "grep -q 'keyauth_credentials:' '$KONG_CONFIG_FILE'"
    
    # Test partner API consumer
    run_test "Partner API consumer configured" "grep -q 'username: partner-api' '$KONG_CONFIG_FILE'"
    run_test "Partner API has OAuth2 credentials" "grep -q 'oauth2_credentials:' '$KONG_CONFIG_FILE'"
    
    # Test internal service consumer
    run_test "Internal service consumer configured" "grep -q 'username: internal-service' '$KONG_CONFIG_FILE'"
    run_test "Internal service has HMAC credentials" "grep -q 'hmacauth_credentials:' '$KONG_CONFIG_FILE'"
}

# Test upstream configurations
test_upstream_configs() {
    log_info "Testing upstream configurations..."
    
    # Test user service upstream
    run_test "User service upstream configured" "grep -q 'name: user-service-upstream' '$KONG_CONFIG_FILE'"
    run_test "User service uses round-robin algorithm" "grep -q 'algorithm: round-robin' '$KONG_CONFIG_FILE'"
    run_test "User service has health checks" "grep -q 'healthchecks:' '$KONG_CONFIG_FILE'"
    
    # Test order service upstream
    run_test "Order service upstream configured" "grep -q 'name: order-service-upstream' '$KONG_CONFIG_FILE'"
    run_test "Order service uses least-connections algorithm" "grep -q 'algorithm: least-connections' '$KONG_CONFIG_FILE'"
    
    # Test payment service upstream
    run_test "Payment service upstream configured" "grep -q 'name: payment-service-upstream' '$KONG_CONFIG_FILE'"
    run_test "Payment service uses consistent-hashing algorithm" "grep -q 'algorithm: consistent-hashing' '$KONG_CONFIG_FILE'"
}

# Test target configurations
test_target_configs() {
    log_info "Testing target configurations..."
    
    # Test user service targets
    run_test "User service target 1 configured" "grep -q 'user-api-1:3000' '$KONG_CONFIG_FILE'"
    run_test "User service target 2 configured" "grep -q 'user-api-2:3000' '$KONG_CONFIG_FILE'"
    run_test "User service backup target configured" "grep -q 'user-api-3:3000' '$KONG_CONFIG_FILE'"
    
    # Test order service targets
    run_test "Order service target 1 configured" "grep -q 'order-api-1:4000' '$KONG_CONFIG_FILE'"
    run_test "Order service target 2 configured" "grep -q 'order-api-2:4000' '$KONG_CONFIG_FILE'"
    
    # Test payment service targets
    run_test "Payment service target 1 configured" "grep -q 'payment-api-1:5000' '$KONG_CONFIG_FILE'"
    run_test "Payment service target 2 configured" "grep -q 'payment-api-2:5000' '$KONG_CONFIG_FILE'"
}

# Test certificate configurations
test_certificate_configs() {
    log_info "Testing certificate configurations..."
    
    # Test certificates are configured
    run_test "Certificates section exists" "grep -q '^certificates:' '$KONG_CONFIG_FILE'"
    run_test "API gateway certificate configured" "grep -q 'API_GATEWAY_CERT' '$KONG_CONFIG_FILE'"
    run_test "Wildcard certificate configured" "grep -q 'WILDCARD_CERT' '$KONG_CONFIG_FILE'"
    run_test "SNI configurations exist" "grep -q 'snis:' '$KONG_CONFIG_FILE'"
}

# Test security configurations
test_security_configs() {
    log_info "Testing security configurations..."
    
    # Test CORS origins
    run_test "CORS origins configured" "grep -q 'origins:' '$KONG_CONFIG_FILE'"
    run_test "App example.com in CORS origins" "grep -q 'https://app.example.com' '$KONG_CONFIG_FILE'"
    
    # Test rate limiting
    run_test "Rate limiting minute limit configured" "grep -q 'minute: 100' '$KONG_CONFIG_FILE'"
    run_test "Rate limiting hour limit configured" "grep -q 'hour: 10000' '$KONG_CONFIG_FILE'"
    run_test "Rate limiting day limit configured" "grep -q 'day: 100000' '$KONG_CONFIG_FILE'"
    
    # Test IP restrictions
    run_test "Internal IP ranges allowed" "grep -q '10.0.0.0/8' '$KONG_CONFIG_FILE'"
    run_test "Private IP ranges allowed" "grep -q '192.168.0.0/16' '$KONG_CONFIG_FILE'"
    
    # Test JWT configurations
    run_test "JWT key claim configured" "grep -q 'key_claim_name: kid' '$KONG_CONFIG_FILE'"
    run_test "JWT expiration claims configured" "grep -q 'claims_to_verify:' '$KONG_CONFIG_FILE'"
}

# Main test execution
main() {
    log_info "Starting Kong configuration unit tests..."
    
    # Initialize test results file
    cat /dev/null > "$TEST_RESULTS_FILE"
    echo "Kong Configuration Test Results - $(date)" > "$TEST_RESULTS_FILE"
    echo "=========================================" >> "$TEST_RESULTS_FILE"
    echo "" >> "$TEST_RESULTS_FILE"
    
    # Run all test suites
    test_kong_config_structure
    test_service_configs
    test_route_configs
    test_plugin_configs
    test_consumer_configs
    test_upstream_configs
    test_target_configs
    test_certificate_configs
    test_security_configs
    
    # Generate test report
    echo "" >> "$TEST_RESULTS_FILE"
    echo "Test Summary:" >> "$TEST_RESULTS_FILE"
    echo "Total Tests: $TOTAL_TESTS" >> "$TEST_RESULTS_FILE"
    echo "Passed: $PASSED_TESTS" >> "$TEST_RESULTS_FILE"
    echo "Failed: $FAILED_TESTS" >> "$TEST_RESULTS_FILE"
    
    generate_test_report "kong-config" "$TOTAL_TESTS" "$PASSED_TESTS" "$FAILED_TESTS"
    
    log_info "Kong configuration tests completed"
    echo "Results saved to: $TEST_RESULTS_FILE"
    
    return $FAILED_TESTS
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi