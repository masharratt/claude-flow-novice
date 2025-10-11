#!/usr/bin/env bash
#
# cleanup-performance-test.sh
# Sprint 1.4: Manual performance validation for cleanup script
#
# This script:
# 1. Creates 10,000 stale coordinator keys in Redis
# 2. Creates 10 active coordinator keys
# 3. Executes cleanup script and measures time
# 4. Validates results

set -euo pipefail

# Configuration
STALE_COORDINATOR_COUNT=10000
ACTIVE_COORDINATOR_COUNT=10
PERFORMANCE_TARGET_SECONDS=5
STALE_AGE_SECONDS=700  # >10 minutes (600s threshold)
SCRIPT_PATH="$(cd "$(dirname "$0")/../../../scripts" && pwd)/cleanup-blocking-coordination.sh"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper: Redis command
redis_cmd() {
  redis-cli "$@" 2>/dev/null
}

# Helper: Count keys matching pattern
count_keys() {
  redis_cmd --scan --pattern "$1" | wc -l
}

# Helper: Log with color
log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  case "$level" in
    INFO)  echo -e "${BLUE}[${timestamp}] [INFO]${NC} ${message}" ;;
    WARN)  echo -e "${YELLOW}[${timestamp}] [WARN]${NC} ${message}" ;;
    ERROR) echo -e "${RED}[${timestamp}] [ERROR]${NC} ${message}" ;;
    SUCCESS) echo -e "${GREEN}[${timestamp}] [SUCCESS]${NC} ${message}" ;;
    *) echo -e "[${timestamp}] [${level}] ${message}" ;;
  esac
}

echo ""
echo "========================================"
echo "Cleanup Performance Validation"
echo "========================================"
echo ""

# Step 1: Check Redis connection
log "INFO" "Checking Redis connection..."
if ! redis_cmd PING >/dev/null 2>&1; then
  log "ERROR" "Redis connection failed"
  exit 1
fi
log "SUCCESS" "Redis connection established"

# Step 2: Clean existing test keys
log "INFO" "Cleaning existing test keys..."
redis_cmd --scan --pattern "blocking:heartbeat:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:heartbeat:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:signal:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:signal:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:ack:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:ack:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "coordinator:activity:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "coordinator:activity:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
log "SUCCESS" "Existing test keys cleaned"

# Step 3: Create 10,000 stale coordinator keys
log "INFO" "Creating ${STALE_COORDINATOR_COUNT} stale coordinator keys..."
START_SETUP=$(date +%s)

# Optimized batch creation using Redis pipeline
{
  for i in $(seq 1 $STALE_COORDINATOR_COUNT); do
    timestamp=$(($(date +%s000) - STALE_AGE_SECONDS * 1000))
    echo "SETEX blocking:heartbeat:test-swarm-$i:coordinator-$i 86400 \"{\\\"coordinatorId\\\":\\\"test-swarm-$i:coordinator-$i\\\",\\\"timestamp\\\":${timestamp},\\\"status\\\":\\\"waiting\\\"}\""
    echo "SETEX blocking:signal:test-swarm-$i:coordinator-$i 86400 \"{\\\"signal\\\":\\\"test\\\"}\""
    echo "SETEX blocking:ack:test-swarm-$i:coordinator-$i:agent-1 86400 \"{\\\"ack\\\":true}\""
    echo "SETEX coordinator:activity:test-swarm-$i:coordinator-$i 86400 \"{\\\"active\\\":true}\""
  done
} | redis-cli --pipe >/dev/null 2>&1

END_SETUP=$(date +%s)
SETUP_TIME=$((END_SETUP - START_SETUP))
log "SUCCESS" "Created ${STALE_COORDINATOR_COUNT} stale coordinators in ${SETUP_TIME}s"

# Step 4: Create 10 active coordinator keys
log "INFO" "Creating ${ACTIVE_COORDINATOR_COUNT} active coordinator keys..."
for i in $(seq 1 $ACTIVE_COORDINATOR_COUNT); do
  timestamp=$(date +%s000)
  redis_cmd SETEX "blocking:heartbeat:active-swarm-$i:coordinator-$i" 86400 "{\"coordinatorId\":\"active-swarm-$i:coordinator-$i\",\"timestamp\":${timestamp},\"status\":\"waiting\"}" >/dev/null
  redis_cmd SETEX "blocking:signal:active-swarm-$i:coordinator-$i" 86400 "{\"signal\":\"test\"}" >/dev/null
  redis_cmd SETEX "blocking:ack:active-swarm-$i:coordinator-$i:agent-1" 86400 "{\"ack\":true}" >/dev/null
  redis_cmd SETEX "coordinator:activity:active-swarm-$i:coordinator-$i" 86400 "{\"active\":true}" >/dev/null
done
log "SUCCESS" "Created ${ACTIVE_COORDINATOR_COUNT} active coordinators"

# Step 5: Verify setup
STALE_COUNT_BEFORE=$(count_keys "blocking:heartbeat:test-*")
ACTIVE_COUNT_BEFORE=$(count_keys "blocking:heartbeat:active-*")
log "INFO" "Setup verified: ${STALE_COUNT_BEFORE} stale, ${ACTIVE_COUNT_BEFORE} active"

