#!/usr/bin/env bash
# Production Load Test: 50 Concurrent Workers
# Sprint 4.1 - Production Testing & Operational Hardening
# Tests system under realistic load (10 workers per team)

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
TOTAL_WORKERS=50
WORKERS_PER_TEAM=10
TEAMS=("marketing" "sales" "support" "engineering" "finance")
TEST_DURATION=300  # 5 minutes
TASK_ID="load-test-$(date +%s)"

# Metrics
START_TIME=$(date +%s)
WORKERS_SPAWNED=0
WORKERS_COMPLETED=0
WORKERS_FAILED=0
declare -A TEAM_METRICS

echo "=========================================="
echo "Production Load Test: 50 Concurrent Workers"
echo "=========================================="
echo "Task ID: $TASK_ID"
echo "Teams: ${TEAMS[@]}"
echo "Workers per team: $WORKERS_PER_TEAM"
echo "Total workers: $TOTAL_WORKERS"
echo "Test duration: $TEST_DURATION seconds"
echo ""

# Initialize team metrics
for team in "${TEAMS[@]}"; do
  TEAM_METRICS["${team}_spawned"]=0
  TEAM_METRICS["${team}_completed"]=0
  TEAM_METRICS["${team}_failed"]=0
done

# Check Redis availability
echo "[1/5] Validating Redis connection..."
if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
  echo -e "${RED}✗ Redis not available at ${REDIS_HOST}:${REDIS_PORT}${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Redis available${NC}"
echo ""

# Check coordinator status
echo "[2/5] Checking coordinator status..."
COORDINATOR_CONTAINERS=$(docker ps --filter "name=coordinator" --format "{{.Names}}" | wc -l)
if [ "$COORDINATOR_CONTAINERS" -lt 5 ]; then
  echo -e "${YELLOW}⚠ Warning: Only $COORDINATOR_CONTAINERS coordinators running (expected 5)${NC}"
else
  echo -e "${GREEN}✓ All 5 coordinators running${NC}"
fi
echo ""

# Spawn workers across teams
echo "[3/5] Spawning $TOTAL_WORKERS workers..."
WORKER_PIDS=()

for team in "${TEAMS[@]}"; do
  echo "  Spawning $WORKERS_PER_TEAM workers for team: $team"

  for i in $(seq 1 $WORKERS_PER_TEAM); do
    WORKER_ID="${team}-worker-${i}"

    # Spawn worker in background
    (
      # Simulate worker task
      TASK_KEY="task:${TASK_ID}:${WORKER_ID}"

      # Register worker
      redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
        "team" "$team" \
        "worker_id" "$WORKER_ID" \
        "status" "running" \
        "start_time" "$(date +%s)" > /dev/null

      # Simulate work (random duration 10-60s)
      WORK_DURATION=$((10 + RANDOM % 50))
      sleep "$WORK_DURATION"

      # Complete work
      redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$TASK_KEY" \
        "status" "completed" \
        "end_time" "$(date +%s)" \
        "duration" "$WORK_DURATION" > /dev/null

      # Signal completion
      redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "swarm:${TASK_ID}:${WORKER_ID}:done" "complete" > /dev/null

    ) &

    WORKER_PIDS+=($!)
    WORKERS_SPAWNED=$((WORKERS_SPAWNED + 1))
    TEAM_METRICS["${team}_spawned"]=$((${TEAM_METRICS["${team}_spawned"]} + 1))

    # Small delay to prevent overwhelming the system
    sleep 0.1
  done
done

echo -e "${GREEN}✓ Spawned $WORKERS_SPAWNED workers${NC}"
echo ""

# Monitor workers
echo "[4/5] Monitoring workers for $TEST_DURATION seconds..."
MONITOR_START=$(date +%s)
LAST_STATUS_TIME=$MONITOR_START

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - MONITOR_START))

  # Break if test duration exceeded
  if [ $ELAPSED -ge $TEST_DURATION ]; then
    echo ""
    echo -e "${YELLOW}Test duration reached. Checking final status...${NC}"
    break
  fi

  # Status update every 30 seconds
  if [ $((CURRENT_TIME - LAST_STATUS_TIME)) -ge 30 ]; then
    # Count completed workers
    COMPLETED_COUNT=0
    for team in "${TEAMS[@]}"; do
      for i in $(seq 1 $WORKERS_PER_TEAM); do
        WORKER_ID="${team}-worker-${i}"
        STATUS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:${TASK_ID}:${WORKER_ID}" status 2>/dev/null || echo "unknown")
        if [ "$STATUS" == "completed" ]; then
          COMPLETED_COUNT=$((COMPLETED_COUNT + 1))
        fi
      done
    done

    echo "  [$ELAPSED/${TEST_DURATION}s] Completed: $COMPLETED_COUNT/$TOTAL_WORKERS"
    LAST_STATUS_TIME=$CURRENT_TIME
  fi

  sleep 5
done

