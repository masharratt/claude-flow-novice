#!/bin/bash
# CFN Marketing Competitive Intel - Get Trending Topics Operation
# Discover trending topics in industry

set -euo pipefail

# Default values
REGION="global"
LIMIT=10

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --industry)
      INDUSTRY="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${INDUSTRY:-}" ]]; then
  echo '{"error": "Missing required parameter: --industry", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate industry
case "$INDUSTRY" in
  tech|finance|healthcare|retail|manufacturing|education|entertainment|real_estate|automotive|energy)
    ;;
  *)
    echo '{"error": "Invalid industry: '"$INDUSTRY"'. Supported: tech, finance, healthcare, retail, manufacturing, education, entertainment, real_estate, automotive, energy", "code": "INVALID_INDUSTRY"}' >&2
    exit 1
    ;;
esac

# Validate region
case "$REGION" in
  global|us|uk|ca|au|de|fr|es|it|jp|cn)
    ;;
  *)
    echo '{"error": "Invalid region: '"$REGION"'. Supported: global, us, uk, ca, au, de, fr, es, it, jp, cn", "code": "INVALID_REGION"}' >&2
    exit 1
    ;;
esac

# Validate limit
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo '{"error": "Limit must be a positive integer", "code": "INVALID_LIMIT"}' >&2
  exit 1
fi

if (( LIMIT > 50 )); then
  echo '{"error": "Limit cannot exceed 50", "code": "LIMIT_TOO_LARGE", "details": {"max": 50, "provided": '"$LIMIT"'}}' >&2
  exit 1
fi

if (( LIMIT < 1 )); then
  echo '{"error": "Limit must be at least 1", "code": "LIMIT_TOO_SMALL"}' >&2
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
  --arg industry "$INDUSTRY" \
  --arg region "$REGION" \
  --argjson limit "$LIMIT" \
  '{
    industry: $industry,
    region: $region,
    limit: $limit
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/competitive-intel-trending-topics" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      echo "{
        \"industry\": \"$INDUSTRY\",
        \"region\": \"$REGION\",
        \"topics\": [],
        \"total_topics\": 0,
        \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
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
