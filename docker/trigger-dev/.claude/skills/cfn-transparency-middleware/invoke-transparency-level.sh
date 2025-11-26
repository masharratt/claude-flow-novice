#!/usr/bin/env bash
##
## Transparency Middleware - Level Management Script
## Get, set, and manage transparency levels for the middleware
##
## Usage:
##   ./invoke-transparency-level.sh [OPTIONS]
##
## Options:
##   --get                    Get current transparency level
##   --set <level>            Set transparency level (minimal|detailed|verbose|debug)
##   --agent-id <id>          Configure level for specific agent
##   --task-id <id>           Configure level for specific task
##   --impact                 Assess impact of level change
##   --format <json|text>     Output format (default: text)
##   --help                   Show this help message
##
## Transparency Levels:
##   minimal   - Critical errors and state changes only
##   detailed  - Important activities, errors, and performance metrics
##   verbose   - All agent activities with context
##   debug     - Full debugging information with performance traces
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"

# Default configuration
ACTION=""
LEVEL=""
AGENT_ID=""
TASK_ID=""
IMPACT="no"
FORMAT="text"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --get)
      ACTION="get"
      shift
      ;;
    --set)
      ACTION="set"
      LEVEL="$2"
      shift 2
      ;;
    --agent-id)
      AGENT_ID="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --impact)
      IMPACT="yes"
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

# Validate action
if [[ -z "$ACTION" ]]; then
  echo "Error: No action specified. Use --get or --set" >&2
  exit 1
fi

# Determine Redis keys
if [[ -n "$AGENT_ID" ]]; then
  CONFIG_KEY="transparency:config:agent:${AGENT_ID}"
  SCOPE="agent:${AGENT_ID}"
elif [[ -n "$TASK_ID" ]]; then
  CONFIG_KEY="transparency:config:${TASK_ID}"
  SCOPE="task:${TASK_ID}"
else
  CONFIG_KEY="transparency:config:global"
  SCOPE="global"
fi

# Level descriptions
declare -A LEVEL_DESCRIPTIONS
LEVEL_DESCRIPTIONS["minimal"]="Critical errors and state changes only. Minimal overhead (<1%)."
LEVEL_DESCRIPTIONS["detailed"]="Important activities, errors, and performance metrics. Low overhead (1-3%)."
LEVEL_DESCRIPTIONS["verbose"]="All agent activities with context. Moderate overhead (3-5%)."
LEVEL_DESCRIPTIONS["debug"]="Full debugging information with performance traces. High overhead (5-10%)."

# Get current level
get_level() {
  # Get config from Redis
  local config=$(redis-cli GET "$CONFIG_KEY" 2>/dev/null || echo "{}")

  if [[ "$config" == "(nil)" || -z "$config" ]]; then
    # Check global config if scope-specific not found
    if [[ "$SCOPE" != "global" ]]; then
      config=$(redis-cli GET "transparency:config:global" 2>/dev/null || echo "{}")
    fi
  fi

  local current_level=$(echo "$config" | jq -r '.level // "detailed"')
  local performance_monitoring=$(echo "$config" | jq -r '.enablePerformanceMonitoring // true')
  local context_filtering=$(echo "$config" | jq -r '.enableContextFiltering // true')
  local message_filtering=$(echo "$config" | jq -r '.enableMessageFiltering // true')
  local max_overhead=$(echo "$config" | jq -r '.maxOverheadPercent // 5')

  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "scope": "$SCOPE",
  "level": "$current_level",
  "description": "${LEVEL_DESCRIPTIONS[$current_level]:-Unknown level}",
  "config": {
    "enablePerformanceMonitoring": $performance_monitoring,
    "enableContextFiltering": $context_filtering,
    "enableMessageFiltering": $message_filtering,
    "maxOverheadPercent": $max_overhead
  }
}
EOF
  else
    echo "Current Transparency Level"
    echo "=========================="
    echo "Scope: $SCOPE"
    echo "Level: $current_level"
    echo "Description: ${LEVEL_DESCRIPTIONS[$current_level]:-Unknown level}"
    echo ""
    echo "Configuration:"
    echo "  Performance Monitoring: $performance_monitoring"
    echo "  Context Filtering: $context_filtering"
    echo "  Message Filtering: $message_filtering"
    echo "  Max Overhead: ${max_overhead}%"
  fi
}

