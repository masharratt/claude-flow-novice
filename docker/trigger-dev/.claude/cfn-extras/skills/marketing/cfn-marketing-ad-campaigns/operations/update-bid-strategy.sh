#!/bin/bash
# CFN Marketing Ad Campaigns - Update Bid Strategy Operation
# Modifies campaign bidding strategy

set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --campaign-id)
      CAMPAIGN_ID="$2"
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
if [[ -z "${CAMPAIGN_ID:-}" ]]; then
  echo '{"error": "Missing required parameter: --campaign-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${BID_STRATEGY:-}" ]]; then
  echo '{"error": "Missing required parameter: --bid-strategy", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate bid strategy
case "$BID_STRATEGY" in
  manual_cpc|enhanced_cpc|maximize_conversions|target_cpa|target_roas)
    ;;
  *)
    echo '{"error": "Invalid bid strategy: '"$BID_STRATEGY"'. Supported: manual_cpc, enhanced_cpc, maximize_conversions, target_cpa, target_roas", "code": "INVALID_BID_STRATEGY"}' >&2
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
  --arg id "$CAMPAIGN_ID" \
  --arg strategy "$BID_STRATEGY" \
  '{
    campaign_id: $id,
    bid_strategy: $strategy
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/ad-campaigns/bid-strategy" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200)
    # Success - parse and format response
    echo "$BODY" | jq \
      --arg id "$CAMPAIGN_ID" \
      --arg strategy "$BID_STRATEGY" \
      '{
        campaign_id: (.campaign_id // $id),
        bid_strategy: {
          previous: .bid_strategy.previous,
          updated: (.bid_strategy.updated // $strategy)
        },
        estimated_impact: (if .estimated_impact then {
          cpa_change: .estimated_impact.cpa_change,
          conversion_volume: .estimated_impact.conversion_volume,
          roas_change: .estimated_impact.roas_change
        } else {
          cpa_change: "calculating",
          conversion_volume: "calculating"
        } end),
        status: (.status // "active"),
        updated_at: (.updated_at // (now | strftime("%Y-%m-%dT%H:%M:%SZ")))
      }'
    exit 0
    ;;
  400)
    echo '{"error": "Bad request - invalid bid strategy parameters", "code": "API_BAD_REQUEST", "details": '"${BODY:-null}"'}' >&2
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
  409)
    # Campaign in state that prevents bid strategy change
    echo '{"error": "Cannot change bid strategy - campaign must be active", "code": "INVALID_CAMPAIGN_STATE", "details": '"${BODY:-null}"'}' >&2
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
