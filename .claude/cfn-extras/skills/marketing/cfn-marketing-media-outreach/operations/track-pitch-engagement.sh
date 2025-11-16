#!/usr/bin/env bash
set -euo pipefail

# track-pitch-engagement.sh - Track pitch email engagement

PITCH_ID=""
INCLUDE_FOLLOW_UPS="true"

while [[ $# -gt 0 ]]; do
  case $1 in
    --pitch-id)
      PITCH_ID="$2"
      shift 2
      ;;
    --include-follow-ups)
      INCLUDE_FOLLOW_UPS="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$PITCH_ID" ]]; then
  echo "Error: --pitch-id is required" >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg pitch_id "$PITCH_ID" \
  --argjson include_follow_ups "$([[ "$INCLUDE_FOLLOW_UPS" == "true" ]] && echo true || echo false)" \
  '{
    pitch_id: $pitch_id,
    include_follow_ups: $include_follow_ups
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/media-outreach-engagement" \
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
  exit 1
else
  echo "Error: API error (HTTP $HTTP_CODE) - $BODY" >&2
  exit 2
fi