# Set transparency level
set_level() {
  # Validate level
  if [[ ! "$LEVEL" =~ ^(minimal|detailed|verbose|debug)$ ]]; then
    echo "Error: Invalid level. Must be one of: minimal, detailed, verbose, debug" >&2
    exit 1
  fi

  # Get current config or create new one
  local config=$(redis-cli GET "$CONFIG_KEY" 2>/dev/null || echo "{}")

  if [[ "$config" == "(nil)" || -z "$config" ]]; then
    # Create default config
    config=$(cat <<EOF
{
  "level": "detailed",
  "enablePerformanceMonitoring": true,
  "enableContextFiltering": true,
  "enableMessageFiltering": true,
  "maxOverheadPercent": 5,
  "messageQueueSize": 1000,
  "flushInterval": 5000,
  "excludedPatterns": [],
  "includedPatterns": []
}
EOF
)
  fi

  # Update level
  local updated_config=$(echo "$config" | jq --arg level "$LEVEL" '.level = $level')

  # Adjust settings based on level
  case "$LEVEL" in
    minimal)
      updated_config=$(echo "$updated_config" | jq '.maxOverheadPercent = 1 | .messageQueueSize = 100 | .enableContextFiltering = false')
      ;;
    detailed)
      updated_config=$(echo "$updated_config" | jq '.maxOverheadPercent = 3 | .messageQueueSize = 1000 | .enableContextFiltering = true')
      ;;
    verbose)
      updated_config=$(echo "$updated_config" | jq '.maxOverheadPercent = 5 | .messageQueueSize = 5000 | .enableContextFiltering = true')
      ;;
    debug)
      updated_config=$(echo "$updated_config" | jq '.maxOverheadPercent = 10 | .messageQueueSize = 10000 | .enableContextFiltering = true')
      ;;
  esac

  # Save to Redis
  redis-cli SET "$CONFIG_KEY" "$updated_config" > /dev/null

  # Publish event
  local event_json=$(cat <<EOF
{
  "event": "level_changed",
  "timestamp": $(date +%s),
  "scope": "$SCOPE",
  "oldLevel": "$(echo "$config" | jq -r '.level // "unknown"')",
  "newLevel": "$LEVEL",
  "config": $updated_config
}
EOF
)
  redis-cli PUBLISH "transparency:events" "$event_json" > /dev/null

  # Output result
  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "success": true,
  "scope": "$SCOPE",
  "level": "$LEVEL",
  "description": "${LEVEL_DESCRIPTIONS[$LEVEL]}",
  "config": $updated_config
}
EOF
  else
    echo "Transparency Level Updated"
    echo "=========================="
    echo "Scope: $SCOPE"
    echo "New Level: $LEVEL"
    echo "Description: ${LEVEL_DESCRIPTIONS[$LEVEL]}"
    echo ""
    echo "Updated Configuration:"
    echo "$updated_config" | jq -r 'to_entries | .[] | "  \(.key): \(.value)"'
  fi
}

# Assess impact of level change
assess_impact() {
  if [[ -z "$LEVEL" ]]; then
    echo "Error: --set <level> is required for impact assessment" >&2
    exit 1
  fi

  # Get current level
  local config=$(redis-cli GET "$CONFIG_KEY" 2>/dev/null || echo '{"level":"detailed"}')
  local current_level=$(echo "$config" | jq -r '.level // "detailed"')

  # Get current metrics
  local metrics_key="transparency:metrics:${TASK_ID:-global}"
  local metrics=$(redis-cli GET "$metrics_key" 2>/dev/null || echo "{}")

  local total_generated=$(echo "$metrics" | jq -r '.totalMessagesGenerated // 0')
  local avg_overhead=$(echo "$metrics" | jq -r '.overheadPercentage // 0')

  # Estimate impact multipliers
  declare -A MESSAGE_MULTIPLIER
  MESSAGE_MULTIPLIER["minimal"]=0.2
  MESSAGE_MULTIPLIER["detailed"]=1.0
  MESSAGE_MULTIPLIER["verbose"]=3.0
  MESSAGE_MULTIPLIER["debug"]=5.0

  declare -A OVERHEAD_ESTIMATE
  OVERHEAD_ESTIMATE["minimal"]=0.5
  OVERHEAD_ESTIMATE["detailed"]=2.0
  OVERHEAD_ESTIMATE["verbose"]=4.0
  OVERHEAD_ESTIMATE["debug"]=8.0

  # Calculate projected impact
  local current_multiplier=${MESSAGE_MULTIPLIER[$current_level]}
  local new_multiplier=${MESSAGE_MULTIPLIER[$LEVEL]}
  local multiplier_ratio=$(echo "scale=2; $new_multiplier / $current_multiplier" | bc)

  local projected_messages=$(echo "scale=0; $total_generated * $multiplier_ratio" | bc)
  local projected_overhead=${OVERHEAD_ESTIMATE[$LEVEL]}

  if [[ "$FORMAT" == "json" ]]; then
    cat <<EOF
{
  "currentLevel": "$current_level",
  "proposedLevel": "$LEVEL",
  "impact": {
    "messageVolumeChange": "$multiplier_ratio",
    "projectedMessages": $projected_messages,
    "projectedOverhead": $projected_overhead,
    "overheadChange": "$(echo "scale=2; $projected_overhead - $avg_overhead" | bc)"
  },
  "recommendation": "$([ "$LEVEL" == "debug" ] && echo "Use only for troubleshooting" || echo "Safe to use")"
}
EOF
  else
    echo "Impact Assessment"
    echo "================="
    echo "Current Level: $current_level"
    echo "Proposed Level: $LEVEL"
    echo ""
    echo "Projected Impact:"
    echo "  Message Volume Change: ${multiplier_ratio}x"
    echo "  Projected Messages: $projected_messages"
    echo "  Current Overhead: ${avg_overhead}%"
    echo "  Projected Overhead: ${projected_overhead}%"
    echo "  Overhead Change: +$(echo "scale=2; $projected_overhead - $avg_overhead" | bc)%"
    echo ""
    if [[ "$LEVEL" == "debug" ]]; then
      echo "Recommendation: Use debug level only for troubleshooting"
    elif [[ "$LEVEL" == "minimal" ]]; then
      echo "Recommendation: Minimal level reduces visibility significantly"
    else
      echo "Recommendation: Safe to use for production"
    fi
  fi
}

# Execute action
case "$ACTION" in
  get)
    get_level
    ;;
  set)
    if [[ "$IMPACT" == "yes" ]]; then
      assess_impact
      echo ""
      echo "Proceeding with level change..."
      echo ""
    fi
    set_level
    ;;
  *)
    echo "Error: Unknown action: $ACTION" >&2
    exit 1
    ;;
esac

exit 0
