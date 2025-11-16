#!/bin/bash
# CFN Marketing Chatbot Conversations - Get Conversation History Operation
# Version: 1.0.0
# Purpose: Retrieve conversation transcript

set -euo pipefail

# Parse arguments
VISITOR_ID=""
PLATFORM=""
LIMIT=50
SINCE=""

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
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --since)
      SINCE="$2"
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

# Validate platform
if [[ "$PLATFORM" != "intercom" && "$PLATFORM" != "drift" ]]; then
  echo '{"error": "Invalid platform. Must be intercom or drift", "code": "INVALID_PLATFORM"}' >&2
  exit 1
fi

# Validate limit
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]] || [[ "$LIMIT" -gt 500 ]]; then
  echo '{"error": "Invalid limit. Must be between 1 and 500", "code": "INVALID_LIMIT"}' >&2
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

# Build query parameters
QUERY_PARAMS="visitor_id=${VISITOR_ID}&platform=${PLATFORM}&limit=${LIMIT}"
if [[ -n "$SINCE" ]]; then
  QUERY_PARAMS="${QUERY_PARAMS}&since=${SINCE}"
fi

# Retrieve conversation history via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  "${N8N_BASE_URL}/webhook/chatbot/conversation-history?${QUERY_PARAMS}" 2>&1) || {
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

# Return conversation history
echo "$BODY" | jq \
  --arg visitor_id "$VISITOR_ID" \
  '{
    visitor_id: $visitor_id,
    messages: (.messages // []),
    total_messages: (.total_messages // (.messages | length))
  }'

exit 0
