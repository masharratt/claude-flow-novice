#!/bin/bash
# CFN Marketing SMS Campaigns - Schedule Campaign Operation
# Version: 1.0.0
# Purpose: Schedule bulk SMS campaign

set -euo pipefail

# Parse arguments
CAMPAIGN_ID=""
SCHEDULE_TIME=""
TIMEZONE=""
BATCH_SIZE=100
BATCH_DELAY=60

while [[ $# -gt 0 ]]; do
  case $1 in
    --campaign-id)
      CAMPAIGN_ID="$2"
      shift 2
      ;;
    --schedule-time)
      SCHEDULE_TIME="$2"
      shift 2
      ;;
    --timezone)
      TIMEZONE="$2"
      shift 2
      ;;
    --batch-size)
      BATCH_SIZE="$2"
      shift 2
      ;;
    --batch-delay)
      BATCH_DELAY="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '$1'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$CAMPAIGN_ID" ]]; then
  echo '{"error": "Missing required parameter: --campaign-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$SCHEDULE_TIME" ]]; then
  echo '{"error": "Missing required parameter: --schedule-time", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$TIMEZONE" ]]; then
  echo '{"error": "Missing required parameter: --timezone", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate ISO 8601 date format
if ! echo "$SCHEDULE_TIME" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'; then
  echo '{"error": "Invalid date format. Use ISO 8601 (YYYY-MM-DDTHH:MM:SS)", "code": "INVALID_DATE"}' >&2
  exit 1
fi

# Validate batch size
if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [[ "$BATCH_SIZE" -lt 1 ]] || [[ "$BATCH_SIZE" -gt 1000 ]]; then
  echo '{"error": "Invalid batch size. Must be between 1 and 1000", "code": "INVALID_BATCH_SIZE"}' >&2
  exit 1
fi

# Validate batch delay
if ! [[ "$BATCH_DELAY" =~ ^[0-9]+$ ]] || [[ "$BATCH_DELAY" -lt 1 ]]; then
  echo '{"error": "Invalid batch delay. Must be >= 1 second", "code": "INVALID_BATCH_DELAY"}' >&2
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

# CRITICAL: TCPA Compliance - Validate time restrictions
# Extract hour from schedule time and validate against 8 AM - 9 PM
SCHEDULE_HOUR=$(echo "$SCHEDULE_TIME" | grep -oP '\d{2}(?=:)' | head -1)
if [[ "$SCHEDULE_HOUR" -lt 8 ]] || [[ "$SCHEDULE_HOUR" -ge 21 ]]; then
  echo '{"error": "Schedule time violates TCPA time restrictions (8 AM - 9 PM)", "code": "TIME_RESTRICTION", "scheduled_hour": '$SCHEDULE_HOUR', "severity": "critical"}' >&2
  exit 3
fi

# Verify campaign exists
if command -v redis-cli &> /dev/null; then
  CAMPAIGN_EXISTS=$(redis-cli EXISTS "sms:campaign:${CAMPAIGN_ID}" 2>/dev/null || echo "0")
  if [[ "$CAMPAIGN_EXISTS" -eq 0 ]]; then
    echo '{"error": "Campaign not found", "code": "CAMPAIGN_NOT_FOUND", "campaign_id": "'"$CAMPAIGN_ID"'"}' >&2
    exit 3
  fi
fi

# Prepare request payload
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

PAYLOAD=$(jq -n \
  --arg campaign_id "$CAMPAIGN_ID" \
  --arg schedule_time "$SCHEDULE_TIME" \
  --arg timezone "$TIMEZONE" \
  --arg batch_size "$BATCH_SIZE" \
  --arg batch_delay "$BATCH_DELAY" \
  --arg timestamp "$TIMESTAMP" \
  '{
    campaign_id: $campaign_id,
    schedule_time: $schedule_time,
    timezone: $timezone,
    batch_size: ($batch_size | tonumber),
    batch_delay: ($batch_delay | tonumber),
    scheduled_at: $timestamp,
    compliance_verified: true
  }')

# Schedule campaign via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/sms/schedule-campaign" 2>&1) || {
  echo '{"error": "Network error: Failed to connect to n8n", "code": "NETWORK_ERROR"}' >&2
  exit 2
}

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle HTTP errors
if [[ "$HTTP_CODE" -ge 400 ]]; then
  if [[ "$HTTP_CODE" -eq 404 ]]; then
    echo '{"error": "Campaign not found", "code": "CAMPAIGN_NOT_FOUND", "campaign_id": "'"$CAMPAIGN_ID"'"}' >&2
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

# Update campaign status in Redis
if command -v redis-cli &> /dev/null; then
  redis-cli HSET "sms:campaign:${CAMPAIGN_ID}" status "scheduled" > /dev/null 2>&1 || true
  redis-cli HSET "sms:campaign:${CAMPAIGN_ID}" scheduled_at "$SCHEDULE_TIME" > /dev/null 2>&1 || true
fi

# Calculate estimated duration
TOTAL_RECIPIENTS=$(echo "$BODY" | jq -r '.total_recipients // 0')
BATCH_COUNT=$(( (TOTAL_RECIPIENTS + BATCH_SIZE - 1) / BATCH_SIZE ))
ESTIMATED_DURATION=$(( BATCH_COUNT * BATCH_DELAY / 60 ))

# Return success response
echo "$BODY" | jq \
  --arg campaign_id "$CAMPAIGN_ID" \
  --arg scheduled_at "$SCHEDULE_TIME" \
  --arg estimated_duration "$ESTIMATED_DURATION" \
  --arg batch_count "$BATCH_COUNT" \
  '{
    campaign_id: ($campaign_id),
    scheduled_at: $scheduled_at,
    status: (.status // "scheduled"),
    estimated_duration_minutes: ($estimated_duration | tonumber),
    batch_count: ($batch_count | tonumber),
    total_recipients: (.total_recipients // 0)
  }'

exit 0
