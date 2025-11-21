#!/usr/bin/env bash
# tests/unit/test-nginx-config.sh
# Unit tests for Nginx reverse proxy configuration

set -euo pipefail

# Source test utilities
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/../test-setup.sh"

# Test configuration
NGINX_CONFIG_DIR=$(cd "$SCRIPT_DIR/../../nginx" && pwd)
NGINX_CONFIG_FILE="$NGINX_CONFIG_DIR/nginx.conf"
NGINX_TEST_RESULTS="$GATEWAY_ROOT/.test-data/nginx-config-test-results.txt"
NGINX_TEST_PORT=8080

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
        echo "PASS: $test_name" >> "$NGINX_TEST_RESULTS"
    else
        echo "FAIL"
        ((FAILED_TESTS++))
        echo "FAIL: $test_name" >> "$NGINX_TEST_RESULTS"
        echo "Command failed: $test_command" >> "$NGINX_TEST_RESULTS"
    fi
}

# Test Nginx configuration file structure
test_nginx_config_structure() {
    log_info "Testing Nginx configuration file structure..."
    
    # Test if configuration file exists (will be created in implementation phase)
    run_test "Nginx config file exists" "[[ -f '$NGINX_CONFIG_FILE' ]]"
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test Nginx syntax
        if command -v nginx >/dev/null 2>&1; then
            run_test "Nginx syntax validation" "nginx -t -c '$NGINX_CONFIG_FILE'"
        else
            run_test "Basic Nginx structure" "grep -q 'user\\|events\\|http' '$NGINX_CONFIG_FILE'"
        fi
        
        # Test required sections
        run_test "User directive exists" "grep -q '^user' '$NGINX_CONFIG_FILE'"
        run_test "Events section exists" "grep -q '^events' '$NGINX_CONFIG_FILE'"
        run_test "HTTP section exists" "grep -q '^http' '$NGINX_CONFIG_FILE'"
    fi
}

# Test HTTP configuration
test_http_config() {
    log_info "Testing HTTP configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test basic HTTP settings
        run_test "MIME types included" "grep -q 'include.*mime.types' '$NGINX_CONFIG_FILE'"
        run_test "Send file enabled" "grep -q 'sendfile.*on' '$NGINX_CONFIG_FILE'"
        run_test "TCP nopush enabled" "grep -q 'tcp_nopush.*on' '$NGINX_CONFIG_FILE'"
        run_test "TCP nodelay enabled" "grep -q 'tcp_nodelay.*on' '$NGINX_CONFIG_FILE'"
        run_test "Keep alive timeout configured" "grep -q 'keepalive_timeout' '$NGINX_CONFIG_FILE'"
        run_test "Server tokens disabled" "grep -q 'server_tokens.*off' '$NGINX_CONFIG_FILE'"
    fi
}

# Test server configuration
test_server_config() {
    log_info "Testing server configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test server blocks
        run_test "Server block exists" "grep -q '^server' '$NGINX_CONFIG_FILE'"
        run_test "Listen directive exists" "grep -q 'listen' '$NGINX_CONFIG_FILE'"
        run_test "Server name configured" "grep -q 'server_name' '$NGINX_CONFIG_FILE'"
        
        # Test HTTP to HTTPS redirect
        run_test "HTTP to HTTPS redirect" "grep -q 'return.*https' '$NGINX_CONFIG_FILE'"
        
        # Test HTTPS server block
        run_test "HTTPS server block" "grep -q 'listen.*ssl' '$NGINX_CONFIG_FILE'"
    fi
}

# Test SSL/TLS configuration
test_ssl_config() {
    log_info "Testing SSL/TLS configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test SSL settings
        run_test "SSL certificate configured" "grep -q 'ssl_certificate' '$NGINX_CONFIG_FILE'"
        run_test "SSL certificate key configured" "grep -q 'ssl_certificate_key' '$NGINX_CONFIG_FILE'"
        run_test "SSL protocols configured" "grep -q 'ssl_protocols' '$NGINX_CONFIG_FILE'"
        run_test "SSL ciphers configured" "grep -q 'ssl_ciphers' '$NGINX_CONFIG_FILE'"
        run_test "SSL prefer server ciphers" "grep -q 'ssl_prefer_server_ciphers.*on' '$NGINX_CONFIG_FILE'"
        run_test "SSL session cache configured" "grep -q 'ssl_session_cache' '$NGINX_CONFIG_FILE'"
        run_test "SSL session timeout configured" "grep -q 'ssl_session_timeout' '$NGINX_CONFIG_FILE'"
    fi
}

