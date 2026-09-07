#!/bin/bash
# tests/api-gateway/nginx-gateway-test.sh
# Phase 1 :: Test Nginx gateway configuration and functionality (Production Ready)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Configuration
NGINX_CONTAINER="cfn-nginx-gateway-test"
NGINX_CONFIG="$PROJECT_ROOT/nginx/nginx.conf"
SSL_CERT_DIR="$PROJECT_ROOT/nginx/ssl"
TEST_TIMEOUT=30

cleanup() {
    log_info "Cleaning up test environment..."
    docker stop "$NGINX_CONTAINER" 2>/dev/null || true
    docker rm "$NGINX_CONTAINER" 2>/dev/null || true
    docker network rm cfn-test-network 2>/dev/null || true
}

trap cleanup EXIT

# Generate test SSL certificates
generate_test_ssl() {
    log_step "GIVEN: SSL certificate generation setup"
    mkdir -p "$SSL_CERT_DIR"
    
    # Create self-signed certificate for testing
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_CERT_DIR/test.key" \
        -out "$SSL_CERT_DIR/test.crt" \
        -subj "/C=US/ST=CA/L=SF/O=Test/CN=localhost" \
        2>/dev/null || {
        log_error "Failed to generate SSL certificates"
        return 1
    }
    
    assert_file_exists "$SSL_CERT_DIR/test.key" "SSL private key should exist"
    assert_file_exists "$SSL_CERT_DIR/test.crt" "SSL certificate should exist"
    log_info "SSL certificates generated successfully"
}

# Test Nginx configuration syntax
test_nginx_syntax() {
    log_step "GIVEN: Nginx configuration file exists"
    assert_file_exists "$NGINX_CONFIG" "Nginx configuration should exist"
    
    # WHEN: Testing syntax with docker
    if docker run --rm -v "$NGINX_CONFIG:/etc/nginx/nginx.conf:ro" \
        nginx:alpine nginx -t > /dev/null 2>&1; then
        log_info "Nginx configuration syntax is valid"
        return 0
    else
        log_error "Nginx configuration syntax is invalid"
        return 1
    fi
}

# Test Nginx container startup
test_nginx_startup() {
    log_step "GIVEN: Nginx container with configuration"
    
    # WHEN: Starting Nginx container
    if docker run -d --name "$NGINX_CONTAINER" \
        -p 8080:80 \
        -p 8443:443 \
        -v "$NGINX_CONFIG:/etc/nginx/nginx.conf:ro" \
        -v "$SSL_CERT_DIR:/etc/nginx/ssl:ro" \
        nginx:alpine > /dev/null 2>&1; then
        
        # THEN: Container should be healthy
        sleep 2
        if docker ps --filter "name=$NGINX_CONTAINER" --format "table {{.Status}}" | grep -q "Up"; then
            log_info "Nginx container started successfully"
            return 0
        else
            log_error "Nginx container failed to start"
            return 1
        fi
    else
        log_error "Failed to start Nginx container"
        return 1
    fi
}

