#!/bin/bash
#
# Auto-Tune Timeouts Helper
#
# Dynamically calculates optimal timeouts for CFN Loop agents based on:
# - Historical performance data
# - Agent type (implementer vs validator)
# - Task complexity
# - Current system load
#
# Usage:
#   auto-tune-timeouts.sh --agent-type <type> --task-complexity <low|medium|high> [--history-file <file>]
#
# Returns: Recommended timeout in seconds

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default configuration
DEFAULT_TIMEOUT=300
MIN_TIMEOUT=60
MAX_TIMEOUT=1800
HISTORY_FILE="/tmp/cfn-agent-performance-history.json"

# Baseline timeouts by agent type (seconds)
declare -A BASELINE_TIMEOUTS=(
  ["implementer"]=300
  ["validator"]=180
  ["coordinator"]=600
  ["product-owner"]=120
)

# Complexity multipliers
declare -A COMPLEXITY_MULTIPLIERS=(
  ["low"]=0.7
  ["medium"]=1.0
  ["high"]=1.5
)

# Parse arguments
AGENT_TYPE=""
TASK_COMPLEXITY="medium"
CUSTOM_HISTORY_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-type)
      AGENT_TYPE="$2"
      shift 2
      ;;
    --task-complexity)
      TASK_COMPLEXITY="$2"
      shift 2
      ;;
    --history-file)
      CUSTOM_HISTORY_FILE="$2"
      shift 2
      ;;
    --help)
      echo "Usage: auto-tune-timeouts.sh --agent-type <type> --task-complexity <low|medium|high> [--history-file <file>]"
      echo ""
      echo "Agent Types: implementer, validator, coordinator, product-owner"
      echo "Task Complexity: low, medium, high"
      echo ""
      echo "Returns: Recommended timeout in seconds"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$AGENT_TYPE" ]; then
  echo "Error: --agent-type is required"
  exit 1
fi

if [[ ! "${BASELINE_TIMEOUTS[$AGENT_TYPE]+isset}" ]]; then
  echo "Error: Unknown agent type '$AGENT_TYPE'"
  echo "Valid types: ${!BASELINE_TIMEOUTS[@]}"
  exit 1
fi

if [[ ! "${COMPLEXITY_MULTIPLIERS[$TASK_COMPLEXITY]+isset}" ]]; then
  echo "Error: Unknown task complexity '$TASK_COMPLEXITY'"
  echo "Valid complexities: ${!COMPLEXITY_MULTIPLIERS[@]}"
  exit 1
fi

# Use custom history file if provided
if [ -n "$CUSTOM_HISTORY_FILE" ]; then
  HISTORY_FILE="$CUSTOM_HISTORY_FILE"
fi

# Function to get historical average execution time
get_historical_avg() {
  local agent_type=$1

  if [ ! -f "$HISTORY_FILE" ]; then
    echo "$DEFAULT_TIMEOUT"
    return
  fi

  # Extract average execution time for this agent type
  local avg_time=$(jq -r --arg type "$agent_type" \
    '.history[]
    | select(.agentType == $type)
    | .executionTime
    | select(. != null)' "$HISTORY_FILE" 2>/dev/null | \
    awk '{ sum += $1; count++ } END { if (count > 0) print sum/count; else print 0 }')

  if [ -z "$avg_time" ] || [ "$avg_time" = "0" ]; then
    echo "$DEFAULT_TIMEOUT"
  else
    echo "$avg_time"
  fi
}

# Function to get system load factor
get_load_factor() {
  # Check if on Linux
  if [ -f /proc/loadavg ]; then
    local load_1min=$(cat /proc/loadavg | awk '{print $1}')
    local cpu_count=$(nproc 2>/dev/null || echo 1)

    # Calculate load factor (load per CPU)
    local load_factor=$(echo "scale=2; $load_1min / $cpu_count" | bc)

    # Return multiplier (1.0 baseline, increase if high load)
    if (( $(echo "$load_factor > 2.0" | bc -l) )); then
      echo "1.5"  # High load, increase timeout by 50%
    elif (( $(echo "$load_factor > 1.0" | bc -l) )); then
      echo "1.2"  # Moderate load, increase timeout by 20%
    else
      echo "1.0"  # Normal load
    fi
  else
    # Non-Linux or can't determine load
    echo "1.0"
  fi
}

# Function to get Redis latency factor
get_redis_latency_factor() {
  # Measure Redis ping latency
  local start_ns=$(date +%s%N)
  redis-cli PING >/dev/null 2>&1 || return
  local end_ns=$(date +%s%N)

  local latency_ns=$((end_ns - start_ns))
  local latency_ms=$(echo "scale=2; $latency_ns / 1000000" | bc)

  # If Redis is slow, increase timeout
  if (( $(echo "$latency_ms > 100" | bc -l) )); then
    echo "1.3"  # Very slow Redis, increase timeout by 30%
  elif (( $(echo "$latency_ms > 50" | bc -l) )); then
    echo "1.1"  # Slow Redis, increase timeout by 10%
  else
    echo "1.0"  # Normal Redis performance
  fi
}

# Calculate base timeout
baseline_timeout=${BASELINE_TIMEOUTS[$AGENT_TYPE]}

# Get historical average
historical_avg=$(get_historical_avg "$AGENT_TYPE")

# If we have historical data, use weighted average
if [ "$historical_avg" != "$DEFAULT_TIMEOUT" ]; then
  # 70% historical, 30% baseline
  base_timeout=$(echo "scale=0; ($historical_avg * 0.7) + ($baseline_timeout * 0.3)" | bc)
else
  base_timeout=$baseline_timeout
fi

# Apply complexity multiplier
complexity_multiplier=${COMPLEXITY_MULTIPLIERS[$TASK_COMPLEXITY]}
timeout_after_complexity=$(echo "scale=0; $base_timeout * $complexity_multiplier" | bc)

# Apply system load factor
load_factor=$(get_load_factor)
timeout_after_load=$(echo "scale=0; $timeout_after_complexity * $load_factor" | bc)

# Apply Redis latency factor
redis_factor=$(get_redis_latency_factor)
final_timeout=$(echo "scale=0; $timeout_after_load * $redis_factor" | bc)

# Ensure timeout is within bounds
if (( $(echo "$final_timeout < $MIN_TIMEOUT" | bc -l) )); then
  final_timeout=$MIN_TIMEOUT
fi

if (( $(echo "$final_timeout > $MAX_TIMEOUT" | bc -l) )); then
  final_timeout=$MAX_TIMEOUT
fi

# Round to integer
final_timeout=$(printf "%.0f" "$final_timeout")

# Output result (JSON format for easy parsing)
cat <<EOF
{
  "agentType": "$AGENT_TYPE",
  "taskComplexity": "$TASK_COMPLEXITY",
  "recommendedTimeout": $final_timeout,
  "calculation": {
    "baselineTimeout": $baseline_timeout,
    "historicalAverage": $historical_avg,
    "complexityMultiplier": $complexity_multiplier,
    "loadFactor": $load_factor,
    "redisLatencyFactor": $redis_factor
  },
  "bounds": {
    "min": $MIN_TIMEOUT,
    "max": $MAX_TIMEOUT
  }
}
EOF

# Also output just the timeout value to stderr for easy shell capture
echo "$final_timeout" >&2

exit 0
