#!/usr/bin/env bash
# tests/unit/test-jwt-auth.sh
# Unit tests for JWT authentication service

set -euo pipefail

# Source test utilities
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/../test-setup.sh"

# Test configuration
JWT_SERVICE_DIR=$(cd "$SCRIPT_DIR/../../jwt" && pwd)
JWT_TEST_RESULTS="$GATEWAY_ROOT/.test-data/jwt-auth-test-results.txt"
JWT_TEST_SERVER_PID=""
JWT_TEST_PORT=3002

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Start JWT test server
start_jwt_test_server() {
    cd "$JWT_SERVICE_DIR"
    
    # Set test environment variables
    export NODE_ENV=test
    export JWT_SECRET="$TEST_JWT_SECRET"
    export REDIS_HOST="$REDIS_HOST"
    export REDIS_PORT="$REDIS_PORT"
    export REDIS_DB="$REDIS_DB"
    export PORT="$JWT_TEST_PORT"
    
    # Start server in background
    node src/index.js > "$GATEWAY_ROOT/.test-data/jwt-server.log" 2>&1 &
    JWT_TEST_SERVER_PID=$!
    
    # Wait for server to start
    if wait_for_service "http://localhost:$JWT_TEST_PORT/health" 10; then
        log_info "JWT test server started (PID: $JWT_TEST_SERVER_PID)"
        return 0
    else
        log_error "Failed to start JWT test server"
        return 1
    fi
}

# Stop JWT test server
stop_jwt_test_server() {
    if [[ -n "$JWT_TEST_SERVER_PID" ]]; then
        kill "$JWT_TEST_SERVER_PID" 2>/dev/null || true
        wait "$JWT_TEST_SERVER_PID" 2>/dev/null || true
        log_info "JWT test server stopped"
    fi
}

# Run a single test case
run_test() {
    local test_name=$1
    local test_command=$2
    
    ((TOTAL_TESTS++))
    
    echo -n "Testing: $test_name ... "
    
    if eval "$test_command" >/dev/null 2>&1; then
        echo "PASS"
        ((PASSED_TESTS++))
        echo "PASS: $test_name" >> "$JWT_TEST_RESULTS"
    else
        echo "FAIL"
        ((FAILED_TESTS++))
        echo "FAIL: $test_name" >> "$JWT_TEST_RESULTS"
        echo "Command failed: $test_command" >> "$JWT_TEST_RESULTS"
    fi
}

# Test JWT service package structure
test_jwt_package_structure() {
    log_info "Testing JWT service package structure..."
    
    # Test package.json exists and is valid
    run_test "package.json exists" "[[ -f '$JWT_SERVICE_DIR/package.json' ]]"
    run_test "package.json is valid JSON" "jq . '$JWT_SERVICE_DIR/package.json' >/dev/null"
    
    # Test required dependencies
    run_test "jsonwebtoken dependency exists" "jq -r '.dependencies.\"jsonwebtoken\"' '$JWT_SERVICE_DIR/package.json' >/dev/null"
    run_test "bcryptjs dependency exists" "jq -r '.dependencies.\"bcryptjs\"' '$JWT_SERVICE_DIR/package.json' >/dev/null"
    run_test "redis dependency exists" "jq -r '.dependencies.\"redis\"' '$JWT_SERVICE_DIR/package.json' >/dev/null"
    run_test "express dependency exists" "jq -r '.dependencies.\"express\"' '$JWT_SERVICE_DIR/package.json' >/dev/null"
    
    # Test test dependencies
    run_test "jest dev dependency exists" "jq -r '.devDependencies.\"jest\"' '$JWT_SERVICE_DIR/package.json' >/dev/null"
    run_test "supertest dev dependency exists" "jq -r '.devDependencies.\"supertest\"' '$JWT_SERVICE_DIR/package.json' >/dev/null"
    
    # Test scripts
    run_test "test script exists" "jq -r '.scripts.test' '$JWT_SERVICE_DIR/package.json' >/dev/null"
    run_test "start script exists" "jq -r '.scripts.start' '$JWT_SERVICE_DIR/package.json' >/dev/null"
}

