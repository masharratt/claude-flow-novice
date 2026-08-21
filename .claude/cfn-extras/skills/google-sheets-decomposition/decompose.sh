#!/usr/bin/env bash
set -euo pipefail

# Google Sheets Request Decomposition Script
# Breaks complex requests into atomic micro-sprints with dependencies

# Configuration
MAX_SPRINTS=15
MAX_OPS_PER_SPRINT=5
MAX_OPS_INTEGRATION=3
MAX_OPS_AUTOMATION=3
MAX_API_CALLS_TOTAL=100

# Default values
REQUEST=""
MODE="standard"
OUTPUT_FILE=""
CURRENT_STATE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --request)
      REQUEST="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --current-state)
      CURRENT_STATE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$REQUEST" ]]; then
  echo "Error: --request is required" >&2
  exit 1
fi

# Validate request is not too vague
if [[ ${#REQUEST} -lt 10 ]]; then
  cat <<EOF
{
  "error": "INVALID_REQUEST",
  "message": "Request too vague: '$REQUEST'",
  "suggestion": "Specify concrete operations (e.g., 'add revenue column', 'create pivot table')"
}
EOF
  exit 1
fi

# Function to classify operation into sprint type
classify_operation() {
  local operation="$1"

  # Schema operations
  if echo "$operation" | grep -qiE "create sheet|add column|rename|define range|structure"; then
    echo "schema"
    return
  fi

  # Data operations
  if echo "$operation" | grep -qiE "import|transform|merge|clean|populate|data"; then
    echo "data"
    return
  fi

  # Formula operations
  if echo "$operation" | grep -qiE "formula|calculate|sum|average|validation|vlookup"; then
    echo "formula"
    return
  fi

  # Formatting operations
  if echo "$operation" | grep -qiE "format|style|color|conditional format|width|height"; then
    echo "formatting"
    return
  fi

  # Integration operations
  if echo "$operation" | grep -qiE "api|import.*from|connect|external|database|importrange"; then
    echo "integration"
    return
  fi

  # Automation operations
  if echo "$operation" | grep -qiE "script|trigger|automat|custom function|apps script"; then
    echo "automation"
    return
  fi

  # Default to data if unclear
  echo "data"
}

# Function to extract operations from request
extract_operations() {
  local request="$1"

  # Simple extraction: split by common delimiters
  # In production, this would use NLP or more sophisticated parsing
  echo "$request" | sed 's/[,;.]/\n/g' | sed 's/and /\n/g' | sed '/^$/d'
}

# Function to generate sprint ID
generate_sprint_id() {
  local sprint_type="$1"
  local counter="$2"
  printf "%s_%03d" "$sprint_type" "$counter"
}

# Function to estimate API calls for operation
estimate_api_calls() {
  local operation="$1"
  local sprint_type="$2"

  case "$sprint_type" in
    schema) echo "1" ;;
    data) echo "2" ;;
    formula) echo "1" ;;
    formatting) echo "1" ;;
    integration) echo "3" ;;
    automation) echo "2" ;;
    *) echo "1" ;;
  esac
}