# Test security headers
test_security_headers() {
    log_info "Testing security headers configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test security headers
        run_test "HSTS header configured" "grep -q 'Strict-Transport-Security' '$NGINX_CONFIG_FILE'"
        run_test "X-Frame-Options header configured" "grep -q 'X-Frame-Options' '$NGINX_CONFIG_FILE'"
        run_test "X-Content-Type-Options header configured" "grep -q 'X-Content-Type-Options' '$NGINX_CONFIG_FILE'"
        run_test "X-XSS-Protection header configured" "grep -q 'X-XSS-Protection' '$NGINX_CONFIG_FILE'"
        run_test "Referrer-Policy header configured" "grep -q 'Referrer-Policy' '$NGINX_CONFIG_FILE'"
    fi
}

# Test CORS configuration
test_cors_config() {
    log_info "Testing CORS configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test CORS headers
        run_test "Access-Control-Allow-Origin header" "grep -q 'Access-Control-Allow-Origin' '$NGINX_CONFIG_FILE'"
        run_test "Access-Control-Allow-Methods header" "grep -q 'Access-Control-Allow-Methods' '$NGINX_CONFIG_FILE'"
        run_test "Access-Control-Allow-Headers header" "grep -q 'Access-Control-Allow-Headers' '$NGINX_CONFIG_FILE'"
        run_test "Access-Control-Max-Age header" "grep -q 'Access-Control-Max-Age' '$NGINX_CONFIG_FILE'"
    fi
}

# Test rate limiting configuration
test_rate_limiting_config() {
    log_info "Testing rate limiting configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test rate limiting zones
        run_test "Rate limiting zones defined" "grep -q 'limit_req_zone' '$NGINX_CONFIG_FILE'"
        run_test "Connection limiting zones defined" "grep -q 'limit_conn_zone' '$NGINX_CONFIG_FILE'"
        
        # Test rate limiting application
        run_test "Rate limiting applied" "grep -q 'limit_req' '$NGINX_CONFIG_FILE'"
        run_test "Connection limiting applied" "grep -q 'limit_conn' '$NGINX_CONFIG_FILE'"
    fi
}

# Test upstream configuration
test_upstream_config() {
    log_info "Testing upstream configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test upstream blocks
        run_test "Upstream block exists" "grep -q '^upstream' '$NGINX_CONFIG_FILE'"
        run_test "Upstream servers configured" "grep -q 'server.*:' '$NGINX_CONFIG_FILE'"
        
        # Test load balancing methods
        run_test "Load balancing method configured" "grep -q 'least_conn\\|round-robin\\|ip_hash' '$NGINX_CONFIG_FILE'"
        
        # Test health checks (if configured)
        run_test "Health check configuration" "grep -q 'health_check\\|check' '$NGINX_CONFIG_FILE'" || run_test "Health check not required" "true"
    fi
}

# Test proxy configuration
test_proxy_config() {
    log_info "Testing proxy configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test proxy settings
        run_test "Proxy pass configured" "grep -q 'proxy_pass' '$NGINX_CONFIG_FILE'"
        run_test "Proxy HTTP version set" "grep -q 'proxy_http_version' '$NGINX_CONFIG_FILE'"
        run_test "Proxy headers configured" "grep -q 'proxy_set_header' '$NGINX_CONFIG_FILE'"
        run_test "Proxy connect timeout configured" "grep -q 'proxy_connect_timeout' '$NGINX_CONFIG_FILE'"
        run_test "Proxy send timeout configured" "grep -q 'proxy_send_timeout' '$NGINX_CONFIG_FILE'"
        run_test "Proxy read timeout configured" "grep -q 'proxy_read_timeout' '$NGINX_CONFIG_FILE'"
    fi
}

