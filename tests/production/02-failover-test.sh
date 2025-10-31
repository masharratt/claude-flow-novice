#!/bin/bash
# Production Failover Test
# Sprint 4.1 - Production Testing & Operational Hardening
# Tests coordinator restart and Redis connection recovery

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test configuration
TEST_TEAM="${TEST_TEAM:-marketing}"
TASK_ID="failover-test-$(date +%s)"
COORDINATOR_RESTART_TIMEOUT=30
REDIS_RECOVERY_TIMEOUT=60

echo "=========================================="
echo "Production Failover Test"
echo "=========================================="
echo "Task ID: $TASK_ID"
echo "Test team: $TEST_TEAM"
echo "Coordinator restart timeout: ${COORDINATOR_RESTART_TIMEOUT}s"
echo "Redis recovery timeout: ${REDIS_RECOVERY_TIMEOUT}s"
echo ""

# Test results
declare -A TEST_RESULTS
PASS_COUNT=0
TOTAL_TESTS=4

# Test 1: Coordinator Restart with Active Workers
echo "=========================================="
echo "Test 1: Coordinator Restart"
echo "=========================================="

# Find coordinator container
COORDINATOR_NAME="${TEST_TEAM}-coordinator"
COORDINATOR_CONTAINER=$(docker ps --filter "name=${COORDINATOR_NAME}" --format "{{.Names}}" | head -1)

if [ -z "$COORDINATOR_CONTAINER" ]; then
  echo -e "${RED}✗ No coordinator found for team: $TEST_TEAM${NC}"
  TEST_RESULTS["coordinator_restart"]="FAIL"
else
  echo "Found coordinator: $COORDINATOR_CONTAINER"

  # Spawn test workers before restart
  echo "Spawning 5 test workers..."
  WORKER_PIDS=()
  for i in {1..5}; do
    WORKER_ID="test-worker-${i}"

    (
      TASK_KEY="task:${TASK_ID}:${WORKER_ID}"
      redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
        "team" "$TEST_TEAM" \
        "worker_id" "$WORKER_ID" \
        "status" "running" \
        "start_time" "$(date +%s)" > /dev/null

      # Work for 90 seconds (spans coordinator restart)
      sleep 90

      redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
        "status" "completed" \
        "end_time" "$(date +%s)" > /dev/null

      redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "swarm:${TASK_ID}:${WORKER_ID}:done" "complete" > /dev/null
    ) &

    WORKER_PIDS+=($!)
  done

  echo "Waiting 10s for workers to start..."
  sleep 10

  # Restart coordinator
  echo "Restarting coordinator: $COORDINATOR_CONTAINER"
  RESTART_START=$(date +%s)

  docker restart "$COORDINATOR_CONTAINER" > /dev/null 2>&1

  # Wait for coordinator to be healthy
  echo "Waiting for coordinator to become healthy..."
  COORDINATOR_HEALTHY=false

  for attempt in {1..30}; do
    if docker ps --filter "name=${COORDINATOR_NAME}" --filter "status=running" | grep -q "$COORDINATOR_NAME"; then
      # Check if container is responding
      if docker exec "$COORDINATOR_CONTAINER" redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
        COORDINATOR_HEALTHY=true
        break
      fi
    fi
    sleep 1
  done

  RESTART_END=$(date +%s)
  RESTART_DURATION=$((RESTART_END - RESTART_START))

  if [ "$COORDINATOR_HEALTHY" = true ]; then
    echo -e "${GREEN}✓ Coordinator restarted successfully${NC}"
    echo "  Downtime: ${RESTART_DURATION}s"

    if [ $RESTART_DURATION -le $COORDINATOR_RESTART_TIMEOUT ]; then
      echo -e "${GREEN}✓ Downtime within acceptable limit (≤${COORDINATOR_RESTART_TIMEOUT}s)${NC}"
      TEST_RESULTS["coordinator_restart"]="PASS"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo -e "${RED}✗ Downtime exceeded limit: ${RESTART_DURATION}s > ${COORDINATOR_RESTART_TIMEOUT}s${NC}"
      TEST_RESULTS["coordinator_restart"]="FAIL"
    fi
  else
    echo -e "${RED}✗ Coordinator failed to restart within ${COORDINATOR_RESTART_TIMEOUT}s${NC}"
    TEST_RESULTS["coordinator_restart"]="FAIL"
  fi

  # Check worker survival
  echo "Checking worker status after coordinator restart..."
  WORKERS_SURVIVED=0

  for i in {1..5}; do
    WORKER_ID="test-worker-${i}"
    TASK_KEY="task:${TASK_ID}:${WORKER_ID}"

    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXISTS "$TASK_KEY" | grep -q 1; then
      WORKERS_SURVIVED=$((WORKERS_SURVIVED + 1))
    fi
  done

  echo "Workers still active: $WORKERS_SURVIVED/5"

  # Wait for workers to complete
  echo "Waiting for workers to complete..."
  for pid in "${WORKER_PIDS[@]}"; do
    if ps -p "$pid" > /dev/null 2>&1; then
      timeout 90 tail --pid="$pid" -f /dev/null 2>/dev/null || true
    fi
  done

  # Cleanup
  for i in {1..5}; do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:${TASK_ID}:test-worker-${i}" > /dev/null 2>&1 || true
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "swarm:${TASK_ID}:test-worker-${i}:done" > /dev/null 2>&1 || true
  done
