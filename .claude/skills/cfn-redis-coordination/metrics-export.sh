#!/bin/bash
# metrics-export.sh - Export CFN Loop metrics in multiple formats
# Supports: JSON, Prometheus, OpenTelemetry (OTLP), CSV
# Features: Time range filtering, remote push, TTL cleanup

set -euo pipefail

# ============================================================================
# Configuration & Default Values
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_ID=""
FORMAT="json"
SINCE=""
UNTIL=""
PUSH_GATEWAY=""
OUTPUT_FILE=""
CLEANUP_TTL=""
VERBOSE=false

# Metric categories (matching orchestrate-cfn-loop.sh)
METRICS_CATEGORIES=(
  "iteration_start"
  "iteration_duration"
  "loop3_consensus"
  "loop2_consensus"
  "agent_latency"
  "gate_failures"
  "timeout_count"
  "quorum_fallback"
  "retry_count"
)

# ============================================================================
# Utility Functions
# ============================================================================

log() {
  if [[ "$VERBOSE" == true ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
  fi
}

error() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: $0 --task-id <id> [OPTIONS]

Export CFN Loop metrics in multiple formats.

Required:
  --task-id <id>           Task ID to export metrics for

Optional:
  --format <type>          Export format: json|prometheus|otlp|csv (default: json)
  --since <timestamp>      Filter metrics since timestamp (ISO 8601 or Unix ms)
  --until <timestamp>      Filter metrics until timestamp (ISO 8601 or Unix ms)
  --output <file>          Write output to file instead of stdout
  --push-gateway <url>     Push Prometheus metrics to remote gateway
  --cleanup-ttl <days>     Cleanup metrics older than N days
  --verbose                Enable verbose logging

Examples:
  # Export all metrics as JSON
  $0 --task-id redis-phase7-1760900252 --format json

  # Export to Prometheus with time range
  $0 --task-id task-123 --format prometheus \\
    --since "2025-10-19T00:00:00Z" --until "2025-10-19T23:59:59Z"

  # Push to Prometheus Pushgateway
  $0 --task-id task-123 --format prometheus \\
    --push-gateway http://localhost:9091

  # Export to file with cleanup
  $0 --task-id task-123 --format json \\
    --output metrics.json --cleanup-ttl 30

  # Export OTLP for OpenTelemetry
  $0 --task-id task-123 --format otlp --output traces.json

EOF
  exit 1
}

# ============================================================================
# Time Conversion Functions
# ============================================================================

# Convert ISO 8601 timestamp to Unix milliseconds
iso_to_unix_ms() {
  local iso_timestamp="$1"

  # Try using date command (GNU/BSD compatible)
  if date --version >/dev/null 2>&1; then
    # GNU date
    date -d "$iso_timestamp" +%s%3N 2>/dev/null || echo "0"
  else
    # BSD/macOS date
    date -j -f "%Y-%m-%dT%H:%M:%S" "${iso_timestamp%%Z*}" +%s000 2>/dev/null || echo "0"
  fi
}

# Filter metrics by time range
filter_by_time() {
  local value="$1"
  local timestamp="$2"

  # If no time filters, include all
  [[ -z "$SINCE" && -z "$UNTIL" ]] && echo "$value" && return

  local since_ms=$(iso_to_unix_ms "$SINCE")
  local until_ms=$(iso_to_unix_ms "$UNTIL")

  if [[ -n "$SINCE" ]] && (( timestamp < since_ms )); then
    return 1
  fi

  if [[ -n "$UNTIL" ]] && (( timestamp > until_ms )); then
    return 1
  fi

  echo "$value"
}

# ============================================================================
# Metric Collection Functions
# ============================================================================

# Collect all metrics from Redis for a task
collect_metrics() {
  local task_id="$1"
  declare -gA METRICS

  log "Collecting metrics for task: $task_id"

  for category in "${METRICS_CATEGORIES[@]}"; do
    local key="swarm:${task_id}:metrics:${category}"
    local values=$(redis-cli LRANGE "$key" 0 -1 2>/dev/null || echo "")

    if [[ -n "$values" ]]; then
      METRICS["$category"]="$values"
      local count=$(echo "$values" | wc -l)
      log "Collected ${category}: $count entries"
    else
      METRICS["$category"]=""
    fi
  done

  # Collect agent-specific metrics
  local agent_pattern="swarm:${task_id}:agent:*:metrics:*"
  local agent_keys=$(redis-cli KEYS "$agent_pattern" 2>/dev/null || echo "")

  if [[ -n "$agent_keys" ]]; then
    METRICS["agent_keys"]="$agent_keys"
    local count=$(echo "$agent_keys" | wc -w)
    log "Found agent-specific metric keys: $count"
  fi
}

# Calculate statistical summaries from JSON array
calculate_stats() {
  local json_array="$1"
  local field="${2:-}"

  # Parse JSON array and extract numeric values
  local values=""
  if [[ -n "$field" ]]; then
    values=$(echo "$json_array" | jq -r ".[] | .$field // empty" 2>/dev/null || echo "")
  else
    values=$(echo "$json_array" | jq -r '.[] // empty' 2>/dev/null || echo "")
  fi

  local count=0
  local sum=0
  local min=""
  local max=""

  for val in $values; do
    # Skip non-numeric values
    if ! [[ "$val" =~ ^[0-9]+\.?[0-9]*$ ]]; then
      continue
    fi

    count=$((count + 1))
    sum=$(echo "$sum + $val" | bc -l)

    if [[ -z "$min" ]] || (( $(echo "$val < $min" | bc -l) )); then
      min="$val"
    fi

    if [[ -z "$max" ]] || (( $(echo "$val > $max" | bc -l) )); then
      max="$val"
    fi
  done

  local avg=0
  if (( count > 0 )); then
    avg=$(echo "scale=2; $sum / $count" | bc -l)
  fi

  cat <<EOF
{
  "count": $count,
  "sum": ${sum:-0},
  "avg": ${avg:-0},
  "min": ${min:-0},
  "max": ${max:-0}
}
EOF
}

# ============================================================================
# Export Format Functions
# ============================================================================

# Export as JSON
export_json() {
  local task_id="$1"

  log "Exporting metrics in JSON format"

  # Build JSON structure
  cat <<EOF
{
  "task_id": "$task_id",
  "export_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "metrics": {
EOF

  local first=true
  for category in "${METRICS_CATEGORIES[@]}"; do
    local values="${METRICS[$category]:-}"
    [[ -z "$values" ]] && continue

    if [[ "$first" == false ]]; then
      echo ","
    fi
    first=false

    # Convert to JSON array (Redis LRANGE returns newline-separated values)
    local json_array=$(echo "$values" | jq -s -c '.' 2>/dev/null || echo "[]")

    # Calculate statistics based on category type
    local stats=""
    case "$category" in
      iteration_duration|agent_latency)
        stats=$(calculate_stats "$json_array" "duration_ms")
        ;;
      loop3_consensus|loop2_consensus)
        stats=$(calculate_stats "$json_array" "consensus")
        ;;
      *)
        # For scalar metrics
        stats=$(calculate_stats "$json_array")
        ;;
    esac

    cat <<EOF
    "$category": {
      "values": $json_array,
      "stats": $stats
    }
