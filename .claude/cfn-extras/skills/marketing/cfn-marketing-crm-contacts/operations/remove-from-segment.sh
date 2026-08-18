#!/usr/bin/env bash
set -euo pipefail

# Remove contact from CRM segment via n8n workflow

if [[ -f .env ]]; then
  source .env
fi

N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"

CONTACT_ID=""
SEGMENT_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --contact-id)
      CONTACT_ID="$2"
      shift 2
      ;;
    --segment-id)
      SEGMENT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$CONTACT_ID" ]]; then
  echo "Error: --contact-id is required" >&2
  exit 1
fi

if [[ -z "$SEGMENT_ID" ]]; then
  echo "Error: --segment-id is required" >&2
  exit 1
fi

PAYLOAD=$(jq -n \
  --arg contactId "$CONTACT_ID" \
  --arg segmentId "$SEGMENT_ID" \
  '{
    contactId: $contactId,
    segmentId: $segmentId
  }')

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/marketing/crm/remove-from-segment" || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "000" ]]; then
  echo '{"success":false,"message":"Network error: Unable to connect to n8n"}' >&2
  exit 2
elif [[ "$HTTP_CODE" == "401" ]] || [[ "$HTTP_CODE" == "403" ]]; then
  echo '{"success":false,"message":"Authentication error: Invalid API key"}' >&2
  exit 3
elif [[ ! "$HTTP_CODE" =~ ^2 ]]; then
  echo "{\"success\":false,\"message\":\"API error: HTTP $HTTP_CODE\",\"response\":$BODY}" >&2
  exit 2
fi

if echo "$BODY" | jq -e '.success' >/dev/null 2>&1; then
  echo "$BODY"
  exit 0
else
  echo '{"success":false,"message":"Invalid response format from n8n"}' >&2
  exit 2
fi
