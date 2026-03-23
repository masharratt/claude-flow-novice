#!/usr/bin/env bash
set -euo pipefail

# get-sentiment-analysis.sh - Analyze sentiment of brand mentions

QUERY=""
TIMEFRAME="24h"
BREAKDOWN="source_type"

while [[ $# -gt 0 ]]; do
  case $1 in
    --query)
      QUERY="$2"
      shift 2
      ;;
    --timeframe)
      TIMEFRAME="$2"
      shift 2
      ;;
    --breakdown)
      BREAKDOWN="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$QUERY" ]]; then
  echo "Error: --query is required" >&2
  exit 1
fi

# Validate timeframe
if [[ ! "$TIMEFRAME" =~ ^(24h|7d|30d)$ ]]; then
  echo "Error: --timeframe must be 24h, 7d, or 30d" >&2
  exit 1
fi

# Validate breakdown
if [[ ! "$BREAKDOWN" =~ ^(source|source_type|date)$ ]]; then
  echo "Error: --breakdown must be source, source_type, or date" >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg query "$QUERY" \
  --arg timeframe "$TIMEFRAME" \
  --arg breakdown "$BREAKDOWN" \
  '{
    query: $query,
    timeframe: $timeframe,
    breakdown: $breakdown
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/media-monitoring-sentiment" \
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
