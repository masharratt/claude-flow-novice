#!/usr/bin/env bash
# Test: Redis password environment variable consistency
# Critical Security Fix: Iteration 2 - Environment variable mismatch
# 
# ISSUE: Two docker-compose files used different variable names
# - Root docker-compose.yml: REDIS_PASSWORD (defined in .env)
# - Coordinator docker/docker-compose.yml: CFN_REDIS_PASSWORD (NOT defined)
# 
# IMPACT: CVSS 9.1/10 - Production coordinator had no Redis authentication
#
# FIX: Standardize both to use REDIS_PASSWORD (the variable in .env)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT_COMPOSE="$PROJECT_ROOT/docker-compose.yml"
COORDINATOR_COMPOSE="$PROJECT_ROOT/docker/docker-compose.yml"

echo "=== Redis Password Consistency Test ==="
echo ""

# Test 1: Both Redis containers use same password variable
echo "Test 1: Redis containers use REDIS_PASSWORD"
ROOT_REDIS_CMD=$(grep 'requirepass' "$ROOT_COMPOSE" || echo "")
COORD_REDIS_CMD=$(grep 'requirepass' "$COORDINATOR_COMPOSE" || echo "")

if [[ "$ROOT_REDIS_CMD" =~ \$\{REDIS_PASSWORD\} ]] && [[ "$COORD_REDIS_CMD" =~ \$\{REDIS_PASSWORD\} ]]; then
  echo "  ✅ PASS: Both use \${REDIS_PASSWORD}"
else
  echo "  ❌ FAIL: Variable mismatch"
  echo "  Root: $ROOT_REDIS_CMD"
  echo "  Coordinator: $COORD_REDIS_CMD"
  exit 1
fi

# Test 2: .env defines REDIS_PASSWORD
echo "Test 2: .env defines REDIS_PASSWORD"
if [ -f "$PROJECT_ROOT/.env" ] && grep -q '^REDIS_PASSWORD=' "$PROJECT_ROOT/.env"; then
  echo "  ✅ PASS: REDIS_PASSWORD found in .env"
else
  echo "  ❌ FAIL: REDIS_PASSWORD not in .env"
  exit 1
fi

# Test 3: Coordinator maps REDIS_PASSWORD to CFN_REDIS_PASSWORD
echo "Test 3: Coordinator environment uses CFN_REDIS_PASSWORD=\${REDIS_PASSWORD}"
if grep -q 'CFN_REDIS_PASSWORD=\${REDIS_PASSWORD' "$COORDINATOR_COMPOSE"; then
  echo "  ✅ PASS: Correct variable mapping"
else
  echo "  ❌ FAIL: Coordinator not reading from REDIS_PASSWORD"
  exit 1
fi

echo ""
echo "✅ All tests passed - Redis authentication properly configured"