EOF
  done

  cat <<EOF

  },
  "metadata": {
    "total_categories": ${#METRICS_CATEGORIES[@]},
    "non_empty_categories": $(for cat in "${METRICS_CATEGORIES[@]}"; do [[ -n "${METRICS[$cat]:-}" ]] && echo 1; done | wc -l)
  }
}
EOF
}

# Export as Prometheus text format
export_prometheus() {
  local task_id="$1"

  log "Exporting metrics in Prometheus format"

  # Iteration duration histogram
  if [[ -n "${METRICS[iteration_duration]:-}" ]]; then
    echo "# HELP cfn_iteration_duration_ms CFN Loop iteration duration in milliseconds"
    echo "# TYPE cfn_iteration_duration_ms histogram"

    local values=$(echo "${METRICS[iteration_duration]}" | jq -s -c '.')
    echo "$values" | jq -r '.[] | "\(.duration_ms) \(.iteration)"' 2>/dev/null | while read -r duration iteration; do
      echo "cfn_iteration_duration_ms{task_id=\"$task_id\",iteration=\"$iteration\"} $duration"
    done
    echo ""
  fi

  # Agent latency histogram
  if [[ -n "${METRICS[agent_latency]:-}" ]]; then
    echo "# HELP cfn_agent_latency_ms Agent completion latency in milliseconds"
    echo "# TYPE cfn_agent_latency_ms histogram"

    local values=$(echo "${METRICS[agent_latency]}" | jq -s -c '.')
    echo "$values" | jq -r '.[] | "\(.agent) \(.latency_ms) \(.loop) \(.iteration)"' 2>/dev/null | while read -r agent latency loop iteration; do
      echo "cfn_agent_latency_ms{task_id=\"$task_id\",agent=\"$agent\",loop=\"$loop\",iteration=\"$iteration\"} $latency"
    done
    echo ""
  fi

  # Loop 3 consensus scores
  if [[ -n "${METRICS[loop3_consensus]:-}" ]]; then
    echo "# HELP cfn_loop3_consensus Loop 3 consensus score (0.0-1.0)"
    echo "# TYPE cfn_loop3_consensus gauge"

    local values=$(echo "${METRICS[loop3_consensus]}" | jq -s -c '.')
    echo "$values" | jq -r '.[] | "\(.consensus) \(.iteration)"' 2>/dev/null | while read -r score iteration; do
      echo "cfn_loop3_consensus{task_id=\"$task_id\",iteration=\"$iteration\"} $score"
    done
    echo ""
  fi

  # Loop 2 consensus scores
  if [[ -n "${METRICS[loop2_consensus]:-}" ]]; then
    echo "# HELP cfn_loop2_consensus Loop 2 consensus score (0.0-1.0)"
    echo "# TYPE cfn_loop2_consensus gauge"

    local values=$(echo "${METRICS[loop2_consensus]}" | jq -s -c '.')
    echo "$values" | jq -r '.[] | "\(.consensus) \(.iteration)"' 2>/dev/null | while read -r score iteration; do
      echo "cfn_loop2_consensus{task_id=\"$task_id\",iteration=\"$iteration\"} $score"
    done
    echo ""
  fi

  # Gate failure counter
  local gate_failures=$(redis-cli GET "swarm:${task_id}:metrics:gate_failures" 2>/dev/null || echo "0")
  echo "# HELP cfn_gate_failures_total Total number of gate failures"
  echo "# TYPE cfn_gate_failures_total counter"
  echo "cfn_gate_failures_total{task_id=\"$task_id\"} ${gate_failures:-0}"
  echo ""

  # Timeout counter
  local timeout_count=$(redis-cli GET "swarm:${task_id}:metrics:timeout_count" 2>/dev/null || echo "0")
  echo "# HELP cfn_timeout_total Total number of agent timeouts"
  echo "# TYPE cfn_timeout_total counter"
  echo "cfn_timeout_total{task_id=\"$task_id\"} ${timeout_count:-0}"
  echo ""

  # Quorum fallback counter
  local quorum_fallback=$(redis-cli GET "swarm:${task_id}:metrics:quorum_fallback" 2>/dev/null || echo "0")
  echo "# HELP cfn_quorum_fallback_total Total number of quorum fallbacks"
  echo "# TYPE cfn_quorum_fallback_total counter"
  echo "cfn_quorum_fallback_total{task_id=\"$task_id\"} ${quorum_fallback:-0}"
  echo ""

  # Retry counter
  local retry_count=$(redis-cli GET "swarm:${task_id}:metrics:retry_count" 2>/dev/null || echo "0")
  echo "# HELP cfn_retry_total Total number of retry attempts"
  echo "# TYPE cfn_retry_total counter"
  echo "cfn_retry_total{task_id=\"$task_id\"} ${retry_count:-0}"
  echo ""
}

