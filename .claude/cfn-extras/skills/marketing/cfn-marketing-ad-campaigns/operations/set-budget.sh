#!/bin/bash
# CFN Marketing Ad Campaigns - Set Budget Operation
# Updates campaign budget with validation

set -euo pipefail

# Budget limits (hard-coded)
DAILY_MIN=1
DAILY_MAX=500
LIFETIME_MIN=10
LIFETIME_MAX=5000

# Initialize optional parameters
DAILY_BUDGET=""
LIFETIME_BUDGET=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --campaign-id)
      CAMPAIGN_ID="$2"
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

if [[ -z "$DAILY_BUDGET" ]] && [[ -z "$LIFETIME_BUDGET" ]]; then
  echo '{"error": "At least one budget parameter required (--daily-budget or --lifetime-budget)", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate daily budget if provided
if [[ -n "$DAILY_BUDGET" ]]; then
  if (( $(echo "$DAILY_BUDGET < $DAILY_MIN" | bc -l) )); then
    echo '{"error": "Daily budget below minimum ($'"$DAILY_MIN"')", "code": "BUDGET_TOO_LOW", "details": {"field": "daily_budget", "min": '"$DAILY_MIN"', "provided": '"$DAILY_BUDGET"'}}' >&2
    exit 3
  fi

  if (( $(echo "$DAILY_BUDGET > $DAILY_MAX" | bc -l) )); then
    echo '{"error": "Daily budget exceeds maximum ($'"$DAILY_MAX"')", "code": "BUDGET_EXCEEDED", "details": {"field": "daily_budget", "max": '"$DAILY_MAX"', "provided": '"$DAILY_BUDGET"'}}' >&2
    exit 3
  fi
fi

# Validate lifetime budget if provided
if [[ -n "$LIFETIME_BUDGET" ]]; then
  if (( $(echo "$LIFETIME_BUDGET < $LIFETIME_MIN" | bc -l) )); then
    echo '{"error": "Lifetime budget below minimum ($'"$LIFETIME_MIN"')", "code": "BUDGET_TOO_LOW", "details": {"field": "lifetime_budget", "min": '"$LIFETIME_MIN"', "provided": '"$LIFETIME_BUDGET"'}}' >&2
    exit 3
  fi

  if (( $(echo "$LIFETIME_BUDGET > $LIFETIME_MAX" | bc -l) )); then
    echo '{"error": "Lifetime budget exceeds maximum ($'"$LIFETIME_MAX"')", "code": "BUDGET_EXCEEDED", "details": {"field": "lifetime_budget", "max": '"$LIFETIME_MAX"', "provided": '"$LIFETIME_BUDGET"'}}' >&2
    exit 3
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
if [[ -n "$DAILY_BUDGET" ]] && [[ -n "$LIFETIME_BUDGET" ]]; then
  PAYLOAD=$(jq -n \
    --arg id "$CAMPAIGN_ID" \
    --argjson daily "$DAILY_BUDGET" \
    --argjson lifetime "$LIFETIME_BUDGET" \
    '{
      campaign_id: $id,
      daily_budget: $daily,
      lifetime_budget: $lifetime
    }'
  )
elif [[ -n "$DAILY_BUDGET" ]]; then
  PAYLOAD=$(jq -n \
    --arg id "$CAMPAIGN_ID" \
    --argjson daily "$DAILY_BUDGET" \
    '{
      campaign_id: $id,
      daily_budget: $daily
    }'
  )
else
  PAYLOAD=$(jq -n \
    --arg id "$CAMPAIGN_ID" \
    --argjson lifetime "$LIFETIME_BUDGET" \
    '{
      campaign_id: $id,
      lifetime_budget: $lifetime
    }'
  )
fi

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/ad-campaigns/budget" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200)
    # Success - parse and format response
    echo "$BODY" | jq \
      --arg id "$CAMPAIGN_ID" \
      '{
        campaign_id: (.campaign_id // $id),
        daily_budget: (if .daily_budget then {
          previous: .daily_budget.previous,
          updated: .daily_budget.updated
        } else null end),
        lifetime_budget: (if .lifetime_budget then {
          previous: .lifetime_budget.previous,
          updated: .lifetime_budget.updated
        } else null end),
        budget_remaining: .budget_remaining,
        current_spend: .current_spend
      }'
    exit 0
    ;;
  400)
    # Check if error is due to budget constraint
    if echo "$BODY" | jq -e '.code == "BUDGET_BELOW_SPEND"' >/dev/null 2>&1; then
      CURRENT_SPEND=$(echo "$BODY" | jq -r '.current_spend // "unknown"')
      echo '{"error": "Cannot reduce lifetime budget below current spend ($'"$CURRENT_SPEND"')", "code": "BUDGET_CONSTRAINT_VIOLATION", "details": '"${BODY:-null}"'}' >&2
      exit 3
    fi
    echo '{"error": "Bad request - invalid budget parameters", "code": "API_BAD_REQUEST", "details": '"${BODY:-null}"'}' >&2
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
  000)
    echo '{"error": "Network error - unable to reach N8N instance", "code": "NETWORK_ERROR"}' >&2
    exit 2
    ;;
  *)
    echo '{"error": "Unexpected API response", "code": "API_ERROR", "http_code": '"$HTTP_CODE"', "details": '"${BODY:-null}"'}' >&2
    exit 2
    ;;
esac
