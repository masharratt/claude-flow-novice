#!/usr/bin/env bash
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Docker MCP Test Script
# Tests MCP server containers and agent connectivity

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

echo "========================================="
echo "  Docker MCP Test Suite"
echo "========================================="
echo ""

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "success")
            echo -e "${GREEN}✓${NC} $message"
            ;;
        "error")
            echo -e "${RED}✗${NC} $message"
            ;;
        "info")
            echo -e "${BLUE}→${NC} $message"
            ;;
        "warning")
            echo -e "${YELLOW}⚠${NC} $message"
            ;;
    esac
}

# Function to record test result
record_test() {
    local test_name=$1
    local passed=$2
    local message=$3

    if [ "$passed" = "true" ]; then
        ((TESTS_PASSED++))
        TEST_RESULTS+=("PASS: $test_name - $message")
        print_status "success" "$test_name"
    else
        ((TESTS_FAILED++))
        TEST_RESULTS+=("FAIL: $test_name - $message")
        print_status "error" "$test_name - $message"
    fi
}

# Cleanup function
cleanup() {
    print_status "info" "Cleaning up test containers..."
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" down \
        mcp-playwright mcp-redis-tools mcp-n8n mcp-security-scanner 2>/dev/null || true
}

# Trap cleanup on exit
trap cleanup EXIT

# Navigate to project root
cd "$PROJECT_ROOT"

# Test 1: MCP Configuration Validation
print_status "info" "Test 1: Validating MCP configuration..."
if [ -f "config/mcp-servers.json" ]; then
    if command -v jq &> /dev/null; then
        if jq empty config/mcp-servers.json 2>/dev/null; then
            record_test "MCP Config Validation" "true" "Valid JSON configuration"
        else
            record_test "MCP Config Validation" "false" "Invalid JSON"
        fi
    else
        record_test "MCP Config Validation" "true" "File exists (jq not available for validation)"
    fi
else
    record_test "MCP Config Validation" "false" "config/mcp-servers.json not found"
fi

# Test 2: Docker Compose Syntax Validation
print_status "info" "Test 2: Validating Docker Compose syntax..."
if docker-compose -f docker-compose.production.yml config > /dev/null 2>&1; then
    record_test "Docker Compose Syntax" "true" "Valid syntax"
else
    record_test "Docker Compose Syntax" "false" "Syntax errors detected"
fi

# Test 3: Start MCP containers
print_status "info" "Test 3: Starting MCP containers..."
if docker-compose -f docker-compose.production.yml up -d \
    redis-coordinator \
    mcp-playwright \
    mcp-redis-tools \
    mcp-n8n \
    mcp-security-scanner 2>&1 | tee /tmp/docker-test-mcp-start.log; then
    record_test "MCP Container Startup" "true" "All containers started"
else
    record_test "MCP Container Startup" "false" "Failed to start containers"
    exit 1
fi

# Wait for containers to initialize
print_status "info" "Waiting for containers to initialize (30s)..."
sleep 30

# Test 4: Health Check - Playwright
print_status "info" "Test 4: Testing Playwright MCP server health..."
if timeout 10 docker exec cfn-mcp-playwright curl -f http://localhost:8081/health 2>/dev/null; then
    record_test "Playwright Health Check" "true" "Responding"
else
    record_test "Playwright Health Check" "false" "Not responding or health endpoint unavailable"
fi

# Test 5: Health Check - Redis Tools
print_status "info" "Test 5: Testing Redis Tools MCP server health..."
if timeout 10 docker exec cfn-mcp-redis-tools wget --quiet --tries=1 --spider http://localhost:8082/health 2>/dev/null; then
    record_test "Redis Tools Health Check" "true" "Responding"
else
    record_test "Redis Tools Health Check" "false" "Not responding or health endpoint unavailable"
fi

# Test 6: Health Check - N8N
print_status "info" "Test 6: Testing N8N MCP server health..."
if timeout 15 docker exec cfn-mcp-n8n wget --quiet --tries=1 --spider http://localhost:5678/healthz 2>/dev/null; then
    record_test "N8N Health Check" "true" "Responding"
else
    record_test "N8N Health Check" "false" "Not responding or health endpoint unavailable"
fi

