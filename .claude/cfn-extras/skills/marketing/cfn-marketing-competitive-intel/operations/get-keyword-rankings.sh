#!/usr/bin/env bash
# CFN Marketing Competitive Intel - Get Keyword Rankings Operation
# Monitor keyword rankings for domain vs competitors

set -euo pipefail

# Default values
COMPETITORS=""
SEARCH_ENGINE="google"
LOCATION="us"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --keywords)
      KEYWORDS="$2"
      shift 2
      ;;
    --competitors)
      COMPETITORS="$2"
      shift 2
      ;;
    --search-engine)
      SEARCH_ENGINE="$2"
      shift 2
      ;;
    --location)
      LOCATION="$2"
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

if [[ -z "${KEYWORDS:-}" ]]; then
  echo '{"error": "Missing required parameter: --keywords", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate domain format (basic validation)
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
  echo '{"error": "Invalid domain format for --domain", "code": "INVALID_DOMAIN"}' >&2
  exit 1
fi

# Validate keywords (non-empty)
IFS=',' read -ra KEYWORD_ARRAY <<< "$KEYWORDS"
if (( ${#KEYWORD_ARRAY[@]} == 0 )); then
  echo '{"error": "At least one keyword is required", "code": "NO_KEYWORDS"}' >&2
  exit 1
fi

# Validate competitor domains (if provided)
if [[ -n "$COMPETITORS" ]]; then
  IFS=',' read -ra COMPETITOR_ARRAY <<< "$COMPETITORS"
  for comp in "${COMPETITOR_ARRAY[@]}"; do
    if [[ ! "$comp" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
      echo '{"error": "Invalid competitor domain format: '"$comp"'", "code": "INVALID_COMPETITOR_DOMAIN"}' >&2
      exit 1
    fi
  done
fi

# Validate search engine
case "$SEARCH_ENGINE" in
  google|bing)
    ;;
  *)
    echo '{"error": "Invalid search engine: '"$SEARCH_ENGINE"'. Supported: google, bing", "code": "INVALID_SEARCH_ENGINE"}' >&2
    exit 1
    ;;
esac

# Validate location
case "$LOCATION" in
  us|uk|ca|au|de|fr|es|it|jp|cn)
    ;;
  *)
    echo '{"error": "Invalid location: '"$LOCATION"'. Supported: us, uk, ca, au, de, fr, es, it, jp, cn", "code": "INVALID_LOCATION"}' >&2
    exit 1
    ;;
esac

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
  --arg keywords "$KEYWORDS" \
  --arg competitors "$COMPETITORS" \
  --arg engine "$SEARCH_ENGINE" \
  --arg location "$LOCATION" \
  '{
    domain: $domain,
    keywords: ($keywords | split(",")),
    competitors: (if $competitors == "" then [] else ($competitors | split(",")) end),
    search_engine: $engine,
    location: $location
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/competitive-intel-keyword-rankings" 2>/dev/null || echo -e "\n000")

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
        \"rankings\": [],
        \"search_engine\": \"$SEARCH_ENGINE\",
        \"location\": \"$LOCATION\",
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
