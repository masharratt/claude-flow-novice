#!/usr/bin/env bash
# Web Portal Skill - Query Metrics API
# Usage: ./invoke-portal-metrics.sh [--agent AGENT_ID] [--timeframe TIMEFRAME] [--view VIEW] [--format json|table]
#
# Queries the /api/metrics endpoint with optional filters
# Implements 60-second cache TTL

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.artifacts/cache/web-portal"
CACHE_TTL=60
DEFAULT_PORT=3000
DEFAULT_FORMAT="json"

# Parse arguments
AGENT_FILTER=""
TIMEFRAME=""
VIEW=""
FORMAT="$DEFAULT_FORMAT"
PORT="$DEFAULT_PORT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      AGENT_FILTER="$2"
      shift 2
      ;;
    --timeframe)
      TIMEFRAME="$2"
      shift 2
      ;;
    --view)
      VIEW="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Create cache directory
mkdir -p "$CACHE_DIR"

# Generate cache key based on filters
CACHE_KEY="metrics"
[[ -n "$AGENT_FILTER" ]] && CACHE_KEY="${CACHE_KEY}_agent_${AGENT_FILTER}"
[[ -n "$TIMEFRAME" ]] && CACHE_KEY="${CACHE_KEY}_time_${TIMEFRAME}"
[[ -n "$VIEW" ]] && CACHE_KEY="${CACHE_KEY}_view_${VIEW}"
CACHE_FILE="$CACHE_DIR/${CACHE_KEY}.json"

# Check cache validity
if [[ -f "$CACHE_FILE" ]]; then
  CACHE_AGE=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null)))

  if [[ $CACHE_AGE -lt $CACHE_TTL ]]; then
    if [[ "$FORMAT" == "table" ]]; then
      jq -r '.data | to_entries | .[] | "\(.key): \(.value)"' "$CACHE_FILE" 2>/dev/null || cat "$CACHE_FILE"
    else
      cat "$CACHE_FILE"
    fi
    exit 0
  fi
fi

# Build API URL with query parameters
API_URL="http://localhost:$PORT/api/metrics"
QUERY_PARAMS=""

if [[ -n "$AGENT_FILTER" || -n "$TIMEFRAME" || -n "$VIEW" ]]; then
  QUERY_PARAMS="?"
  [[ -n "$AGENT_FILTER" ]] && QUERY_PARAMS="${QUERY_PARAMS}agent=${AGENT_FILTER}&"
  [[ -n "$TIMEFRAME" ]] && QUERY_PARAMS="${QUERY_PARAMS}timeframe=${TIMEFRAME}&"
  [[ -n "$VIEW" ]] && QUERY_PARAMS="${QUERY_PARAMS}view=${VIEW}&"
  QUERY_PARAMS="${QUERY_PARAMS%&}"
fi

FULL_URL="${API_URL}${QUERY_PARAMS}"

# Query API
RESPONSE=$(curl -f -s "$FULL_URL" 2>/dev/null) || {
  echo "{\"success\":false,\"error\":\"Failed to query metrics API at $FULL_URL\"}" >&2
  exit 1
}

# Validate response
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
  echo "{\"success\":false,\"error\":\"Invalid JSON response from metrics API\"}" >&2
  exit 1
fi

# Store in cache
echo "$RESPONSE" > "$CACHE_FILE"

# Output based on format
if [[ "$FORMAT" == "table" ]]; then
  echo "$RESPONSE" | jq -r '.data | to_entries | .[] | "\(.key): \(.value)"' 2>/dev/null || echo "$RESPONSE"
else
  echo "$RESPONSE"
fi
