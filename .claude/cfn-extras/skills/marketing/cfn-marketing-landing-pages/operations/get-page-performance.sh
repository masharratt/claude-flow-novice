#!/usr/bin/env bash
# CFN Marketing Landing Pages - Get Page Performance Operation
# Get conversion metrics and A/B test results

set -euo pipefail

# Default values
DATE_FROM=$(date -d '30 days ago' +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d)
DATE_TO=$(date +%Y-%m-%d)

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --page-id)
      PAGE_ID="$2"
      shift 2
      ;;
    --date-from)
      DATE_FROM="$2"
      shift 2
      ;;
    --date-to)
      DATE_TO="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${PAGE_ID:-}" ]]; then
  echo '{"error": "Missing required parameter: --page-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate date format
if ! date -d "$DATE_FROM" +%Y-%m-%d &>/dev/null && ! date -j -f "%Y-%m-%d" "$DATE_FROM" &>/dev/null; then
  echo '{"error": "Invalid date format for --date-from. Use YYYY-MM-DD", "code": "INVALID_DATE"}' >&2
  exit 1
fi

if ! date -d "$DATE_TO" +%Y-%m-%d &>/dev/null && ! date -j -f "%Y-%m-%d" "$DATE_TO" &>/dev/null; then
  echo '{"error": "Invalid date format for --date-to. Use YYYY-MM-DD", "code": "INVALID_DATE"}' >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]]; then
  echo '{"error": "N8N_BASE_URL environment variable not set", "code": "MISSING_ENV_VAR"}' >&2
  exit 2
fi

if [[ -z "${N8N_API_KEY:-}" ]]; then
  echo '{"error": "N8N_API_KEY environment variable not set", "code": "MISSING_ENV_VAR"}' >&2
  exit 2
fi

# Build request payload
PAYLOAD=$(jq -n \
  --arg page_id "$PAGE_ID" \
  --arg from "$DATE_FROM" \
  --arg to "$DATE_TO" \
  '{
    page_id: $page_id,
    date_from: $from,
    date_to: $to
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/landing-pages-performance" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      echo "{
        \"page_id\": \"$PAGE_ID\",
        \"page_name\": \"landing-page\",
        \"status\": \"published\",
        \"date_range\": {
          \"from\": \"$DATE_FROM\",
          \"to\": \"$DATE_TO\"
        },
        \"performance\": {
          \"visits\": 0,
          \"conversions\": 0,
          \"conversion_rate\": 0.0,
          \"bounce_rate\": 0.0,
          \"avg_time_on_page\": 0
        },
        \"ab_test\": null,
        \"checked_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }"
    else
      echo "$BODY"
    fi
    exit 0
    ;;
  400)
    echo '{"error": "Bad request - invalid parameters", "code": "API_BAD_REQUEST", "details": '"${BODY:-null}"'}' >&2
    exit 2
    ;;
  401)
    echo '{"error": "Authentication failed - check N8N_API_KEY", "code": "API_AUTH_FAILED"}' >&2
    exit 2
    ;;
  404)
    echo '{"error": "Page not found", "code": "PAGE_NOT_FOUND", "details": {"page_id": "'"$PAGE_ID"'"}}' >&2
    exit 3
    ;;
  429)
    echo '{"error": "Rate limit exceeded - try again later", "code": "API_RATE_LIMIT"}' >&2
    exit 2
    ;;
  000)
    echo '{"error": "Network error - unable to reach N8N instance", "code": "NETWORK_ERROR"}' >&2
    exit 2
    ;;
  *)
    echo '{"error": "Unexpected API response", "code": "API_ERROR", "http_code": '"$HTTP_CODE"', "details": '"${BODY:-null}"'}' >&2
    exit 2
    ;;
esac
