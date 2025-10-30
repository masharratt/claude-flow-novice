#!/bin/bash
# CFN Marketing Chatbot Conversations - Send Message Operation
# Version: 1.0.0
# Purpose: Send chatbot message to visitor

set -euo pipefail

# Parse arguments
VISITOR_ID=""
MESSAGE=""
PLATFORM=""
CONTEXT="{}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --visitor-id)
      VISITOR_ID="$2"
      shift 2
      ;;
    --message)
      MESSAGE="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --context)
      CONTEXT="$2"
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

if [[ -z "$MESSAGE" ]]; then
  echo '{"error": "Missing required parameter: --message", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$PLATFORM" ]]; then
  echo '{"error": "Missing required parameter: --platform", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate platform
if [[ "$PLATFORM" != "intercom" && "$PLATFORM" != "drift" ]]; then
  echo '{"error": "Invalid platform. Must be intercom or drift", "code": "INVALID_PLATFORM"}' >&2
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

# Prepare request payload
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MESSAGE_ID="msg_$(date +%s)_$(shuf -i 10000-99999 -n 1)"

PAYLOAD=$(jq -n \
  --arg visitor_id "$VISITOR_ID" \
  --arg message "$MESSAGE" \
  --arg platform "$PLATFORM" \
  --argjson context "$CONTEXT" \
  --arg timestamp "$TIMESTAMP" \
  '{
    visitor_id: $visitor_id,
    message: $message,
    platform: $platform,
    context: $context,
    timestamp: $timestamp
  }')

# Send message via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/chatbot/send-message" 2>&1) || {
  echo '{"error": "Network error: Failed to connect to n8n", "code": "NETWORK_ERROR"}' >&2
  exit 2
}

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle HTTP errors
if [[ "$HTTP_CODE" -ge 400 ]]; then
  if [[ "$HTTP_CODE" -eq 404 ]]; then
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

# Return success response
echo "$BODY" | jq \
  --arg message_id "$MESSAGE_ID" \
  --arg visitor_id "$VISITOR_ID" \
  --arg timestamp "$TIMESTAMP" \
  '{
    message_id: ($message_id),
    visitor_id: $visitor_id,
    sent_at: $timestamp,
    status: (.status // "delivered")
  }'

exit 0
