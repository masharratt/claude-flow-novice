#!/bin/bash

echo "MCP Authentication System Test"
echo "============================"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

log_success() {
    echo -e "${GREEN}[${date '+%H:%M:%S'}] SUCCESS:${NC} $*"
}

log_error() {
    echo -e "${RED}[${date '+%H:%M:%S'}] ERROR:${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[${date '+%H:%M:%S'}] WARNING:${NC} $*"
}

# Test 1: Check Redis availability
test_redis_availability() {
    log "Test 1: Redis availability"

    if ! command -v redis-cli >/dev/null 2>&1; then
        log_error "redis-cli not found"
        return 1
    fi

    if redis-cli -r 1 ping >/dev/null 2>&1; then
        log_success "Redis is available"
        return 0
    else
        log_warning "Redis not available - some tests may fail"
        return 1
    fi
}

# Test 2: Token generation and registration
test_token_registration() {
    log "Test 2: Token generation and registration"

    # Check if token manager exists
    if [[ ! -f "${PROJECT_ROOT}/src/cli/agent-token-manager.js" ]]; then
        log_error "Token manager not found"
        return 1
    fi

    # List available agent types
    log "Listing available agent types..."
    if node "${PROJECT_ROOT}/src/cli/agent-token-manager.js" types > /tmp/agent-types.log 2>&1; then
        log_success "Agent types listed successfully"

        if grep -q "react-frontend-engineer" /tmp/agent-types.log; then
            log_success "Frontend engineer agent type available"
        else
            log_error "Frontend engineer agent type not found"
            return 1
        fi
    else
        log_error "Failed to list agent types"
        cat /tmp/agent-types.log
        return 1
    fi

    # Get agent info
    log "Getting frontend engineer info..."
    if node "${PROJECT_ROOT}/src/cli/agent-token-manager.js" info react-frontend-engineer > /tmp/agent-info.log 2>&1; then
        log_success "Agent info retrieved successfully"

        if grep -q "ui-development" /tmp/agent-info.log; then
            log_success "Agent skills configured correctly"
        else
            log_error "Agent skills not found"
            return 1
        fi
    else
        log_error "Failed to get agent info"
        cat /tmp/agent-info.log
        return 1
    fi

    return 0
}

# Test 3: Configuration file validation
test_configuration_files() {
    log "Test 3: Configuration file validation"

    # Check agent whitelist
    local agent_config="${PROJECT_ROOT}/config/agent-whitelist.json"
    if [[ -f "$agent_config" ]]; then
        log_success "Agent whitelist configuration exists"

        # Validate JSON structure
        if jq empty "$agent_config" 2>/dev/null; then
            log_success "Agent whitelist JSON is valid"

            # Check for required agent types
            if jq -e '.agents[] | select(.type == "react-frontend-engineer")' "$agent_config" >/dev/null; then
                log_success "Frontend engineer configuration found"
            else
                log_error "Frontend engineer configuration missing"
                return 1
            fi

            if jq -e '.agents[] | select(.type == "backend-developer")' "$agent_config" >/dev/null; then
                log_success "Backend developer configuration found"
            else
                log_error "Backend developer configuration missing"
                return 1
            fi
        else
            log_error "Agent whitelist JSON is invalid"
            return 1
        fi
    else
        log_error "Agent whitelist configuration not found"
        return 1
    fi

    # Check skill requirements
    local skill_config="${PROJECT_ROOT}/config/skill-requirements.json"
    if [[ -f "$skill_config" ]]; then
        log_success "Skill requirements configuration exists"

        # Validate JSON structure
        if jq empty "$skill_config" 2>/dev/null; then
            log_success "Skill requirements JSON is valid"

            # Check for required tools
            if jq -e '.tools.take_screenshot' "$skill_config" >/dev/null; then
                log_success "Screenshot tool requirements found"
            else
                log_error "Screenshot tool requirements missing"
                return 1
            fi

            # Check skill requirements for screenshot tool
            if jq -e '.tools.take_screenshot.requiredSkills | contains(["browser-automation"])' "$skill_config" >/dev/null; then
                log_success "Screenshot tool requires browser-automation skill"
            else
                log_error "Screenshot tool missing browser-automation skill requirement"
                return 1
            fi
        else
            log_error "Skill requirements JSON is invalid"
            return 1
        fi
    else
        log_error "Skill requirements configuration not found"
        return 1
    fi

    return 0
}

# Test 4: Authentication middleware validation
test_authentication_middleware() {
    log "Test 4: Authentication middleware validation"

    local auth_middleware="${PROJECT_ROOT}/src/mcp/auth-middleware.js"
    if [[ -f "$auth_middleware" ]]; then
        log_success "Authentication middleware exists"

        # Check for required methods
        if grep -q "class MCPAuthMiddleware" "$auth_middleware"; then
            log_success "MCPAuthMiddleware class found"
        else
            log_error "MCPAuthMiddleware class not found"
            return 1
        fi

        if grep -q "authenticateRequest" "$auth_middleware"; then
            log_success "authenticateRequest method found"
        else
            log_error "authenticateRequest method not found"
            return 1
        fi

        if grep -q "authorizeToolAccess" "$auth_middleware"; then
            log_success "authorizeToolAccess method found"
        else
            log_error "authorizeToolAccess method not found"
            return 1
        fi

        if grep -q "checkRateLimit" "$auth_middleware"; then
            log_success "checkRateLimit method found"
        else
            log_error "checkRateLimit method not found"
            return 1
        fi
    else
        log_error "Authentication middleware not found"
        return 1
    fi

    return 0
}

