#!/usr/bin/env bash
# CFN Marketing Ad Campaigns - Get Campaign Performance Operation
# Fetches campaign performance metrics and analytics

set -euo pipefail

# Default values
DATE_RANGE="last_7_days"
METRICS="all"
START_DATE=""
END_DATE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --campaign-id)
      CAMPAIGN_ID="$2"
      shift 2
      ;;
    --date-range)
      DATE_RANGE="$2"
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
    --metrics)
      METRICS="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '"$1"'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "${CAMPAIGN_ID:-}" ]]; then
  echo '{"error": "Missing required parameter: --campaign-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate date range
case "$DATE_RANGE" in
  last_7_days|last_30_days|custom)
    ;;
  *)
    echo '{"error": "Invalid date range: '"$DATE_RANGE"'. Supported: last_7_days, last_30_days, custom", "code": "INVALID_DATE_RANGE"}' >&2
    exit 1
    ;;
esac

# Validate custom date range
if [[ "$DATE_RANGE" == "custom" ]]; then
  if [[ -z "$START_DATE" ]]; then
    echo '{"error": "Missing --start-date for custom date range", "code": "MISSING_PARAMETER"}' >&2
    exit 1
  fi
  if [[ -z "$END_DATE" ]]; then
    echo '{"error": "Missing --end-date for custom date range", "code": "MISSING_PARAMETER"}' >&2
    exit 1
  fi

  # Validate date format (YYYY-MM-DD)
  if ! [[ "$START_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo '{"error": "Invalid start date format. Use YYYY-MM-DD", "code": "INVALID_DATE_FORMAT"}' >&2
    exit 1
  fi
  if ! [[ "$END_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo '{"error": "Invalid end date format. Use YYYY-MM-DD", "code": "INVALID_DATE_FORMAT"}' >&2
    exit 1
  fi
fi

# Calculate date range for predefined options
if [[ "$DATE_RANGE" == "last_7_days" ]]; then
  END_DATE=$(date +%Y-%m-%d)
  START_DATE=$(date -d "7 days ago" +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d)
elif [[ "$DATE_RANGE" == "last_30_days" ]]; then
  END_DATE=$(date +%Y-%m-%d)
  START_DATE=$(date -d "30 days ago" +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d)
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
  --arg id "$CAMPAIGN_ID" \
  --arg start "$START_DATE" \
  --arg end "$END_DATE" \
  --arg metrics "$METRICS" \
  '{
    campaign_id: $id,
    date_range: {
      start: $start,
      end: $end
    },
    metrics: (if $metrics == "all" then null else ($metrics | split(",")) end)
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/ad-campaigns/performance" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200)
    # Success - parse and format response
    echo "$BODY" | jq \
      --arg id "$CAMPAIGN_ID" \
      --arg start "$START_DATE" \
      --arg end "$END_DATE" \
      '{
        campaign_id: (.campaign_id // $id),
        date_range: {
          start: (.date_range.start // $start),
          end: (.date_range.end // $end)
        },
        metrics: {
          impressions: (.metrics.impressions // 0),
          clicks: (.metrics.clicks // 0),
          conversions: (.metrics.conversions // 0),
          spend: (.metrics.spend // 0),
          ctr: (.metrics.ctr // 0),
          cpa: (.metrics.cpa // 0),
          roas: (.metrics.roas // 0),
          conversion_rate: (.metrics.conversion_rate // 0)
        },
        budget: {
          total: (.budget.total // .budget.lifetime_budget),
          spent: (.budget.spent // .metrics.spend // 0),
          remaining: (.budget.remaining // (.budget.total - .budget.spent))
        },
        status: (.status // "unknown"),
        platform: .platform
      }'
    exit 0
    ;;
  400)
    echo '{"error": "Bad request - invalid performance query", "code": "API_BAD_REQUEST", "details": '"${BODY:-null}"'}' >&2
    exit 2
    ;;
  401)
    echo '{"error": "Authentication failed - check N8N_API_KEY", "code": "API_AUTH_FAILED"}' >&2
    exit 2
    ;;
  404)
    echo '{"error": "Campaign not found: '"$CAMPAIGN_ID"'", "code": "CAMPAIGN_NOT_FOUND"}' >&2
    exit 1
    ;;
  429)
    echo '{"error": "Rate limit exceeded - try again later", "code": "API_RATE_LIMIT"}' >&2
    exit 2
    ;;
  503)
    echo '{"error": "Performance data temporarily unavailable - try again later", "code": "SERVICE_UNAVAILABLE"}' >&2
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
