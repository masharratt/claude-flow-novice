#!/usr/bin/env bash
# tests/test-setup.sh
# Test environment setup and utilities for API Gateway testing

set -euo pipefail

# Get the project root directory
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
GATEWAY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Test configuration
export TEST_ENV=${TEST_ENV:-"test"}
export TEST_PORT=${TEST_PORT:-3001}
export KONG_ADMIN_URL=${KONG_ADMIN_URL:-"http://localhost:8001"}
export KONG_PROXY_URL=${KONG_PROXY_URL:-"http://localhost:8000"}

# Redis configuration for testing
export REDIS_HOST=${REDIS_HOST:-"localhost"}
export REDIS_PORT=${REDIS_PORT:-6379}
export REDIS_DB=${REDIS_DB:-1}

# Test data
export TEST_JWT_SECRET=${TEST_JWT_SECRET:-"test-secret-key-for-testing-only"}
export TEST_API_KEY=${TEST_API_KEY:-"test-api-key-12345"}
export TEST_USER_ID=${TEST_USER_ID:-"test-user-123"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."
    
    # Load test environment variables
    if [[ -f "$GATEWAY_ROOT/.env.test" ]]; then
        source "$GATEWAY_ROOT/.env.test"
    fi
    
    # Create necessary directories
    mkdir -p "$GATEWAY_ROOT/logs"
    mkdir -p "$GATEWAY_ROOT/tmp"
    mkdir -p "$GATEWAY_ROOT/.test-data"
    
    # Initialize test database if needed
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -n "$REDIS_DB" flushall >/dev/null 2>&1 || log_warn "Redis not available for testing"
    fi
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."
    
    # Stop any running test containers
    docker-compose -f "$GATEWAY_ROOT/docker-compose.test.yml" down --remove-orphans >/dev/null 2>&1 || true
    
    # Clear test data
    rm -rf "$GATEWAY_ROOT/.test-data"
    rm -rf "$GATEWAY_ROOT/tmp"
    
    # Clear test Redis database
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -n "$REDIS_DB" flushall >/dev/null 2>&1 || true
    fi
}

# Wait for service to be available
wait_for_service() {
    local url=$1
    local timeout=${2:-30}
    local counter=0
    
    log_info "Waiting for service: $url"
    
    while [[ $counter -lt $timeout ]]; do
        if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|404"; then
            log_info "Service is available: $url"
            return 0
        fi
        
        sleep 1
        ((counter++))
    done
    
    log_error "Service not available after ${timeout}s: $url"
    return 1
}

# Generate test JWT token
generate_test_jwt() {
    local payload=${1:-'{"userId":"'$TEST_USER_ID'","role":"user"}'}
    local secret=${2:-$TEST_JWT_SECRET}
    
    if command -v jq >/dev/null 2>&1; then
        # Use jq to create proper JWT (simplified for testing)
        local header=$(echo '{"alg":"HS256","typ":"JWT"}' | base64 -w 0 | tr -d '=' | tr '/+' '_-')
        local claims=$(echo "$payload" | base64 -w 0 | tr -d '=' | tr '/+' '_-')
        local signature=$(echo -n "$header.$claims" | openssl dgst -sha256 -hmac "$secret" -binary | base64 -w 0 | tr -d '=' | tr '/+' '_-')
        
        echo "$header.$claims.$signature"
    else
        log_error "jq required for JWT generation"
        return 1
    fi
}

# Make HTTP request with test JWT
make_authenticated_request() {
    local method=$1
    local url=$2
    local data=${3:-""}
    local token=$(generate_test_jwt)
    
    local curl_opts=(
        -X "$method"
        -H "Authorization: Bearer $token"
        -H "Content-Type: application/json"
        -w "\n%{http_code}\n"
    )
    
    if [[ -n "$data" ]]; then
        curl_opts+=(-d "$data")
    fi
    
    curl "${curl_opts[@]}" "$url"
}

# Assert functions for testing
assert_equals() {
    local expected=$1
    local actual=$2
    local message=${3:-"Assertion failed"}
    
    if [[ "$expected" != "$actual" ]]; then
        log_error "$message: expected '$expected', got '$actual'"
        return 1
    fi
}

assert_contains() {
    local haystack=$1
    local needle=$2
    local message=${3:-"Assertion failed"}
    
    if [[ "$haystack" != *"$needle"* ]]; then
        log_error "$message: '$haystack' does not contain '$needle'"
        return 1
    fi
}

assert_http_status() {
    local expected_status=$1
    local actual_response=$2
    local message=${3:-"HTTP status assertion failed"}
    
    local actual_status=$(echo "$actual_response" | tail -n1 | tr -d '\n')
    
    if [[ "$expected_status" != "$actual_status" ]]; then
        log_error "$message: expected status $expected_status, got $actual_status"
        return 1
    fi
}

# Test reporting
generate_test_report() {
    local test_file=$1
    local total_tests=$2
    local passed_tests=$3
    local failed_tests=$4
    
    local pass_rate=0
    if [[ $total_tests -gt 0 ]]; then
        pass_rate=$(awk "BEGIN {printf \"%.2f\", $passed_tests/$total_tests}")
    fi
    
    cat > "$GATEWAY_ROOT/.test-data/test-report-${test_file}.json" << EOF
{
    "test_file": "$test_file",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "total_tests": $total_tests,
    "passed_tests": $passed_tests,
    "failed_tests": $failed_tests,
    "pass_rate": $pass_rate,
    "environment": "$TEST_ENV"
}
EOF
    
    log_info "Test report generated: $GATEWAY_ROOT/.test-data/test-report-${test_file}.json"
    echo "{\"total\": $total_tests, \"passed\": $passed_tests, \"failed\": $failed_tests, \"pass_rate\": $pass_rate}"
}

# Export functions for use in test scripts
export -f setup_test_env cleanup_test_env wait_for_service generate_test_jwt
export -f make_authenticated_request assert_equals assert_contains assert_http_status
export -f generate_test_report

# Initialize test environment if script is sourced
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    setup_test_env
fi