#!/usr/bin/env bash

# Redis Server Authentication Validation Test
# Purpose: Verify that Redis server REJECTS unauthenticated connections
# Tests both negative case (auth required) and positive case (auth succeeds)

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/.env"
TEST_TIMEOUT=60

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
VALIDATION_ISSUES=()

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Redis Server Authentication Validation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print section headers
print_section() {
    echo -e "${BLUE}>>> $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((TESTS_PASSED++))
}

# Function to print failure
print_failure() {
    echo -e "${RED}✗ $1${NC}"
    ((TESTS_FAILED++))
    VALIDATION_ISSUES+=("$1")
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# ===== VALIDATION TASK 1: Check docker-compose.yml Configuration =====
print_section "Task 1: Verify Docker Compose Configuration"
echo ""

if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
    print_failure "docker-compose.yml not found at $DOCKER_COMPOSE_FILE"
    exit 1
fi

print_success "docker-compose.yml exists"

# Check for Redis service definition
if grep -q "redis:" "$DOCKER_COMPOSE_FILE"; then
    print_success "Redis service defined in docker-compose.yml"
else
    print_failure "Redis service NOT found in docker-compose.yml"
    exit 1
fi

# Check for --requirepass directive
if grep -q "\-\-requirepass" "$DOCKER_COMPOSE_FILE"; then
    print_success "--requirepass directive found in Redis command"
else
    print_failure "--requirepass directive NOT found in Redis command"
    VALIDATION_ISSUES+=("Redis command missing --requirepass directive")
fi

# Check for password environment variable
if grep -q "REDIS_PASSWORD\|CFN_REDIS_PASSWORD" "$DOCKER_COMPOSE_FILE"; then
    print_success "Redis password environment variable referenced"
else
    print_failure "Redis password environment variable NOT referenced"
fi

# Display the Redis configuration
echo ""
echo -e "${BLUE}Current Redis Configuration:${NC}"
grep -A 15 "redis:" "$DOCKER_COMPOSE_FILE" | head -20

echo ""

# ===== VALIDATION TASK 2: Check .env File =====
print_section "Task 2: Verify .env Configuration"
echo ""

if [ ! -f "$ENV_FILE" ]; then
    print_failure ".env file not found"
    exit 1
fi

print_success ".env file exists"

# Extract Redis password
REDIS_PASSWORD=$(grep "^REDIS_PASSWORD=" "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)

if [ -z "$REDIS_PASSWORD" ]; then
    print_failure "REDIS_PASSWORD not set in .env file"
    exit 1
fi

print_success "REDIS_PASSWORD is set in .env file"
echo "  Password length: ${#REDIS_PASSWORD} characters"

# Check for CFN_REDIS_PASSWORD variant
if grep -q "^CFN_REDIS_PASSWORD=" "$ENV_FILE"; then
    print_warning "Both REDIS_PASSWORD and CFN_REDIS_PASSWORD are defined (may cause confusion)"
fi

echo ""

# ===== VALIDATION TASK 3: Check for Multiple docker-compose Files =====
print_section "Task 3: Identify All Docker Compose Files"
echo ""

# Find all docker-compose files with redis configuration
REDIS_COMPOSE_FILES=$(find "$PROJECT_ROOT" -name "docker-compose*.yml" -o -name "docker-compose*.yaml" 2>/dev/null | xargs grep -l "redis:" 2>/dev/null | sort || true)

if [ -z "$REDIS_COMPOSE_FILES" ]; then
    print_warning "No docker-compose files with Redis found"
else
    echo "Docker Compose files with Redis configuration:"
    echo "$REDIS_COMPOSE_FILES" | while read -r file; do
        echo "  - $file"
    done
    echo ""

    # Check if all have --requirepass
    echo "Checking --requirepass in all Redis configurations:"
    echo "$REDIS_COMPOSE_FILES" | while read -r file; do
        if grep -A 10 "redis:" "$file" | grep -q "\-\-requirepass"; then
            print_success "  $(basename $file): --requirepass found"
        else
            print_failure "  $(basename $file): --requirepass MISSING"
        fi
    done
fi

echo ""

# ===== VALIDATION TASK 4: Docker Health Check =====
print_section "Task 4: Check Docker Service Status"
echo ""

# Check if docker is available
if ! command -v docker &> /dev/null; then
    print_warning "Docker not available, skipping container tests"
else
    print_success "Docker is available"

    # Check if redis container is running
    if docker ps --filter "name=cfn-redis" --filter "status=running" 2>/dev/null | grep -q cfn-redis; then
        print_success "Redis container (cfn-redis) is running"
        REDIS_RUNNING=true
    else
        print_warning "Redis container (cfn-redis) is not running"
        echo "  Use: docker-compose up -d redis"
        REDIS_RUNNING=false
    fi
fi

echo ""

# ===== VALIDATION TASK 5: Test Authentication (if Redis is running) =====
if [ "${REDIS_RUNNING:-false}" = true ]; then
    print_section "Task 5: Test Redis Authentication"
    echo ""

    # Test NEGATIVE case: Unauthenticated connection should FAIL
    echo "Test 5.1: NEGATIVE - Unauthenticated connection should be REJECTED"

    UNAUTHENTICATED_RESULT=$(docker exec cfn-redis redis-cli ping 2>&1 || true)

    if echo "$UNAUTHENTICATED_RESULT" | grep -q "NOAUTH\|authentication required\|ERR"; then
        print_success "Unauthenticated PING rejected with error"
        echo "  Error message: $UNAUTHENTICATED_RESULT"
    else
        print_failure "Unauthenticated PING was NOT rejected (CRITICAL SECURITY ISSUE)"
        echo "  Result: $UNAUTHENTICATED_RESULT"
        VALIDATION_ISSUES+=("Redis server accepts unauthenticated connections (SEC-001)")
    fi

    echo ""

    # Test POSITIVE case: Authenticated connection should SUCCEED
    echo "Test 5.2: POSITIVE - Authenticated connection should SUCCEED"

    if [ -n "$REDIS_PASSWORD" ]; then
        AUTHENTICATED_RESULT=$(docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" ping 2>&1 || true)

        if echo "$AUTHENTICATED_RESULT" | grep -qi "PONG\|OK"; then
            print_success "Authenticated PING succeeded"
            echo "  Response: $AUTHENTICATED_RESULT"
        else
            print_failure "Authenticated PING failed"
            echo "  Result: $AUTHENTICATED_RESULT"
            VALIDATION_ISSUES+=("Authenticated connection failed - check password configuration")
        fi
    else
        print_warning "Cannot test authenticated connection - password not available"
    fi

    echo ""

    # Test detailed security checks
    print_section "Task 5.3: Additional Security Checks"
    echo ""

    # Check Redis configuration inside container
    echo "Redis server configuration:"
    REDIS_CONFIG=$(docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET requirepass 2>&1 || true)

    if echo "$REDIS_CONFIG" | grep -q "requirepass"; then
        print_success "requirepass is configured in Redis server"
        echo "  $REDIS_CONFIG"
    else
        print_warning "Could not verify requirepass configuration via CONFIG GET"
    fi

    echo ""

    # Test connection timeout behavior
    echo "Test 5.4: Verify NOAUTH Error Message"
    NOAUTH_TEST=$(timeout 3 docker exec cfn-redis redis-cli INFO server 2>&1 || true)

    if echo "$NOAUTH_TEST" | grep -q "NOAUTH"; then
        print_success "Server correctly returns NOAUTH for unauthenticated commands"
    else
        print_warning "NOAUTH error not seen in INFO command"
    fi

else
    echo ""
    print_warning "Redis container is not running - skipping authentication tests"
    echo "To run these tests:"
    echo "  1. Start services: docker-compose up -d"
    echo "  2. Re-run this script: $0"
fi

echo ""

# ===== SUMMARY =====
print_section "Validation Summary"
echo ""

echo "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ ${#VALIDATION_ISSUES[@]} -gt 0 ]; then
    echo -e "${RED}Validation Issues Found:${NC}"
    for i in "${!VALIDATION_ISSUES[@]}"; do
        echo "  $((i+1)). ${VALIDATION_ISSUES[$i]}"
    done
    echo ""
fi

# ===== CONFIGURATION SUMMARY =====
print_section "Configuration Summary"
echo ""

echo "Project Root: $PROJECT_ROOT"
echo "Docker Compose: $DOCKER_COMPOSE_FILE"
echo "Environment File: $ENV_FILE"
echo ""

echo "Redis Configuration:"
echo "  - Password configured: $([ -n "$REDIS_PASSWORD" ] && echo 'Yes' || echo 'No')"
echo "  - Password length: ${#REDIS_PASSWORD} chars"
echo "  - Health check uses auth: $(grep -A 5 'redis:' "$DOCKER_COMPOSE_FILE" | grep -q 'redis-cli.*-a' && echo 'Yes' || echo 'No')"
echo ""

# ===== RECOMMENDATIONS =====
if [ ${TESTS_FAILED} -gt 0 ]; then
    print_section "Recommendations"
    echo ""
    echo "1. Verify docker-compose.yml has --requirepass \${REDIS_PASSWORD}"
    echo "2. Verify .env file has REDIS_PASSWORD set to a strong value"
    echo "3. Restart Redis container: docker-compose restart redis"
    echo "4. Run authentication test again"
    echo ""
fi

# ===== EXIT CODE =====
if [ ${TESTS_FAILED} -eq 0 ]; then
    echo -e "${GREEN}✓ Redis authentication validation PASSED${NC}"
    exit 0
else
    echo -e "${RED}✗ Redis authentication validation FAILED${NC}"
    exit 1
fi
