#!/usr/bin/env bash
set -euo pipefail

# create-crisis-alert.sh - Set up crisis detection alert

QUERY=""
NEGATIVE_THRESHOLD="50"
POSITIVE_THRESHOLD="30"
ALERT_EMAIL=""
CHECK_INTERVAL="15"

while [[ $# -gt 0 ]]; do
  case $1 in
    --query)
      QUERY="$2"
      shift 2
      ;;
    --negative-threshold)
      NEGATIVE_THRESHOLD="$2"
      shift 2
      ;;
    --positive-threshold)
      POSITIVE_THRESHOLD="$2"
      shift 2
      ;;
    --alert-email)
      ALERT_EMAIL="$2"
      shift 2
      ;;
    --check-interval)
      CHECK_INTERVAL="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$QUERY" ]] || [[ -z "$ALERT_EMAIL" ]]; then
  echo "Error: --query and --alert-email are required" >&2
  exit 1
fi

# Validate thresholds
if ! [[ "$NEGATIVE_THRESHOLD" =~ ^[0-9]+$ ]] || [[ "$NEGATIVE_THRESHOLD" -lt 0 ]] || [[ "$NEGATIVE_THRESHOLD" -gt 100 ]]; then
  echo "Error: --negative-threshold must be 0-100" >&2
  exit 3
fi

if ! [[ "$POSITIVE_THRESHOLD" =~ ^[0-9]+$ ]] || [[ "$POSITIVE_THRESHOLD" -lt 0 ]] || [[ "$POSITIVE_THRESHOLD" -gt 100 ]]; then
  echo "Error: --positive-threshold must be 0-100" >&2
  exit 3
fi

# Validate check interval (must be <=15 minutes for crisis SLA)
if ! [[ "$CHECK_INTERVAL" =~ ^[0-9]+$ ]] || [[ "$CHECK_INTERVAL" -lt 1 ]] || [[ "$CHECK_INTERVAL" -gt 60 ]]; then
  echo "Error: --check-interval must be 1-60 minutes" >&2
  exit 3
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg query "$QUERY" \
  --arg negative_threshold "$NEGATIVE_THRESHOLD" \
  --arg positive_threshold "$POSITIVE_THRESHOLD" \
  --arg alert_email "$ALERT_EMAIL" \
  --arg check_interval "$CHECK_INTERVAL" \
  '{
    query: $query,
    negative_threshold: ($negative_threshold | tonumber),
    positive_threshold: ($positive_threshold | tonumber),
    alert_email: $alert_email,
    check_interval_minutes: ($check_interval | tonumber)
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/media-monitoring-alert" \
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
