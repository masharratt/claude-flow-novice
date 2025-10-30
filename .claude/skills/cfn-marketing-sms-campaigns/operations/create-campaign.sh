#!/bin/bash
# CFN Marketing SMS Campaigns - Create Campaign Operation
# Version: 1.0.0
# Purpose: Create SMS campaign configuration

set -euo pipefail

# Parse arguments
NAME=""
MESSAGE=""
AUDIENCE="{}"
SENDER_ID="${SMS_SENDER_ID:-CFN Marketing}"
SCHEDULE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      NAME="$2"
      shift 2
      ;;
    --message)
      MESSAGE="$2"
      shift 2
      ;;
    --audience)
      AUDIENCE="$2"
      shift 2
      ;;
    --sender-id)
      SENDER_ID="$2"
      shift 2
      ;;
    --schedule)
      SCHEDULE="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '$1'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$NAME" ]]; then
  echo '{"error": "Missing required parameter: --name", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$MESSAGE" ]]; then
  echo '{"error": "Missing required parameter: --message", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$AUDIENCE" || "$AUDIENCE" == "{}" ]]; then
  echo '{"error": "Missing required parameter: --audience", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate message length
if [[ ${#MESSAGE} -gt 160 ]]; then
  echo '{"error": "Message too long. Maximum 160 characters", "code": "MESSAGE_TOO_LONG", "length": '${#MESSAGE}'}' >&2
  exit 1
fi

# Ensure opt-out instructions included (TCPA requirement)
if ! echo "$MESSAGE" | grep -qiE 'STOP|opt.*out|unsubscribe'; then
  echo '{"error": "Message must include opt-out instructions (TCPA requirement)", "code": "MISSING_OPT_OUT", "severity": "critical"}' >&2
  exit 3
fi

# Validate audience JSON
if ! echo "$AUDIENCE" | jq empty 2>/dev/null; then
  echo '{"error": "Invalid audience JSON format", "code": "INVALID_AUDIENCE"}' >&2
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

# CRITICAL: TCPA Compliance - Verify audience excludes opted-out numbers
EXCLUDE_SEGMENTS=$(echo "$AUDIENCE" | jq -r '.exclude_segments // [] | @json' 2>/dev/null || echo "[]")
if ! echo "$EXCLUDE_SEGMENTS" | grep -q "opted_out"; then
  echo '{"error": "Audience must explicitly exclude opted_out segment (TCPA requirement)", "code": "MISSING_EXCLUSION", "severity": "critical"}' >&2
  exit 3
fi

if ! echo "$EXCLUDE_SEGMENTS" | grep -q "dnc"; then
  echo '{"error": "Audience must explicitly exclude dnc segment (TCPA requirement)", "code": "MISSING_EXCLUSION", "severity": "critical"}' >&2
  exit 3
fi

# Generate campaign ID
CAMPAIGN_ID="camp_$(date +%s)_$(shuf -i 10000-99999 -n 1)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Prepare request payload
PAYLOAD=$(jq -n \
  --arg campaign_id "$CAMPAIGN_ID" \
  --arg name "$NAME" \
  --arg message "$MESSAGE" \
  --argjson audience "$AUDIENCE" \
  --arg sender_id "$SENDER_ID" \
  --arg schedule "$SCHEDULE" \
  --arg timestamp "$TIMESTAMP" \
  '{
    campaign_id: $campaign_id,
    name: $name,
    message: $message,
    audience: $audience,
    sender_id: $sender_id,
    schedule: $schedule,
    created_at: $timestamp,
    status: "draft",
    compliance_verified: true
  }')

# Create campaign via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/sms/create-campaign" 2>&1) || {
  echo '{"error": "Network error: Failed to connect to n8n", "code": "NETWORK_ERROR"}' >&2
  exit 2
}

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle HTTP errors
if [[ "$HTTP_CODE" -ge 400 ]]; then
  if [[ "$HTTP_CODE" -eq 401 ]]; then
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

# Store campaign metadata in Redis
if command -v redis-cli &> /dev/null; then
  redis-cli HMSET "sms:campaign:${CAMPAIGN_ID}" \
    name "$NAME" \
    message "$MESSAGE" \
    created_at "$TIMESTAMP" \
    status "draft" \
    > /dev/null 2>&1 || true
  redis-cli EXPIRE "sms:campaign:${CAMPAIGN_ID}" 2592000 > /dev/null 2>&1 || true
fi

# Return success response
echo "$BODY" | jq \
  --arg campaign_id "$CAMPAIGN_ID" \
  --arg name "$NAME" \
  --arg timestamp "$TIMESTAMP" \
  '{
    campaign_id: ($campaign_id),
    name: $name,
    status: (.status // "draft"),
    created_at: $timestamp,
    estimated_recipients: (.estimated_recipients // 0),
    compliance_cleared: true
  }'

exit 0
