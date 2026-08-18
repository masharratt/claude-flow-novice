#!/usr/bin/env bash
##
## Transparency Middleware - Metrics Script
## Query performance metrics and statistics for transparency middleware
##
## Usage:
##   ./invoke-transparency-metrics.sh [OPTIONS]
##
## Options:
##   --task-id <id>           Task ID for scoped metrics
##   --metric <type>          Specific metric to query (default: all)
##                            Options: generation-rate, filtering-efficiency,
##                                     overhead, queue-stats, message-breakdown
##   --format <json|text>     Output format (default: text)
##   --window <seconds>       Time window for rate calculations (default: 60)
##   --reset                  Reset metrics after querying
##   --help                   Show this help message
##

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Default configuration
TASK_ID=""
METRIC="all"
FORMAT="text"
WINDOW="60"
RESET="no"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --metric)
      METRIC="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --window)
      WINDOW="$2"
      shift 2
      ;;
    --reset)
      RESET="yes"
      shift
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
METRICS_KEY="transparency:metrics:${TASK_ID:-global}"
STATE_KEY="transparency:state:${TASK_ID:-global}"

# Get current metrics from Redis
METRICS_JSON=$(redis-cli GET "$METRICS_KEY" 2>/dev/null || echo "{}")
STATE_JSON=$(redis-cli GET "$STATE_KEY" 2>/dev/null || echo "{}")

# Parse metrics
TOTAL_GENERATED=$(echo "$METRICS_JSON" | jq -r '.totalMessagesGenerated // 0')
TOTAL_FILTERED=$(echo "$METRICS_JSON" | jq -r '.totalMessagesFiltered // 0')
AVG_GEN_TIME=$(echo "$METRICS_JSON" | jq -r '.averageGenerationTime // 0')
AVG_FILTER_TIME=$(echo "$METRICS_JSON" | jq -r '.averageFilteringTime // 0')
TOTAL_OVERHEAD=$(echo "$METRICS_JSON" | jq -r '.totalOverheadMs // 0')
OVERHEAD_PERCENT=$(echo "$METRICS_JSON" | jq -r '.overheadPercentage // 0')
FILTER_EFFECTIVENESS=$(echo "$METRICS_JSON" | jq -r '.filterEffectiveness // 0')

# Parse state
STARTED_AT=$(echo "$STATE_JSON" | jq -r '.startedAt // 0')
MESSAGE_COUNT=$(echo "$STATE_JSON" | jq -r '.messageCount // 0')
LAST_ACTIVITY=$(echo "$STATE_JSON" | jq -r '.lastActivity // 0')

# Calculate derived metrics
CURRENT_TIME=$(date +%s)
UPTIME=$((CURRENT_TIME - STARTED_AT))

# Generation rate (messages per second)
if [[ $UPTIME -gt 0 ]]; then
  GENERATION_RATE=$(echo "scale=2; $TOTAL_GENERATED / $UPTIME" | bc)
else
  GENERATION_RATE="0.00"
fi

# Filtering efficiency (percentage of messages filtered)
if [[ $TOTAL_GENERATED -gt 0 ]]; then
  FILTERING_EFFICIENCY=$(echo "scale=2; ($TOTAL_FILTERED / $TOTAL_GENERATED) * 100" | bc)
else
  FILTERING_EFFICIENCY="0.00"
fi

# Queue utilization
QUEUE_SIZE=$(redis-cli LLEN "transparency:messages:list:${TASK_ID:-global}" 2>/dev/null || echo "0")

# Message breakdown by level
MINIMAL_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByLevel.minimal // 0')
DETAILED_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByLevel.detailed // 0')
VERBOSE_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByLevel.verbose // 0')
DEBUG_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByLevel.debug // 0')

# Message breakdown by type
ACTIVITY_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByType.agent_activity // 0')
STATE_CHANGE_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByType.state_change // 0')
PERFORMANCE_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByType.performance_metric // 0')
ERROR_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByType.error // 0')
DEBUG_MSG_COUNT=$(echo "$METRICS_JSON" | jq -r '.messagesByType.debug // 0')

# Output functions
output_generation_rate() {
  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "metric": "generation_rate",
  "value": $GENERATION_RATE,
  "unit": "messages/second",
  "totalGenerated": $TOTAL_GENERATED,
  "uptime": $UPTIME
}
EOF
  else
    echo "Message Generation Rate"
    echo "======================="
    echo "Rate: ${GENERATION_RATE} messages/second"
    echo "Total Generated: $TOTAL_GENERATED"
    echo "Uptime: ${UPTIME}s"
  fi
}

output_filtering_efficiency() {
  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "metric": "filtering_efficiency",
  "value": $FILTERING_EFFICIENCY,
  "unit": "percent",
  "totalGenerated": $TOTAL_GENERATED,
  "totalFiltered": $TOTAL_FILTERED,
  "effectiveness": $FILTER_EFFECTIVENESS
}
EOF
  else
    echo "Filtering Efficiency"
    echo "===================="
    echo "Efficiency: ${FILTERING_EFFICIENCY}%"
    echo "Total Generated: $TOTAL_GENERATED"
    echo "Total Filtered: $TOTAL_FILTERED"
    echo "Effectiveness: $FILTER_EFFECTIVENESS"
  fi
}

