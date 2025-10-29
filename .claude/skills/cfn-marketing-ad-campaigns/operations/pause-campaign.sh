#!/bin/bash
# CFN Marketing Ad Campaigns - Pause/Resume Campaign Operation
# Controls campaign active status

set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --campaign-id)
      CAMPAIGN_ID="$2"
      shift 2
      ;;
    --action)
      ACTION="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${CAMPAIGN_ID:-}" ]]; then
  echo '{"error": "Missing required parameter: --campaign-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${ACTION:-}" ]]; then
  echo '{"error": "Missing required parameter: --action", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate action
case "$ACTION" in
  pause|resume)
    ;;
  *)
    echo '{"error": "Invalid action: '"$ACTION"'. Supported: pause, resume", "code": "INVALID_ACTION"}' >&2
    exit 1
    ;;
esac

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]]; then
  echo '{"error": "N8N_BASE_URL environment variable not set", "code": "MISSING_ENV_VAR"}' >&2
  exit 2
fi

if [[ -z "${N8N_API_KEY:-}" ]]; then
  echo '{"error": "N8N_API_KEY environment variable not set", "code": "MISSING_ENV_VAR"}' >&2
  exit 2
fi

# Build request payload
PAYLOAD=$(jq -n \
  --arg id "$CAMPAIGN_ID" \
  --arg action "$ACTION" \
  '{
    campaign_id: $id,
    action: $action
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/ad-campaigns/status" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Determine expected status
if [[ "$ACTION" == "pause" ]]; then
  EXPECTED_STATUS="paused"
  TIMESTAMP_FIELD="paused_at"
else
  EXPECTED_STATUS="active"
  TIMESTAMP_FIELD="resumed_at"
fi

# Handle response
case "$HTTP_CODE" in
  200)
    # Success - parse and format response
    CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    echo "$BODY" | jq \
      --arg id "$CAMPAIGN_ID" \
      --arg status "$EXPECTED_STATUS" \
      --arg timestamp_field "$TIMESTAMP_FIELD" \
      --arg timestamp "$CURRENT_TIME" \
      '{
        campaign_id: (.campaign_id // $id),
        status: (.status // $status),
        ($timestamp_field): (.[$timestamp_field] // $timestamp),
        budget_remaining: .budget_remaining,
        daily_budget: .daily_budget,
        lifetime_budget: .lifetime_budget
      }'
    exit 0
    ;;
  400)
    echo '{"error": "Bad request - invalid status change", "code": "API_BAD_REQUEST", "details": '"${BODY:-null}"'}' >&2
    exit 2
    ;;
  401)
    echo '{"error": "Authentication failed - check N8N_API_KEY", "code": "API_AUTH_FAILED"}' >&2
    exit 2
    ;;
  404)
    echo '{"error": "Campaign not found: '"$CAMPAIGN_ID"'", "code": "CAMPAIGN_NOT_FOUND"}' >&2
    exit 1
    ;;
  409)
    # Campaign already in requested state
    if [[ "$ACTION" == "pause" ]]; then
      MSG="Campaign already paused"
    else
      MSG="Campaign already active"
    fi
    echo '{"error": "'"$MSG"'", "code": "INVALID_STATE_TRANSITION", "details": '"${BODY:-null}"'}' >&2
    exit 1
    ;;
  429)
    echo '{"error": "Rate limit exceeded - try again later", "code": "API_RATE_LIMIT"}' >&2
    exit 2
    ;;
  000)
    echo '{"error": "Network error - unable to reach N8N instance", "code": "NETWORK_ERROR"}' >&2
    exit 2
    ;;
  *)
    echo '{"error": "Unexpected API response", "code": "API_ERROR", "http_code": '"$HTTP_CODE"', "details": '"${BODY:-null}"'}' >&2
    exit 2
    ;;
esac
