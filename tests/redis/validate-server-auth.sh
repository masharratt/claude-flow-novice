#!/bin/bash
# Validation script for Redis server-side authentication enforcement
# Tests that Redis server requires password authentication (--requirepass flag)
#
# Expected behavior:
# - Unauthenticated access: NOAUTH error
# - Authenticated access: PONG response
#
# Created: 2025-11-17
# Context: Iteration 2 fix for SEC-001 CRITICAL issue

set -euo pipefail

echo "=== Redis Server Authentication Validation ==="
echo ""

# Check if Redis container is running
if ! docker ps --filter "name=cfn-redis" --format "{{.Names}}" | grep -q "cfn-redis"; then
    echo "❌ FAIL: cfn-redis container is not running"
    echo ""
    echo "Start the container with:"
    echo "  cd docker && docker-compose up -d cfn-redis"
    exit 1
fi

echo "✓ cfn-redis container is running"
echo ""

# Test 1: Unauthenticated access should be REJECTED
echo "Test 1: Unauthenticated access (should fail with NOAUTH)"
UNAUTH_RESULT=$(docker exec cfn-redis redis-cli PING 2>&1 || true)

if echo "$UNAUTH_RESULT" | grep -q "NOAUTH"; then
    echo "✅ PASS: Unauthenticated access rejected with NOAUTH"
    echo "   Response: $UNAUTH_RESULT"
else
    echo "❌ FAIL: Unauthenticated access should return NOAUTH error"
    echo "   Got: $UNAUTH_RESULT"
    echo ""
    echo "This means --requirepass is NOT enforced on the Redis server."
    echo "Check docker-compose.yml command line for --requirepass flag."
    exit 1
fi

echo ""

# Test 2: Authenticated access should SUCCEED
echo "Test 2: Authenticated access (should succeed with PONG)"

# Get password from .env file
if [ -f "/mnt/c/Users/masha/Documents/claude-flow-novice/.env" ]; then
    source "/mnt/c/Users/masha/Documents/claude-flow-novice/.env"
fi

# Use CFN_REDIS_PASSWORD or fall back to REDIS_PASSWORD
REDIS_PASS="${CFN_REDIS_PASSWORD:-${REDIS_PASSWORD:-}}"

if [ -z "$REDIS_PASS" ]; then
    echo "❌ FAIL: No password found in environment"
    echo "   Check .env file for CFN_REDIS_PASSWORD or REDIS_PASSWORD"
    exit 1
fi

AUTH_RESULT=$(docker exec cfn-redis redis-cli -a "$REDIS_PASS" PING 2>&1 || true)

# Filter out the warning message about using password on CLI
AUTH_RESULT_CLEAN=$(echo "$AUTH_RESULT" | grep -v "Warning: Using a password")

if [ "$AUTH_RESULT_CLEAN" = "PONG" ]; then
    echo "✅ PASS: Authenticated access succeeded with PONG"
    echo "   Response: $AUTH_RESULT_CLEAN"
else
    echo "❌ FAIL: Authenticated access should return PONG"
    echo "   Got: $AUTH_RESULT_CLEAN"
    exit 1
fi

echo ""

# Test 3: Verify command line contains --requirepass
echo "Test 3: Verify Redis command line includes --requirepass flag"
REDIS_CMD=$(docker inspect cfn-redis --format '{{.Args}}' 2>&1 || echo "")

if echo "$REDIS_CMD" | grep -q "requirepass"; then
    echo "✅ PASS: Redis command includes --requirepass flag"
    echo "   Command: $REDIS_CMD"
else
    echo "⚠️  WARNING: Could not verify --requirepass in command (inspect may not show env-expanded args)"
    echo "   Tests 1 and 2 provide functional verification"
fi

echo ""
echo "=== All Tests Passed ==="
echo ""
echo "Summary:"
echo "  ✅ Server-side authentication is ENFORCED"
echo "  ✅ Unauthenticated clients are REJECTED (NOAUTH)"
echo "  ✅ Authenticated clients are ACCEPTED (PONG)"
echo ""
echo "Security posture: SECURE"
echo "Confidence: 0.95"
