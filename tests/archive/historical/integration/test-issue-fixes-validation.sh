#!/bin/bash
# Integration test for Issue #1, #6, #8 fixes
# Validates Redis auth, Docker permissions, and database initialization

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_test() { echo -e "${YELLOW}[TEST]${NC} $*"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $*"; }

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup
cleanup() {
    log_test "Cleaning up test resources..."
    docker rm -f test-redis-auth test-db-init test-npm-cache 2>/dev/null || true
}
trap cleanup EXIT

echo "=== CFN Issue Fixes Validation Suite ==="
echo "Testing fixes for Issues #1, #6, #8"
echo ""

# Test 1: Issue #1 - Redis Auth Environment Propagation
test_redis_auth() {
    log_test "Test 1: Redis authentication environment variables (Issue #1)"

    # Check compiled JS has the fix
    if grep -q "CFN_REDIS_PASSWORD" "$PROJECT_ROOT/dist/cli/agent-spawn.js" && \
       grep -q "REDIS_PASSWORD" "$PROJECT_ROOT/dist/cli/agent-spawn.js" && \
       grep -q "PWD" "$PROJECT_ROOT/dist/cli/agent-spawn.js"; then
        log_pass "✅ Redis auth variables present in compiled code"
        ((TESTS_PASSED++))
    else
        log_fail "❌ Redis auth variables missing from compiled code"
        ((TESTS_FAILED++))
        return 1
    fi

    # Verify whitelist matches agent-executor.ts reference
    local agent_spawn_vars=$(grep -A 30 "const safeEnvVars" "$PROJECT_ROOT/dist/cli/agent-spawn.js" | grep -E "(CFN_REDIS_PASSWORD|REDIS_PASSWORD|PWD)" | wc -l)

    if [[ $agent_spawn_vars -ge 3 ]]; then
        log_pass "✅ All 3 critical variables present in whitelist"
        ((TESTS_PASSED++))
    else
        log_fail "❌ Missing variables in whitelist (found: $agent_spawn_vars/3)"
        ((TESTS_FAILED++))
    fi
}

# Test 2: Issue #6 - Database Directory Initialization
test_database_init() {
    log_test "Test 2: Database directory initialization (Issue #6)"

    # Build fresh image if needed
    if ! docker image inspect cfn-agent:latest >/dev/null 2>&1; then
        log_test "Building cfn-agent:latest image..."
        DOCKERFILE="docker/Dockerfile.agent" IMAGE_NAME="cfn-agent" \
            "$PROJECT_ROOT/scripts/docker/build-from-linux.sh" >/dev/null 2>&1
    fi

    # Test database directory exists
    local db_dir_output=$(docker run --rm cfn-agent:latest ls -ld /app/claude-assets/skills/cfn-redis-coordination/data 2>/dev/null)

    if [[ $db_dir_output == *"cfnagent"* ]]; then
        log_pass "✅ Database directory exists with correct ownership"
        ((TESTS_PASSED++))
    else
        log_fail "❌ Database directory missing or wrong ownership"
        ((TESTS_FAILED++))
    fi

    # Test database can be created
    docker run --name test-db-init --rm cfn-agent:latest bash -c "
        touch /app/claude-assets/skills/cfn-redis-coordination/data/test.db && \
        ls -l /app/claude-assets/skills/cfn-redis-coordination/data/test.db
    " >/dev/null 2>&1

    if [[ $? -eq 0 ]]; then
        log_pass "✅ Database file creation succeeds"
        ((TESTS_PASSED++))
    else
        log_fail "❌ Database file creation failed (permission issue)"
        ((TESTS_FAILED++))
    fi
}

# Test 3: Issue #8 - npm Cache Permissions
test_npm_cache() {
    log_test "Test 3: npm cache directory and permissions (Issue #8)"

    # Test home directory exists
    local home_output=$(docker run --rm cfn-agent:latest ls -ld /home/cfnagent 2>/dev/null)

    if [[ $home_output == *"cfnagent"* ]]; then
        log_pass "✅ Home directory exists for cfnagent user"
        ((TESTS_PASSED++))
    else
        log_fail "❌ Home directory missing"
        ((TESTS_FAILED++))
    fi

    # Test npm cache directory exists
    local cache_output=$(docker run --rm cfn-agent:latest ls -ld /app/.npm-cache 2>/dev/null)

    if [[ $cache_output == *"cfnagent"* ]]; then
        log_pass "✅ npm cache directory exists with correct ownership"
        ((TESTS_PASSED++))
    else
        log_fail "❌ npm cache directory missing or wrong ownership"
        ((TESTS_FAILED++))
    fi

    # Test npm_config_cache environment variable
    local npm_cache_env=$(docker run --rm cfn-agent:latest printenv npm_config_cache)

    if [[ "$npm_cache_env" == "/app/.npm-cache" ]]; then
        log_pass "✅ npm_config_cache environment variable set correctly"
        ((TESTS_PASSED++))
    else
        log_fail "❌ npm_config_cache not set (got: $npm_cache_env)"
        ((TESTS_FAILED++))
    fi

    # Test npm can write to cache
    docker run --name test-npm-cache --rm cfn-agent:latest bash -c "
        touch /app/.npm-cache/test-file && \
        ls -l /app/.npm-cache/test-file
    " >/dev/null 2>&1

    if [[ $? -eq 0 ]]; then
        log_pass "✅ npm cache directory is writable"
        ((TESTS_PASSED++))
    else
        log_fail "❌ npm cache directory not writable"
        ((TESTS_FAILED++))
    fi
}

# Test 4: Integration - Spawn Agent with All Fixes
test_integration() {
    log_test "Test 4: Integration test - Full agent spawn with all fixes"

    # This test requires Redis to be running
    if ! docker ps | grep -q redis; then
        log_test "⚠️  Redis not running, skipping integration test"
        return 0
    fi

    # Test CLI spawn with environment propagation
    local task_id="test-fixes-$(date +%s)"

    # Spawn a simple agent
    timeout 30 node "$PROJECT_ROOT/dist/cli/spawn.js" researcher \
        --task-id "$task_id" \
        --prompt "Return 'Integration test successful'" \
        >/dev/null 2>&1

    if [[ $? -eq 0 ]]; then
        log_pass "✅ Agent spawn completed successfully with all fixes"
        ((TESTS_PASSED++))
    else
        log_fail "❌ Agent spawn failed (check Redis auth or Docker permissions)"
        ((TESTS_FAILED++))
    fi
}

# Run all tests
main() {
    test_redis_auth
    test_database_init
    test_npm_cache
    test_integration

    echo ""
    echo "=== Test Results ==="
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_pass "All validation tests passed! ✅"
        exit 0
    else
        log_fail "Some validation tests failed ❌"
        exit 1
    fi
}

main
