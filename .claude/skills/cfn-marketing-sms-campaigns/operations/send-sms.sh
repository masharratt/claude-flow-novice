#!/bin/bash
# CFN Marketing SMS Campaigns - Send SMS Operation
# Version: 1.0.0
# Purpose: Send single SMS message with TCPA compliance checks

set -euo pipefail

# Parse arguments
PHONE=""
MESSAGE=""
CAMPAIGN_ID=""
SENDER_ID="${SMS_SENDER_ID:-CFN Marketing}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --phone)
      PHONE="$2"
      shift 2
      ;;
    --message)
      MESSAGE="$2"
      shift 2
      ;;
    --campaign-id)
      CAMPAIGN_ID="$2"
      shift 2
      ;;
    --sender-id)
      SENDER_ID="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '$1'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$PHONE" ]]; then
  echo '{"error": "Missing required parameter: --phone", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$MESSAGE" ]]; then
  echo '{"error": "Missing required parameter: --message", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate phone format (E.164: +1XXXXXXXXXX)
if ! echo "$PHONE" | grep -qE '^\+[1-9][0-9]{1,14}$'; then
  echo '{"error": "Invalid phone format. Use E.164 format (+1XXXXXXXXXX)", "code": "INVALID_PHONE"}' >&2
  exit 1
fi

# Validate message length (160 characters for standard SMS)
if [[ ${#MESSAGE} -gt 160 ]]; then
  echo '{"error": "Message too long. Maximum 160 characters", "code": "MESSAGE_TOO_LONG", "length": '${#MESSAGE}'}' >&2
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

# CRITICAL: TCPA Compliance Check #1 - Verify opt-in
if command -v redis-cli &> /dev/null; then
  OPT_IN=$(redis-cli GET "sms:opt_in:$PHONE" 2>/dev/null || echo "false")
  if [[ "$OPT_IN" != "true" ]]; then
    echo '{"error": "Recipient has not opted-in (TCPA violation)", "code": "NO_OPT_IN", "phone": "'"$PHONE"'", "severity": "critical"}' >&2
    exit 3
  fi
else
  echo '{"error": "Redis not available for opt-in verification", "code": "REDIS_UNAVAILABLE"}' >&2
  exit 2
fi

# CRITICAL: TCPA Compliance Check #2 - Check Do Not Call registry
DNC=$(redis-cli GET "sms:dnc:$PHONE" 2>/dev/null || echo "false")
if [[ "$DNC" == "true" ]]; then
  echo '{"error": "Phone number on DNC registry", "code": "DNC_VIOLATION", "phone": "'"$PHONE"'", "severity": "critical"}' >&2
  exit 3
fi

# CRITICAL: TCPA Compliance Check #3 - Time restrictions (8 AM - 9 PM)
# Note: Requires recipient timezone lookup in production
CURRENT_HOUR=$(date +%H)
if [[ "$CURRENT_HOUR" -lt 8 ]] || [[ "$CURRENT_HOUR" -ge 21 ]]; then
  echo '{"error": "Time restriction violation (8 AM - 9 PM)", "code": "TIME_RESTRICTION", "current_hour": '$CURRENT_HOUR', "severity": "critical"}' >&2
  exit 3
fi

# Ensure opt-out instructions included (TCPA requirement)
if ! echo "$MESSAGE" | grep -qiE 'STOP|opt.*out|unsubscribe'; then
  echo '{"error": "Message must include opt-out instructions (TCPA requirement)", "code": "MISSING_OPT_OUT", "severity": "critical"}' >&2
  exit 3
fi

# Generate message ID
MESSAGE_ID="sms_$(date +%s)_$(shuf -i 10000-99999 -n 1)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Prepare request payload
PAYLOAD=$(jq -n \
  --arg phone "$PHONE" \
  --arg message "$MESSAGE" \
  --arg campaign_id "$CAMPAIGN_ID" \
  --arg sender_id "$SENDER_ID" \
  --arg message_id "$MESSAGE_ID" \
  --arg timestamp "$TIMESTAMP" \
  '{
    phone: $phone,
    message: $message,
    campaign_id: $campaign_id,
    sender_id: $sender_id,
    message_id: $message_id,
    sent_at: $timestamp,
    compliance_verified: true
  }')

# Send SMS via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/sms/send" 2>&1) || {
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

# Log successful send (for audit trail)
redis-cli LPUSH "sms:sent_log:$PHONE" "$MESSAGE_ID:$TIMESTAMP" > /dev/null 2>&1 || true
redis-cli LTRIM "sms:sent_log:$PHONE" 0 99 > /dev/null 2>&1 || true

# Return success response
echo "$BODY" | jq \
  --arg message_id "$MESSAGE_ID" \
  --arg phone "$PHONE" \
  --arg timestamp "$TIMESTAMP" \
  '{
    message_id: ($message_id),
    phone: $phone,
    status: (.status // "sent"),
    sent_at: $timestamp,
    compliance_checks: {
      opt_in_verified: true,
      dnc_cleared: true,
      time_restriction_ok: true
    }
  }'

exit 0
