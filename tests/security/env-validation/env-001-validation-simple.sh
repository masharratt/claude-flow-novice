#!/usr/bin/env bash

# ENV-001: Redis Password Standardization - Simple Validation
# Tests core standardization without external dependencies

set -eu

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

WORK_DIR="$PROJECT_ROOT"
PASS=0
FAIL=0

echo "=== ENV-001 Redis Password Standardization Validation ==="
echo ""

# Test 1: Root docker-compose uses REDIS_PASSWORD
echo "Test 1: Root docker-compose.yml uses REDIS_PASSWORD"
if grep -q 'requirepass ${REDIS_PASSWORD}' "$WORK_DIR/docker-compose.yml"; then
  echo "  PASS: Root redis service uses REDIS_PASSWORD"
  ((PASS++))
else
  echo "  FAIL: Root redis service missing REDIS_PASSWORD"
  ((FAIL++))
fi

# Test 2: Root healthcheck uses REDIS_PASSWORD
echo "Test 2: Root healthcheck authenticates with REDIS_PASSWORD"
if grep -q 'redis-cli.*${REDIS_PASSWORD}' "$WORK_DIR/docker-compose.yml"; then
  echo "  PASS: Root healthcheck uses REDIS_PASSWORD"
  ((PASS++))
else
  echo "  FAIL: Root healthcheck missing REDIS_PASSWORD"
  ((FAIL++))
fi

# Test 3: Coordinator maps REDIS_PASSWORD to CFN_REDIS_PASSWORD
echo "Test 3: Coordinator maps REDIS_PASSWORD to CFN_REDIS_PASSWORD"
if grep -q 'CFN_REDIS_PASSWORD=${REDIS_PASSWORD' "$WORK_DIR/docker/docker-compose.yml"; then
  echo "  PASS: Coordinator maps REDIS_PASSWORD correctly"
  ((PASS++))
else
  echo "  FAIL: Coordinator missing REDIS_PASSWORD mapping"
  ((FAIL++))
fi

# Test 4: Coordinator has ENV-001 documentation
echo "Test 4: Coordinator has ENV-001 standardization documentation"
if grep -q 'ENV-001.*Standardized naming' "$WORK_DIR/docker/docker-compose.yml"; then
  echo "  PASS: Coordinator has ENV-001 documentation"
  ((PASS++))
else
  echo "  FAIL: Coordinator missing ENV-001 documentation"
  ((FAIL++))
fi

# Test 5: Agent executor reads CFN_REDIS_PASSWORD
echo "Test 5: Agent executor reads CFN_REDIS_PASSWORD"
if grep -q 'redisPassword = process.env.CFN_REDIS_PASSWORD' "$WORK_DIR/src/cli/agent-executor.ts"; then
  echo "  PASS: Agent executor reads CFN_REDIS_PASSWORD"
  ((PASS++))
else
  echo "  FAIL: Agent executor missing CFN_REDIS_PASSWORD support"
  ((FAIL++))
fi

# Test 6: Agent executor fallback to REDIS_PASSWORD
echo "Test 6: Agent executor falls back to REDIS_PASSWORD"
if grep -q 'redisPassword = .* || process.env.REDIS_PASSWORD' "$WORK_DIR/src/cli/agent-executor.ts"; then
  echo "  PASS: Agent executor has REDIS_PASSWORD fallback"
  ((PASS++))
else
  echo "  FAIL: Agent executor missing REDIS_PASSWORD fallback"
  ((FAIL++))
fi

# Test 7: Agent executor constructs auth flag
echo "Test 7: Agent executor includes auth flag in redis-cli"
if grep -q 'authFlag = redisPassword' "$WORK_DIR/src/cli/agent-executor.ts"; then
  echo "  PASS: Agent executor constructs auth flag"
  ((PASS++))
else
  echo "  FAIL: Agent executor missing auth flag construction"
  ((FAIL++))
fi

# Test 8: Agent executor uses auth flag
echo "Test 8: Agent executor applies auth flag to redis-cli"
if grep -q '${authFlag}' "$WORK_DIR/src/cli/agent-executor.ts"; then
  echo "  PASS: Agent executor applies auth flag"
  ((PASS++))
else
  echo "  FAIL: Agent executor missing auth flag application"
  ((FAIL++))
fi

# Test 9: ENV file defines REDIS_PASSWORD
echo "Test 9: .env file defines REDIS_PASSWORD"
if grep -q '^REDIS_PASSWORD=' "$WORK_DIR/.env"; then
  echo "  PASS: .env defines REDIS_PASSWORD"
  ((PASS++))
else
  echo "  FAIL: .env missing REDIS_PASSWORD"
  ((FAIL++))
fi

# Test 10: No hardcoded passwords in root compose
echo "Test 10: No hardcoded passwords in root docker-compose"
hardcoded=0
if grep -E 'requirepass [^$]' "$WORK_DIR/docker-compose.yml" | grep -v 'requirepass ${' > /dev/null 2>&1; then
  hardcoded=1
fi
if [ $hardcoded -eq 0 ]; then
  echo "  PASS: No hardcoded passwords in root docker-compose"
  ((PASS++))
else
  echo "  FAIL: Hardcoded passwords detected in root docker-compose"
  ((FAIL++))
fi

# Test 11: No hardcoded passwords in coordinator compose
echo "Test 11: No hardcoded passwords in coordinator docker-compose"
hardcoded=0
if grep -E 'requirepass [^$]' "$WORK_DIR/docker/docker-compose.yml" | grep -v 'requirepass ${' > /dev/null 2>&1; then
  hardcoded=1
fi
if [ $hardcoded -eq 0 ]; then
  echo "  PASS: No hardcoded passwords in coordinator docker-compose"
  ((PASS++))
else
  echo "  FAIL: Hardcoded passwords detected in coordinator docker-compose"
  ((FAIL++))
fi

# Test 12: ENV-001 documentation exists
echo "Test 12: ENV-001 documentation file exists"
if [ -f "$WORK_DIR/docs/ENV-001_REDIS_PASSWORD_STANDARDIZATION.md" ]; then
  echo "  PASS: ENV-001 documentation exists"
  ((PASS++))
else
  echo "  FAIL: ENV-001 documentation missing"
  ((FAIL++))
fi

echo ""
echo "=== Test Results ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "SUCCESS: All tests passed!"
  exit 0
else
  echo "FAILURE: Some tests failed"
  exit 1
fi
