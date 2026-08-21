#!/usr/bin/env bash

##############################################################################
# Example: Redis Integration for Async Validation
#
# Scenario: Coordinator publishes validation results to Redis for distributed
#           agent coordination and event-driven workflows
##############################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="${SCRIPT_DIR}/../validate-iteration.sh"

# Configuration
TASK_ID="distributed-task-microservices"
MODE="enterprise"
ITERATION=2
CONFIDENCE=0.88
CONSENSUS=0.94
AGENT_ID="coordinator-redis"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_VALIDATION_LIST="cfn:validation:${TASK_ID}"
REDIS_EVENT_CHANNEL="cfn:events"

echo "═══════════════════════════════════════════════════════════"
echo "  CFN Loop Validation with Redis Integration"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Task: $TASK_ID"
echo "Mode: $MODE"
echo "Iteration: $ITERATION"
echo "Redis: ${REDIS_HOST}:${REDIS_PORT}"
echo ""

# Check Redis connectivity
echo "Checking Redis connectivity..."
if command -v redis-cli &>/dev/null; then
  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then
    echo "✓ Redis connection successful"
  else
    echo "✗ Redis connection failed"
    echo "  Continuing without Redis persistence (validation only)"
  fi
else
  echo "⚠ redis-cli not found"
  echo "  Install: sudo apt-get install redis-tools"
  echo "  Continuing without Redis persistence (validation only)"
fi
echo ""

# Run validation
echo "Running CFN Loop validation..."
VALIDATION_RESULT=$("$VALIDATOR" \
  --mode "$MODE" \
  --iteration "$ITERATION" \
  --confidence "$CONFIDENCE" \
  --consensus "$CONSENSUS" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --json)

# Parse result
PASSED=$(echo "$VALIDATION_RESULT" | jq -r '.passed')
STATUS=$(echo "$VALIDATION_RESULT" | jq -r '.status')
CODE=$(echo "$VALIDATION_RESULT" | jq -r '.code')

echo "Validation Result:"
echo "  Status: $STATUS"
echo "  Passed: $PASSED"
echo "  Code: $CODE"
echo ""

# Publish to Redis (if available)
if command -v redis-cli &>/dev/null && \
   redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then

  echo "Publishing validation result to Redis..."

  # 1. Store full validation result in list
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" lpush "$REDIS_VALIDATION_LIST" "$VALIDATION_RESULT" >/dev/null
  echo "✓ Stored in list: $REDIS_VALIDATION_LIST"

  # 2. Set validation status with TTL (1 hour)
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" setex \
    "cfn:validation:${TASK_ID}:status" 3600 "$STATUS" >/dev/null
  echo "✓ Set status key (TTL: 1 hour)"

  # 3. Publish event to channel
  if [[ "$PASSED" == "true" ]]; then
    EVENT_PAYLOAD=$(jq -n \
      --arg type "validation_passed" \
      --arg taskId "$TASK_ID" \
      --arg mode "$MODE" \
      --argjson iteration "$ITERATION" \
      --argjson confidence "$CONFIDENCE" \
      --argjson consensus "$CONSENSUS" \
      '{
        type: $type,
        taskId: $taskId,
        mode: $mode,
        iteration: $iteration,
        confidence: $confidence,
        consensus: $consensus,
        timestamp: now
      }')

    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" publish "$REDIS_EVENT_CHANNEL" "$EVENT_PAYLOAD" >/dev/null
    echo "✓ Published event: validation_passed"

  else
    EVENT_PAYLOAD=$(jq -n \
      --arg type "validation_failed" \
      --arg taskId "$TASK_ID" \
      --arg mode "$MODE" \
      --arg status "$STATUS" \
      --argjson code "$CODE" \
      '{
        type: $type,
        taskId: $taskId,
        mode: $mode,
        status: $status,
        code: $code,
        timestamp: now
      }')

    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" publish "$REDIS_EVENT_CHANNEL" "$EVENT_PAYLOAD" >/dev/null
    echo "✓ Published event: validation_failed"
  fi

  # 4. Update task metadata
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" hset \
    "cfn:task:${TASK_ID}:metadata" \
    "last_validation_status" "$STATUS" \
    "last_validation_timestamp" "$(date +%s)" \
    "validation_iteration" "$ITERATION" >/dev/null
  echo "✓ Updated task metadata"

  echo ""
  echo "Redis Integration Summary:"
  echo "  List: $REDIS_VALIDATION_LIST (validation history)"
  echo "  Key: cfn:validation:${TASK_ID}:status (current status)"
  echo "  Channel: $REDIS_EVENT_CHANNEL (event stream)"
  echo "  Hash: cfn:task:${TASK_ID}:metadata (task metadata)"
  echo ""

  # Example: Other agents can listen for events
  echo "Other agents can subscribe to events:"
  echo "  redis-cli -h $REDIS_HOST -p $REDIS_PORT subscribe $REDIS_EVENT_CHANNEL"
  echo ""

  echo "Query validation history:"
  echo "  redis-cli -h $REDIS_HOST -p $REDIS_PORT lrange $REDIS_VALIDATION_LIST 0 -1"
  echo ""

fi

# Decision logic based on validation
case "$CODE" in
  0)
    echo "✓ VALIDATION PASSED"
    echo "  → Proceeding to next phase"
    exit 0
    ;;

  1)
    echo "✗ VALIDATION FAILED"
    echo "  → Retrying with feedback"
    exit 1
    ;;

  2)
    echo "✗ MAX ITERATIONS EXCEEDED"
    echo "  → Escalating to human"
    exit 2
    ;;

  *)
    echo "✗ UNEXPECTED ERROR"
    exit "$CODE"
    ;;
esac
