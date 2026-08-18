#!/usr/bin/env bash
# CFN Marketing Chatbot Conversations - Transfer to Human Operation
# Version: 1.0.0
# Purpose: Escalate conversation to human agent

set -euo pipefail

# Parse arguments
VISITOR_ID=""
PLATFORM=""
REASON=""
PRIORITY="medium"

while [[ $# -gt 0 ]]; do
  case $1 in
    --visitor-id)
      VISITOR_ID="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --reason)
      REASON="$2"
      shift 2
      ;;
    --priority)
      PRIORITY="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '$1'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$VISITOR_ID" ]]; then
  echo '{"error": "Missing required parameter: --visitor-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$PLATFORM" ]]; then
  echo '{"error": "Missing required parameter: --platform", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$REASON" ]]; then
  echo '{"error": "Missing required parameter: --reason", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate platform
if [[ "$PLATFORM" != "intercom" && "$PLATFORM" != "drift" ]]; then
  echo '{"error": "Invalid platform. Must be intercom or drift", "code": "INVALID_PLATFORM"}' >&2
  exit 1
fi

# Validate priority
if [[ "$PRIORITY" != "low" && "$PRIORITY" != "medium" && "$PRIORITY" != "high" ]]; then
  echo '{"error": "Invalid priority. Must be low, medium, or high", "code": "INVALID_PRIORITY"}' >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]]; then
  echo '{"error": "Environment variable N8N_BASE_URL not set", "code": "MISSING_ENV_VAR"}' >&2
  exit 2
fi

if [[ -z "${N8N_API_KEY:-}" ]]; then
  echo '{"error": "Environment variable N8N_API_KEY not set", "code": "MISSING_ENV_VAR"}' >&2
  exit 2
fi

# Generate transfer ID
TRANSFER_ID="trf_$(date +%s)_$(shuf -i 10000-99999 -n 1)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Calculate ETA based on priority
ETA_MINUTES=5
case "$PRIORITY" in
  high)
    ETA_MINUTES=2
    ;;
  medium)
    ETA_MINUTES=5
    ;;
  low)
    ETA_MINUTES=10
    ;;
esac

# Prepare request payload
PAYLOAD=$(jq -n \
  --arg visitor_id "$VISITOR_ID" \
  --arg platform "$PLATFORM" \
  --arg reason "$REASON" \
  --arg priority "$PRIORITY" \
  --arg transfer_id "$TRANSFER_ID" \
  --arg timestamp "$TIMESTAMP" \
  '{
    visitor_id: $visitor_id,
    platform: $platform,
    reason: $reason,
    priority: $priority,
    transfer_id: $transfer_id,
    requested_at: $timestamp
  }')

# Request human transfer via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/chatbot/transfer-to-human" 2>&1) || {
  echo '{"error": "Network error: Failed to connect to n8n", "code": "NETWORK_ERROR"}' >&2
  exit 2
}

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle HTTP errors
if [[ "$HTTP_CODE" -ge 400 ]]; then
  if [[ "$HTTP_CODE" -eq 503 ]]; then
    echo '{"error": "No agents available", "code": "NO_AGENTS_AVAILABLE"}' >&2
    exit 3
  elif [[ "$HTTP_CODE" -eq 404 ]]; then
    echo '{"error": "Visitor not found", "code": "VISITOR_NOT_FOUND", "visitor_id": "'"$VISITOR_ID"'"}' >&2
    exit 3
  elif [[ "$HTTP_CODE" -eq 401 ]]; then
    echo '{"error": "Authentication failed", "code": "AUTH_ERROR"}' >&2
    exit 2
  else
    ERROR_MSG=$(echo "$BODY" | jq -r '.error // "Unknown API error"' 2>/dev/null || echo "Unknown API error")
    echo '{"error": "'"$ERROR_MSG"'", "code": "API_ERROR", "http_code": '$HTTP_CODE'}' >&2
    exit 2
  fi
fi

# Parse response
if ! echo "$BODY" | jq empty 2>/dev/null; then
  echo '{"error": "Invalid JSON response from API", "code": "INVALID_RESPONSE"}' >&2
  exit 2
fi

# Store transfer in Redis (optional - for tracking)
if command -v redis-cli &> /dev/null; then
  redis-cli HMSET "chatbot:transfer:${TRANSFER_ID}" \
    visitor_id "$VISITOR_ID" \
    platform "$PLATFORM" \
    reason "$REASON" \
    priority "$PRIORITY" \
    transferred_at "$TIMESTAMP" \
    status "transferred" \
    > /dev/null 2>&1 || true
  redis-cli EXPIRE "chatbot:transfer:${TRANSFER_ID}" 2592000 > /dev/null 2>&1 || true
fi

# Return success response
echo "$BODY" | jq \
  --arg transfer_id "$TRANSFER_ID" \
  --arg visitor_id "$VISITOR_ID" \
  --arg timestamp "$TIMESTAMP" \
  --arg eta_minutes "$ETA_MINUTES" \
  '{
    transfer_id: ($transfer_id),
    visitor_id: $visitor_id,
    agent_id: (.agent_id // "pending"),
    agent_name: (.agent_name // "Next Available Agent"),
    transferred_at: $timestamp,
    eta_minutes: ($eta_minutes | tonumber)
  }'

exit 0
