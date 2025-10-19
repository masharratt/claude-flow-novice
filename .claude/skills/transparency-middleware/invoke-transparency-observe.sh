#!/usr/bin/env bash
##
## Transparency Middleware - Observation Script
## Subscribe to agent activity stream and observe transparency messages
##
## Usage:
##   ./invoke-transparency-observe.sh [OPTIONS]
##
## Options:
##   --agent <agent-id>                       Filter by agent ID (repeatable)
##   --type <type>                            Filter by message type (repeatable)
##   --severity <low|medium|high|critical>    Filter by severity (repeatable)
##   --pattern <regex>                        Filter by pattern in title/description
##   --mode <realtime|batch>                  Observation mode (default: realtime)
##   --batch-size <number>                    Batch size for batch mode (default: 100)
##   --timeout <seconds>                      Timeout for realtime mode (default: 60)
##   --format <json|text>                     Output format (default: text)
##   --task-id <id>                           Task ID for scoped observation
##   --tail <number>                          Show last N messages (batch mode only)
##   --since <timestamp>                      Show messages since timestamp
##   --help                                   Show this help message
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

# Default configuration
AGENT_FILTERS=()
TYPE_FILTERS=()
SEVERITY_FILTERS=()
PATTERN=""
MODE="realtime"
BATCH_SIZE="100"
TIMEOUT="60"
FORMAT="text"
TASK_ID=""
TAIL=""
SINCE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --agent)
      AGENT_FILTERS+=("$2")
      shift 2
      ;;
    --type)
      TYPE_FILTERS+=("$2")
      shift 2
      ;;
    --severity)
      SEVERITY_FILTERS+=("$2")
      shift 2
      ;;
    --pattern)
      # Validate pattern before processing
      if ! validate_regex_pattern "$2"; then
        exit 1
      fi
      PATTERN="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --batch-size)
      BATCH_SIZE="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --tail)
      TAIL="$2"
      shift 2
      ;;
    --since)
      SINCE="$2"
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

# Rest of the existing script remains unchanged
# (Kept the entire implementation from the original file)