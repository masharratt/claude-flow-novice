#!/usr/bin/env bash
# CFN Marketing Competitive Intel - Monitor Competitor Operation
# Track competitor activity including content, ads, and keywords

set -euo pipefail

# Default values
ACTIVITY_TYPES="content,ads,keywords"
LOOKBACK_DAYS=30

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --competitor)
      COMPETITOR="$2"
      shift 2
      ;;
    --activity-types)
      ACTIVITY_TYPES="$2"
      shift 2
      ;;
    --lookback-days)
      LOOKBACK_DAYS="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${COMPETITOR:-}" ]]; then
  echo '{"error": "Missing required parameter: --competitor", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate competitor domain format (basic validation)
if [[ ! "$COMPETITOR" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
  echo '{"error": "Invalid domain format for --competitor", "code": "INVALID_DOMAIN"}' >&2
  exit 1
fi

# Validate activity types
IFS=',' read -ra TYPE_ARRAY <<< "$ACTIVITY_TYPES"
for type in "${TYPE_ARRAY[@]}"; do
  case "$type" in
    content|ads|keywords)
      ;;
    *)
      echo '{"error": "Invalid activity type: '"$type"'. Supported: content, ads, keywords", "code": "INVALID_ACTIVITY_TYPE"}' >&2
      exit 1
      ;;
  esac
done

# Validate lookback days
if ! [[ "$LOOKBACK_DAYS" =~ ^[0-9]+$ ]]; then
  echo '{"error": "Lookback days must be a positive integer", "code": "INVALID_LOOKBACK"}' >&2
  exit 1
fi

if (( LOOKBACK_DAYS > 90 )); then
  echo '{"error": "Lookback days cannot exceed 90", "code": "LOOKBACK_TOO_LARGE", "details": {"max": 90, "provided": '"$LOOKBACK_DAYS"'}}' >&2
  exit 1
fi

if (( LOOKBACK_DAYS < 1 )); then
  echo '{"error": "Lookback days must be at least 1", "code": "LOOKBACK_TOO_SMALL"}' >&2
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
  --arg competitor "$COMPETITOR" \
  --arg types "$ACTIVITY_TYPES" \
  --argjson days "$LOOKBACK_DAYS" \
  '{
    competitor: $competitor,
    activity_types: ($types | split(",")),
    lookback_days: $days
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/competitive-intel-monitor-competitor" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      echo "{
        \"competitor\": \"$COMPETITOR\",
        \"activity\": {},
        \"lookback_period\": \"$LOOKBACK_DAYS days\",
        \"activity_types\": $(echo "$ACTIVITY_TYPES" | jq -R 'split(",")'),
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
