#!/bin/bash
# validation.sh - Shared validation utilities for changelog and backlog management
# Part of claude-flow-novice cfn-changelog-management skill

# Validates string length within min/max bounds
# Usage: validate_string_length "$string" "$min" "$max" "$field_name"
# Returns: 0 on success, 1 on failure
# Example: validate_string_length "$SUMMARY" 10 100 "summary" || exit 1
validate_string_length() {
  local string="$1"
  local min="$2"
  local max="$3"
  local field_name="$4"

  local length=${#string}

  if (( length < min )); then
    echo "Error: --${field_name} must be at least ${min} characters (got ${length})" >&2
    return 1
  fi

  if (( length > max )); then
    echo "Error: --${field_name} must be at most ${max} characters (got ${length})" >&2
    return 1
  fi

  return 0
}

# Validates date format (YYYY-MM-DD) and value
# Usage: validate_date "$date_string"
# Returns: 0 on success, 1 on failure
# Example: validate_date "$CUSTOM_DATE" || exit 1
validate_date() {
  local date_string="$1"

  # Validate format (YYYY-MM-DD)
  if [[ ! "$date_string" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "Error: --date must be in format YYYY-MM-DD (got: ${date_string})" >&2
    return 1
  fi

  # Validate date is valid (checks for valid month/day ranges)
  if ! date -d "$date_string" >/dev/null 2>&1; then
    echo "Error: Invalid date provided: ${date_string}" >&2
    return 1
  fi

  return 0
}

# Validates value against pipe-separated enum options
# Usage: validate_enum "$value" "$field_name" "$valid_options"
# Returns: 0 on success, 1 on failure
# Example: validate_enum "$TYPE" "type" "feature|bugfix|breaking" || exit 1
validate_enum() {
  local value="$1"
  local field_name="$2"
  local valid_options="$3"

  # Convert pipe-separated options to regex pattern
  local pattern="^(${valid_options})$"

  if [[ ! "$value" =~ $pattern ]]; then
    # Format valid options for error message (replace | with comma+space)
    local formatted_options=$(echo "$valid_options" | sed 's/|/, /g')
    echo "Error: --${field_name} must be one of: ${formatted_options} (got: ${value})" >&2
    return 1
  fi

  return 0
}