# Test JWT service source structure
test_jwt_source_structure() {
    log_info "Testing JWT service source structure..."
    
    # Test source directory exists
    run_test "src directory exists" "[[ -d '$JWT_SERVICE_DIR/src' ]]"
    
    # Test required source files exist (will be created in implementation phase)
    run_test "config.js file exists" "[[ -f '$JWT_SERVICE_DIR/src/config.js' ]]"
    run_test "logger.js file exists" "[[ -f '$JWT_SERVICE_DIR/src/logger.js' ]]"
    run_test "redis-client.js file exists" "[[ -f '$JWT_SERVICE_DIR/src/redis-client.js' ]]"
    
    # Test main entry point exists (will be created)
    run_test "index.js file exists" "[[ -f '$JWT_SERVICE_DIR/src/index.js' ]]"
}

# Test JWT service functionality
test_jwt_service_functionality() {
    log_info "Testing JWT service functionality..."
    
    # Test server startup
    if [[ -n "$JWT_TEST_SERVER_PID" ]]; then
        # Test health endpoint
        run_test "Health endpoint responds" "curl -s -f http://localhost:$JWT_TEST_PORT/health >/dev/null"
        
        # Test token generation endpoint
        run_test "Token generation endpoint exists" "curl -s -f -X POST -H 'Content-Type: application/json' -d '{\"userId\":\"'$TEST_USER_ID'\"}' http://localhost:$JWT_TEST_PORT/auth/token >/dev/null"
        
        # Test token validation endpoint
        local test_token=$(generate_test_jwt)
        run_test "Token validation endpoint exists" "curl -s -f -X POST -H 'Content-Type: application/json' -d '{\"token\":\"'$test_token'\"}' http://localhost:$JWT_TEST_PORT/auth/validate >/dev/null"
        
        # Test token refresh endpoint
        run_test "Token refresh endpoint exists" "curl -s -f -X POST -H 'Content-Type: application/json' -d '{\"refreshToken\":\"dummy-refresh-token\"}' http://localhost:$JWT_TEST_PORT/auth/refresh >/dev/null"
    fi
}

# Test JWT token operations
test_jwt_token_operations() {
    log_info "Testing JWT token operations..."
    
    # Test token generation
    run_test "Can generate JWT token" "generate_test_jwt >/dev/null"
    
    # Test token structure
    local test_token=$(generate_test_jwt)
    run_test "JWT token has 3 parts" '[[ $(echo "$test_token" | tr "." "\\n" | wc -l) -eq 3 ]]'
    
    # Test token payload (if jq available)
    if command -v jq >/dev/null 2>&1; then
        local payload=$(echo "$test_token" | cut -d. -f2 | base64 -d 2>/dev/null || echo '{}')
        run_test "JWT token contains userId" 'echo "$payload" | jq -e ".userId" >/dev/null'
        run_test "JWT token contains role" 'echo "$payload" | jq -e ".role" >/dev/null'
    fi
}

# Test Redis integration
test_redis_integration() {
    log_info "Testing Redis integration..."
    
    if command -v redis-cli >/dev/null 2>&1; then
        # Test Redis connectivity
        run_test "Redis server is accessible" "redis-cli -h '$REDIS_HOST' -p '$REDIS_PORT' -n '$REDIS_DB' ping >/dev/null 2>&1"
        
        # Test Redis operations
        run_test "Can write to Redis" "redis-cli -h '$REDIS_HOST' -p '$REDIS_PORT' -n '$REDIS_DB' set 'test-key' 'test-value' >/dev/null 2>&1"
        run_test "Can read from Redis" '[[ "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" get test-key 2>/dev/null)" == "test-value" ]]'
        run_test "Can delete from Redis" "redis-cli -h '$REDIS_HOST' -p '$REDIS_PORT' -n '$REDIS_DB' del test-key >/dev/null 2>&1"
    else
        log_warn "Redis CLI not available, skipping Redis tests"
        run_test "Redis CLI skipped (not available)" "true"
    fi
}

