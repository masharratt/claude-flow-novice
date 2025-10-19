#!/bin/bash
# get-agent-timeout.sh - Get agent timeout from swarm metadata with intelligent fallback
# Part of Redis Coordination Skill
# Usage: ./get-agent-timeout.sh --task-id <id> --agent-id <id>
#
# Returns agent-specific timeout from swarm metadata with fallback order:
# 1. agentTimeouts[agent-id] (exact match from swarm metadata)
# 2. roleTimeouts[agent-role] (role-based from swarm metadata)
# 3. agentTimeouts.default (fallback from swarm metadata)
# 4. Role-based hardcoded defaults (researcher=7200, backend-dev=3600, etc.)
# 5. 3600 (hardcoded default: 1 hour)
#
# Version: 1.1.0
# Last Updated: 2025-10-19

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
DEFAULT_TIMEOUT=3600

# Parse arguments
TASK_ID=""
AGENT_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --agent-id)
      AGENT_ID="$2"
      shift 2
      ;;
    *)
      echo "❌ Unknown argument: $1" >&2
      echo "Usage: $0 --task-id <id> --agent-id <id>" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$TASK_ID" || -z "$AGENT_ID" ]]; then
  echo "❌ Missing required arguments" >&2
  echo "Usage: $0 --task-id <id> --agent-id <id>" >&2
  exit 1
fi

# Function to extract role from agent-id
extract_role_from_agent_id() {
  local agent_id="$1"

  # Extract role prefix (everything before last hyphen and number)
  # Examples:
  #   "researcher-1" -> "researcher"
  #   "backend-dev-6" -> "backend-dev"
  #   "reviewer" -> "reviewer"
  if [[ "$agent_id" =~ ^(.+)-[0-9]+$ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "$agent_id"
  fi
}

# Function to get role-based hardcoded timeout defaults (fallback layer 4)
get_hardcoded_role_timeout() {
  local role="$1"

  case "$role" in
    researcher)
      echo "7200"  # 2 hours - research takes longer
      ;;
    backend-dev|coder|frontend-dev)
      echo "3600"  # 1 hour - development work
      ;;
    reviewer|tester|security)
      echo "1800"  # 30 minutes - validation/review
      ;;
    coordinator|orchestrator|product-owner)
      echo "900"   # 15 minutes - coordination tasks
      ;;
    devops|architect)
      echo "5400"  # 90 minutes - infrastructure/architecture
      ;;
    *)
      echo "3600"  # 1 hour - default fallback
      ;;
  esac
}

# Function to extract timeout from JSON using jq or fallback parsing
extract_timeout_from_json() {
  local json="$1"
  local key="$2"

  if [[ -z "$json" || "$json" == "(nil)" ]]; then
    echo ""
    return
  fi

  # Use jq if available
  if command -v jq &>/dev/null; then
    local result
    result=$(echo "$json" | jq -r --arg k "$key" '.[$k] // empty' 2>/dev/null || echo "")
    echo "$result"
  else
    # Fallback: simple pattern matching for "key": value
    echo "$json" | grep -oP "\"$key\"\s*:\s*\K\d+" 2>/dev/null || echo ""
  fi
}

# Get swarm ID from task mapping
SWARM_ID=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
  GET "task:${TASK_ID}:swarm" 2>/dev/null || echo "")

if [[ -z "$SWARM_ID" || "$SWARM_ID" == "(nil)" ]]; then
  # Fallback: assume task-id is swarm-id for backwards compatibility
  SWARM_ID="$TASK_ID"
fi

# Read swarm metadata from Redis
METADATA=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
  HGETALL "swarm:${SWARM_ID}:metadata" 2>/dev/null || echo "")

# Extract role from agent ID
ROLE=$(extract_role_from_agent_id "$AGENT_ID")

# Parse metadata and extract timeout configurations
TIMEOUT=""

if [[ -n "$METADATA" && "$METADATA" != "(nil)" ]]; then
  # Parse metadata into associative array
  declare -A META
  while IFS= read -r key && IFS= read -r value; do
    META["$key"]="$value"
  done <<< "$METADATA"

  AGENT_TIMEOUTS_JSON="${META[agentTimeouts]:-}"
  ROLE_TIMEOUTS_JSON="${META[roleTimeouts]:-}"

  # Fallback order 1: agentTimeouts[agent-id] (exact match)
  if [[ -n "$AGENT_TIMEOUTS_JSON" ]]; then
    TIMEOUT=$(extract_timeout_from_json "$AGENT_TIMEOUTS_JSON" "$AGENT_ID")
  fi

  # Fallback order 2: roleTimeouts[agent-role] (role-based)
  if [[ -z "$TIMEOUT" && -n "$ROLE_TIMEOUTS_JSON" ]]; then
    TIMEOUT=$(extract_timeout_from_json "$ROLE_TIMEOUTS_JSON" "$ROLE")
  fi

  # Fallback order 3: agentTimeouts.default
  if [[ -z "$TIMEOUT" && -n "$AGENT_TIMEOUTS_JSON" ]]; then
    TIMEOUT=$(extract_timeout_from_json "$AGENT_TIMEOUTS_JSON" "default")
  fi
fi

# Fallback order 4: Role-based hardcoded defaults
if [[ -z "$TIMEOUT" ]]; then
  TIMEOUT=$(get_hardcoded_role_timeout "$ROLE")
fi

# Fallback order 5: Hardcoded default (3600s)
if [[ -z "$TIMEOUT" ]]; then
  TIMEOUT="$DEFAULT_TIMEOUT"
fi

# Validate timeout is numeric
if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Invalid timeout value: $TIMEOUT, using default: ${DEFAULT_TIMEOUT}s" >&2
  TIMEOUT="$DEFAULT_TIMEOUT"
fi

# Return timeout value
echo "$TIMEOUT"