#!/usr/bin/env bash
# CFN Marketing Ad Campaigns - Create Campaign Operation
# Creates new advertising campaign with budget validation

set -euo pipefail

# Budget limits (hard-coded)
DAILY_MIN=1
DAILY_MAX=500
LIFETIME_MIN=10
LIFETIME_MAX=5000

# Default values
BID_STRATEGY="enhanced_cpc"
START_DATE=$(date +%Y-%m-%d)
END_DATE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --campaign-name)
      CAMPAIGN_NAME="$2"
      shift 2
      ;;
    --daily-budget)
      DAILY_BUDGET="$2"
      shift 2
      ;;
    --lifetime-budget)
      LIFETIME_BUDGET="$2"
      shift 2
      ;;
    --target-audience)
      TARGET_AUDIENCE="$2"
      shift 2
      ;;
    --start-date)
      START_DATE="$2"
      shift 2
      ;;
    --end-date)
      END_DATE="$2"
      shift 2
      ;;
    --bid-strategy)
      BID_STRATEGY="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${PLATFORM:-}" ]]; then
  echo '{"error": "Missing required parameter: --platform", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${CAMPAIGN_NAME:-}" ]]; then
  echo '{"error": "Missing required parameter: --campaign-name", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${DAILY_BUDGET:-}" ]]; then
  echo '{"error": "Missing required parameter: --daily-budget", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${LIFETIME_BUDGET:-}" ]]; then
  echo '{"error": "Missing required parameter: --lifetime-budget", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${TARGET_AUDIENCE:-}" ]]; then
  echo '{"error": "Missing required parameter: --target-audience", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate platform
case "$PLATFORM" in
  google_ads|meta_ads|linkedin_ads)
    ;;
  *)
    echo '{"error": "Invalid platform: '"$PLATFORM"'. Supported: google_ads, meta_ads, linkedin_ads", "code": "INVALID_PLATFORM"}' >&2
    exit 1
    ;;
esac

# Validate budget - daily
if (( $(echo "$DAILY_BUDGET < $DAILY_MIN" | bc -l) )); then
  echo '{"error": "Daily budget below minimum ($'"$DAILY_MIN"')", "code": "BUDGET_TOO_LOW", "details": {"field": "daily_budget", "min": '"$DAILY_MIN"', "provided": '"$DAILY_BUDGET"'}}' >&2
  exit 3
fi

if (( $(echo "$DAILY_BUDGET > $DAILY_MAX" | bc -l) )); then
  echo '{"error": "Daily budget exceeds maximum ($'"$DAILY_MAX"')", "code": "BUDGET_EXCEEDED", "details": {"field": "daily_budget", "max": '"$DAILY_MAX"', "provided": '"$DAILY_BUDGET"'}}' >&2
  exit 3
fi

# Validate budget - lifetime
if (( $(echo "$LIFETIME_BUDGET < $LIFETIME_MIN" | bc -l) )); then
  echo '{"error": "Lifetime budget below minimum ($'"$LIFETIME_MIN"')", "code": "BUDGET_TOO_LOW", "details": {"field": "lifetime_budget", "min": '"$LIFETIME_MIN"', "provided": '"$LIFETIME_BUDGET"'}}' >&2
  exit 3
fi

if (( $(echo "$LIFETIME_BUDGET > $LIFETIME_MAX" | bc -l) )); then
  echo '{"error": "Lifetime budget exceeds maximum ($'"$LIFETIME_MAX"')", "code": "BUDGET_EXCEEDED", "details": {"field": "lifetime_budget", "max": '"$LIFETIME_MAX"', "provided": '"$LIFETIME_BUDGET"'}}' >&2
  exit 3
fi

# Validate lifetime >= daily
if (( $(echo "$LIFETIME_BUDGET < $DAILY_BUDGET" | bc -l) )); then
  echo '{"error": "Lifetime budget must be >= daily budget", "code": "BUDGET_CONSTRAINT_VIOLATION", "details": {"lifetime": '"$LIFETIME_BUDGET"', "daily": '"$DAILY_BUDGET"'}}' >&2
  exit 1
fi

# Validate target audience JSON
if ! echo "$TARGET_AUDIENCE" | jq empty 2>/dev/null; then
  echo '{"error": "Invalid JSON in --target-audience", "code": "INVALID_JSON"}' >&2
  exit 1
fi

# Validate bid strategy
case "$BID_STRATEGY" in
  manual_cpc|enhanced_cpc|maximize_conversions|target_cpa|target_roas)
    ;;
  *)
    echo '{"error": "Invalid bid strategy: '"$BID_STRATEGY"'", "code": "INVALID_BID_STRATEGY"}' >&2
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
  --arg platform "$PLATFORM" \
  --arg name "$CAMPAIGN_NAME" \
  --argjson daily "$DAILY_BUDGET" \
  --argjson lifetime "$LIFETIME_BUDGET" \
  --argjson audience "$TARGET_AUDIENCE" \
  --arg start "$START_DATE" \
  --arg end "$END_DATE" \
  --arg strategy "$BID_STRATEGY" \
  '{
    platform: $platform,
    campaign_name: $name,
    daily_budget: $daily,
    lifetime_budget: $lifetime,
    target_audience: $audience,
    start_date: $start,
    end_date: (if $end == "" then null else $end end),
    bid_strategy: $strategy
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/ad-campaigns/create" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - parse and format response
    CAMPAIGN_ID=$(echo "$BODY" | jq -r '.campaign_id // "cmp_'$(date +%s)'"')

    echo "$BODY" | jq \
      --arg id "$CAMPAIGN_ID" \
      --arg status "active" \
      --argjson daily "$DAILY_BUDGET" \
      --argjson lifetime "$LIFETIME_BUDGET" \
      --argjson remaining "$LIFETIME_BUDGET" \
      --arg start "$START_DATE" \
      --arg platform "$PLATFORM" \
      '{
        campaign_id: (.campaign_id // $id),
        status: (.status // $status),
        daily_budget: (.daily_budget // $daily),
        lifetime_budget: (.lifetime_budget // $lifetime),
        budget_remaining: (.budget_remaining // $remaining),
        start_date: (.start_date // $start),
        end_date: (.end_date // null),
        platform: (.platform // $platform),
        bid_strategy: .bid_strategy
      }'
    exit 0
    ;;
  400)
    echo '{"error": "Bad request - invalid campaign parameters", "code": "API_BAD_REQUEST", "details": '"${BODY:-null}"'}' >&2
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