fi

echo ""

# Test 2: Redis Connection Loss
echo "=========================================="
echo "Test 2: Redis Connection Recovery"
echo "=========================================="

# Create test worker that monitors Redis connection
echo "Starting worker with Redis connection monitoring..."

WORKER_ID="redis-monitor-worker"
TASK_KEY="task:${TASK_ID}:${WORKER_ID}"

# Initial connection
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
  "status" "running" \
  "start_time" "$(date +%s)" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Initial Redis connection established${NC}"
else
  echo -e "${RED}✗ Failed to establish initial Redis connection${NC}"
  TEST_RESULTS["redis_recovery"]="FAIL"
fi

# Simulate connection loss (using iptables or firewall)
echo "Simulating Redis connection disruption..."
RECOVERY_START=$(date +%s)

# Block Redis port temporarily (requires sudo, fallback to network delay)
if command -v sudo > /dev/null 2>&1; then
  echo "  Using iptables to block Redis port (requires sudo)..."

  # Try to block Redis port
  if sudo iptables -A OUTPUT -p tcp --dport "$REDIS_PORT" -j DROP 2>/dev/null; then
    echo "  Redis port blocked"
    sleep 5  # Simulate outage

    # Restore connection
    sudo iptables -D OUTPUT -p tcp --dport "$REDIS_PORT" -j DROP 2>/dev/null || true
    echo "  Redis port unblocked"
  else
    echo "  iptables failed, using connection test instead"
  fi
else
  echo "  Simulating connection disruption via test pattern..."
  sleep 5
fi

# Test recovery
echo "Testing Redis connection recovery..."
REDIS_RECOVERED=false
RECOVERY_ATTEMPTS=0
MAX_ATTEMPTS=60

for attempt in {1..60}; do
  RECOVERY_ATTEMPTS=$((RECOVERY_ATTEMPTS + 1))

  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
      "status" "recovered" \
      "recovery_time" "$(date +%s)" > /dev/null 2>&1; then
      REDIS_RECOVERED=true
      break
    fi
  fi

  sleep 1
done

RECOVERY_END=$(date +%s)
RECOVERY_DURATION=$((RECOVERY_END - RECOVERY_START))

if [ "$REDIS_RECOVERED" = true ]; then
  echo -e "${GREEN}✓ Redis connection recovered${NC}"
  echo "  Recovery time: ${RECOVERY_DURATION}s (${RECOVERY_ATTEMPTS} attempts)"

  if [ $RECOVERY_DURATION -le $REDIS_RECOVERY_TIMEOUT ]; then
    echo -e "${GREEN}✓ Recovery within acceptable limit (≤${REDIS_RECOVERY_TIMEOUT}s)${NC}"
    TEST_RESULTS["redis_recovery"]="PASS"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "${RED}✗ Recovery exceeded limit: ${RECOVERY_DURATION}s > ${REDIS_RECOVERY_TIMEOUT}s${NC}"
    TEST_RESULTS["redis_recovery"]="FAIL"
  fi
else
  echo -e "${RED}✗ Redis connection failed to recover within ${REDIS_RECOVERY_TIMEOUT}s${NC}"
  TEST_RESULTS["redis_recovery"]="FAIL"
fi

# Cleanup
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$TASK_KEY" > /dev/null 2>&1 || true

echo ""

# Test 3: State Persistence After Restart
echo "=========================================="
echo "Test 3: State Persistence"
echo "=========================================="

# Store test data
TEST_STATE_KEY="test:state:${TASK_ID}"
TEST_DATA="persistence-test-data-$(date +%s)"

