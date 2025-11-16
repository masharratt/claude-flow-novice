#!/usr/bin/env bash
##
## Transparency Middleware - Shutdown Script
## Gracefully stop transparency middleware, flush queues, and cleanup resources
##
## Usage:
##   ./invoke-transparency-stop.sh [OPTIONS]
##
## Options:
##   --task-id <id>           Task ID for scoped shutdown
##   --flush                  Flush message queue before shutdown
##   --preserve-metrics       Preserve metrics data (don't delete)
##   --preserve-config        Preserve configuration (don't delete)
##   --force                  Force shutdown without confirmation
##   --format <json|text>     Output format (default: text)
##   --help                   Show this help message
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"

# Default configuration
TASK_ID=""
FLUSH="no"
PRESERVE_METRICS="no"
PRESERVE_CONFIG="no"
FORCE="no"
FORMAT="text"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --flush)
      FLUSH="yes"
      shift
      ;;
    --preserve-metrics)
      PRESERVE_METRICS="yes"
      shift
      ;;
    --preserve-config)
      PRESERVE_CONFIG="yes"
      shift
      ;;
    --force)
      FORCE="yes"
      shift
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --help)
      grep "^##" "$0" | sed 's/^## \?//'
      exit 0
      ;;
    *)
      echo "Error: Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Determine Redis keys
SCOPE="${TASK_ID:-global}"
CONFIG_KEY="transparency:config:${SCOPE}"
STATE_KEY="transparency:state:${SCOPE}"
METRICS_KEY="transparency:metrics:${SCOPE}"
FILTERS_KEY="transparency:filters:${SCOPE}"
MESSAGES_LIST="transparency:messages:list:${SCOPE}"
MESSAGES_CHANNEL="transparency:messages:${SCOPE}"

# Get current state
STATE_JSON=$(redis-cli GET "$STATE_KEY" 2>/dev/null || echo "{}")
MESSAGE_COUNT=$(echo "$STATE_JSON" | jq -r '.messageCount // 0')

# Confirmation prompt (unless forced)
if [[ "$FORCE" != "yes" && "$FORMAT" == "text" ]]; then
  echo "Transparency Middleware Shutdown"
  echo "================================="
  echo "Scope: $SCOPE"
  echo "Message Count: $MESSAGE_COUNT"
  echo ""
  echo "This will:"
  echo "  - Stop message generation"
  echo "  - Unsubscribe from Redis channels"
  [[ "$FLUSH" == "yes" ]] && echo "  - Flush message queue"
  [[ "$PRESERVE_METRICS" != "yes" ]] && echo "  - Delete metrics data"
  [[ "$PRESERVE_CONFIG" != "yes" ]] && echo "  - Delete configuration"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Shutdown cancelled"
    exit 0
  fi
fi

# Track shutdown steps
declare -A STEPS_COMPLETED
SHUTDOWN_START=$(date +%s)

# Step 1: Flush message queue
if [[ "$FLUSH" == "yes" ]]; then
  QUEUE_SIZE=$(redis-cli LLEN "$MESSAGES_LIST" 2>/dev/null || echo "0")

  if [[ $QUEUE_SIZE -gt 0 ]]; then
    # Get all messages before flushing
    FLUSHED_MESSAGES=$(redis-cli LRANGE "$MESSAGES_LIST" 0 -1)

    # Optionally save to file
    FLUSH_FILE="/tmp/transparency-flush-${SCOPE}-$(date +%s).jsonl"
    echo "$FLUSHED_MESSAGES" > "$FLUSH_FILE"

    [[ "$FORMAT" == "text" ]] && echo "Flushed $QUEUE_SIZE messages to: $FLUSH_FILE"
  fi

  STEPS_COMPLETED["flush"]="true"
else
  STEPS_COMPLETED["flush"]="skipped"
fi

# Step 2: Update state to stopping
STOPPING_STATE=$(cat <<EOF
{
  "initialized": false,
  "status": "stopped",
  "stoppedAt": $(date +%s),
  "messageCount": $MESSAGE_COUNT,
  "shutdownReason": "manual"
}
EOF
)
redis-cli SET "$STATE_KEY" "$STOPPING_STATE" > /dev/null
STEPS_COMPLETED["state_update"]="true"

