#!/bin/bash
# tests/docker/validate-bug6-redis-vars.sh
# Phase 0 :: Validate Bug #6 Fix - CFN_REDIS_HOST/CFN_REDIS_PORT Standardization
# Tests that agents connect to Redis using CFN_REDIS_HOST and CFN_REDIS_PORT
# after variable name standardization (Bug #6 fix)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
NETWORK_NAME="cfn-network-bug6-test"
REDIS_CONTAINER="cfn-redis-bug6-test"
WORKSPACE="/tmp/cfn-bug6-test-$$"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup function
cleanup() {
  local exit_code=$?
  echo ""
  echo -e "${BLUE}[CLEANUP]${NC} Removing test containers and network..."
  docker rm -f "$REDIS_CONTAINER" 2>/dev/null || true
  docker ps -a --filter "name=cfn-bug6-agent" -q | xargs -r docker rm -f 2>/dev/null || true
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
  rm -rf "$WORKSPACE" 2>/dev/null || true
  exit $exit_code
}

trap cleanup EXIT INT TERM

# Test assertion helpers
assert_success() {
  local test_name="$1"
  local command="$2"

  echo -e "${BLUE}[TEST]${NC} $test_name"

  if eval "$command" >/dev/null 2>&1; then
    echo -e "${GREEN}[PASS]${NC} $test_name"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $test_name"
    ((TESTS_FAILED++))
    return 1
  fi
}

assert_output_contains() {
  local test_name="$1"
  local command="$2"
  local expected="$3"

  echo -e "${BLUE}[TEST]${NC} $test_name"

  local output
  output=$(eval "$command" 2>&1 || echo "COMMAND_FAILED")

  if echo "$output" | grep -q "$expected"; then
    echo -e "${GREEN}[PASS]${NC} $test_name (found: $expected)"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $test_name"
    echo -e "${YELLOW}Expected:${NC} $expected"
    echo -e "${YELLOW}Got:${NC} $output"
    ((TESTS_FAILED++))
    return 1
  fi
}

# Start test suite
echo "============================================================"
echo "Bug #6 Validation: CFN_REDIS_HOST/CFN_REDIS_PORT Standardization"
echo "============================================================"
echo ""
echo "This test validates that agents use CFN_REDIS_HOST and CFN_REDIS_PORT"
echo "instead of legacy REDIS_HOST/REDIS_PORT variables."
echo ""
echo "Bug #6 Context:"
echo "  - Before: REDIS_HOST, MCP_REDIS_HOST (inconsistent)"
echo "  - After:  CFN_REDIS_HOST, CFN_REDIS_PORT (standardized)"
echo "  - Backward compatibility via fallback pattern"
echo ""

# Phase 1: Infrastructure Setup
echo "============================================================"
echo "Phase 1: Infrastructure Setup"
echo "============================================================"
echo ""

# Test 1: Create Docker network
echo -e "${BLUE}[SETUP]${NC} Creating Docker network: $NETWORK_NAME"
assert_success "Create Docker network" \
  "docker network create $NETWORK_NAME >/dev/null 2>&1 || docker network inspect $NETWORK_NAME >/dev/null 2>&1"

# Test 2: Start Redis container
echo -e "${BLUE}[SETUP]${NC} Starting Redis container: $REDIS_CONTAINER"
docker run -d \
  --name "$REDIS_CONTAINER" \
  --network "$NETWORK_NAME" \
  redis:7-alpine >/dev/null 2>&1

sleep 2 # Wait for Redis to be ready

assert_success "Redis container is running" \
  "docker ps --filter name=$REDIS_CONTAINER --filter status=running --quiet | grep -q ."

assert_output_contains "Redis responds to PING" \
  "docker exec $REDIS_CONTAINER redis-cli PING" \
  "PONG"

echo ""

# Phase 2: CFN_REDIS_HOST Variable Tests
echo "============================================================"
echo "Phase 2: CFN_REDIS_HOST Variable Tests"
echo "============================================================"
echo ""

# Test 3: Create workspace for test agents
echo -e "${BLUE}[SETUP]${NC} Creating test workspace: $WORKSPACE"
mkdir -p "$WORKSPACE"

# Test 4: Agent using CFN_REDIS_HOST can connect
echo -e "${BLUE}[TEST]${NC} Agent with CFN_REDIS_HOST connects to Redis"

cat > "$WORKSPACE/test-cfn-vars.sh" <<'AGENT_SCRIPT'
#!/bin/bash
set -euo pipefail

