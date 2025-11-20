#!/usr/bin/env bash
#
# API Gateway Configuration Tests
# Tests for nginx reverse proxy, rate limiting, authentication, and security features
#

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
    # Clean up any test containers or processes
    docker ps -q --filter "name=test-gateway-" | xargs -r docker stop
    docker ps -aq --filter "name=test-gateway-" | xargs -r docker rm
}
trap cleanup EXIT

test_case_nginx_config_validation() {
    log_step "GIVEN valid nginx configuration"
    
    # Test nginx configuration syntax
    assert_success "nginx -t -c $PROJECT_ROOT/nginx/nginx.conf" \
        "nginx configuration should be valid"
    
    log_info "✓ nginx configuration syntax is valid"
}

test_case_rate_limiting_configuration() {
    log_step "GIVEN nginx rate limiting zones configured"
    
    # Check for rate limiting zones
    if grep -q "limit_req_zone.*api_limit" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ API rate limiting zone found"
        assert_success "true" "Rate limiting zone should exist"
    else
        log_error "❌ API rate limiting zone not found"
        return 1
    fi
    
    if grep -q "limit_req_zone.*auth_limit" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Authentication rate limiting zone found"
        assert_success "true" "Authentication rate limiting zone should exist"
    else
        log_error "❌ Authentication rate limiting zone not found"
        return 1
    fi
}

test_case_ssl_configuration() {
    log_step "GIVEN SSL/TLS security configuration"
    
    # Check for SSL protocols
    if grep -q "ssl_protocols.*TLSv1.2.*TLSv1.3" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Secure SSL protocols configured"
        assert_success "true" "Secure SSL protocols should be configured"
    else
        log_error "❌ Insecure SSL protocols found"
        return 1
    fi
    
    # Check for security headers
    local security_headers=(
        "Strict-Transport-Security"
        "X-Frame-Options"
        "X-Content-Type-Options"
        "X-XSS-Protection"
        "Referrer-Policy"
        "Content-Security-Policy"
    )
    
    for header in "${security_headers[@]}"; do
        if grep -q "$header" $PROJECT_ROOT/nginx/nginx.conf; then
            log_info "✓ Security header $header found"
            assert_success "true" "Security header $header should be configured"
        else
            log_error "❌ Security header $header missing"
            return 1
        fi
    done
}

test_case_upstream_configuration() {
    log_step "GIVEN upstream backend services configured"
    
    # Check for orchestrator upstream
    if grep -q "upstream orchestrator_backend" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Orchestrator upstream found"
        assert_success "true" "Orchestrator upstream should be configured"
    else
        log_error "❌ Orchestrator upstream not found"
        return 1
    fi
    
    # Check for health check configuration
    if grep -q "healthcheck" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Health check configuration found"
        assert_success "true" "Health check should be configured"
    else
        log_error "❌ Health check configuration missing"
        return 1
    fi
}

test_case_cors_configuration() {
    log_step "GIVEN CORS configuration for API endpoints"
    
    # Check for CORS headers
    local cors_headers=(
        "Access-Control-Allow-Origin"
        "Access-Control-Allow-Methods"
        "Access-Control-Allow-Headers"
        "Access-Control-Max-Age"
    )
    
    for header in "${cors_headers[@]}"; do
        if grep -q "$header" $PROJECT_ROOT/nginx/nginx.conf; then
            log_info "✓ CORS header $header found"
            assert_success "true" "CORS header $header should be configured"
        else
            log_error "❌ CORS header $header missing"
            return 1
        fi
    done
}

test_case_monitoring_endpoints() {
    log_step "GIVEN monitoring and metrics endpoints configured"
    
    # Check for health endpoint
    if grep -q "location /health" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Health endpoint found"
        assert_success "true" "Health endpoint should be configured"
    else
        log_error "❌ Health endpoint not found"
        return 1
    fi
    
    # Check for metrics endpoint
    if grep -q "location /metrics" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Metrics endpoint found"
        assert_success "true" "Metrics endpoint should be configured"
    else
        log_error "❌ Metrics endpoint not found"
        return 1
    fi
}

test_case_caching_configuration() {
    log_step "GIVEN caching configuration for API responses"
    
    # Check for proxy cache path
    if grep -q "proxy_cache_path" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Proxy cache path configured"
        assert_success "true" "Proxy cache path should be configured"
    else
        log_error "❌ Proxy cache path not configured"
        return 1
    fi
    
    # Check for caching directives
    if grep -q "proxy_cache" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Proxy cache directives found"
        assert_success "true" "Proxy cache directives should be configured"
    else
        log_error "❌ Proxy cache directives not found"
        return 1
    fi
}

test_case_authentication_integration() {
    log_step "GIVEN authentication integration configured"
    
    # Check for auth endpoint
    if grep -q "location = /auth" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Authentication endpoint found"
        assert_success "true" "Authentication endpoint should be configured"
    else
        log_error "❌ Authentication endpoint not found"
        return 1
    fi
    
    # Check for auth_request directive
    if grep -q "auth_request" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Auth request directive found"
        assert_success "true" "Auth request directive should be configured"
    else
        log_error "❌ Auth request directive not found"
        return 1
    fi
}

test_case_error_handling() {
    log_step "GIVEN comprehensive error handling configured"
    
    # Check for custom error pages
    if grep -q "error_page.*502.*503.*504" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Custom error pages configured"
        assert_success "true" "Custom error pages should be configured"
    else
        log_error "❌ Custom error pages not configured"
        return 1
    fi
    
    # Check for proxy_intercept_errors
    if grep -q "proxy_intercept_errors on" $PROJECT_ROOT/nginx/nginx.conf; then
        log_info "✓ Proxy intercept errors enabled"
        assert_success "true" "Proxy intercept errors should be enabled"
    else
        log_error "❌ Proxy intercept errors not enabled"
        return 1
    fi
}

test_case_docker_compose_integration() {
    log_step "GIVEN Docker Compose configuration includes nginx gateway"
    
    # Check if nginx is included in production compose file
    if grep -q "nginx:" $PROJECT_ROOT/docker-compose.production.yml; then
        log_info "✓ Nginx service found in production compose"
        assert_success "true" "Nginx service should be in production compose"
    else
        log_error "❌ Nginx service not found in production compose"
        return 1
    fi
    
    # Check for proper port mapping
    if grep -q "CFN_NGINX_HTTP_PORT.*80" $PROJECT_ROOT/docker-compose.production.yml; then
        log_info "✓ HTTP port mapping configured"
        assert_success "true" "HTTP port mapping should be configured"
    else
        log_error "❌ HTTP port mapping not configured"
        return 1
    fi
    
    # Check for HTTPS port mapping
    if grep -q "CFN_NGINX_HTTPS_PORT.*443" $PROJECT_ROOT/docker-compose.production.yml; then
        log_info "✓ HTTPS port mapping configured"
        assert_success "true" "HTTPS port mapping should be configured"
    else
        log_error "❌ HTTPS port mapping not configured"
        return 1
    fi
}

# Run all test cases
main() {
    log_step "Starting API Gateway Configuration Tests"
    
    test_case_nginx_config_validation
    test_case_rate_limiting_configuration
    test_case_ssl_configuration
    test_case_upstream_configuration
    test_case_cors_configuration
    test_case_monitoring_endpoints
    test_case_caching_configuration
    test_case_authentication_integration
    test_case_error_handling
    test_case_docker_compose_integration
    
    log_step "All API Gateway Configuration Tests Completed"
}

main "$@"