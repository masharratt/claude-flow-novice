#!/usr/bin/env bash
# Web Portal Skill - Query Agent Information
# Usage: ./invoke-portal-agents.sh [--status STATUS] [--type TYPE] [--swarm SWARM_ID] [--agent-id AGENT_ID] [--format json|table]
#
# Queries /api/agents with filters for agent hierarchy and status

set -euo pipefail

# Configuration
DEFAULT_PORT=3000
DEFAULT_FORMAT="json"

# Parse arguments
PORT="$DEFAULT_PORT"
FORMAT="$DEFAULT_FORMAT"
STATUS_FILTER=""
TYPE_FILTER=""
SWARM_FILTER=""
AGENT_ID=""

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
    --status)
      STATUS_FILTER="$2"
      shift 2
      ;;
    --type)
      TYPE_FILTER="$2"
      shift 2
      ;;
    --swarm)
      SWARM_FILTER="$2"
      shift 2
      ;;
    --agent-id)
      AGENT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Query specific agent or hierarchy
if [[ -n "$AGENT_ID" ]]; then
  # Query specific agent status
  API_URL="http://localhost:$PORT/api/agents/$AGENT_ID/status"

  RESPONSE=$(curl -f -s "$API_URL" 2>/dev/null) || {
    echo "{\"success\":false,\"error\":\"Failed to query agent $AGENT_ID at $API_URL\"}" >&2
    exit 1
  }

  # Validate response
  if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
    echo "{\"success\":false,\"error\":\"Invalid JSON response from agents API\"}" >&2
    exit 1
  fi

  # Output based on format
  if [[ "$FORMAT" == "table" ]]; then
    echo "$RESPONSE" | jq -r '
      "=== Agent \(.data.id) ===",
      "Status: \(.data.status)",
      "Type: \(.data.type // "unknown")",
      "Confidence: \(.data.confidence // "N/A")",
      "Uptime: \(.data.uptime // "N/A")",
      "",
      "=== Metrics ===",
      (.data.metrics // {} | to_entries | .[] | "\(.key): \(.value)")
    ' 2>/dev/null || echo "$RESPONSE"
  else
    echo "$RESPONSE"
  fi
else
  # Query agent hierarchy with filters
  API_URL="http://localhost:$PORT/api/agents/hierarchy"
  QUERY_PARAMS=""

  if [[ -n "$STATUS_FILTER" || -n "$TYPE_FILTER" ]]; then
    QUERY_PARAMS="?"
    [[ -n "$STATUS_FILTER" ]] && QUERY_PARAMS="${QUERY_PARAMS}status=${STATUS_FILTER}&"
    [[ -n "$TYPE_FILTER" ]] && QUERY_PARAMS="${QUERY_PARAMS}type=${TYPE_FILTER}&"
    QUERY_PARAMS="${QUERY_PARAMS%&}"
  fi

  FULL_URL="${API_URL}${QUERY_PARAMS}"

  RESPONSE=$(curl -f -s "$FULL_URL" 2>/dev/null) || {
    echo "{\"success\":false,\"error\":\"Failed to query agents hierarchy at $FULL_URL\"}" >&2
    exit 1
  }

  # Validate response
  if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
    echo "{\"success\":false,\"error\":\"Invalid JSON response from agents API\"}" >&2
    exit 1
  fi

  # Filter by swarm if requested
  if [[ -n "$SWARM_FILTER" ]]; then
    RESPONSE=$(echo "$RESPONSE" | jq --arg swarm "$SWARM_FILTER" '{
      success: true,
      data: [.data[] | select(.swarmId == $swarm)]
    }')
  fi

  # Output based on format
  if [[ "$FORMAT" == "table" ]]; then
    echo "$RESPONSE" | jq -r '
      "=== Agent Hierarchy ===",
      "Total Agents: \(.data | length)",
      "",
      (.data[] | "- \(.id) (\(.status)) - Type: \(.type // "unknown") - Confidence: \(.confidence // "N/A")")
    ' 2>/dev/null || echo "$RESPONSE"
  else
    echo "$RESPONSE"
  fi
fi
