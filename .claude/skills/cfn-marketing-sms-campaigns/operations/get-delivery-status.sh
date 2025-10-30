#!/bin/bash
# CFN Marketing SMS Campaigns - Get Delivery Status Operation
# Version: 1.0.0
# Purpose: Check SMS delivery status

set -euo pipefail

# Parse arguments
MESSAGE_ID=""
PHONE=""
CAMPAIGN_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --message-id)
      MESSAGE_ID="$2"
      shift 2
      ;;
    --phone)
      PHONE="$2"
      shift 2
      ;;
    --campaign-id)
      CAMPAIGN_ID="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '$1'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters (at least one must be provided)
if [[ -z "$MESSAGE_ID" && -z "$PHONE" && -z "$CAMPAIGN_ID" ]]; then
  echo '{"error": "Missing required parameter: --message-id, --phone, or --campaign-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate phone format if provided
if [[ -n "$PHONE" ]] && ! echo "$PHONE" | grep -qE '^\+[1-9][0-9]{1,14}$'; then
  echo '{"error": "Invalid phone format. Use E.164 format (+1XXXXXXXXXX)", "code": "INVALID_PHONE"}' >&2
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
QUERY_PARAMS=""
if [[ -n "$MESSAGE_ID" ]]; then
  QUERY_PARAMS="message_id=${MESSAGE_ID}"
fi

if [[ -n "$PHONE" ]]; then
  if [[ -n "$QUERY_PARAMS" ]]; then
    QUERY_PARAMS="${QUERY_PARAMS}&phone=${PHONE}"
  else
    QUERY_PARAMS="phone=${PHONE}"
  fi
fi

if [[ -n "$CAMPAIGN_ID" ]]; then
  if [[ -n "$QUERY_PARAMS" ]]; then
    QUERY_PARAMS="${QUERY_PARAMS}&campaign_id=${CAMPAIGN_ID}"
  else
    QUERY_PARAMS="campaign_id=${CAMPAIGN_ID}"
  fi
fi

# Get delivery status via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  "${N8N_BASE_URL}/webhook/sms/delivery-status?${QUERY_PARAMS}" 2>&1) || {
  echo '{"error": "Network error: Failed to connect to n8n", "code": "NETWORK_ERROR"}' >&2
  exit 2
}

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle HTTP errors
if [[ "$HTTP_CODE" -ge 400 ]]; then
  if [[ "$HTTP_CODE" -eq 404 ]]; then
    echo '{"error": "Message not found", "code": "MESSAGE_NOT_FOUND", "message_id": "'"$MESSAGE_ID"'"}' >&2
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

# Handle bulk status (campaign-level)
if [[ -n "$CAMPAIGN_ID" ]]; then
  echo "$BODY" | jq \
    --arg campaign_id "$CAMPAIGN_ID" \
    '{
      campaign_id: $campaign_id,
      total_messages: (.total_messages // 0),
      delivered: (.delivered // 0),
      failed: (.failed // 0),
      pending: (.pending // 0),
      delivery_rate: (.delivery_rate // 0),
      messages: (.messages // [])
    }'
else
  # Handle single message status
  echo "$BODY" | jq \
    --arg message_id "$MESSAGE_ID" \
    '{
      message_id: ($message_id),
      phone: (.phone // ""),
      status: (.status // "unknown"),
      delivered_at: (.delivered_at // null),
      carrier: (.carrier // "unknown"),
      error: (.error // null)
    }'
fi

exit 0
