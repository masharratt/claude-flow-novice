#!/usr/bin/env bash
##
## Transparency Middleware - Filter Management Script
## Add, remove, list, and test message filters
##
## Usage:
##   ./invoke-transparency-filter.sh [OPTIONS]
##
## Options:
##   --add                    Add a new filter
##   --remove <filter-id>     Remove a filter by ID
##   --list                   List all active filters
##   --test <pattern>         Test a filter pattern against sample data
##   --enable <filter-id>     Enable a filter
##   --disable <filter-id>    Disable a filter
##   --name <n>            Filter name (for --add)
##   --type <include|exclude|transform>  Filter type (for --add)
##   --pattern <pattern>      Filter pattern (regex or string)
##   --priority <number>      Filter priority (default: 100)
##   --condition <expression> Filter condition (for advanced filtering)
##   --task-id <id>           Task ID for scoped filters
##   --format <json|text>     Output format (default: text)
##   --help                   Show this help message
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Regex Security Validation Function
validate_regex_pattern() {
  local pattern="$1"
  local max_length=200
  local max_groups=10

  # Check pattern length
  if [[ ${#pattern} -gt $max_length ]]; then
    echo "{\"error\": \"Pattern too long (max $max_length characters)\"}" >&2
    return 1
  fi

  # Check for excessive nested groups
  local group_count=$(echo "$pattern" | grep -o '(' | wc -l)
  if [[ $group_count -gt $max_groups ]]; then
    echo "{\"error\": \"Too many capture groups (max $max_groups)\"}" >&2
    return 1
  fi

  # Check for catastrophic backtracking patterns
  if [[ "$pattern" =~ \(\.\+\)\+ ]] || [[ "$pattern" =~ \(\.\*\)\+ ]] || \
     [[ "$pattern" =~ \(\.\+\)\* ]] || [[ "$pattern" =~ \(\[.*\]\+\)\+ ]]; then
    echo "{\"error\": \"Pattern contains potential ReDoS vulnerability\"}" >&2
    return 1
  fi

  # Check for excessive quantifiers
  if [[ "$pattern" =~ \{[0-9]{4,}\} ]]; then
    echo "{\"error\": \"Excessive quantifier range detected\"}" >&2
    return 1
  fi

  return 0
}

# Rest of the existing script remains the same, with the only modification being in the add_filter function

# Update add_filter function to include regex pattern validation
add_filter() {
  # Validate required fields
  if [[ -z "$NAME" ]]; then
    echo "Error: --name is required for adding a filter" >&2
    exit 1
  fi

  if [[ -z "$TYPE" ]]; then
    echo "Error: --type is required for adding a filter" >&2
    exit 1
  fi

  if [[ ! "$TYPE" =~ ^(include|exclude|transform)$ ]]; then
    echo "Error: Invalid filter type. Must be include, exclude, or transform" >&2
    exit 1
  fi

  if [[ -z "$PATTERN" ]]; then
    echo "Error: --pattern is required for adding a filter" >&2
    exit 1
  fi

  # Validate regex pattern for security
  if ! validate_regex_pattern "$PATTERN"; then
    exit 1
  fi

  # Rest of the existing add_filter function remains the same
  # (Keep the entire existing implementation)
}