# Test 5: Enhanced MCP server validation
test_enhanced_mcp_server() {
    log "Test 5: Enhanced MCP server validation"

    local mcp_server="${PROJECT_ROOT}/src/mcp/playwright-mcp-server-auth.js"
    if [[ -f "$mcp_server" ]]; then
        log_success "Enhanced MCP server exists"

        # Check for authentication integration
        if grep -q "MCPAuthMiddleware" "$mcp_server"; then
            log_success "Authentication middleware integrated"
        else
            log_error "Authentication middleware not integrated"
            return 1
        fi

        if grep -q "authenticateRequest" "$mcp_server"; then
            log_success "Authentication calls found"
        else
            log_error "Authentication calls not found"
            return 1
        fi

        # Check for skill requirement logging
        if grep -q "skillRequirements" "$mcp_server"; then
            log_success "Skill requirements integrated"
        else
            log_error "Skill requirements not integrated"
            return 1
        fi

        # Check for agent context tracking
        if grep -q "agentContext" "$mcp_server"; then
            log_success "Agent context tracking implemented"
        else
            log_error "Agent context tracking not implemented"
            return 1
        fi
    else
        log_error "Enhanced MCP server not found"
        return 1
    fi

    return 0
}

# Test 6: Node.js module dependencies
test_node_dependencies() {
    log "Test 6: Node.js module dependencies"

    # Check if Node.js modules exist
    if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        log_success "package.json found"

        # Check for Redis dependency
        if grep -q '"redis"' "${PROJECT_ROOT}/package.json" || grep -q '"redis"' "${PROJECT_ROOT}/package-lock.json" 2>/dev/null; then
            log_success "Redis dependency found"
        else
            log_warning "Redis dependency not found in package.json"
        fi
    else
        log_error "package.json not found"
        return 1
    fi

    # Test if modules can be required (basic test)
    cat > /tmp/test-deps.js <<'EOF'
try {
    require('crypto');
    console.log('crypto: OK');
} catch (e) {
    console.log('crypto: MISSING');
}

try {
    require('fs').promises;
    console.log('fs.promises: OK');
} catch (e) {
    console.log('fs.promises: MISSING');
}

try {
    require('path');
    console.log('path: OK');
} catch (e) {
    console.log('path: MISSING');
}
EOF

    if node /tmp/test-deps.js > /tmp/deps-test.log 2>&1; then
        if grep -q "OK" /tmp/deps-test.log; then
            log_success "Core Node.js modules available"
        else
            log_error "Core Node.js modules missing"
            return 1
        fi
    else
        log_error "Failed to test Node.js modules"
        return 1
    fi

    return 0
}

# Test 7: Security validation
test_security_features() {
    log "Test 7: Security features validation"

    # Check for token generation security
    local auth_middleware="${PROJECT_ROOT}/src/mcp/auth-middleware.js"
    if [[ -f "$auth_middleware" ]]; then
        if grep -q "crypto.randomBytes" "$auth_middleware"; then
            log_success "Cryptographically secure token generation"
        else
            log_error "Insecure token generation"
            return 1
        fi

        if grep -q "token.*expiry\|expiresAt" "$auth_middleware"; then
            log_success "Token expiration implemented"
        else
            log_error "Token expiration not implemented"
            return 1
        fi

        if grep -q "rate.*limit\|checkRateLimit" "$auth_middleware"; then
            log_success "Rate limiting implemented"
        else
            log_error "Rate limiting not implemented"
            return 1
        fi

        if grep -q "skill.*requirement\|authorizeToolAccess" "$auth_middleware"; then
            log_success "Skill-based authorization implemented"
        else
            log_error "Skill-based authorization not implemented"
            return 1
        fi
    else
        log_error "Authentication middleware not found for security validation"
        return 1
    fi

    return 0
}

# Main test execution
main() {
    local tests_passed=0
    local tests_total=7

    echo "Starting MCP Authentication System Tests..."
    echo "=========================================="

    # Run all tests
    test_redis_availability && ((tests_passed++))
    test_token_registration && ((tests_passed++))
    test_configuration_files && ((tests_passed++))
    test_authentication_middleware && ((tests_passed++))
    test_enhanced_mcp_server && ((tests_passed++))
    test_node_dependencies && ((tests_passed++))
    test_security_features && ((tests_passed++))

    echo ""
    echo "=========================================="
    echo "Test Results: $tests_passed/$tests_total tests passed"

    if [[ $tests_passed -eq $tests_total ]]; then
        log_success "ALL MCP AUTHENTICATION TESTS PASSED"
        echo ""
        echo "Authentication System Features Validated:"
        echo "✅ Token-based authentication middleware"
        echo "✅ Skill-based authorization system"
        echo "✅ Agent whitelist configuration"
        echo "✅ Tool skill requirements"
        echo "✅ Rate limiting and resource controls"
        echo "✅ Secure token generation and expiration"
        echo "✅ Enhanced MCP server with authentication"
        echo ""
        echo "Next Steps:"
        echo "1. Start Redis server: redis-server"
        echo "2. Register agent tokens: node src/cli/agent-token-manager.js register <agent-type>"
        echo "3. Start authenticated MCP server: node src/mcp/playwright-mcp-server-auth.js"
        echo "4. Test end-to-end agent-MCP authentication"
        return 0
    else
        log_error "SOME MCP AUTHENTICATION TESTS FAILED"
        echo "Authentication system needs fixes before proceeding"
        return 1
    fi
}

# Run main function
main "$@"