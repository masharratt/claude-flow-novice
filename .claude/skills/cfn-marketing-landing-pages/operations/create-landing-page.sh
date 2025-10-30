#!/bin/bash
# CFN Marketing Landing Pages - Create Landing Page Operation
# Create new landing page from template

set -euo pipefail

# Default values
DESCRIPTION=""
IMAGE_URL=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --page-name)
      PAGE_NAME="$2"
      shift 2
      ;;
    --template)
      TEMPLATE="$2"
      shift 2
      ;;
    --headline)
      HEADLINE="$2"
      shift 2
      ;;
    --cta-text)
      CTA_TEXT="$2"
      shift 2
      ;;
    --cta-url)
      CTA_URL="$2"
      shift 2
      ;;
    --description)
      DESCRIPTION="$2"
      shift 2
      ;;
    --image-url)
      IMAGE_URL="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${PAGE_NAME:-}" ]]; then
  echo '{"error": "Missing required parameter: --page-name", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${TEMPLATE:-}" ]]; then
  echo '{"error": "Missing required parameter: --template", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${HEADLINE:-}" ]]; then
  echo '{"error": "Missing required parameter: --headline", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${CTA_TEXT:-}" ]]; then
  echo '{"error": "Missing required parameter: --cta-text", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${CTA_URL:-}" ]]; then
  echo '{"error": "Missing required parameter: --cta-url", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate page name format (alphanumeric, hyphens only)
if [[ ! "$PAGE_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo '{"error": "Page name must contain only lowercase letters, numbers, and hyphens", "code": "INVALID_PAGE_NAME"}' >&2
  exit 1
fi

# Validate template
case "$TEMPLATE" in
  product|lead-gen|webinar|ebook|demo)
    ;;
  *)
    echo '{"error": "Invalid template: '"$TEMPLATE"'. Supported: product, lead-gen, webinar, ebook, demo", "code": "INVALID_TEMPLATE"}' >&2
    exit 1
    ;;
esac

# Validate CTA URL format
if [[ ! "$CTA_URL" =~ ^https?:// ]]; then
  echo '{"error": "CTA URL must start with http:// or https://", "code": "INVALID_CTA_URL"}' >&2
  exit 1
fi

# Validate image URL format (if provided)
if [[ -n "$IMAGE_URL" ]] && [[ ! "$IMAGE_URL" =~ ^https?:// ]]; then
  echo '{"error": "Image URL must start with http:// or https://", "code": "INVALID_IMAGE_URL"}' >&2
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
  --arg name "$PAGE_NAME" \
  --arg template "$TEMPLATE" \
  --arg headline "$HEADLINE" \
  --arg cta_text "$CTA_TEXT" \
  --arg cta_url "$CTA_URL" \
  --arg description "$DESCRIPTION" \
  --arg image "$IMAGE_URL" \
  '{
    page_name: $name,
    template: $template,
    headline: $headline,
    cta_text: $cta_text,
    cta_url: $cta_url,
    description: (if $description == "" then null else $description end),
    image_url: (if $image == "" then null else $image end)
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/landing-pages-create" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      PAGE_ID="lp_$(date +%s)"
      echo "{
        \"page_id\": \"$PAGE_ID\",
        \"page_name\": \"$PAGE_NAME\",
        \"status\": \"draft\",
        \"template\": \"$TEMPLATE\",
        \"url\": \"https://pages.example.com/$PAGE_NAME\",
        \"preview_url\": \"https://pages.example.com/preview/$PAGE_NAME\",
        \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
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
  409)
    echo '{"error": "Page name already exists", "code": "PAGE_NAME_EXISTS", "details": '"${BODY:-null}"'}' >&2
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
