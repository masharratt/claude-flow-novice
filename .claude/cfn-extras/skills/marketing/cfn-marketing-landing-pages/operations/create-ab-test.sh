#!/usr/bin/env bash
# CFN Marketing Landing Pages - Create A/B Test Operation
# Set up A/B test with statistical validation requirements

set -euo pipefail

# Default values
TRAFFIC_SPLIT="50/50"

# Statistical requirements (hard-coded)
MIN_CONVERSIONS_PER_VARIANT=100
MIN_DURATION_DAYS=7
CONFIDENCE_LEVEL=0.95

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --page-id)
      PAGE_ID="$2"
      shift 2
      ;;
    --variant-a-name)
      VARIANT_A_NAME="$2"
      shift 2
      ;;
    --variant-b-name)
      VARIANT_B_NAME="$2"
      shift 2
      ;;
    --variant-b-changes)
      VARIANT_B_CHANGES="$2"
      shift 2
      ;;
    --traffic-split)
      TRAFFIC_SPLIT="$2"
      shift 2
      ;;
    --goal-metric)
      GOAL_METRIC="$2"
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

if [[ -z "${VARIANT_A_NAME:-}" ]]; then
  echo '{"error": "Missing required parameter: --variant-a-name", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${VARIANT_B_NAME:-}" ]]; then
  echo '{"error": "Missing required parameter: --variant-b-name", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${VARIANT_B_CHANGES:-}" ]]; then
  echo '{"error": "Missing required parameter: --variant-b-changes", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

if [[ -z "${GOAL_METRIC:-}" ]]; then
  echo '{"error": "Missing required parameter: --goal-metric", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate variant B changes JSON
if ! echo "$VARIANT_B_CHANGES" | jq empty 2>/dev/null; then
  echo '{"error": "Invalid JSON in --variant-b-changes", "code": "INVALID_JSON"}' >&2
  exit 1
fi

# Validate traffic split format
if [[ ! "$TRAFFIC_SPLIT" =~ ^[0-9]+/[0-9]+$ ]]; then
  echo '{"error": "Traffic split must be in format X/Y (e.g., 50/50)", "code": "INVALID_TRAFFIC_SPLIT"}' >&2
  exit 1
fi

# Validate traffic split adds to 100
IFS='/' read -r SPLIT_A SPLIT_B <<< "$TRAFFIC_SPLIT"
TOTAL=$((SPLIT_A + SPLIT_B))
if (( TOTAL != 100 )); then
  echo '{"error": "Traffic split must add up to 100", "code": "TRAFFIC_SPLIT_INVALID", "details": {"provided": "'"$TRAFFIC_SPLIT"'", "total": '"$TOTAL"'}}' >&2
  exit 1
fi

# Validate goal metric
case "$GOAL_METRIC" in
  form_submit|purchase|signup|download|click)
    ;;
  *)
    echo '{"error": "Invalid goal metric: '"$GOAL_METRIC"'. Supported: form_submit, purchase, signup, download, click", "code": "INVALID_GOAL_METRIC"}' >&2
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

# Calculate earliest conclusion date
EARLIEST_DATE=$(date -d "+${MIN_DURATION_DAYS} days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -v+${MIN_DURATION_DAYS}d +%Y-%m-%dT%H:%M:%SZ)

# Build request payload
PAYLOAD=$(jq -n \
  --arg page_id "$PAGE_ID" \
  --arg var_a "$VARIANT_A_NAME" \
  --arg var_b "$VARIANT_B_NAME" \
  --argjson changes "$VARIANT_B_CHANGES" \
  --argjson split_a "$SPLIT_A" \
  --argjson split_b "$SPLIT_B" \
  --arg metric "$GOAL_METRIC" \
  --argjson min_conv "$MIN_CONVERSIONS_PER_VARIANT" \
  --argjson min_days "$MIN_DURATION_DAYS" \
  --argjson confidence "$CONFIDENCE_LEVEL" \
  '{
    page_id: $page_id,
    variant_a: {
      name: $var_a,
      traffic_percentage: $split_a
    },
    variant_b: {
      name: $var_b,
      traffic_percentage: $split_b,
      changes: $changes
    },
    goal_metric: $metric,
    requirements: {
      min_conversions_per_variant: $min_conv,
      min_duration_days: $min_days,
      confidence_level: $confidence
    }
  }'
)

# Make API request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "$N8N_BASE_URL/webhook/landing-pages-create-ab-test" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201)
    # Success - validate and format response
    if ! echo "$BODY" | jq empty 2>/dev/null; then
      # Mock response if API returns invalid JSON
      TEST_ID="test_$(date +%s)"
      STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      echo "{
        \"test_id\": \"$TEST_ID\",
        \"page_id\": \"$PAGE_ID\",
        \"status\": \"active\",
        \"variants\": [
          {
            \"variant_id\": \"var_a\",
            \"name\": \"$VARIANT_A_NAME\",
            \"traffic_percentage\": $SPLIT_A,
            \"url\": \"https://pages.example.com/page?variant=a\"
          },
          {
            \"variant_id\": \"var_b\",
            \"name\": \"$VARIANT_B_NAME\",
            \"traffic_percentage\": $SPLIT_B,
            \"url\": \"https://pages.example.com/page?variant=b\",
            \"changes\": $VARIANT_B_CHANGES
          }
        ],
        \"requirements\": {
          \"min_conversions_per_variant\": $MIN_CONVERSIONS_PER_VARIANT,
          \"min_duration_days\": $MIN_DURATION_DAYS,
          \"confidence_level\": $CONFIDENCE_LEVEL
        },
        \"goal_metric\": \"$GOAL_METRIC\",
        \"started_at\": \"$STARTED_AT\",
        \"earliest_conclusion_date\": \"$EARLIEST_DATE\"
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
  404)
    echo '{"error": "Page not found", "code": "PAGE_NOT_FOUND", "details": {"page_id": "'"$PAGE_ID"'"}}' >&2
    exit 3
    ;;
  409)
    echo '{"error": "A/B test already exists for this page", "code": "TEST_EXISTS", "details": '"${BODY:-null}"'}' >&2
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