# Test caching configuration
test_caching_config() {
    log_info "Testing caching configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test proxy cache
        run_test "Proxy cache path configured" "grep -q 'proxy_cache_path' '$NGINX_CONFIG_FILE'"
        run_test "Proxy cache configured" "grep -q 'proxy_cache' '$NGINX_CONFIG_FILE'"
        run_test "Proxy cache key configured" "grep -q 'proxy_cache_key' '$NGINX_CONFIG_FILE'"
        run_test "Proxy cache valid configured" "grep -q 'proxy_cache_valid' '$NGINX_CONFIG_FILE'"
    fi
}

# Test logging configuration
test_logging_config() {
    log_info "Testing logging configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test log formats
        run_test "Log format defined" "grep -q 'log_format' '$NGINX_CONFIG_FILE'"
        run_test "Access log configured" "grep -q 'access_log' '$NGINX_CONFIG_FILE'"
        run_test "Error log configured" "grep -q 'error_log' '$NGINX_CONFIG_FILE'"
        
        # Test JSON logging (if configured)
        run_test "JSON log format" "grep -q 'json\\|escape=json' '$NGINX_CONFIG_FILE'" || run_test "JSON logging not required" "true"
    fi
}

# Test compression configuration
test_compression_config() {
    log_info "Testing compression configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test gzip settings
        run_test "Gzip enabled" "grep -q 'gzip.*on' '$NGINX_CONFIG_FILE'"
        run_test "Gzip vary enabled" "grep -q 'gzip_vary.*on' '$NGINX_CONFIG_FILE'"
        run_test "Gzip proxied enabled" "grep -q 'gzip_proxied.*any' '$NGINX_CONFIG_FILE'"
        run_test "Gzip compression level set" "grep -q 'gzip_comp_level' '$NGINX_CONFIG_FILE'"
        run_test "Gzip types configured" "grep -q 'gzip_types' '$NGINX_CONFIG_FILE'"
    fi
}

# Test monitoring configuration
test_monitoring_config() {
    log_info "Testing monitoring configuration..."
    
    if [[ -f "$NGINX_CONFIG_FILE" ]]; then
        # Test monitoring endpoints
        run_test "Health check endpoint" "grep -q '/health' '$NGINX_CONFIG_FILE'"
        run_test "Metrics endpoint" "grep -q '/metrics\\|stub_status' '$NGINX_CONFIG_FILE'" || run_test "Metrics not required" "true"
        
        # Test monitoring access controls
        run_test "Metrics access control" "grep -q 'allow.*deny' '$NGINX_CONFIG_FILE'" || run_test "Access control not required" "true"
    fi
}

# Main test execution
main() {
    log_info "Starting Nginx configuration unit tests..."
    
    # Initialize test results file
    cat /dev/null > "$NGINX_TEST_RESULTS"
    echo "Nginx Configuration Test Results - $(date)" > "$NGINX_TEST_RESULTS"
    echo "=========================================" >> "$NGINX_TEST_RESULTS"
    echo "" >> "$NGINX_TEST_RESULTS"
    
    # Run all test suites
    test_nginx_config_structure
    test_http_config
    test_server_config
    test_ssl_config
    test_security_headers
    test_cors_config
    test_rate_limiting_config
    test_upstream_config
    test_proxy_config
    test_caching_config
    test_logging_config
    test_compression_config
    test_monitoring_config
    
    # Generate test report
    echo "" >> "$NGINX_TEST_RESULTS"
    echo "Test Summary:" >> "$NGINX_TEST_RESULTS"
    echo "Total Tests: $TOTAL_TESTS" >> "$NGINX_TEST_RESULTS"
    echo "Passed: $PASSED_TESTS" >> "$NGINX_TEST_RESULTS"
    echo "Failed: $FAILED_TESTS" >> "$NGINX_TEST_RESULTS"
    
    generate_test_report "nginx-config" "$TOTAL_TESTS" "$PASSED_TESTS" "$FAILED_TESTS"
    
    log_info "Nginx configuration tests completed"
    echo "Results saved to: $NGINX_TEST_RESULTS"
    
    return $FAILED_TESTS
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi