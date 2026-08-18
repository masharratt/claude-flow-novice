#!/usr/bin/env bash
# CFN Marketing Competitive Intel - Search Brand Mentions Operation
# Search for brand mentions across multiple sources

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Default values
SOURCES="twitter,reddit,news,blogs"
DATE_FROM=$(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d)
DATE_TO=$(date +%Y-%m-%d)
SENTIMENT="all"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --brand)
      BRAND="$2"
      shift 2
      ;;
    --sources)
      SOURCES="$2"
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
    --sentiment)
      SENTIMENT="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${BRAND:-}" ]]; then
  echo '{"error": "Missing required parameter: --brand", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate sources
IFS=',' read -ra SOURCE_ARRAY <<< "$SOURCES"
for source in "${SOURCE_ARRAY[@]}"; do
  case "$source" in
    twitter|reddit|news|blogs)
      ;;
    *)
      echo '{"error": "Invalid source: '"$source"'. Supported: twitter, reddit, news, blogs", "code": "INVALID_SOURCE"}' >&2
      exit 1
      ;;
  esac
done

# Validate sentiment
case "$SENTIMENT" in
  all|positive|negative|neutral)
    ;;
  *)
    echo '{"error": "Invalid sentiment: '"$SENTIMENT"'. Supported: all, positive, negative, neutral", "code": "INVALID_SENTIMENT"}' >&2
    exit 1
    ;;
esac

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
  --arg brand "$BRAND" \
  --arg sources "$SOURCES" \
  --arg from "$DATE_FROM" \
  --arg to "$DATE_TO" \
  --arg sentiment "$SENTIMENT" \
  '{
    brand: $brand,
    sources: ($sources | split(",")),
    date_from: $from,
    date_to: $to,
    sentiment: $sentiment
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/competitive-intel-search-mentions" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      echo "{
        \"brand\": \"$BRAND\",
        \"mentions\": [],
        \"total_mentions\": 0,
        \"sentiment_breakdown\": {
          \"positive\": 0,
          \"negative\": 0,
          \"neutral\": 0
        },
        \"date_range\": {
          \"from\": \"$DATE_FROM\",
          \"to\": \"$DATE_TO\"
        },
        \"sources\": $(echo "$SOURCES" | jq -R 'split(",")')
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