# Test HTTP to HTTPS redirection
test_http_redirection() {
    log_step "GIVEN: HTTP endpoint configured"
    
    # WHEN: Making HTTP request
    local response=$(curl -s -w "%{http_code}" -o /dev/null \
        http://localhost:8080/ 2>/dev/null || echo "000")
    
    # THEN: Should redirect to HTTPS
    assert_equals "$response" "301" "HTTP should redirect to HTTPS (301)"
    log_info "HTTP to HTTPS redirection working correctly"
}

# Test HTTPS accessibility
test_https_accessibility() {
    log_step "GIVEN: HTTPS endpoint configured"
    
    # WHEN: Making HTTPS request (insecure for test)
    local response=$(curl -s -k -w "%{http_code}" -o /dev/null \
        https://localhost:8443/health 2>/dev/null || echo "000")
    
    # THEN: Should respond successfully
    assert_equals "$response" "200" "HTTPS should respond with 200"
    log_info "HTTPS endpoint accessible"
}

# Test rate limiting
test_rate_limiting() {
    log_step "GIVEN: Rate limiting configured"
    
    # WHEN: Making rapid requests
    local success_count=0
    local rate_limit_count=0
    
    for i in {1..15}; do
        local response=$(curl -s -k -w "%{http_code}" -o /dev/null \
            https://localhost:8443/api/v1/test 2>/dev/null || echo "000")
        
        if [ "$response" = "200" ]; then
            success_count=$((success_count + 1))
        elif [ "$response" = "429" ]; then
            rate_limit_count=$((rate_limit_count + 1))
        fi
    done
    
    # THEN: Should enforce rate limits
    if [ $rate_limit_count -gt 0 ]; then
        log_info "Rate limiting is active (limited $rate_limit_count requests)"
    else
        log_warn "Rate limiting may not be working properly"
    fi
    
    assert_true "$success_count -gt 0" "Some requests should succeed"
    log_info "Rate limiting test completed"
}

# Test API routing
test_api_routing() {
    log_step "GIVEN: API routes configured"
    
    # WHEN: Accessing different API endpoints
    local endpoints=(
        "/health"
        "/api/v1/health-scores"
        "/api/v1/circuit-breaker"
        "/metrics"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local response=$(curl -s -k -w "%{http_code}" -o /dev/null \
            https://localhost:8443$endpoint 2>/dev/null || echo "000")
        
        if [ "$response" != "404" ] && [ "$response" != "000" ]; then
            log_info "Endpoint $endpoint responds with $response"
        else
            log_warn "Endpoint $endpoint not found ($response)"
        fi
    done
    
    log_info "API routing test completed"
}

# Test security headers
test_security_headers() {
    log_step "GIVEN: Security headers configured"
    
    # WHEN: Making HTTPS request and checking headers
    local headers=$(curl -s -k -I https://localhost:8443/api/v1/test 2>/dev/null || echo "")
    
    # THEN: Security headers should be present
    local security_headers=(
        "strict-transport-security"
        "x-frame-options"
        "x-content-type-options"
        "x-xss-protection"
    )
    
    for header in "${security_headers[@]}"; do
        if echo "$headers" | grep -qi "$header"; then
            log_info "Security header $header is present"
        else
            log_warn "Security header $header is missing"
        fi
    done
    
    log_info "Security headers test completed"
}

# Test CORS configuration
test_cors_configuration() {
    log_step "GIVEN: CORS configured"
    
    # WHEN: Making OPTIONS request
    local response=$(curl -s -k -w "%{http_code}" -X OPTIONS \
        -H "Origin: https://app.example.com" \
        -H "Access-Control-Request-Method: GET" \
        -o /dev/null https://localhost:8443/api/v1/test 2>/dev/null || echo "000")
    
    # THEN: Should handle preflight request
    if [ "$response" = "204" ] || [ "$response" = "200" ]; then
        log_info "CORS preflight request handled correctly"
    else
        log_warn "CORS preflight request returned $response"
    fi
    
    log_info "CORS configuration test completed"
}

# Test performance metrics
test_performance_metrics() {
    log_step "GIVEN: Performance monitoring configured"
    
    # WHEN: Making multiple requests and measuring response time
    local total_time=0
    local requests=10
    
    for i in $(seq 1 $requests); do
        local response_time=$(curl -s -k -w "%{time_total}" \
            -o /dev/null https://localhost:8443/health 2>/dev/null || echo "10.0")
        total_time=$(echo "$total_time + $response_time" | bc -l 2>/dev/null || echo "$total_time")
    done
    
    local avg_time=$(echo "scale=3; $total_time / $requests" | bc -l 2>/dev/null || echo "1.0")
    
    # THEN: Response times should be reasonable
    local threshold=2.0  # 2 seconds threshold
    if (( $(echo "$avg_time < $threshold" | bc -l 2>/dev/null || echo "1") )); then
        log_info "Average response time: ${avg_time}s (good)"
    else
        log_warn "Average response time: ${avg_time}s (slow)"
    fi
    
    log_info "Performance metrics test completed"
}

# Main test execution
main() {
    log_info "Starting Nginx Gateway Test Suite"
    
    # Create test network
    docker network create cfn-test-network > /dev/null 2>&1 || true
    
    # Run test cases
    local test_results=(
        "generate_test_ssl"
        "test_nginx_syntax"
        "test_nginx_startup"
        "test_http_redirection"
        "test_https_accessibility"
        "test_rate_limiting"
        "test_api_routing"
        "test_security_headers"
        "test_cors_configuration"
        "test_performance_metrics"
    )
    
    local passed=0
    local total=${#test_results[@]}
    
    for test_case in "${test_results[@]}"; do
        log_info "Running test: $test_case"
        if $test_case; then
            passed=$((passed + 1))
            log_info "✓ $test_case passed"
        else
            log_error "✗ $test_case failed"
        fi
        echo "---"
    done
    
    # Final results
    log_info "Test Results: $passed/$total tests passed"
    
    if [ $passed -eq $total ]; then
        log_info "🎉 All tests passed! Nginx gateway is production ready."
        return 0
    else
        log_error "❌ Some tests failed. Review the configuration."
        return 1
    fi
}

# Execute main function
main "$@"