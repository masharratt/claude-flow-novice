#!/usr/bin/env bash
# Web Portal Skill - Query Events Timeline
# Usage: ./invoke-portal-events.sh [--type TYPE] [--agent AGENT_ID] [--phase PHASE_ID] [--since TIMESTAMP] [--severity LEVEL] [--limit NUM] [--offset NUM] [--format json|table]
#
# Queries /api/events timeline with filters and pagination

set -euo pipefail

# Configuration
DEFAULT_PORT=3000
DEFAULT_FORMAT="json"
DEFAULT_LIMIT=50

# Parse arguments
PORT="$DEFAULT_PORT"
FORMAT="$DEFAULT_FORMAT"
TYPE_FILTER=""
AGENT_FILTER=""
PHASE_FILTER=""
SINCE=""
SEVERITY=""
LIMIT="$DEFAULT_LIMIT"
OFFSET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --type)
      TYPE_FILTER="$2"
      shift 2
      ;;
    --agent)
      AGENT_FILTER="$2"
      shift 2
      ;;
    --phase)
      PHASE_FILTER="$2"
      shift 2
      ;;
    --since)
      SINCE="$2"
      shift 2
      ;;
    --severity)
      SEVERITY="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --offset)
      OFFSET="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Determine API endpoint based on filters
if [[ -n "$PHASE_FILTER" ]]; then
  # Query by phase
  API_URL="http://localhost:$PORT/api/events/phase/$PHASE_FILTER"
  QUERY_PARAMS="?limit=$LIMIT"
elif [[ -n "$AGENT_FILTER" ]]; then
  # Query by agent
  API_URL="http://localhost:$PORT/api/events/agent/$AGENT_FILTER"
  QUERY_PARAMS="?limit=$LIMIT"
else
  # General query with filters
  API_URL="http://localhost:$PORT/api/events"
  QUERY_PARAMS="?limit=$LIMIT&offset=$OFFSET"

  [[ -n "$TYPE_FILTER" ]] && QUERY_PARAMS="${QUERY_PARAMS}&eventType=${TYPE_FILTER}"
  [[ -n "$SINCE" ]] && QUERY_PARAMS="${QUERY_PARAMS}&startDate=${SINCE}"
fi

FULL_URL="${API_URL}${QUERY_PARAMS}"

# Query API
RESPONSE=$(curl -f -s "$FULL_URL" 2>/dev/null) || {
  echo "{\"success\":false,\"error\":\"Failed to query events API at $FULL_URL\"}" >&2
  exit 1
}

# Validate response
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
  echo "{\"success\":false,\"error\":\"Invalid JSON response from events API\"}" >&2
  exit 1
fi

# Apply severity filter if provided (client-side filtering)
if [[ -n "$SEVERITY" ]]; then
  RESPONSE=$(echo "$RESPONSE" | jq --arg sev "$SEVERITY" '{
    success: .success,
    data: [.data[]? | select(.metadata.severity == $sev or .severity == $sev)]
  }')
fi

# Output based on format
if [[ "$FORMAT" == "table" ]]; then
  echo "$RESPONSE" | jq -r '
    if .data then
      "=== Events Timeline ===",
      "Total Events: \(.data | length)",
      "",
      (.data[] | "[\(.timestamp // .createdAt)] \(.eventType) - Agent: \(.agentId) - Phase: \(.phaseId)")
    else
      "=== Events Timeline ===",
      "No events found"
    end
  ' 2>/dev/null || echo "$RESPONSE"
else
  echo "$RESPONSE"
fi
