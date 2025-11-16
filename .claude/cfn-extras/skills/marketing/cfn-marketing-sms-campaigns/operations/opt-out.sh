#!/bin/bash
# CFN Marketing SMS Campaigns - Opt-Out Operation
# Version: 1.0.0
# Purpose: Process opt-out request (CRITICAL - must execute within seconds)

set -euo pipefail

# Parse arguments
PHONE=""
SOURCE="manual"
REASON=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --phone)
      PHONE="$2"
      shift 2
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --reason)
      REASON="$2"
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

# Validate phone format (E.164: +1XXXXXXXXXX)
if ! echo "$PHONE" | grep -qE '^\+[1-9][0-9]{1,14}$'; then
  echo '{"error": "Invalid phone format. Use E.164 format (+1XXXXXXXXXX)", "code": "INVALID_PHONE"}' >&2
  exit 1
fi

# Validate source
if [[ "$SOURCE" != "inbound_sms" && "$SOURCE" != "web" && "$SOURCE" != "manual" ]]; then
  echo '{"error": "Invalid source. Must be inbound_sms, web, or manual", "code": "INVALID_SOURCE"}' >&2
  exit 1
fi

# Check if already opted out
if command -v redis-cli &> /dev/null; then
  CURRENT_OPT_IN=$(redis-cli GET "sms:opt_in:$PHONE" 2>/dev/null || echo "")
  if [[ "$CURRENT_OPT_IN" == "false" ]]; then
    OPTED_OUT_AT=$(redis-cli HGET "sms:opt_out:$PHONE" "opted_out_at" 2>/dev/null || echo "")
    echo '{"error": "Phone number already opted out", "code": "ALREADY_OPTED_OUT", "phone": "'"$PHONE"'", "opted_out_at": "'"$OPTED_OUT_AT"'"}' >&2
    exit 3
  fi
else
  echo '{"error": "Redis not available for opt-out processing", "code": "REDIS_UNAVAILABLE"}' >&2
  exit 2
fi

# Generate timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# CRITICAL: TCPA Compliance - Immediate opt-out processing
# Step 1: Update opt-in status (blocks all future sends)
redis-cli SET "sms:opt_in:$PHONE" "false" > /dev/null 2>&1 || {
  echo '{"error": "Failed to update opt-in status", "code": "REDIS_ERROR"}' >&2
  exit 2
}

# Step 2: Add to Do Not Call registry
redis-cli SET "sms:dnc:$PHONE" "true" > /dev/null 2>&1 || {
  echo '{"error": "Failed to update DNC registry", "code": "REDIS_ERROR"}' >&2
  exit 2
}

# Step 3: Add to global opt-out set
redis-cli SADD "sms:global_opt_out" "$PHONE" > /dev/null 2>&1 || {
  echo '{"error": "Failed to add to global opt-out set", "code": "REDIS_ERROR"}' >&2
  exit 2
}

# Step 4: Store detailed opt-out metadata
redis-cli HMSET "sms:opt_out:$PHONE" \
  phone "$PHONE" \
  opted_out_at "$TIMESTAMP" \
  source "$SOURCE" \
  reason "$REASON" \
  > /dev/null 2>&1 || true

redis-cli EXPIRE "sms:opt_out:$PHONE" 31536000 > /dev/null 2>&1 || true  # 1 year retention

# Step 5: Cancel any pending messages for this phone number
redis-cli SADD "sms:cancelled_recipients" "$PHONE" > /dev/null 2>&1 || true

# Validate environment variables for confirmation message
CONFIRMATION_SENT=false
if [[ -n "${N8N_BASE_URL:-}" && -n "${N8N_API_KEY:-}" ]]; then
  # Prepare confirmation payload
  CONFIRMATION_MESSAGE="You have been unsubscribed. No further messages will be sent."

  PAYLOAD=$(jq -n \
    --arg phone "$PHONE" \
    --arg message "$CONFIRMATION_MESSAGE" \
    --arg opted_out_at "$TIMESTAMP" \
    --arg source "$SOURCE" \
    '{
      phone: $phone,
      message: $message,
      opted_out_at: $opted_out_at,
      source: $source,
      type: "opt_out_confirmation"
    }')

  # Send confirmation and persist to database (async, non-blocking)
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
    -d "$PAYLOAD" \
    "${N8N_BASE_URL}/webhook/sms/opt-out" > /dev/null 2>&1 &

  CONFIRMATION_SENT=true
fi

# Log opt-out for audit trail
redis-cli LPUSH "sms:opt_out_log" "$PHONE:$TIMESTAMP:$SOURCE" > /dev/null 2>&1 || true
redis-cli LTRIM "sms:opt_out_log" 0 9999 > /dev/null 2>&1 || true

# Return success response
jq -n \
  --arg phone "$PHONE" \
  --argjson opted_out "true" \
  --arg opted_out_at "$TIMESTAMP" \
  --arg source "$SOURCE" \
  --argjson confirmation_sent "$CONFIRMATION_SENT" \
  --arg message "You have been unsubscribed. No further messages will be sent." \
  '{
    phone: $phone,
    opted_out: $opted_out,
    opted_out_at: $opted_out_at,
    source: $source,
    confirmation_sent: $confirmation_sent,
    message: $message
  }'

exit 0
