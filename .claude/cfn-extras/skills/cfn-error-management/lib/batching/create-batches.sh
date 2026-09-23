#!/usr/bin/env bash

# CFN Error Batching Strategy - Phase 4: Create Batches with Tier Assignment
# Assigns memory tiers to clusters and creates agent-ready batches

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
CLUSTERS="[]"
TIER_CONFIG=""
ERRORS_JSON="{}"
OUTPUT_FORMAT="json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --clusters)
      CLUSTERS="$2"
      shift 2
      ;;
    --tier-config)
      TIER_CONFIG="$2"
      shift 2
      ;;
    --errors-json)
      ERRORS_JSON="$2"
      shift 2
      ;;
    --output-format)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Load default tier configuration
load_tier_config() {
  local config_file="$1"

  if [ -f "$config_file" ]; then
    jq '.' "$config_file"
  else
    # Default tier configuration
    jq -n '{
      tier_1: {max_files: 1, memory: "512m"},
      tier_2: {max_files: 3, memory: "600m"},
      tier_3: {max_files: 8, memory: "800m"},
      tier_4: {max_files: null, memory: "1g"}
    }'
  fi
}

# Assign tier based on cluster size
assign_tier() {
  local size="$1"
  local tier_config="$2"

  jq -n \
    --arg size "$size" \
    --argjson tier_config "$tier_config" \
    '
    ($size | tonumber) as $size |
    if $size <= 1 then 1
    elif $size <= 3 then 2
    elif $size <= 8 then 3
    else 4
    end
    '
}

# Parse memory string to bytes
parse_memory_bytes() {
  local mem_str="$1"

  # Extract number and unit
  local num=$(echo "$mem_str" | sed 's/[^0-9]//g')
  local unit=$(echo "$mem_str" | sed 's/[0-9]//g' | tr '[:upper:]' '[:lower:]')

  case "$unit" in
    m)
      echo "$((num * 1024 * 1024))"
      ;;
    g)
      echo "$((num * 1024 * 1024 * 1024))"
      ;;
    *)
      echo "$num"
      ;;
  esac
}

# Format bytes to human-readable
format_bytes() {
  local bytes="$1"

  if [ "$bytes" -gt $((1024 * 1024 * 1024)) ]; then
    echo "$((bytes / (1024 * 1024 * 1024)))GB"
  elif [ "$bytes" -gt $((1024 * 1024)) ]; then
    echo "$((bytes / (1024 * 1024)))MB"
  else
    echo "$((bytes / 1024))KB"
  fi
}

# Create batches from clusters
create_batches() {
  local clusters="$1"
  local tier_config="$2"
  local errors_json="$3"
  local iteration="${4:-1}"

  local batch_id=0
  local tier_dist_1=0 tier_dist_2=0 tier_dist_3=0 tier_dist_4=0
  local total_memory_bytes=0

  # Process each cluster
  jq -n \
    --argjson clusters "$clusters" \
    --argjson tier_config "$tier_config" \
    --argjson errors_json "$errors_json" \
    --arg iteration "$iteration" \
    '[
      $clusters.clusters | if . == null or . == [] then [] else
        to_entries | map(
          .value as $cluster |
          (.value.size | tostring) as $size |
          (
            if ($size | tonumber) <= 1 then 1
            elif ($size | tonumber) <= 3 then 2
            elif ($size | tonumber) <= 8 then 3
            else 4
            end
          ) as $tier |
          {
            batch_id: "iter\($iteration)-batch-\(.key + 1)",
            tier: $tier,
            memory: (
              if $tier == 1 then "512m"
              elif $tier == 2 then "600m"
              elif $tier == 3 then "800m"
              else "1g"
              end
            ),
            files: $cluster.files,
            error_count: (
              [$cluster.files[] as $file |
                $errors_json.files_with_errors[$file] // 0] |
              add // 0
            ),
            coordination_note: (
              if $tier == 1 then "Independent file"
              elif $tier == 2 then "Small cluster with shared types"
              elif $tier == 3 then "Medium feature module"
              else "Large interconnected module"
              end
            )
          }
        )
      end
    ] | .[0]
    '
}

# Calculate total memory needed
calculate_total_memory() {
  local batches="$1"

  jq -n \
    --argjson batches "$batches" \
    '[
      $batches[] |
      .memory as $mem |
      (
        if ($mem | contains("g")) then
          ($mem | gsub("[^0-9]"; "") | tonumber) * 1024 * 1024 * 1024
        elif ($mem | contains("m")) then
          ($mem | gsub("[^0-9]"; "") | tonumber) * 1024 * 1024
        else
          ($mem | gsub("[^0-9]"; "") | tonumber)
        end
      )
    ] |
    add as $total_bytes |
    if $total_bytes > (1024 * 1024 * 1024) then
      "\(($total_bytes / (1024 * 1024 * 1024)) | floor)GB"
    else
      "\(($total_bytes / (1024 * 1024)) | floor)MB"
    end
    '
}

# Calculate tier distribution
calculate_tier_distribution() {
  local batches="$1"

  jq -n \
    --argjson batches "$batches" \
    '{
      tier_1: ([$batches[] | select(.tier == 1)] | length),
      tier_2: ([$batches[] | select(.tier == 2)] | length),
      tier_3: ([$batches[] | select(.tier == 3)] | length),
      tier_4: ([$batches[] | select(.tier == 4)] | length)
    }'
}

# Main batch creation
main() {
  # Load tier configuration
  local tier_config
  if [ -n "$TIER_CONFIG" ] && [ -f "$TIER_CONFIG" ]; then
    tier_config=$(jq '.' "$TIER_CONFIG")
  else
    tier_config=$(jq -n '{
      tier_1: {max_files: 1, memory: "512m"},
      tier_2: {max_files: 3, memory: "600m"},
      tier_3: {max_files: 8, memory: "800m"},
      tier_4: {max_files: null, memory: "1g"}
    }')
  fi

  # Parse clusters
  if [ "$CLUSTERS" = "[]" ] || [ -z "$CLUSTERS" ]; then
    # No clusters, output empty result
    jq -n '{
      batches: [],
      tier_distribution: {tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0},
      total_memory_needed: "0GB"
    }'
    return 0
  fi

  # Create batches
  local batches
  batches=$(create_batches "$CLUSTERS" "$tier_config" "$ERRORS_JSON" "1")

  # Calculate statistics
  local tier_dist
  tier_dist=$(calculate_tier_distribution "$batches")

  local total_memory
  total_memory=$(calculate_total_memory "$batches")

  # Output result
  jq -n \
    --argjson batches "$batches" \
    --argjson tier_distribution "$tier_dist" \
    --arg total_memory_needed "$total_memory" \
    '{
      batches: $batches,
      tier_distribution: $tier_distribution,
      total_memory_needed: $total_memory_needed
    }'
}

main
