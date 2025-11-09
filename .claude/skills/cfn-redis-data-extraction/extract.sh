#!/bin/bash
# CFN Redis Data Extraction Script
# Extracts complete Redis coordination data from completed CFN Loop tasks

set -euo pipefail

# Default values
OUTPUT_DIR="./analysis/cfn-loop-data"
INCLUDE_PERFORMANCE=false
TASK_IDS=()
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_IDS+=("$2")
      shift 2
      ;;
    --task-ids)
      IFS=',' read -ra TASK_IDS <<< "$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --include-performance)
      INCLUDE_PERFORMANCE=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 --task-id <TASK_ID> [--output-dir <DIR>] [--include-performance] [--verbose]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ ${#TASK_IDS[@]} -eq 0 ]]; then
  echo "Error: --task-id or --task-ids is required"
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Redis connection check
if ! redis-cli ping > /dev/null 2>&1; then
  echo "Error: Redis is not accessible"
  exit 1
fi

# Function to extract task data
extract_task_data() {
  local task_id="$1"
  local output_file="$OUTPUT_DIR/cfn-loop-${task_id}-extracted.json"

  [[ "$VERBOSE" == true ]] && echo "Extracting data for task: $task_id"

  # Get all Redis keys for the task
  local redis_keys
  redis_keys=$(redis-cli keys "*${task_id}*" 2>/dev/null | sort)

  if [[ -z "$redis_keys" ]]; then
    echo "Warning: No Redis keys found for task: $task_id"
    return 1
  fi

  # Initialize JSON structure
  local json_data
  json_data=$(cat << EOF
{
  "task_id": "$task_id",
  "extraction_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "extraction_version": "1.0.0",
  "redis_keys_analyzed": $(echo "$redis_keys" | wc -l),
  "agents": {},
  "metadata": {},
  "summary": {}
}
EOF
)

  # Process each Redis key
  local agent_count=0
  local completion_signals=0
  local total_confidence=0
  local confidence_count=0
  declare -A agent_loops
  declare -A agent_types

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue

    # Skip if not a swarm key
    [[ ! "$key" =~ ^swarm: ]] && continue

    # Extract agent information from key
    local agent_id=""
    local data_type=""

    if [[ "$key" =~ ^swarm:([^:]+):([^:]+):([^:]+)$ ]]; then
      local task_key="${BASH_REMATCH[1]}"
      agent_id="${BASH_REMATCH[2]}"
      data_type="${BASH_REMATCH[3]}"

      # Determine agent type and loop number
      local agent_type=""
      local loop_number=""

      if [[ "$agent_id" =~ ^cfn-v3-coordinator ]]; then
        agent_type="coordinator"
        loop_number="coordination"
      elif [[ "$agent_id" =~ -validation$ ]]; then
        agent_type="${agent_id%-validation}"
        loop_number="2"
      elif [[ "$agent_id" =~ -[0-9]+$ ]]; then
        agent_type="${agent_id%-*}"
        loop_number="3"
      elif [[ "$agent_id" =~ product-owner$ ]]; then
        agent_type="product-owner"
        loop_number="4"
      else
        agent_type="$agent_id"
        loop_number="unknown"
      fi

      # Store agent classification
      agent_types["$agent_id"]="$agent_type"
      agent_loops["$agent_id"]="$loop_number"

      # Initialize agent in JSON if not exists
      if [[ ! "$json_data" =~ "\"$agent_id\":" ]]; then
        ((agent_count++))
        json_data=$(echo "$json_data" | jq ".agents += {\"$agent_id\": {\"agent_type\": \"$agent_type\", \"loop\": \"$loop_number\", \"data\": {}}}")
      fi

      # Extract data based on type
      case "$data_type" in
        "confidence")
          local confidence
          confidence=$(redis-cli get "$key" 2>/dev/null || echo "null")
          json_data=$(echo "$json_data" | jq ".agents[\"$agent_id\"].confidence = $confidence")
          if [[ "$confidence" != "null" ]]; then
            total_confidence=$(echo "$total_confidence + $confidence" | bc -l)
            ((confidence_count++))
          fi
          ;;
        "done")
          local completion_signal
          completion_signal=$(redis-cli type "$key" 2>/dev/null)
          if [[ "$completion_signal" == "list" ]]; then
            completion_signal=$(redis-cli lrange "$key" 0 -1 2>/dev/null | head -1 || echo "null")
          else
            completion_signal=$(redis-cli get "$key" 2>/dev/null || echo "null")
          fi
          json_data=$(echo "$json_data" | jq ".agents[\"$agent_id\"].completion_signal = \"$completion_signal\"")
          ((completion_signals++))
          ;;
        "messages")
          local messages_json="[]"
          local message_count
          message_count=$(redis-cli llen "$key" 2>/dev/null || echo "0")

          if [[ "$message_count" -gt 0 ]]; then
            messages_json=$(redis-cli lrange "$key" 0 -1 2>/dev/null | jq -R . | jq -s .)
          fi

          json_data=$(echo "$json_data" | jq ".agents[\"$agent_id\"].messages = $messages_json")
          ;;
        "result")
          local result_type
          result_type=$(redis-cli type "$key" 2>/dev/null)
          local result="null"

          case "$result_type" in
            "string")
              result=$(redis-cli get "$key" 2>/dev/null || echo "null")
              ;;
            "list")
              result=$(redis-cli lrange "$key" 0 -1 2>/dev/null | jq -R . | jq -s .)
              ;;
          esac

          json_data=$(echo "$json_data" | jq ".agents[\"$agent_id\"].result = $result")
          ;;
      esac
    fi
  done <<< "$redis_keys"

  # Calculate averages and summary
  local avg_confidence="0"
  if [[ "$confidence_count" -gt 0 ]]; then
    avg_confidence=$(echo "scale=3; $total_confidence / $confidence_count" | bc -l)
  fi

  # Extract task context if available
  local task_context
  task_context=$(redis-cli get "cfn_loop:task:$task_id:context" 2>/dev/null || echo "{}")

  # Extract completed agents list
  local completed_agents
  completed_agents=$(redis-cli lrange "swarm:$task_id:completed_agents" 0 -1 2>/dev/null | jq -R . | jq -s . || echo "[]")

  # Update summary
  json_data=$(echo "$json_data" | jq "
    .summary += {
      \"total_agents\": $agent_count,
      \"completion_signals\": $completion_signals,
      \"average_confidence\": $avg_confidence,
      \"confidence_scores_count\": $confidence_count,
      \"completed_agents\": $completed_agents,
      \"extraction_status\": \"success\"
    }
  ")

  # Add task context
  json_data=$(echo "$json_data" | jq ".metadata.task_context = \"$task_context\"")

  # Add performance metrics if requested
  if [[ "$INCLUDE_PERFORMANCE" == true ]]; then
    local redis_memory
    redis_memory=$(redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r' || echo "\"unknown\"")
    local redis_clients
    redis_clients=$(redis-cli info clients 2>/dev/null | grep "connected_clients" | cut -d: -f2 | tr -d '\r' || echo "0")

    json_data=$(echo "$json_data" | jq "
      .metadata.performance = {
        \"redis_memory_usage\": \"$redis_memory\",
        \"redis_connected_clients\": $redis_clients,
        \"extraction_duration_ms\": 0
      }
    ")
  fi

  # Write to file
  echo "$json_data" | jq '.' > "$output_file"

  [[ "$VERBOSE" == true ]] && echo "Data extracted to: $output_file"

  # Generate summary report
  local summary_file="$OUTPUT_DIR/cfn-loop-${task_id}-summary.txt"
  cat > "$summary_file" << EOF
CFN Loop Data Extraction Summary
================================

Task ID: $task_id
Extraction Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Output File: $output_file

Statistics:
- Redis Keys Analyzed: $(echo "$redis_keys" | wc -l)
- Total Agents: $agent_count
- Completion Signals: $completion_signals
- Average Confidence: $avg_confidence
- Confidence Scores: $confidence_count

Agent Types:
$(for agent_id in "${!agent_types[@]}"; do
  echo "- $agent_id: ${agent_types[$agent_id]} (Loop ${agent_loops[$agent_id]})"
done | sort)

Status: Successfully extracted
EOF

  [[ "$VERBOSE" == true ]] && echo "Summary report generated: $summary_file"

  return 0
}

# Main execution
echo "CFN Redis Data Extraction Started"
echo "================================="
echo "Output Directory: $OUTPUT_DIR"
echo "Include Performance: $INCLUDE_PERFORMANCE"
echo ""

# Process each task
for task_id in "${TASK_IDS[@]}"; do
  echo "Processing task: $task_id"
  if extract_task_data "$task_id"; then
    echo "✅ Successfully extracted data for: $task_id"
  else
    echo "❌ Failed to extract data for: $task_id"
  fi
  echo ""
done

echo "CFN Redis Data Extraction Completed"
echo "==================================="
echo "Output Directory: $OUTPUT_DIR"
echo "Files Generated:"
find "$OUTPUT_DIR" -name "cfn-loop-*.json" -o -name "cfn-loop-*.txt" | while read -r file; do
  echo "  - $file"
done

exit 0