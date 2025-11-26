#!/usr/bin/env bash
set -euo pipefail

# search-journalists.sh - Find journalists by beat, outlet, or topic

BEAT=""
OUTLET=""
TOPIC=""
LIMIT="20"

while [[ $# -gt 0 ]]; do
  case $1 in
    --beat)
      BEAT="$2"
      shift 2
      ;;
    --outlet)
      OUTLET="$2"
      shift 2
      ;;
    --topic)
      TOPIC="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg beat "$BEAT" \
  --arg outlet "$OUTLET" \
  --arg topic "$TOPIC" \
  --arg limit "$LIMIT" \
  '{
    beat: $beat,
    outlet: $outlet,
    topic: $topic,
    limit: ($limit | tonumber)
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/media-outreach-search" \
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