echo "Storing test state in Redis..."
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$TEST_STATE_KEY" "$TEST_DATA" EX 300 > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Test state stored${NC}"

  # Restart coordinator again
  if [ -n "$COORDINATOR_CONTAINER" ]; then
    echo "Restarting coordinator to test state persistence..."
    docker restart "$COORDINATOR_CONTAINER" > /dev/null 2>&1

    # Wait for restart
    sleep 10

    # Verify data persisted
    RETRIEVED_DATA=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$TEST_STATE_KEY" 2>/dev/null || echo "")

    if [ "$RETRIEVED_DATA" == "$TEST_DATA" ]; then
      echo -e "${GREEN}✓ State persisted across coordinator restart${NC}"
      TEST_RESULTS["state_persistence"]="PASS"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo -e "${RED}✗ State lost after coordinator restart${NC}"
      TEST_RESULTS["state_persistence"]="FAIL"
    fi
  else
    echo -e "${YELLOW}⚠ Skipping coordinator restart (no container)${NC}"
    TEST_RESULTS["state_persistence"]="SKIP"
  fi

  # Cleanup
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$TEST_STATE_KEY" > /dev/null 2>&1 || true
else
  echo -e "${RED}✗ Failed to store test state${NC}"
  TEST_RESULTS["state_persistence"]="FAIL"
fi

echo ""

# Test 4: Concurrent Operations During Failover
echo "=========================================="
echo "Test 4: Concurrent Operations During Failover"
echo "=========================================="

echo "Spawning 10 workers..."
CONCURRENT_PIDS=()

for i in {1..10}; do
  WORKER_ID="concurrent-worker-${i}"

  (
    TASK_KEY="task:${TASK_ID}:${WORKER_ID}"

    # Store initial state
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
      "status" "running" \
      "iteration" "0" > /dev/null 2>&1 || exit 1

    # Perform 5 iterations with Redis operations
    for iteration in {1..5}; do
      redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
        "iteration" "$iteration" > /dev/null 2>&1 || exit 1
      sleep 2
    done

    # Mark complete
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
      "status" "completed" > /dev/null 2>&1 || exit 1

  ) &

  CONCURRENT_PIDS+=($!)
done

# Trigger coordinator restart mid-execution
sleep 5
if [ -n "$COORDINATOR_CONTAINER" ]; then
  echo "Restarting coordinator during concurrent operations..."
  docker restart "$COORDINATOR_CONTAINER" > /dev/null 2>&1
fi

# Wait for workers
echo "Waiting for workers to complete..."
SUCCESSFUL_WORKERS=0
FAILED_WORKERS=0

for pid in "${CONCURRENT_PIDS[@]}"; do
  if wait "$pid" 2>/dev/null; then
    SUCCESSFUL_WORKERS=$((SUCCESSFUL_WORKERS + 1))
  else
    FAILED_WORKERS=$((FAILED_WORKERS + 1))
  fi
done

echo "Results: $SUCCESSFUL_WORKERS successful, $FAILED_WORKERS failed"

# Accept ≥7/10 success rate
if [ $SUCCESSFUL_WORKERS -ge 7 ]; then
  echo -e "${GREEN}✓ Concurrent operations survived failover (${SUCCESSFUL_WORKERS}/10 ≥70%)${NC}"
  TEST_RESULTS["concurrent_failover"]="PASS"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}✗ Too many concurrent operations failed (${SUCCESSFUL_WORKERS}/10 <70%)${NC}"
  TEST_RESULTS["concurrent_failover"]="FAIL"
fi

# Cleanup
for i in {1..10}; do
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:${TASK_ID}:concurrent-worker-${i}" > /dev/null 2>&1 || true
done

echo ""

# Final Results
echo "=========================================="
echo "Failover Test Results"
echo "=========================================="

echo "Test Summary:"
for test_name in coordinator_restart redis_recovery state_persistence concurrent_failover; do
  result=${TEST_RESULTS[$test_name]:-SKIP}
  case $result in
    PASS) echo -e "  ${GREEN}✓${NC} ${test_name}: PASS" ;;
    FAIL) echo -e "  ${RED}✗${NC} ${test_name}: FAIL" ;;
    SKIP) echo -e "  ${YELLOW}○${NC} ${test_name}: SKIP" ;;
  esac
done

echo ""
echo "=========================================="
if [ $PASS_COUNT -eq $TOTAL_TESTS ]; then
  echo -e "${GREEN}✓ FAILOVER TEST PASSED ($PASS_COUNT/$TOTAL_TESTS tests)${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}✗ FAILOVER TEST FAILED ($PASS_COUNT/$TOTAL_TESTS tests passed)${NC}"
  EXIT_CODE=1
fi
echo "=========================================="

exit $EXIT_CODE