echo ""
echo "========================================"
echo "Executing Cleanup Script"
echo "========================================"
echo ""

# Step 6: Execute cleanup script and measure time
START_CLEANUP=$(date +%s%3N)  # Milliseconds
bash "$SCRIPT_PATH" 2>&1 | while read -r line; do
  echo "  $line"
done
END_CLEANUP=$(date +%s%3N)  # Milliseconds

EXECUTION_TIME_MS=$((END_CLEANUP - START_CLEANUP))
EXECUTION_TIME_SECONDS=$(echo "scale=2; $EXECUTION_TIME_MS / 1000" | bc)

echo ""
log "INFO" "Execution time: ${EXECUTION_TIME_SECONDS}s"
echo ""

# Step 7: Count keys after cleanup
STALE_COUNT_AFTER=$(count_keys "blocking:heartbeat:test-*")
ACTIVE_COUNT_AFTER=$(count_keys "blocking:heartbeat:active-*")

# Step 8: Calculate metrics
STALE_REMOVED=$((STALE_COUNT_BEFORE - STALE_COUNT_AFTER))

# Step 9: Validate results
echo "========================================"
echo "Validation Results"
echo "========================================"
echo ""

PERFORMANCE_MET=false
ACCURACY_MET=false
SAFETY_MET=false
CONFIDENCE=0.0

# Performance validation
if (( $(echo "$EXECUTION_TIME_SECONDS < $PERFORMANCE_TARGET_SECONDS" | bc -l) )); then
  log "SUCCESS" "Performance: ${EXECUTION_TIME_SECONDS}s < ${PERFORMANCE_TARGET_SECONDS}s ✓"
  PERFORMANCE_MET=true
  CONFIDENCE=$(echo "$CONFIDENCE + 0.33" | bc)
else
  log "ERROR" "Performance: ${EXECUTION_TIME_SECONDS}s >= ${PERFORMANCE_TARGET_SECONDS}s ✗"
fi

# Accuracy validation
if [ "$STALE_COUNT_AFTER" -eq 0 ]; then
  log "SUCCESS" "Accuracy: All stale keys removed (${STALE_REMOVED}/${STALE_COUNT_BEFORE}) ✓"
  ACCURACY_MET=true
  CONFIDENCE=$(echo "$CONFIDENCE + 0.33" | bc)
else
  log "ERROR" "Accuracy: ${STALE_COUNT_AFTER} stale keys remaining ✗"
fi

# Safety validation
if [ "$ACTIVE_COUNT_AFTER" -eq "$ACTIVE_COORDINATOR_COUNT" ]; then
  log "SUCCESS" "Safety: All active keys preserved (${ACTIVE_COUNT_AFTER}/${ACTIVE_COORDINATOR_COUNT}) ✓"
  SAFETY_MET=true
  CONFIDENCE=$(echo "$CONFIDENCE + 0.34" | bc)
else
  log "ERROR" "Safety: ${ACTIVE_COUNT_AFTER} active keys (expected ${ACTIVE_COORDINATOR_COUNT}) ✗"
fi

echo ""
echo "========================================"
echo "Test Results JSON"
echo "========================================"

# Output JSON results
cat <<EOF | tee /tmp/cleanup-performance-results.json
{
  "agent": "tester",
  "confidence": ${CONFIDENCE},
  "test_results": {
    "execution_time_seconds": ${EXECUTION_TIME_SECONDS},
    "stale_keys_created": ${STALE_COORDINATOR_COUNT},
    "stale_keys_removed": ${STALE_REMOVED},
    "active_keys_preserved": ${ACTIVE_COUNT_AFTER},
    "performance_target_met": ${PERFORMANCE_MET},
    "accuracy_target_met": ${ACCURACY_MET},
    "safety_target_met": ${SAFETY_MET}
  },
  "blockers": [
$(if ! $PERFORMANCE_MET; then echo "    \"Performance target not met: ${EXECUTION_TIME_SECONDS}s >= ${PERFORMANCE_TARGET_SECONDS}s\","; fi)
$(if ! $ACCURACY_MET; then echo "    \"Accuracy target not met: ${STALE_COUNT_AFTER} stale keys remaining\","; fi)
$(if ! $SAFETY_MET; then echo "    \"Safety target not met: ${ACTIVE_COUNT_AFTER} active keys (expected ${ACTIVE_COORDINATOR_COUNT})\","; fi)
  ]
}
EOF

echo ""
echo "========================================"

# Step 10: Cleanup test keys
log "INFO" "Cleaning up test keys..."
redis_cmd --scan --pattern "blocking:heartbeat:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:heartbeat:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:signal:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:signal:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:ack:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "blocking:ack:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "coordinator:activity:test-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
redis_cmd --scan --pattern "coordinator:activity:active-*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
log "SUCCESS" "Test keys cleaned"

echo ""

# Exit code based on confidence
if (( $(echo "$CONFIDENCE >= 0.75" | bc -l) )); then
  log "SUCCESS" "VALIDATION PASSED: Confidence ${CONFIDENCE} >= 0.75 ✓"
  exit 0
else
  log "ERROR" "VALIDATION FAILED: Confidence ${CONFIDENCE} < 0.75 ✗"
  exit 1
fi