# Main decomposition logic
decompose_request() {
  local request="$1"

  # Extract operations
  mapfile -t operations < <(extract_operations "$request")

  if [[ ${#operations[@]} -eq 0 ]]; then
    cat <<EOF
{
  "error": "NO_OPERATIONS_FOUND",
  "message": "Could not extract operations from request",
  "request": "$request"
}
EOF
    return 1
  fi

  # Classify and group operations
  declare -A sprint_groups
  declare -A sprint_counters=(
    [schema]=1
    [data]=1
    [formula]=1
    [formatting]=1
    [integration]=1
    [automation]=1
  )

  for op in "${operations[@]}"; do
    # Skip empty lines
    [[ -z "$op" ]] && continue

    # Trim whitespace
    op="$(echo "$op" | xargs)"

    # Classify operation
    sprint_type=$(classify_operation "$op")

    # Get current counter
    counter=${sprint_counters[$sprint_type]}
    sprint_id=$(generate_sprint_id "$sprint_type" "$counter")

    # Add to group
    if [[ -z "${sprint_groups[$sprint_id]:-}" ]]; then
      sprint_groups[$sprint_id]="$op"
    else
      sprint_groups[$sprint_id]="${sprint_groups[$sprint_id]}|$op"
    fi

    # Check if we need to start a new sprint (max operations reached)
    op_count=$(echo "${sprint_groups[$sprint_id]}" | tr '|' '\n' | wc -l)
    max_ops=$MAX_OPS_PER_SPRINT

    if [[ "$sprint_type" == "integration" ]]; then
      max_ops=$MAX_OPS_INTEGRATION
    elif [[ "$sprint_type" == "automation" ]]; then
      max_ops=$MAX_OPS_AUTOMATION
    fi

    if [[ $op_count -ge $max_ops ]]; then
      sprint_counters[$sprint_type]=$((counter + 1))
    fi
  done

  # Check total sprint count
  total_sprints=${#sprint_groups[@]}
  if [[ $total_sprints -gt $MAX_SPRINTS ]]; then
    cat <<EOF
{
  "error": "EXCEEDS_COMPLEXITY_LIMIT",
  "message": "Request requires $total_sprints sprints, maximum is $MAX_SPRINTS",
  "suggestion": "Break into multiple user requests or simplify scope"
}
EOF
    return 1
  fi

  # Generate JSON output
  echo "{"
  echo "  \"request_summary\": \"$request\","
  echo "  \"total_sprints\": $total_sprints,"
  echo "  \"sprints\": ["

  local sprint_index=0
  local total_api_calls=0

  # Sort sprints by dependency order (schema → data → formula → formatting → integration → automation)
  local -a ordered_types=(schema data formula formatting integration automation)

  for sprint_type in "${ordered_types[@]}"; do
    for sprint_id in $(echo "${!sprint_groups[@]}" | tr ' ' '\n' | grep "^${sprint_type}_" | sort); do
      [[ $sprint_index -gt 0 ]] && echo ","

      # Extract operations for this sprint
      IFS='|' read -ra ops <<< "${sprint_groups[$sprint_id]}"

      # Determine dependencies
      local dependencies="[]"
      case "$sprint_type" in
        data)
          dependencies='["schema"]'
          ;;
        formula)
          dependencies='["schema", "data"]'
          ;;
        formatting)
          dependencies='["data"]'
          ;;
        integration)
          dependencies='["schema"]'
          ;;
        automation)
          dependencies='["schema", "data", "formula", "formatting", "integration"]'
          ;;
      esac

      # Generate success criteria
      local success_criteria="["
      local criteria_index=0
      for op in "${ops[@]}"; do
        [[ $criteria_index -gt 0 ]] && success_criteria+=", "
        success_criteria+="\"Operation completed: $op\""
        criteria_index=$((criteria_index + 1))
      done
      success_criteria+="]"

      # Estimate API calls
      local api_calls=0
      for op in "${ops[@]}"; do
        api_calls=$((api_calls + $(estimate_api_calls "$op" "$sprint_type")))
      done
      total_api_calls=$((total_api_calls + api_calls))

      # Output sprint JSON
      cat <<EOF
    {
      "sprint_id": "$sprint_id",
      "sprint_type": "$sprint_type",
      "operations": [$(printf '"%s"' "${ops[0]}"; printf ', "%s"' "${ops[@]:1}")],
      "dependencies": $dependencies,
      "success_criteria": $success_criteria,
      "estimated_api_calls": $api_calls
    }
EOF

      sprint_index=$((sprint_index + 1))
    done
  done

  echo ""
  echo "  ],"
  echo "  \"total_estimated_api_calls\": $total_api_calls"
  echo "}"

  # Check API quota
  if [[ $total_api_calls -gt $MAX_API_CALLS_TOTAL ]]; then
    echo "Warning: Estimated API calls ($total_api_calls) exceeds quota limit ($MAX_API_CALLS_TOTAL)" >&2
  fi
}

# Execute decomposition
RESULT=$(decompose_request "$REQUEST")

# Output to file or stdout
if [[ -n "$OUTPUT_FILE" ]]; then
  echo "$RESULT" > "$OUTPUT_FILE"
  echo "Decomposition written to: $OUTPUT_FILE" >&2
else
  echo "$RESULT"
fi
