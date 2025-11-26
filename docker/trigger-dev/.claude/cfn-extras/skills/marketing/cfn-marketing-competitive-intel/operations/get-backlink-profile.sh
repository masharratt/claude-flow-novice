#!/bin/bash
# CFN Marketing Competitive Intel - Get Backlink Profile Operation
# Analyze competitor backlink profiles

set -euo pipefail

# Default values
LIMIT=50
MIN_AUTHORITY=20

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --min-authority)
      MIN_AUTHORITY="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${DOMAIN:-}" ]]; then
  echo '{"error": "Missing required parameter: --domain", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate domain format (basic validation)
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
  echo '{"error": "Invalid domain format for --domain", "code": "INVALID_DOMAIN"}' >&2
  exit 1
fi

# Validate limit
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo '{"error": "Limit must be a positive integer", "code": "INVALID_LIMIT"}' >&2
  exit 1
fi

if (( LIMIT > 200 )); then
  echo '{"error": "Limit cannot exceed 200", "code": "LIMIT_TOO_LARGE", "details": {"max": 200, "provided": '"$LIMIT"'}}' >&2
  exit 1
fi

if (( LIMIT < 1 )); then
  echo '{"error": "Limit must be at least 1", "code": "LIMIT_TOO_SMALL"}' >&2
  exit 1
fi

# Validate min authority
if ! [[ "$MIN_AUTHORITY" =~ ^[0-9]+$ ]]; then
  echo '{"error": "Minimum authority must be a positive integer", "code": "INVALID_AUTHORITY"}' >&2
  exit 1
fi

if (( MIN_AUTHORITY > 100 )); then
  echo '{"error": "Minimum authority cannot exceed 100", "code": "AUTHORITY_TOO_LARGE", "details": {"max": 100, "provided": '"$MIN_AUTHORITY"'}}' >&2
  exit 1
fi

if (( MIN_AUTHORITY < 0 )); then
  echo '{"error": "Minimum authority cannot be negative", "code": "AUTHORITY_NEGATIVE"}' >&2
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
  --arg domain "$DOMAIN" \
  --argjson limit "$LIMIT" \
  --argjson min_auth "$MIN_AUTHORITY" \
  '{
    domain: $domain,
    limit: $limit,
    min_authority: $min_auth
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/competitive-intel-backlink-profile" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      echo "{
        \"domain\": \"$DOMAIN\",
        \"backlink_summary\": {
          \"total_backlinks\": 0,
          \"referring_domains\": 0,
          \"avg_domain_authority\": 0,
          \"new_backlinks_30d\": 0
        },
        \"top_backlinks\": [],
        \"link_building_opportunities\": [],
        \"analyzed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
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