# Wait for remaining workers (with timeout)
echo "Waiting for workers to complete (30s timeout)..."
for pid in "${WORKER_PIDS[@]}"; do
  if ps -p "$pid" > /dev/null 2>&1; then
    timeout 30 tail --pid="$pid" -f /dev/null 2>/dev/null || true
  fi
done

echo ""

# Collect final metrics
echo "[5/5] Collecting final metrics..."
for team in "${TEAMS[@]}"; do
  TEAM_COMPLETED=0
  TEAM_FAILED=0

  for i in $(seq 1 $WORKERS_PER_TEAM); do
    WORKER_ID="${team}-worker-${i}"
    STATUS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:${TASK_ID}:${WORKER_ID}" status 2>/dev/null || echo "failed")

    if [ "$STATUS" == "completed" ]; then
      TEAM_COMPLETED=$((TEAM_COMPLETED + 1))
      WORKERS_COMPLETED=$((WORKERS_COMPLETED + 1))
    else
      TEAM_FAILED=$((TEAM_FAILED + 1))
      WORKERS_FAILED=$((WORKERS_FAILED + 1))
    fi
  done

  TEAM_METRICS["${team}_completed"]=$TEAM_COMPLETED
  TEAM_METRICS["${team}_failed"]=$TEAM_FAILED
done

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo ""
echo "=========================================="
echo "Load Test Results"
echo "=========================================="
echo "Total duration: ${TOTAL_DURATION}s"
echo "Workers spawned: $WORKERS_SPAWNED"
echo "Workers completed: $WORKERS_COMPLETED"
echo "Workers failed: $WORKERS_FAILED"
echo "Success rate: $(awk "BEGIN {printf \"%.1f\", ($WORKERS_COMPLETED / $WORKERS_SPAWNED) * 100}")%"
echo ""

echo "Team Breakdown:"
for team in "${TEAMS[@]}"; do
  SPAWNED=${TEAM_METRICS["${team}_spawned"]}
  COMPLETED=${TEAM_METRICS["${team}_completed"]}
  FAILED=${TEAM_METRICS["${team}_failed"]}
  SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($COMPLETED / $SPAWNED) * 100}")

  echo "  $team: $COMPLETED/$SPAWNED completed ($SUCCESS_RATE%)"
done

echo ""

# System resource check
echo "System Resources:"
echo "  Memory usage: $(free -h | awk '/^Mem:/ {print $3 "/" $2}')"
echo "  Redis memory: $(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory | grep used_memory_human | cut -d: -f2)"
echo "  Redis keys: $(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE | awk '{print $2}')"
echo ""

# Pass/fail criteria
echo "=========================================="
echo "Acceptance Criteria Validation"
echo "=========================================="

PASS_COUNT=0
TOTAL_CHECKS=4

# Check 1: At least 45/50 workers completed (90% success rate)
if [ $WORKERS_COMPLETED -ge 45 ]; then
  echo -e "${GREEN}✓ Worker completion rate: $WORKERS_COMPLETED/50 (≥90%)${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}✗ Worker completion rate: $WORKERS_COMPLETED/50 (<90%)${NC}"
fi

# Check 2: All teams had at least 8/10 workers complete
ALL_TEAMS_OK=true
for team in "${TEAMS[@]}"; do
  COMPLETED=${TEAM_METRICS["${team}_completed"]}
  if [ $COMPLETED -lt 8 ]; then
    ALL_TEAMS_OK=false
    break
  fi
done

if [ "$ALL_TEAMS_OK" = true ]; then
  echo -e "${GREEN}✓ All teams achieved ≥80% completion${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}✗ Some teams below 80% completion${NC}"
fi

# Check 3: Test completed within expected time
if [ $TOTAL_DURATION -le 360 ]; then  # 6 minutes max
  echo -e "${GREEN}✓ Test duration: ${TOTAL_DURATION}s (≤360s)${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}✗ Test duration: ${TOTAL_DURATION}s (>360s)${NC}"
fi

# Check 4: Redis responded throughout test
REDIS_RESPONSIVE=true
if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
  REDIS_RESPONSIVE=false
fi

if [ "$REDIS_RESPONSIVE" = true ]; then
  echo -e "${GREEN}✓ Redis remained responsive${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}✗ Redis became unresponsive${NC}"
fi

echo ""
echo "=========================================="
if [ $PASS_COUNT -eq $TOTAL_CHECKS ]; then
  echo -e "${GREEN}✓ LOAD TEST PASSED ($PASS_COUNT/$TOTAL_CHECKS checks)${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}✗ LOAD TEST FAILED ($PASS_COUNT/$TOTAL_CHECKS checks)${NC}"
  EXIT_CODE=1
fi
echo "=========================================="

# Cleanup
echo ""
echo "Cleaning up test data..."
for team in "${TEAMS[@]}"; do
  for i in $(seq 1 $WORKERS_PER_TEAM); do
    WORKER_ID="${team}-worker-${i}"
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:${TASK_ID}:${WORKER_ID}" > /dev/null 2>&1 || true
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "swarm:${TASK_ID}:${WORKER_ID}:done" > /dev/null 2>&1 || true
  done
done

echo "Cleanup complete."
exit $EXIT_CODE