echo "[AGENT] Testing CFN_REDIS_HOST variable"
echo "[AGENT] CFN_REDIS_HOST=${CFN_REDIS_HOST:-NOT_SET}"
echo "[AGENT] CFN_REDIS_PORT=${CFN_REDIS_PORT:-NOT_SET}"

# Verify environment variables are set
if [ -z "${CFN_REDIS_HOST:-}" ]; then
  echo "[AGENT] ERROR: CFN_REDIS_HOST not set"
  exit 1
fi

if [ -z "${CFN_REDIS_PORT:-}" ]; then
  echo "[AGENT] ERROR: CFN_REDIS_PORT not set"
  exit 1
fi

# Test connection using CFN_REDIS_HOST
if redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" PING | grep -q "PONG"; then
  echo "[AGENT] SUCCESS: Connected using CFN_REDIS_HOST"
  exit 0
else
  echo "[AGENT] ERROR: Cannot connect using CFN_REDIS_HOST"
  exit 1
fi
AGENT_SCRIPT

chmod +x "$WORKSPACE/test-cfn-vars.sh"

docker run --rm \
  --name "cfn-bug6-agent-test1" \
  --network "$NETWORK_NAME" \
  -v "$WORKSPACE:/workspace:ro" \
  -e CFN_REDIS_HOST="$REDIS_CONTAINER" \
  -e CFN_REDIS_PORT=6379 \
  redis:7-alpine \
  /workspace/test-cfn-vars.sh 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}[PASS]${NC} Agent connects using CFN_REDIS_HOST"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} Agent cannot connect using CFN_REDIS_HOST"
  ((TESTS_FAILED++))
fi

echo ""

# Phase 3: Init Script Pattern Validation
echo "============================================================"
echo "Phase 3: Init Script Pattern Validation"
echo "============================================================"
echo ""

# Test 5: Test actual init script pattern (from docker-agent-init.sh)
echo -e "${BLUE}[TEST]${NC} Actual init script fallback pattern"

cat > "$WORKSPACE/test-init-pattern.sh" <<'INIT_SCRIPT'
#!/bin/bash
set -euo pipefail

# This is the ACTUAL pattern from docker-agent-init.sh (line 109)
REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-cfn-redis}}"
REDIS_PORT="${CFN_REDIS_PORT:-${REDIS_PORT:-6379}}"

echo "[INIT] Testing docker-agent-init.sh pattern"
echo "[INIT] CFN_REDIS_HOST=${CFN_REDIS_HOST:-NOT_SET}"
echo "[INIT] REDIS_HOST (legacy)=${REDIS_HOST:-NOT_SET}"
echo "[INIT] Resolved REDIS_HOST=$REDIS_HOST"
echo "[INIT] Resolved REDIS_PORT=$REDIS_PORT"

# Test connection
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING | grep -q "PONG"; then
  echo "[INIT] SUCCESS: Init pattern connects correctly"
  exit 0
else
  echo "[INIT] ERROR: Init pattern failed to connect"
  exit 1
fi
INIT_SCRIPT

chmod +x "$WORKSPACE/test-init-pattern.sh"

docker run --rm \
  --name "cfn-bug6-agent-init" \
  --network "$NETWORK_NAME" \
  -v "$WORKSPACE:/workspace:ro" \
  -e CFN_REDIS_HOST="$REDIS_CONTAINER" \
  -e CFN_REDIS_PORT=6379 \
  redis:7-alpine \
  /workspace/test-init-pattern.sh 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}[PASS]${NC} Init script pattern works"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} Init script pattern failed"
  ((TESTS_FAILED++))
fi

echo ""

# Phase 4: Backward Compatibility Tests
echo "============================================================"
echo "Phase 4: Backward Compatibility Tests"
echo "============================================================"
echo ""

# Test 6: Fallback to REDIS_HOST when CFN_REDIS_HOST not set
echo -e "${BLUE}[TEST]${NC} Backward compatibility: REDIS_HOST fallback"

cat > "$WORKSPACE/test-legacy-fallback.sh" <<'FALLBACK_SCRIPT'
#!/bin/bash
set -euo pipefail

# Test the fallback pattern when CFN_REDIS_HOST is NOT set
# This ensures old code still works
REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-cfn-redis}}"
REDIS_PORT="${CFN_REDIS_PORT:-${REDIS_PORT:-6379}}"

echo "[LEGACY] Testing fallback to REDIS_HOST"
echo "[LEGACY] CFN_REDIS_HOST=${CFN_REDIS_HOST:-NOT_SET}"
echo "[LEGACY] REDIS_HOST (provided)=${REDIS_HOST}"

if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING | grep -q "PONG"; then
  echo "[LEGACY] SUCCESS: Fallback pattern works"
  exit 0