# Export as OpenTelemetry OTLP JSON
export_otlp() {
  local task_id="$1"

  log "Exporting metrics in OTLP format"

  # OTLP Trace/Span structure for CFN Loop
  cat <<EOF
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": { "stringValue": "cfn-loop-orchestrator" }
          },
          {
            "key": "task.id",
            "value": { "stringValue": "$task_id" }
          }
        ]
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "redis-coordination",
            "version": "2.2.0"
          },
          "spans": [
EOF

  # Create spans for each iteration
  local first_span=true

  if [[ -n "${METRICS[iteration_start]:-}" ]] && [[ -n "${METRICS[iteration_duration]:-}" ]]; then
    local starts="${METRICS[iteration_start]}"
    local durations=$(echo "${METRICS[iteration_duration]}" | jq -s -c '.')

    # Parse starts and combine with durations
    local iteration=1
    for start_time in $starts; do
      local duration=$(echo "$durations" | jq -r ".[$((iteration - 1))].duration_ms // 0" 2>/dev/null)

      if [[ "$first_span" == false ]]; then
        echo ","
      fi
      first_span=false

      # Calculate end time
      local end_time=$((start_time + duration))

      # Convert to nanoseconds for OTLP
      local start_ns=$((start_time * 1000000))
      local end_ns=$((end_time * 1000000))

      # Generate trace and span IDs
      local trace_id=$(openssl rand -hex 16 2>/dev/null || echo "00000000000000000000000000000000")
      local span_id=$(openssl rand -hex 8 2>/dev/null || echo "0000000000000000")

      cat <<SPAN
            {
              "traceId": "$trace_id",
              "spanId": "$span_id",
              "name": "cfn_loop_iteration_${iteration}",
              "kind": 1,
              "startTimeUnixNano": "$start_ns",
              "endTimeUnixNano": "$end_ns",
              "attributes": [
                {
                  "key": "iteration",
                  "value": { "intValue": "$iteration" }
                },
                {
                  "key": "duration_ms",
                  "value": { "intValue": "$duration" }
                }
              ]
            }
SPAN

      iteration=$((iteration + 1))
    done
  fi

  cat <<EOF

          ]
        }
      ]
    }
  ]
}
EOF
}

