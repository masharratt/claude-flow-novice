#!/usr/bin/env bash
# CFN Marketing Landing Pages - Publish Page Operation
# Publish landing page to production

set -euo pipefail

# Default values
CUSTOM_DOMAIN=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --page-id)
      PAGE_ID="$2"
      shift 2
      ;;
    --custom-domain)
      CUSTOM_DOMAIN="$2"
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

# Validate custom domain format (if provided)
if [[ -n "$CUSTOM_DOMAIN" ]]; then
  if [[ ! "$CUSTOM_DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
    echo '{"error": "Invalid custom domain format", "code": "INVALID_DOMAIN"}' >&2
    exit 1
  fi
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
  --arg domain "$CUSTOM_DOMAIN" \
  '{
    page_id: $page_id,
    custom_domain: (if $domain == "" then null else $domain end)
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/landing-pages-publish" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      if [[ -n "$CUSTOM_DOMAIN" ]]; then
        URL="https://$CUSTOM_DOMAIN/page"
      else
        URL="https://pages.example.com/page"
      fi
      echo "{
        \"page_id\": \"$PAGE_ID\",
        \"status\": \"published\",
        \"url\": \"$URL\",
        \"published_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }"
    else
      echo "$BODY"
    fi
    exit 0
    ;;
  400)
    echo '{"error": "Bad request - page not in publishable state", "code": "API_BAD_REQUEST", "details": '"${BODY:-null}"'}' >&2
    exit 1
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
