#!/usr/bin/env bash
set -euo pipefail

# send-pitch.sh - Send personalized pitch to journalist via Mailshake

JOURNALIST_ID=""
SUBJECT=""
BODY=""
FOLLOW_UP_DAYS="3"

while [[ $# -gt 0 ]]; do
  case $1 in
    --journalist-id)
      JOURNALIST_ID="$2"
      shift 2
      ;;
    --subject)
      SUBJECT="$2"
      shift 2
      ;;
    --body)
      BODY="$2"
      shift 2
      ;;
    --follow-up-days)
      FOLLOW_UP_DAYS="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$JOURNALIST_ID" ]] || [[ -z "$SUBJECT" ]] || [[ -z "$BODY" ]]; then
  echo "Error: --journalist-id, --subject, and --body are required" >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg journalist_id "$JOURNALIST_ID" \
  --arg subject "$SUBJECT" \
  --arg body "$BODY" \
  --arg follow_up_days "$FOLLOW_UP_DAYS" \
  '{
    journalist_id: $journalist_id,
    subject: $subject,
    body: $body,
    follow_up_days: ($follow_up_days | tonumber)
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/media-outreach-pitch" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 ]] && [[ "$HTTP_CODE" -lt 300 ]]; then
  echo "$BODY"
  exit 0
elif [[ "$HTTP_CODE" -ge 400 ]] && [[ "$HTTP_CODE" -lt 500 ]]; then
  echo "Error: Invalid request - $BODY" >&2
  exit 3
else
  echo "Error: API error (HTTP $HTTP_CODE) - $BODY" >&2
  exit 2
fi