# Export as CSV
export_csv() {
  local task_id="$1"

  log "Exporting metrics in CSV format"

  # CSV header
  echo "timestamp,category,metric_type,value,task_id,iteration,agent,loop"

  local export_timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Export each category
  for category in "${METRICS_CATEGORIES[@]}"; do
    local values="${METRICS[$category]:-}"
    [[ -z "$values" ]] && continue

    local json_array=$(echo "$values" | jq -s -c '.' 2>/dev/null || echo "[]")

    case "$category" in
      iteration_duration)
        echo "$json_array" | jq -r ".[] | \"$export_timestamp,$category,duration,\(.duration_ms),$task_id,\(.iteration),,\"" 2>/dev/null
        ;;
      agent_latency)
        echo "$json_array" | jq -r ".[] | \"$export_timestamp,$category,latency,\(.latency_ms),$task_id,\(.iteration),\(.agent),\(.loop)\"" 2>/dev/null
        ;;
      loop3_consensus|loop2_consensus)
        echo "$json_array" | jq -r ".[] | \"$export_timestamp,$category,consensus,\(.consensus),$task_id,\(.iteration),,\"" 2>/dev/null
        ;;
      *)
        # For scalar counter metrics
        local value=$(redis-cli GET "swarm:${task_id}:metrics:${category}" 2>/dev/null || echo "0")
        if [[ -n "$value" ]] && [[ "$value" != "0" ]]; then
          echo "$export_timestamp,$category,count,$value,$task_id,,,,"
        fi
        ;;
    esac
  done
}

# ============================================================================
# Push to Prometheus Pushgateway
# ============================================================================

push_to_gateway() {
  local gateway_url="$1"
  local task_id="$2"
  local metrics_data="$3"

  log "Pushing metrics to Prometheus Pushgateway: $gateway_url"

  # Push to Pushgateway
  local response=$(curl -s -w "\n%{http_code}" --data-binary "$metrics_data" \
    "${gateway_url}/metrics/job/cfn-loop/instance/${task_id}" 2>&1)

  local http_code=$(echo "$response" | tail -n1)

  if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
    log "Successfully pushed metrics to gateway (HTTP $http_code)"
    echo "Metrics pushed successfully to $gateway_url"
  else
    error "Failed to push metrics (HTTP $http_code)"
  fi
}

