#!/usr/bin/env bash
set -euo pipefail

# Google Sheets Sprint Ordering Script
# Resolves dependencies and generates execution plan using topological sort

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Default values
SPRINTS_JSON=""
OUTPUT_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --sprints-json)
      SPRINTS_JSON="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$SPRINTS_JSON" ]]; then
  echo "Error: --sprints-json is required" >&2
  exit 1
fi

# Read sprints JSON (from file or stdin)
if [[ -f "$SPRINTS_JSON" ]]; then
  SPRINTS_DATA=$(cat "$SPRINTS_JSON")
else
  SPRINTS_DATA="$SPRINTS_JSON"
fi

# Validate JSON
if ! echo "$SPRINTS_DATA" | jq empty 2>/dev/null; then
  echo "Error: Invalid JSON in sprints data" >&2
  exit 1
fi

# Extract sprints array
SPRINTS=$(echo "$SPRINTS_DATA" | jq -c '.sprints')
TOTAL_SPRINTS=$(echo "$SPRINTS" | jq 'length')

if [[ $TOTAL_SPRINTS -eq 0 ]]; then
  echo "Error: No sprints found in input" >&2
  exit 1
fi

# Build dependency graph
declare -A adjacency_list
declare -A in_degree
declare -A sprint_types

for i in $(seq 0 $((TOTAL_SPRINTS - 1))); do
  SPRINT=$(echo "$SPRINTS" | jq -c ".[$i]")
  SPRINT_ID=$(echo "$SPRINT" | jq -r '.sprint_id')
  SPRINT_TYPE=$(echo "$SPRINT" | jq -r '.sprint_type')
  DEPENDENCIES=$(echo "$SPRINT" | jq -r '.dependencies[]' 2>/dev/null || true)

  # Store sprint type
  sprint_types[$SPRINT_ID]="$SPRINT_TYPE"

  # Initialize in-degree
  in_degree[$SPRINT_ID]=0

  # Process dependencies
  for dep_type in $DEPENDENCIES; do
    # Find all sprints of this dependency type
    for j in $(seq 0 $((TOTAL_SPRINTS - 1))); do
      DEP_SPRINT=$(echo "$SPRINTS" | jq -c ".[$j]")
      DEP_SPRINT_ID=$(echo "$DEP_SPRINT" | jq -r '.sprint_id')
      DEP_SPRINT_TYPE=$(echo "$DEP_SPRINT" | jq -r '.sprint_type')

      if [[ "$DEP_SPRINT_TYPE" == "$dep_type" ]]; then
        # Add edge from dependency to current sprint
        if [[ -z "${adjacency_list[$DEP_SPRINT_ID]:-}" ]]; then
          adjacency_list[$DEP_SPRINT_ID]="$SPRINT_ID"
        else
          adjacency_list[$DEP_SPRINT_ID]="${adjacency_list[$DEP_SPRINT_ID]} $SPRINT_ID"
        fi

        # Increment in-degree
        in_degree[$SPRINT_ID]=$((in_degree[$SPRINT_ID] + 1))
      fi
    done
  done
done

# Ensure all sprints have an in-degree entry
for i in $(seq 0 $((TOTAL_SPRINTS - 1))); do
  SPRINT_ID=$(echo "$SPRINTS" | jq -r ".[$i].sprint_id")
  if [[ -z "${in_degree[$SPRINT_ID]:-}" ]]; then
    in_degree[$SPRINT_ID]=0
  fi
done

# Kahn's algorithm for topological sort
declare -a execution_levels
declare -a current_level
declare -a next_level

# Find all sprints with in-degree 0 (no dependencies)
for sprint_id in "${!in_degree[@]}"; do
  if [[ ${in_degree[$sprint_id]} -eq 0 ]]; then
    current_level+=("$sprint_id")
  fi
done

level=0
total_processed=0

while [[ ${#current_level[@]} -gt 0 ]]; do
  # Store current level
  execution_levels[$level]="${current_level[*]}"

  # Process each sprint in current level
  for sprint_id in "${current_level[@]}"; do
    total_processed=$((total_processed + 1))

    # Get all dependents (children) of this sprint
    dependents="${adjacency_list[$sprint_id]:-}"

    for dependent in $dependents; do
      # Decrement in-degree
      in_degree[$dependent]=$((in_degree[$dependent] - 1))

      # If in-degree becomes 0, add to next level
      if [[ ${in_degree[$dependent]} -eq 0 ]]; then
        next_level+=("$dependent")
      fi
    done
  done

  # Move to next level
  current_level=("${next_level[@]}")
  next_level=()
  level=$((level + 1))
done

# Check for cycles (if not all sprints processed)
if [[ $total_processed -ne $TOTAL_SPRINTS ]]; then
  # Find remaining sprints (part of cycle)
  remaining_sprints=()
  for i in $(seq 0 $((TOTAL_SPRINTS - 1))); do
    SPRINT_ID=$(echo "$SPRINTS" | jq -r ".[$i].sprint_id")
    if [[ ${in_degree[$SPRINT_ID]} -gt 0 ]]; then
      remaining_sprints+=("$SPRINT_ID")
    fi
  done

  cat <<EOF
{
  "error": "CIRCULAR_DEPENDENCY",
  "message": "Cycle detected in sprint dependencies",
  "sprints_in_cycle": [$(printf '"%s"' "${remaining_sprints[0]}"; printf ', "%s"' "${remaining_sprints[@]:1}")],
  "suggestion": "Remove dependency or restructure operations"
}
EOF
  exit 1
fi

# Generate execution plan JSON
echo "{"
echo "  \"execution_order\": ["

for lvl in $(seq 0 $((level - 1))); do
  [[ $lvl -gt 0 ]] && echo ","

  IFS=' ' read -ra sprint_ids <<< "${execution_levels[$lvl]}"

  echo "    {"
  echo "      \"level\": $lvl,"
  echo "      \"parallel_group\": ["

  for idx in "${!sprint_ids[@]}"; do
    sprint_id="${sprint_ids[$idx]}"
    sprint_type="${sprint_types[$sprint_id]}"

    # Determine if can parallelize (safe if multiple sprints at same level and different sheets)
    can_parallelize="false"
    if [[ ${#sprint_ids[@]} -gt 1 ]]; then
      can_parallelize="true"
    fi

    [[ $idx -gt 0 ]] && echo ","

    cat <<EOF
        {
          "sprint_id": "$sprint_id",
          "sprint_type": "$sprint_type",
          "can_parallelize": $can_parallelize
        }
EOF
  done

  echo "      ]"
  echo -n "    }"
done

echo ""
echo "  ],"

# Calculate critical path (longest path)
critical_path_length=0
for lvl in $(seq 0 $((level - 1))); do
  IFS=' ' read -ra sprint_ids <<< "${execution_levels[$lvl]}"
  critical_path_length=$((critical_path_length + 1))
done

# Count parallelization opportunities
parallelization_opportunities=0
for lvl in $(seq 0 $((level - 1))); do
  IFS=' ' read -ra sprint_ids <<< "${execution_levels[$lvl]}"
  if [[ ${#sprint_ids[@]} -gt 1 ]]; then
    parallelization_opportunities=$((parallelization_opportunities + 1))
  fi
done

echo "  \"total_levels\": $level,"
echo "  \"critical_path_length\": $critical_path_length,"
echo "  \"parallelization_opportunities\": $parallelization_opportunities"
echo "}"
