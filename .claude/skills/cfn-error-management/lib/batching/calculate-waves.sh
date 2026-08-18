#!/usr/bin/env bash

# CFN Error Batching Strategy - Phase 5: Calculate Spawn Waves
# Plans memory-aware spawning waves respecting budget and parallelism constraints

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
BATCHES="[]"
MEMORY_BUDGET="40g"
MAX_PARALLEL=32
OUTPUT_FORMAT="json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --batches)
      BATCHES="$2"
      shift 2
      ;;
    --budget)
      MEMORY_BUDGET="$2"
      shift 2
      ;;
    --max-parallel)
      MAX_PARALLEL="$2"
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

# Parse memory to bytes
parse_memory() {
  local mem="$1"
  local num=$(echo "$mem" | sed 's/[^0-9]//g')
  local unit=$(echo "$mem" | sed 's/[0-9]//g' | tr '[:upper:]' '[:lower:]')

  case "$unit" in
    g) echo "$((num * 1024 * 1024 * 1024))" ;;
    m) echo "$((num * 1024 * 1024))" ;;
    k) echo "$((num * 1024))" ;;
    *) echo "$num" ;;
  esac
}

# Format bytes to human-readable
format_memory() {
  local bytes="$1"

  if [ "$bytes" -ge $((1024 * 1024 * 1024)) ]; then
    echo "$((bytes / (1024 * 1024 * 1024)))GB"
  elif [ "$bytes" -ge $((1024 * 1024)) ]; then
    echo "$((bytes / (1024 * 1024)))MB"
  else
    echo "$((bytes / 1024))KB"
  fi
}

# Estimate task duration (rough heuristic)
estimate_duration() {
  local error_count="$1"

  # Rough estimate: 1-2 errors fixed per second
  # Lower bound: 30 seconds, upper bound: 10 minutes
  local seconds=$((error_count / 2 + 30))

  if [ $seconds -gt 600 ]; then
    seconds=600
  fi

  # Convert to m:ss format
  local minutes=$((seconds / 60))
  local secs=$((seconds % 60))

  printf "%dm%02ds\n" "$minutes" "$secs"
}

# Calculate spawn waves
calculate_waves() {
  local batches="$1"
  local budget_bytes="$2"
  local max_parallel="$3"

  jq -n \
    --argjson batches "$batches" \
    --argjson budget_bytes "$budget_bytes" \
    --argjson max_parallel "$max_parallel" \
    '
    # Sort batches by tier (tier 1 first for max parallelism)
    ($batches.batches | sort_by(.tier)) as $sorted_batches |

    # Calculate wave groupings respecting budget
    reduce $sorted_batches[] as $batch (
      {
        waves: [],
        current_wave: [],
        current_memory: 0,
        wave_count: 0
      };
      . as $acc |
      (
        if ($batch.memory | contains("g")) then
          ($batch.memory | gsub("[^0-9]"; "") | tonumber) * 1024 * 1024 * 1024
        elif ($batch.memory | contains("m")) then
          ($batch.memory | gsub("[^0-9]"; "") | tonumber) * 1024 * 1024
        else
          ($batch.memory | gsub("[^0-9]"; "") | tonumber)
        end
      ) as $batch_memory |

      if (($acc.current_memory + $batch_memory) <= $budget_bytes) and
         (($acc.current_wave | length) < $max_parallel) then
        # Add to current wave
        $acc |
        .current_wave += [$batch] |
        .current_memory += $batch_memory
      else
        # Start new wave if current has items
        if ($acc.current_wave | length) > 0 then
          $acc |
          .waves += [{
            wave_number: (.wave_count + 1),
            batches: .current_wave,
            batch_count: (.current_wave | length),
            memory_needed: (
              if (.current_memory >= (1024 * 1024 * 1024)) then
                "\((.current_memory / (1024 * 1024 * 1024)) | floor).\((((.current_memory % (1024 * 1024 * 1024)) / (1024 * 1024 * 1024) * 10) | floor))GB"
              else
                "\((.current_memory / (1024 * 1024)) | floor)MB"
              end
            ),
            parallelism: (.current_wave | length),
            estimated_duration: (
              ([.current_wave[] | .error_count] | add // 0) as $errors |
              if $errors > 0 then
                "\(($errors / 2 / 60 | floor))m\((($errors / 2 % 60) | floor))s"
              else
                "Unknown"
              end
            )
          }] |
          .current_wave = [$batch] |
          .current_memory = $batch_memory |
          .wave_count += 1
        else
          $acc |
          .current_wave = [$batch] |
          .current_memory = $batch_memory
        end
      end
    ) |

    # Add final wave
    if (.current_wave | length) > 0 then
      .waves += [{
        wave_number: (.wave_count + 1),
        batches: .current_wave,
        batch_count: (.current_wave | length),
        memory_needed: (
          if (.current_memory >= (1024 * 1024 * 1024)) then
            "\((.current_memory / (1024 * 1024 * 1024)) | floor).\((((.current_memory % (1024 * 1024 * 1024)) / (1024 * 1024 * 1024) * 10) | floor))GB"
          else
            "\((.current_memory / (1024 * 1024)) | floor)MB"
          end
        ),
        parallelism: (.current_wave | length),
        estimated_duration: (
          ([.current_wave[] | .error_count] | add // 0) as $errors |
          if $errors > 0 then
            "\(($errors / 2 / 60 | floor))m\((($errors / 2 % 60) | floor))s"
          else
            "Unknown"
          end
        )
      }]
    else
      .
    end |

    # Calculate summary
    {
      waves: .waves,
      summary: {
        total_waves: (.waves | length),
        total_agents: ([.waves[] | .batch_count] | add // 0),
        total_memory: (
          ([.waves[] | .memory_needed] | map(
            if contains("GB") then
              (split("GB")[0] | tonumber) * 1024
            else
              (split("MB")[0] | tonumber)
            end
          ) | add // 0) as $total_mb |
          if $total_mb >= 1024 then
            "\(($total_mb / 1024) | floor).\((($total_mb % 1024) * 10 / 1024 | floor))GB"
          else
            "\($total_mb)MB"
          end
        ),
        max_parallelism: ([.waves[] | .parallelism] | max // 0),
        budget_utilization: (
          ([.waves[] | .memory_needed] | map(
            if contains("GB") then
              (split("GB")[0] | tonumber) * 1024
            else
              (split("MB")[0] | tonumber)
            end
          ) | add // 0) as $total_mb |
          (($budget_bytes / (1024 * 1024)) as $budget_mb |
          (($total_mb / $budget_mb) * 100 | floor) as $percent |
          "\($percent).\((($total_mb / $budget_mb) * 1000 % 10) | floor)%")
        )
      }
    }
    '
}

# Main wave calculation
main() {
  # Parse inputs
  if [ "$BATCHES" = "[]" ] || [ -z "$BATCHES" ]; then
    jq -n '{
      waves: [],
      summary: {
        total_waves: 0,
        total_agents: 0,
        total_memory: "0GB",
        max_parallelism: 0,
        budget_utilization: "0%"
      }
    }'
    return 0
  fi

  # Parse memory budget
  local budget_bytes
  budget_bytes=$(parse_memory "$MEMORY_BUDGET")

  # Calculate waves
  local result
  result=$(calculate_waves "$BATCHES" "$budget_bytes" "$MAX_PARALLEL")

  echo "$result"
}

main
