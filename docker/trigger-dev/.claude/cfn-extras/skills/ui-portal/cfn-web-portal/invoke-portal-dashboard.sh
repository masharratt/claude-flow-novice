#!/usr/bin/env bash
# Web Portal Skill - Query Dashboard Summary
# Usage: ./invoke-portal-dashboard.sh [--port PORT] [--format json|table]
#
# Fetches dashboard summary with active agents, system health, events, and performance

set -euo pipefail

# Configuration
DEFAULT_PORT=3000
DEFAULT_FORMAT="json"

# Parse arguments
PORT="$DEFAULT_PORT"
FORMAT="$DEFAULT_FORMAT"

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
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Query metrics API (serves as dashboard summary)
API_URL="http://localhost:$PORT/api/metrics"

# Query API
RESPONSE=$(curl -f -s "$API_URL" 2>/dev/null) || {
  echo "{\"success\":false,\"error\":\"Failed to query dashboard API at $API_URL\"}" >&2
  exit 1
}

# Validate response
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
  echo "{\"success\":false,\"error\":\"Invalid JSON response from dashboard API\"}" >&2
  exit 1
fi

# Also query agent hierarchy for active agents count
AGENTS_URL="http://localhost:$PORT/api/agents/hierarchy"
AGENTS_RESPONSE=$(curl -f -s "$AGENTS_URL" 2>/dev/null) || {
  AGENTS_RESPONSE="{\"data\":[]}"
}

# Count active agents
ACTIVE_AGENTS=$(echo "$AGENTS_RESPONSE" | jq -r '[.data[] | select(.status == "active")] | length' 2>/dev/null || echo "0")

# Combine dashboard data
DASHBOARD=$(jq -n \
  --argjson metrics "$RESPONSE" \
  --argjson activeAgents "$ACTIVE_AGENTS" \
  '{
    success: true,
    dashboard: {
      activeAgents: $activeAgents,
      systemHealth: ($metrics.data.systemHealth // "unknown"),
      metrics: $metrics.data,
      timestamp: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
    }
  }')

# Output based on format
if [[ "$FORMAT" == "table" ]]; then
  echo "$DASHBOARD" | jq -r '
    "=== Dashboard Summary ===",
    "Active Agents: \(.dashboard.activeAgents)",
    "System Health: \(.dashboard.systemHealth)",
    "Timestamp: \(.dashboard.timestamp)",
    "",
    "=== Metrics ===",
    (.dashboard.metrics | to_entries | .[] | "\(.key): \(.value)")
  ' 2>/dev/null || echo "$DASHBOARD"
else
  echo "$DASHBOARD"
fi