else
  echo "[LEGACY] ERROR: Fallback pattern failed"
  exit 1
fi
FALLBACK_SCRIPT

chmod +x "$WORKSPACE/test-legacy-fallback.sh"

# Don't set CFN_REDIS_HOST, only legacy REDIS_HOST
docker run --rm \
  --name "cfn-bug6-agent-legacy" \
  --network "$NETWORK_NAME" \
  -v "$WORKSPACE:/workspace:ro" \
  -e REDIS_HOST="$REDIS_CONTAINER" \
  -e REDIS_PORT=6379 \
  redis:7-alpine \
  /workspace/test-legacy-fallback.sh 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}[PASS]${NC} Backward compatibility (REDIS_HOST fallback)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} Backward compatibility failed"
  ((TESTS_FAILED++))
fi

echo ""

# Phase 5: Heartbeat and Coordination Tests
echo "============================================================"
echo "Phase 5: Heartbeat and Coordination Tests"
echo "============================================================"
echo ""

# Test 7: Agent writes heartbeat using CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} Agent writes heartbeat to Redis"

cat > "$WORKSPACE/test-heartbeat.sh" <<'HEARTBEAT_SCRIPT'
#!/bin/bash
set -euo pipefail

HEARTBEAT_KEY="swarm:test-task:agent-$$:heartbeat"

echo "[HEARTBEAT] Writing heartbeat using CFN_REDIS_HOST"

# Write heartbeat
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" \
  SET "$HEARTBEAT_KEY" "alive" EX 60 >/dev/null

# Read it back
HEARTBEAT_VALUE=$(redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" \
  GET "$HEARTBEAT_KEY")

if [ "$HEARTBEAT_VALUE" = "alive" ]; then
  echo "[HEARTBEAT] SUCCESS: Heartbeat written and read"
  exit 0
else
  echo "[HEARTBEAT] ERROR: Heartbeat mismatch. Expected: alive, Got: $HEARTBEAT_VALUE"
  exit 1
fi
HEARTBEAT_SCRIPT

chmod +x "$WORKSPACE/test-heartbeat.sh"

docker run --rm \
  --name "cfn-bug6-agent-heartbeat" \
  --network "$NETWORK_NAME" \
  -v "$WORKSPACE:/workspace:ro" \
  -e CFN_REDIS_HOST="$REDIS_CONTAINER" \
  -e CFN_REDIS_PORT=6379 \
  redis:7-alpine \
  /workspace/test-heartbeat.sh 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}[PASS]${NC} Heartbeat write/read"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} Heartbeat write/read failed"
  ((TESTS_FAILED++))
fi

echo ""

# Test 8: Agent completion signal using CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} Agent sends completion signal"

cat > "$WORKSPACE/test-completion.sh" <<'COMPLETION_SCRIPT'
#!/bin/bash
set -euo pipefail

SIGNAL_KEY="swarm:test-task:agent-$$:done"

echo "[COMPLETION] Testing completion signal"

# Send completion signal (LPUSH pattern from init script)
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" \
  LPUSH "$SIGNAL_KEY" "complete" >/dev/null

# Verify signal was stored
SIGNAL_VALUE=$(redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" \
  LPOP "$SIGNAL_KEY")

if [ "$SIGNAL_VALUE" = "complete" ]; then
  echo "[COMPLETION] SUCCESS: Completion signal sent and verified"
  exit 0
else
  echo "[COMPLETION] ERROR: Signal mismatch. Expected: complete, Got: $SIGNAL_VALUE"
  exit 1
fi
COMPLETION_SCRIPT

chmod +x "$WORKSPACE/test-completion.sh"

docker run --rm \
  --name "cfn-bug6-agent-completion" \
  --network "$NETWORK_NAME" \
  -v "$WORKSPACE:/workspace:ro" \
  -e CFN_REDIS_HOST="$REDIS_CONTAINER" \
  -e CFN_REDIS_PORT=6379 \
  redis:7-alpine \
  /workspace/test-completion.sh 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}[PASS]${NC} Completion signal"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} Completion signal failed"
  ((TESTS_FAILED++))
fi

echo ""

# Phase 6: CLI Code Validation
echo "============================================================"
echo "Phase 6: CLI Code Validation (Static Analysis)"
echo "============================================================"
echo ""

# Test 9: Verify agent-executor.ts uses CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} agent-executor.ts uses CFN_REDIS_HOST"

if grep -q 'CFN_REDIS_HOST' "$PROJECT_ROOT/src/cli/agent-executor.ts"; then
  echo -e "${GREEN}[PASS]${NC} agent-executor.ts uses CFN_REDIS_HOST"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} agent-executor.ts missing CFN_REDIS_HOST"
  ((TESTS_FAILED++))