# ============================================================================
# TTL Cleanup
# ============================================================================

cleanup_old_metrics() {
  local task_id="$1"
  local ttl_days="$2"

  log "Cleaning up metrics older than $ttl_days days"

  local cutoff_ms=$(date -d "$ttl_days days ago" +%s%3N 2>/dev/null || echo "0")
  local deleted_count=0

  for category in "${METRICS_CATEGORIES[@]}"; do
    local key="swarm:${task_id}:metrics:${category}"
    local values=$(redis-cli LRANGE "$key" 0 -1 2>/dev/null || echo "")

    [[ -z "$values" ]] && continue

    local keep_values=()
    local json_array="[$values]"

    # Parse JSON objects and filter by timestamp
    local filtered=$(echo "$json_array" | jq -c "[.[] | select(.timestamp >= $cutoff_ms)]" 2>/dev/null || echo "[]")

    local filtered_count=$(echo "$filtered" | jq 'length' 2>/dev/null || echo "0")
    local original_count=$(echo "$json_array" | jq 'length' 2>/dev/null || echo "0")

    deleted_count=$((deleted_count + original_count - filtered_count))

    # Replace list with filtered values
    if (( filtered_count > 0 )); then
      redis-cli DEL "$key" >/dev/null
      echo "$filtered" | jq -c '.[]' | while read -r val; do
        echo "$val" | redis-cli -x RPUSH "$key" >/dev/null
      done
    else
      redis-cli DEL "$key" >/dev/null
    fi
  done

  log "Deleted $deleted_count old metric entries"
  echo "Cleanup complete: $deleted_count entries removed"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --task-id)
        TASK_ID="$2"
        shift 2
        ;;
      --format)
        FORMAT="$2"
        shift 2
        ;;
      --since)
        SINCE="$2"
        shift 2
        ;;
      --until)
        UNTIL="$2"
        shift 2
        ;;
      --output)
        OUTPUT_FILE="$2"
        shift 2
        ;;
      --push-gateway)
        PUSH_GATEWAY="$2"
        shift 2
        ;;
      --cleanup-ttl)
        CLEANUP_TTL="$2"
        shift 2
        ;;
      --verbose)
        VERBOSE=true
        shift
        ;;
      --help)
        usage
        ;;
      *)
        echo "Unknown option: $1"
        usage
        ;;
    esac
  done

  # Validate required arguments
  [[ -z "$TASK_ID" ]] && error "Missing required --task-id argument"

  # Validate format
  case "$FORMAT" in
    json|prometheus|otlp|csv)
      ;;
    *)
      error "Invalid format: $FORMAT (must be json|prometheus|otlp|csv)"
      ;;
  esac

  # Collect metrics
  collect_metrics "$TASK_ID"

  # Generate export
  local output=""
  case "$FORMAT" in
    json)
      output=$(export_json "$TASK_ID")
      ;;
    prometheus)
      output=$(export_prometheus "$TASK_ID")
      ;;
    otlp)
      output=$(export_otlp "$TASK_ID")
      ;;
    csv)
      output=$(export_csv "$TASK_ID")
      ;;
  esac

  # Output handling
  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$output" > "$OUTPUT_FILE"
    log "Metrics exported to: $OUTPUT_FILE"
    echo "Exported metrics to: $OUTPUT_FILE"
  else
    echo "$output"
  fi

  # Push to Prometheus Pushgateway if specified
  if [[ -n "$PUSH_GATEWAY" ]] && [[ "$FORMAT" == "prometheus" ]]; then
    push_to_gateway "$PUSH_GATEWAY" "$TASK_ID" "$output"
  fi

  # Cleanup old metrics if specified
  if [[ -n "$CLEANUP_TTL" ]]; then
    cleanup_old_metrics "$TASK_ID" "$CLEANUP_TTL"
  fi
}

# Run main function
main "$@"