# Step 3: Publish shutdown event
SHUTDOWN_EVENT=$(cat <<EOF
{
  "event": "transparency_stopped",
  "timestamp": $(date +%s),
  "scope": "$SCOPE",
  "messageCount": $MESSAGE_COUNT,
  "preserveMetrics": $([ "$PRESERVE_METRICS" == "yes" ] && echo "true" || echo "false"),
  "preserveConfig": $([ "$PRESERVE_CONFIG" == "yes" ] && echo "true" || echo "false")
}
EOF
)
redis-cli PUBLISH "transparency:events" "$SHUTDOWN_EVENT" > /dev/null
STEPS_COMPLETED["event_publish"]="true"

# Step 4: Clear message queue
redis-cli DEL "$MESSAGES_LIST" > /dev/null
STEPS_COMPLETED["queue_clear"]="true"

# Step 5: Remove filters
FILTER_COUNT=$(redis-cli HLEN "$FILTERS_KEY" 2>/dev/null || echo "0")
redis-cli DEL "$FILTERS_KEY" > /dev/null
STEPS_COMPLETED["filters_clear"]="true"

# Step 6: Delete metrics (unless preserved)
if [[ "$PRESERVE_METRICS" != "yes" ]]; then
  redis-cli DEL "$METRICS_KEY" > /dev/null
  STEPS_COMPLETED["metrics_delete"]="true"
else
  STEPS_COMPLETED["metrics_delete"]="preserved"
fi

# Step 7: Delete config (unless preserved)
if [[ "$PRESERVE_CONFIG" != "yes" ]]; then
  redis-cli DEL "$CONFIG_KEY" > /dev/null
  STEPS_COMPLETED["config_delete"]="true"
else
  STEPS_COMPLETED["config_delete"]="preserved"
fi

# Step 8: Delete state
redis-cli DEL "$STATE_KEY" > /dev/null
STEPS_COMPLETED["state_delete"]="true"

# Calculate shutdown duration
SHUTDOWN_END=$(date +%s)
SHUTDOWN_DURATION=$((SHUTDOWN_END - SHUTDOWN_START))

# Build summary
if [[ "$FORMAT" == "json" ]]; then
  cat <<EOF
{
  "success": true,
  "scope": "$SCOPE",
  "messageCount": $MESSAGE_COUNT,
  "filterCount": $FILTER_COUNT,
  "shutdownDuration": $SHUTDOWN_DURATION,
  "steps": {
    "flush": "${STEPS_COMPLETED[flush]}",
    "stateUpdate": "${STEPS_COMPLETED[state_update]}",
    "eventPublish": "${STEPS_COMPLETED[event_publish]}",
    "queueClear": "${STEPS_COMPLETED[queue_clear]}",
    "filtersClear": "${STEPS_COMPLETED[filters_clear]}",
    "metricsDelete": "${STEPS_COMPLETED[metrics_delete]}",
    "configDelete": "${STEPS_COMPLETED[config_delete]}",
    "stateDelete": "${STEPS_COMPLETED[state_delete]}"
  },
  "timestamp": $SHUTDOWN_END
}
EOF
else
  echo ""
  echo "Shutdown Complete"
  echo "================="
  echo "Scope: $SCOPE"
  echo "Duration: ${SHUTDOWN_DURATION}s"
  echo ""
  echo "Summary:"
  echo "  Messages Processed: $MESSAGE_COUNT"
  echo "  Filters Removed: $FILTER_COUNT"
  echo "  Message Queue: Cleared"
  echo "  Metrics: $([ "$PRESERVE_METRICS" == "yes" ] && echo "Preserved" || echo "Deleted")"
  echo "  Config: $([ "$PRESERVE_CONFIG" == "yes" ] && echo "Preserved" || echo "Deleted")"
  echo ""
  echo "Transparency middleware has been stopped successfully."

  if [[ "$FLUSH" == "yes" && -f "$FLUSH_FILE" ]]; then
    echo ""
    echo "Flushed messages saved to: $FLUSH_FILE"
  fi
fi

exit 0