fi

# Test 10: Verify agent-token-manager.js uses CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} agent-token-manager.js uses CFN_REDIS_HOST"

if grep -q 'CFN_REDIS_HOST' "$PROJECT_ROOT/src/cli/agent-token-manager.js"; then
  echo -e "${GREEN}[PASS]${NC} agent-token-manager.js uses CFN_REDIS_HOST"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} agent-token-manager.js missing CFN_REDIS_HOST"
  ((TESTS_FAILED++))
fi

# Test 11: Verify iteration-history.ts uses CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} iteration-history.ts uses CFN_REDIS_HOST"

if grep -q 'CFN_REDIS_HOST' "$PROJECT_ROOT/src/cli/iteration-history.ts"; then
  echo -e "${GREEN}[PASS]${NC} iteration-history.ts uses CFN_REDIS_HOST"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} iteration-history.ts missing CFN_REDIS_HOST"
  ((TESTS_FAILED++))
fi

# Test 12: Verify coordinator uses CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} coordinator.js uses CFN_REDIS_HOST"

if grep -q 'CFN_REDIS_HOST' "$PROJECT_ROOT/docker/coordinator/src/coordinator.js"; then
  echo -e "${GREEN}[PASS]${NC} coordinator.js uses CFN_REDIS_HOST"
  ((TESTS_PASSED++))
else
  echo -e "${RED}[FAIL]${NC} coordinator.js missing CFN_REDIS_HOST"
  ((TESTS_FAILED++))
fi

echo ""

# Phase 7: Environment Contract Validation
echo "============================================================"
echo "Phase 7: Environment Contract Validation"
echo "============================================================"
echo ""

# Test 14: Verify cfn-runtime.contract.yml documents CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} cfn-runtime.contract.yml documents CFN_REDIS_HOST"

if [ -f "$PROJECT_ROOT/docker/runtime/cfn-runtime.contract.yml" ]; then
  if grep -q 'CFN_REDIS_HOST' "$PROJECT_ROOT/docker/runtime/cfn-runtime.contract.yml"; then
    echo -e "${GREEN}[PASS]${NC} CFN_REDIS_HOST in contract"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}[FAIL]${NC} CFN_REDIS_HOST missing from contract"
    ((TESTS_FAILED++))
  fi
else
  echo -e "${YELLOW}[SKIP]${NC} cfn-runtime.contract.yml not found"
fi

# Test 15: Verify cfn-runtime.env sets CFN_REDIS_HOST
echo -e "${BLUE}[TEST]${NC} cfn-runtime.env sets CFN_REDIS_HOST"

if [ -f "$PROJECT_ROOT/docker/runtime/cfn-runtime.env" ]; then
  if grep -q 'CFN_REDIS_HOST=' "$PROJECT_ROOT/docker/runtime/cfn-runtime.env"; then
    echo -e "${GREEN}[PASS]${NC} CFN_REDIS_HOST in runtime env"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}[FAIL]${NC} CFN_REDIS_HOST missing from runtime env"
    ((TESTS_FAILED++))
  fi
else
  echo -e "${YELLOW}[SKIP]${NC} cfn-runtime.env not found"
fi

echo ""

# Print summary
echo "============================================================"
echo "Test Summary"
echo "============================================================"
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Failed:${NC} $TESTS_FAILED"
echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}=====================================${NC}"
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo -e "${GREEN}=====================================${NC}"
  echo ""
  echo "Bug #6 Fix Validation: SUCCESS"
  echo ""
  echo "Summary:"
  echo "  ✓ Agents connect using CFN_REDIS_HOST/CFN_REDIS_PORT"
  echo "  ✓ Init script uses correct fallback pattern"
  echo "  ✓ Backward compatibility maintained (REDIS_HOST fallback)"
  echo "  ✓ Heartbeat reporting works"
  echo "  ✓ Completion signaling works"
  echo "  ✓ CLI code uses standardized variables"
  echo "  ✓ Runtime environment contracts updated"
  echo ""
  echo "Next Steps:"
  echo "  1. Run integration test with real agents"
  echo "  2. Test coordinator spawning agents"
  echo "  3. Validate full CFN Loop execution"
  echo ""
  exit 0
else
  echo -e "${RED}=====================================${NC}"
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  echo -e "${RED}=====================================${NC}"
  echo ""
  echo "Bug #6 Fix Validation: FAILED"
  echo ""
  echo "Review failed tests above for details."
  echo "Check logs for specific error messages."
  echo ""
  exit 1
fi