output_overhead() {
  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "metric": "overhead",
  "totalOverheadMs": $TOTAL_OVERHEAD,
  "overheadPercentage": $OVERHEAD_PERCENT,
  "averageGenerationTime": $AVG_GEN_TIME,
  "averageFilteringTime": $AVG_FILTER_TIME
}
EOF
  else
    echo "Performance Overhead"
    echo "===================="
    echo "Total Overhead: ${TOTAL_OVERHEAD}ms"
    echo "Overhead Percentage: ${OVERHEAD_PERCENT}%"
    echo "Avg Generation Time: ${AVG_GEN_TIME}ms"
    echo "Avg Filtering Time: ${AVG_FILTER_TIME}ms"
  fi
}

output_queue_stats() {
  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "metric": "queue_statistics",
  "currentQueueSize": $QUEUE_SIZE,
  "messageCount": $MESSAGE_COUNT,
  "lastActivity": $LAST_ACTIVITY
}
EOF
  else
    echo "Queue Statistics"
    echo "================"
    echo "Current Queue Size: $QUEUE_SIZE"
    echo "Total Message Count: $MESSAGE_COUNT"
    echo "Last Activity: $(date -d "@$LAST_ACTIVITY" 2>/dev/null || date -r "$LAST_ACTIVITY" 2>/dev/null || echo "$LAST_ACTIVITY")"
  fi
}

output_message_breakdown() {
  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "metric": "message_breakdown",
  "byLevel": {
    "minimal": $MINIMAL_COUNT,
    "detailed": $DETAILED_COUNT,
    "verbose": $VERBOSE_COUNT,
    "debug": $DEBUG_COUNT
  },
  "byType": {
    "agent_activity": $ACTIVITY_COUNT,
    "state_change": $STATE_CHANGE_COUNT,
    "performance_metric": $PERFORMANCE_COUNT,
    "error": $ERROR_COUNT,
    "debug": $DEBUG_MSG_COUNT
  }
}
EOF
  else
    echo "Message Breakdown"
    echo "================="
    echo ""
    echo "By Level:"
    echo "  Minimal: $MINIMAL_COUNT"
    echo "  Detailed: $DETAILED_COUNT"
    echo "  Verbose: $VERBOSE_COUNT"
    echo "  Debug: $DEBUG_COUNT"
    echo ""
    echo "By Type:"
    echo "  Agent Activity: $ACTIVITY_COUNT"
    echo "  State Change: $STATE_CHANGE_COUNT"
    echo "  Performance Metric: $PERFORMANCE_COUNT"
    echo "  Error: $ERROR_COUNT"
    echo "  Debug: $DEBUG_MSG_COUNT"
  fi
}

output_all_metrics() {
  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "timestamp": $CURRENT_TIME,
  "taskId": "${TASK_ID:-global}",
  "uptime": $UPTIME,
  "generationRate": {
    "value": $GENERATION_RATE,
    "unit": "messages/second",
    "totalGenerated": $TOTAL_GENERATED
  },
  "filteringEfficiency": {
    "value": $FILTERING_EFFICIENCY,
    "unit": "percent",
    "totalFiltered": $TOTAL_FILTERED,
    "effectiveness": $FILTER_EFFECTIVENESS
  },
  "overhead": {
    "totalMs": $TOTAL_OVERHEAD,
    "percentage": $OVERHEAD_PERCENT,
    "avgGenerationMs": $AVG_GEN_TIME,
    "avgFilteringMs": $AVG_FILTER_TIME
  },
  "queue": {
    "currentSize": $QUEUE_SIZE,
    "totalMessages": $MESSAGE_COUNT,
    "lastActivity": $LAST_ACTIVITY
  },
  "breakdown": {
    "byLevel": {
      "minimal": $MINIMAL_COUNT,
      "detailed": $DETAILED_COUNT,
      "verbose": $VERBOSE_COUNT,
      "debug": $DEBUG_COUNT
    },
    "byType": {
      "agent_activity": $ACTIVITY_COUNT,
      "state_change": $STATE_CHANGE_COUNT,
      "performance_metric": $PERFORMANCE_COUNT,
      "error": $ERROR_COUNT,
      "debug": $DEBUG_MSG_COUNT
    }
  }
}
EOF
  else
    echo "Transparency Middleware Metrics"
    echo "================================"
    echo "Task ID: ${TASK_ID:-global}"
    echo "Uptime: ${UPTIME}s"
    echo ""
    output_generation_rate
    echo ""
    output_filtering_efficiency
    echo ""
    output_overhead
    echo ""
    output_queue_stats
    echo ""
    output_message_breakdown
  fi
}

# Output based on metric type
case "$METRIC" in
  generation-rate)
    output_generation_rate
    ;;
  filtering-efficiency)
    output_filtering_efficiency
    ;;
  overhead)
    output_overhead
    ;;
  queue-stats)
    output_queue_stats
    ;;
  message-breakdown)
    output_message_breakdown
    ;;
  all)
    output_all_metrics
    ;;
  *)
    echo "Error: Unknown metric type: $METRIC" >&2
    exit 1
    ;;
esac

# Reset metrics if requested
if [[ "$RESET" == "yes" ]]; then
  redis-cli DEL "$METRICS_KEY" > /dev/null
  redis-cli DEL "$STATE_KEY" > /dev/null

  if [[ "$FORMAT" == "text" ]]; then
    echo ""
    echo "Metrics reset successfully"
  fi
fi

exit 0
