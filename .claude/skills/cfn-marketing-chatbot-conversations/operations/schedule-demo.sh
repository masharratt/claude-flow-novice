#!/bin/bash
# CFN Marketing Chatbot Conversations - Schedule Demo Operation
# Version: 1.0.0
# Purpose: Book demo appointment

set -euo pipefail

# Parse arguments
VISITOR_ID=""
EMAIL=""
PREFERRED_DATE=""
TIMEZONE=""
NOTES=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --visitor-id)
      VISITOR_ID="$2"
      shift 2
      ;;
    --email)
      EMAIL="$2"
      shift 2
      ;;
    --preferred-date)
      PREFERRED_DATE="$2"
      shift 2
      ;;
    --timezone)
      TIMEZONE="$2"
      shift 2
      ;;
    --notes)
      NOTES="$2"
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

if [[ -z "$EMAIL" ]]; then
  echo '{"error": "Missing required parameter: --email", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$PREFERRED_DATE" ]]; then
  echo '{"error": "Missing required parameter: --preferred-date", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "$TIMEZONE" ]]; then
  echo '{"error": "Missing required parameter: --timezone", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate email format
if ! echo "$EMAIL" | grep -qE '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'; then
  echo '{"error": "Invalid email format", "code": "INVALID_EMAIL"}' >&2
  exit 1
fi

# Validate ISO 8601 date format (basic check)
if ! echo "$PREFERRED_DATE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'; then
  echo '{"error": "Invalid date format. Use ISO 8601 (YYYY-MM-DDTHH:MM:SS)", "code": "INVALID_DATE"}' >&2
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

# Check lead qualification status (optional verification)
QUALIFICATION_SCORE=0
if command -v redis-cli &> /dev/null; then
  QUALIFICATION_SCORE=$(redis-cli GET "chatbot:qualification:${VISITOR_ID}" 2>/dev/null || echo "0")
fi

# Warn if scheduling demo for unqualified lead
if [[ "$QUALIFICATION_SCORE" -lt 60 ]] && [[ "$QUALIFICATION_SCORE" -gt 0 ]]; then
  echo "Warning: Scheduling demo for potentially unqualified lead (BANT score: $QUALIFICATION_SCORE)" >&2
fi

# Generate appointment ID
APPOINTMENT_ID="apt_$(date +%s)_$(shuf -i 10000-99999 -n 1)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Prepare request payload
PAYLOAD=$(jq -n \
  --arg visitor_id "$VISITOR_ID" \
  --arg email "$EMAIL" \
  --arg preferred_date "$PREFERRED_DATE" \
  --arg timezone "$TIMEZONE" \
  --arg notes "$NOTES" \
  --arg appointment_id "$APPOINTMENT_ID" \
  --arg timestamp "$TIMESTAMP" \
  '{
    visitor_id: $visitor_id,
    email: $email,
    preferred_date: $preferred_date,
    timezone: $timezone,
    notes: $notes,
    appointment_id: $appointment_id,
    requested_at: $timestamp
  }')

# Schedule demo via n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/chatbot/schedule-demo" 2>&1) || {
  echo '{"error": "Network error: Failed to connect to n8n", "code": "NETWORK_ERROR"}' >&2
  exit 2
}

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle HTTP errors
if [[ "$HTTP_CODE" -ge 400 ]]; then
  if [[ "$HTTP_CODE" -eq 404 ]]; then
    echo '{"error": "No available slots for preferred date", "code": "NO_AVAILABLE_SLOTS"}' >&2
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

# Store appointment in Redis (optional - for tracking)
if command -v redis-cli &> /dev/null; then
  redis-cli HMSET "chatbot:appointment:${APPOINTMENT_ID}" \
    visitor_id "$VISITOR_ID" \
    email "$EMAIL" \
    scheduled_at "$PREFERRED_DATE" \
    timezone "$TIMEZONE" \
    status "scheduled" \
    > /dev/null 2>&1 || true
  redis-cli EXPIRE "chatbot:appointment:${APPOINTMENT_ID}" 2592000 > /dev/null 2>&1 || true
fi

# Return success response
echo "$BODY" | jq \
  --arg appointment_id "$APPOINTMENT_ID" \
  --arg visitor_id "$VISITOR_ID" \
  '{
    appointment_id: ($appointment_id),
    visitor_id: $visitor_id,
    scheduled_at: (.scheduled_at // .preferred_date),
    calendar_link: (.calendar_link // ""),
    confirmation_sent: (.confirmation_sent // true)
  }'

exit 0
