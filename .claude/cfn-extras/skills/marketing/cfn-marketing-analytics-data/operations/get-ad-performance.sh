#!/usr/bin/env bash
set -euo pipefail

# Get advertising campaign performance analytics via n8n workflow

if [[ -f .env ]]; then
  source .env
fi

N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"

START_DATE=""
END_DATE=""
PLATFORMS=""
METRICS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --start-date)
      START_DATE="$2"
      shift 2
      ;;
    --end-date)
      END_DATE="$2"
      shift 2
      ;;
    --platforms)
      PLATFORMS="$2"
      shift 2
      ;;
    --metrics)
      METRICS="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$START_DATE" ]]; then
  echo "Error: --start-date is required" >&2
  exit 1
fi

if [[ -z "$END_DATE" ]]; then
  echo "Error: --end-date is required" >&2
  exit 1
fi

if [[ ! "$START_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Error: --start-date must be in YYYY-MM-DD format" >&2
  exit 1
fi

if [[ ! "$END_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Error: --end-date must be in YYYY-MM-DD format" >&2
  exit 1
fi

PLATFORMS_ARRAY=$(if [[ -n "$PLATFORMS" ]]; then echo "$PLATFORMS" | jq -R 'split(",")'; else echo "[]"; fi)
METRICS_ARRAY=$(if [[ -n "$METRICS" ]]; then echo "$METRICS" | jq -R 'split(",")'; else echo "[]"; fi)

PAYLOAD=$(jq -n \
  --arg startDate "$START_DATE" \
  --arg endDate "$END_DATE" \
  --argjson platforms "$PLATFORMS_ARRAY" \
  --argjson metrics "$METRICS_ARRAY" \
  '{
    startDate: $startDate,
    endDate: $endDate,
    platforms: $platforms,
    metrics: $metrics
  }')

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/marketing/analytics/ad-performance" || echo -e "\n000")

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