# Test 7: Health Check - Security Scanner
print_status "info" "Test 7: Testing Security Scanner MCP server health..."
if timeout 10 docker exec cfn-mcp-security-scanner wget --quiet --tries=1 --spider http://localhost:8084/health 2>/dev/null; then
    record_test "Security Scanner Health Check" "true" "Responding"
else
    record_test "Security Scanner Health Check" "false" "Not responding or health endpoint unavailable"
fi

# Test 8: Network Connectivity - MCP Network
print_status "info" "Test 8: Testing MCP network isolation..."
if docker network inspect mcp-isolated > /dev/null 2>&1; then
    record_test "MCP Network Creation" "true" "Network exists"
else
    record_test "MCP Network Creation" "false" "Network not found"
fi

# Test 9: Volume Mounts
print_status "info" "Test 9: Testing MCP configuration volume mounts..."
MOUNT_ERRORS=0
for container in cfn-mcp-playwright cfn-mcp-redis-tools cfn-mcp-n8n cfn-mcp-security-scanner; do
    if docker exec "$container" test -f /app/config/mcp-servers.json 2>/dev/null; then
        : # Success
    else
        ((MOUNT_ERRORS++))
    fi
done

if [ $MOUNT_ERRORS -eq 0 ]; then
    record_test "MCP Config Volume Mounts" "true" "All containers have config mounted"
else
    record_test "MCP Config Volume Mounts" "false" "$MOUNT_ERRORS containers missing config"
fi

# Test 10: Redis Coordinator Connectivity
print_status "info" "Test 10: Testing Redis coordinator connectivity..."
if docker exec cfn-redis-coordinator redis-cli ping 2>/dev/null | grep -q "PONG"; then
    record_test "Redis Coordinator" "true" "Responding to pings"
else
    record_test "Redis Coordinator" "false" "Not responding"
fi

# Test 11: Container Resource Limits
print_status "info" "Test 11: Verifying container resource limits..."
LIMIT_ERRORS=0
for container in cfn-mcp-playwright cfn-mcp-redis-tools cfn-mcp-n8n cfn-mcp-security-scanner; do
    if docker inspect "$container" --format '{{.HostConfig.Memory}}' 2>/dev/null | grep -q -v "^0$"; then
        : # Memory limit set
    else
        ((LIMIT_ERRORS++))
    fi
done

if [ $LIMIT_ERRORS -eq 0 ]; then
    record_test "Container Resource Limits" "true" "All containers have memory limits"
else
    record_test "Container Resource Limits" "false" "$LIMIT_ERRORS containers missing resource limits"
fi

# Test 12: MCP Server Environment Variables
print_status "info" "Test 12: Verifying MCP server environment variables..."
ENV_ERRORS=0
for container in cfn-mcp-playwright cfn-mcp-redis-tools cfn-mcp-n8n cfn-mcp-security-scanner; do
    if docker exec "$container" env 2>/dev/null | grep -q "MCP_SERVER_TYPE"; then
        : # Environment variable set
    else
        ((ENV_ERRORS++))
    fi
done

if [ $ENV_ERRORS -eq 0 ]; then
    record_test "MCP Environment Variables" "true" "All containers have MCP env vars"
else
    record_test "MCP Environment Variables" "false" "$ENV_ERRORS containers missing MCP env vars"
fi

# Print container status
echo ""
print_status "info" "Container Status:"
docker-compose -f docker-compose.production.yml ps \
    redis-coordinator mcp-playwright mcp-redis-tools mcp-n8n mcp-security-scanner

# Print container logs for debugging
echo ""
print_status "info" "Recent container logs:"
for container in cfn-mcp-playwright cfn-mcp-redis-tools cfn-mcp-n8n cfn-mcp-security-scanner; do
    echo ""
    echo "--- $container ---"
    docker logs "$container" --tail 10 2>&1 || true
done

# Summary
echo ""
echo "========================================="
echo "  Test Results Summary"
echo "========================================="
echo ""

for result in "${TEST_RESULTS[@]}"; do
    if [[ $result == PASS:* ]]; then
        echo -e "${GREEN}$result${NC}"
    else
        echo -e "${RED}$result${NC}"
    fi
done

echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    print_status "success" "All tests passed!"
    exit 0
else
    print_status "error" "$TESTS_FAILED test(s) failed"
    exit 1
fi