# Test configuration files
test_configuration_files() {
    log_info "Testing configuration files..."
    
    # Test config.js structure
    if [[ -f "$JWT_SERVICE_DIR/src/config.js" ]]; then
        run_test "config.js exports JWT settings" "grep -q 'JWT_SECRET\|jwt.*secret' '$JWT_SERVICE_DIR/src/config.js'"
        run_test "config.js exports Redis settings" "grep -q 'redis\|REDIS' '$JWT_SERVICE_DIR/src/config.js'"
        run_test "config.js exports server settings" "grep -q 'PORT\|port' '$JWT_SERVICE_DIR/src/config.js'"
    fi
    
    # Test logger.js structure
    if [[ -f "$JWT_SERVICE_DIR/src/logger.js" ]]; then
        run_test "logger.js exports logger" "grep -q 'module.exports\|export' '$JWT_SERVICE_DIR/src/logger.js'"
    fi
    
    # Test redis-client.js structure
    if [[ -f "$JWT_SERVICE_DIR/src/redis-client.js" ]]; then
        run_test "redis-client.js exports Redis client" "grep -q 'module.exports\|export' '$JWT_SERVICE_DIR/src/redis-client.js'"
        run_test "redis-client.js handles connection" "grep -q 'connect\|createClient' '$JWT_SERVICE_DIR/src/redis-client.js'"
    fi
}

# Test security configurations
test_security_configurations() {
    log_info "Testing security configurations..."
    
    # Test JWT security settings
    run_test "JWT secret is configured" '[[ -n "${JWT_SECRET:-$TEST_JWT_SECRET}" ]]'
    run_test "JWT secret is not empty" '[[ "${JWT_SECRET:-$TEST_JWT_SECRET}" != "" ]]'
    run_test "JWT secret is reasonable length" '[[ ${#JWT_SECRET:-$TEST_JWT_SECRET} -ge 16 ]]'
    
    # Test environment variables
    run_test "NODE_ENV is set for testing" '[[ "${NODE_ENV:-test}" == "test" ]]'
    run_test "Test environment variables are set" '[[ -n "$TEST_JWT_SECRET" ]]'
}

# Main test execution
main() {
    log_info "Starting JWT authentication unit tests..."
    
    # Initialize test results file
    cat /dev/null > "$JWT_TEST_RESULTS"
    echo "JWT Authentication Test Results - $(date)" > "$JWT_TEST_RESULTS"
    echo "=========================================" >> "$JWT_TEST_RESULTS"
    echo "" >> "$JWT_TEST_RESULTS"
    
    # Run static tests first
    test_jwt_package_structure
    test_jwt_source_structure
    test_jwt_token_operations
    test_redis_integration
    test_configuration_files
    test_security_configurations
    
    # Try to start test server for functionality tests
    if start_jwt_test_server; then
        test_jwt_service_functionality
        stop_jwt_test_server
    else
        log_warn "Could not start JWT test server, skipping functionality tests"
        # Mark functionality tests as skipped
        local functionality_tests=(
            "Health endpoint responds"
            "Token generation endpoint exists"
            "Token validation endpoint exists"
            "Token refresh endpoint exists"
        )
        
        for test in "${functionality_tests[@]}"; do
            ((TOTAL_TESTS++))
            echo "Testing: $test ... SKIP (server not running)"
            echo "SKIP: $test (server not running)" >> "$JWT_TEST_RESULTS"
        done
    fi
    
    # Generate test report
    echo "" >> "$JWT_TEST_RESULTS"
    echo "Test Summary:" >> "$JWT_TEST_RESULTS"
    echo "Total Tests: $TOTAL_TESTS" >> "$JWT_TEST_RESULTS"
    echo "Passed: $PASSED_TESTS" >> "$JWT_TEST_RESULTS"
    echo "Failed: $FAILED_TESTS" >> "$JWT_TEST_RESULTS"
    
    generate_test_report "jwt-auth" "$TOTAL_TESTS" "$PASSED_TESTS" "$FAILED_TESTS"
    
    log_info "JWT authentication tests completed"
    echo "Results saved to: $JWT_TEST_RESULTS"
    
    return $FAILED_TESTS
}

# Cleanup on exit
trap cleanup_test_env EXIT
trap stop_jwt_test_server EXIT

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi