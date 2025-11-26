#!/usr/bin/env bash
##
## Transparency Middleware - Initialization Script
## Initialize and configure transparency middleware for agent activity monitoring
##
## Usage:
##   ./invoke-transparency-init.sh [OPTIONS]
##
## Options:
##   --level <minimal|detailed|verbose|debug>  Transparency level (default: detailed)
##   --performance-monitoring <yes|no>         Enable performance monitoring (default: yes)
##   --context-filtering <yes|no>              Enable context-aware filtering (default: yes)
##   --message-filtering <yes|no>              Enable message filtering (default: yes)
##   --max-overhead <percent>                  Max overhead percentage (default: 5)
##   --queue-size <number>                     Message queue size (default: 1000)
##   --flush-interval <ms>                     Flush interval in ms (default: 5000)
##   --exclude-pattern <pattern>               Add exclusion pattern (repeatable)
##   --include-pattern <pattern>               Add inclusion pattern (repeatable)
##   --task-id <id>                            Task ID for Redis coordination
##   --json                                    Output as JSON
##   --help                                    Show this help message
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"

# Default configuration
LEVEL="detailed"
PERFORMANCE_MONITORING="yes"
CONTEXT_FILTERING="yes"
MESSAGE_FILTERING="yes"
MAX_OVERHEAD="5"
QUEUE_SIZE="1000"
FLUSH_INTERVAL="5000"
EXCLUDE_PATTERNS=()
INCLUDE_PATTERNS=()
TASK_ID=""
OUTPUT_JSON="no"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --level)
      LEVEL="$2"
      shift 2
      ;;
    --performance-monitoring)
      PERFORMANCE_MONITORING="$2"
      shift 2
      ;;
    --context-filtering)
      CONTEXT_FILTERING="$2"
      shift 2
      ;;
    --message-filtering)
      MESSAGE_FILTERING="$2"
      shift 2
      ;;
    --max-overhead)
      MAX_OVERHEAD="$2"
      shift 2
      ;;
    --queue-size)
      QUEUE_SIZE="$2"
      shift 2
      ;;
    --flush-interval)
      FLUSH_INTERVAL="$2"
      shift 2
      ;;
    --exclude-pattern)
      EXCLUDE_PATTERNS+=("$2")
      shift 2
      ;;
    --include-pattern)
      INCLUDE_PATTERNS+=("$2")
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --json)
      OUTPUT_JSON="yes"
      shift
      ;;
    --help)
      grep "^##" "$0" | sed 's/^## \?//'
      exit 0
      ;;
    *)
      echo "Error: Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

# Validate level
if [[ ! "$LEVEL" =~ ^(minimal|detailed|verbose|debug)$ ]]; then
  echo "Error: Invalid level. Must be one of: minimal, detailed, verbose, debug" >&2
  exit 1
fi

# Validate numeric values
if ! [[ "$MAX_OVERHEAD" =~ ^[0-9]+$ ]]; then
  echo "Error: max-overhead must be a number" >&2
  exit 1
fi

if ! [[ "$QUEUE_SIZE" =~ ^[0-9]+$ ]]; then
  echo "Error: queue-size must be a number" >&2
  exit 1
fi

if ! [[ "$FLUSH_INTERVAL" =~ ^[0-9]+$ ]]; then
  echo "Error: flush-interval must be a number" >&2
  exit 1
fi

# Generate configuration key
if [[ -n "$TASK_ID" ]]; then
  CONFIG_KEY="transparency:config:${TASK_ID}"
else
  CONFIG_KEY="transparency:config:global"
fi

# Build configuration JSON
EXCLUDE_JSON="[]"
if [[ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]]; then
  EXCLUDE_JSON=$(printf '%s\n' "${EXCLUDE_PATTERNS[@]}" | jq -R . | jq -s .)
fi

INCLUDE_JSON="[]"
if [[ ${#INCLUDE_PATTERNS[@]} -gt 0 ]]; then
  INCLUDE_JSON=$(printf '%s\n' "${INCLUDE_PATTERNS[@]}" | jq -R . | jq -s .)
fi

CONFIG_JSON=$(cat <<EOF
{
  "level": "$LEVEL",
  "enablePerformanceMonitoring": $([ "$PERFORMANCE_MONITORING" = "yes" ] && echo "true" || echo "false"),
  "enableContextFiltering": $([ "$CONTEXT_FILTERING" = "yes" ] && echo "true" || echo "false"),
  "enableMessageFiltering": $([ "$MESSAGE_FILTERING" = "yes" ] && echo "true" || echo "false"),
  "maxOverheadPercent": $MAX_OVERHEAD,
  "messageQueueSize": $QUEUE_SIZE,
  "flushInterval": $FLUSH_INTERVAL,
  "excludedPatterns": $EXCLUDE_JSON,
  "includedPatterns": $INCLUDE_JSON
}
EOF
)

# Store configuration in Redis
redis-cli SET "$CONFIG_KEY" "$CONFIG_JSON" > /dev/null

# Initialize middleware state
STATE_KEY="transparency:state:${TASK_ID:-global}"
STATE_JSON=$(cat <<EOF
{
  "initialized": true,
  "startedAt": $(date +%s),
  "configKey": "$CONFIG_KEY",
  "status": "active",
  "messageCount": 0,
  "lastActivity": $(date +%s)
}
EOF
)
redis-cli SET "$STATE_KEY" "$STATE_JSON" > /dev/null

# Publish initialization event
EVENT_JSON=$(cat <<EOF
{
  "event": "transparency_initialized",
  "timestamp": $(date +%s),
  "level": "$LEVEL",
  "taskId": "${TASK_ID:-global}",
  "config": $CONFIG_JSON
}
EOF
)
redis-cli PUBLISH "transparency:events" "$EVENT_JSON" > /dev/null

# Output result
if [[ "$OUTPUT_JSON" = "yes" ]]; then
  cat <<EOF
{
  "success": true,
  "configKey": "$CONFIG_KEY",
  "stateKey": "$STATE_KEY",
  "level": "$LEVEL",
  "config": $CONFIG_JSON,
  "state": $STATE_JSON
}
EOF
else
  echo "Transparency Middleware Initialized"
  echo "===================================="
  echo "Config Key: $CONFIG_KEY"
  echo "State Key: $STATE_KEY"
  echo "Level: $LEVEL"
  echo "Performance Monitoring: $PERFORMANCE_MONITORING"
  echo "Context Filtering: $CONTEXT_FILTERING"
  echo "Message Filtering: $MESSAGE_FILTERING"
  echo "Max Overhead: ${MAX_OVERHEAD}%"
  echo "Queue Size: $QUEUE_SIZE"
  echo "Flush Interval: ${FLUSH_INTERVAL}ms"

  if [[ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]]; then
    echo "Exclude Patterns: ${EXCLUDE_PATTERNS[*]}"
  fi

  if [[ ${#INCLUDE_PATTERNS[@]} -gt 0 ]]; then
    echo "Include Patterns: ${INCLUDE_PATTERNS[*]}"
  fi

  echo ""
  echo "Status: Active"
fi

exit 0
