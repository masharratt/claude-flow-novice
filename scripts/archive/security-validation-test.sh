#!/bin/bash
# Independent Security Validation for SEC-001 Fix
# Tests Redis authentication enforcement

set -euo pipefail

echo "=== INDEPENDENT SECURITY VALIDATION TEST ==="
echo ""

# Load environment
source .env 2>/dev/null || echo "Warning: .env not found"

# Get password
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

echo "=== CONFIGURATION CHECK ==="
echo "REDIS_PASSWORD defined: ${REDIS_PASSWORD:+YES}${REDIS_PASSWORD:+ (length: ${#REDIS_PASSWORD})}${REDIS_PASSWORD:-NO}"
echo "CFN_REDIS_PASSWORD defined: ${CFN_REDIS_PASSWORD:+YES (length: ${#CFN_REDIS_PASSWORD})}${CFN_REDIS_PASSWORD:-NO - CRITICAL ISSUE}"
echo ""

echo "=== ATTACK SCENARIO 1: Unauthenticated PING ==="
RESULT=$(docker exec cfn-redis redis-cli PING 2>&1 || true)
if echo "$RESULT" | grep -q "NOAUTH"; then
  echo "✅ PASS: Server rejected unauthenticated access"
  echo "   Response: $(echo "$RESULT" | head -1)"
else
  echo "❌ FAIL: Server accepted unauthenticated access"
  echo "   Response: $RESULT"
  FAIL=1
fi
echo ""

echo "=== ATTACK SCENARIO 2: Authenticated PING ==="
if [ -z "$REDIS_PASSWORD" ]; then
  echo "❌ FAIL: REDIS_PASSWORD not configured"
  FAIL=1
else
  AUTH_RESULT=$(docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" PING 2>&1 || true)
  AUTH_CLEAN=$(echo "$AUTH_RESULT" | grep -v "Warning:" | head -1)
  if [ "$AUTH_CLEAN" = "PONG" ]; then
    echo "✅ PASS: Authenticated client accepted"
    echo "   Response: $AUTH_CLEAN"
  else
    echo "❌ FAIL: Authenticated client rejected"
    echo "   Response: $AUTH_CLEAN"
    FAIL=1
  fi
fi
echo ""

echo "=== ATTACK SCENARIO 3: FLUSHALL without authentication ==="
FLUSH_RESULT=$(docker exec cfn-redis redis-cli FLUSHALL 2>&1 || true)
if echo "$FLUSH_RESULT" | grep -q "NOAUTH"; then
  echo "✅ PASS: Server blocked destructive command"
  echo "   Response: $(echo "$FLUSH_RESULT" | head -1)"
else
  echo "❌ FAIL: Server allowed destructive command"
  echo "   Response: $FLUSH_RESULT"
  FAIL=1
fi
echo ""

echo "=== ATTACK SCENARIO 4: Task queue manipulation check ==="
if [ -z "$REDIS_PASSWORD" ]; then
  echo "⚠️  SKIP: No password configured"
else
  LPUSH_RESULT=$(docker exec cfn-redis redis-cli LPUSH task:queue test 2>&1 || true)
  if echo "$LPUSH_RESULT" | grep -q "NOAUTH"; then
    echo "✅ PASS: Server blocked queue manipulation"
    echo "   Response: $(echo "$LPUSH_RESULT" | head -1)"
  else
    echo "❌ FAIL: Server allowed queue manipulation"
    echo "   Response: $LPUSH_RESULT"
    FAIL=1
  fi
fi
echo ""

echo "=== CONFIGURATION VERIFICATION ==="
COMPOSE_CHECK=$(grep -o "requirepass.*" docker/docker-compose.yml | head -1 || echo "NOT FOUND")
echo "docker/docker-compose.yml config: $COMPOSE_CHECK"
echo ""

echo "=== SUMMARY ==="
if [ "${FAIL:-0}" = "1" ]; then
  echo "❌ VALIDATION FAILED"
  exit 1
else
  echo "✅ VALIDATION PASSED"
  exit 0
fi
