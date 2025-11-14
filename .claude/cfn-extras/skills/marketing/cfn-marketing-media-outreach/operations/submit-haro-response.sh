#!/usr/bin/env bash
set -euo pipefail

# submit-haro-response.sh - Submit response to HARO query

QUERY_ID=""
RESPONSE=""
EXPERT_NAME=""
EXPERT_TITLE=""
COMPANY_NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --query-id)
      QUERY_ID="$2"
      shift 2
      ;;
    --response)
      RESPONSE="$2"
      shift 2
      ;;
    --expert-name)
      EXPERT_NAME="$2"
      shift 2
      ;;
    --expert-title)
      EXPERT_TITLE="$2"
      shift 2
      ;;
    --company-name)
      COMPANY_NAME="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$QUERY_ID" ]] || [[ -z "$RESPONSE" ]] || [[ -z "$EXPERT_NAME" ]] || \
   [[ -z "$EXPERT_TITLE" ]] || [[ -z "$COMPANY_NAME" ]]; then
  echo "Error: --query-id, --response, --expert-name, --expert-title, and --company-name are required" >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg query_id "$QUERY_ID" \
  --arg response "$RESPONSE" \
  --arg expert_name "$EXPERT_NAME" \
  --arg expert_title "$EXPERT_TITLE" \
  --arg company_name "$COMPANY_NAME" \
  '{
    query_id: $query_id,
    response: $response,
    expert_name: $expert_name,
    expert_title: $expert_title,
    company_name: $company_name
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/media-outreach-haro" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 ]] && [[ "$HTTP_CODE" -lt 300 ]]; then
  echo "$BODY"
  exit 0
elif [[ "$HTTP_CODE" -ge 400 ]] && [[ "$HTTP_CODE" -lt 500 ]]; then
  echo "Error: Invalid request or missed deadline - $BODY" >&2
  exit 3
else
  echo "Error: API error (HTTP $HTTP_CODE) - $BODY" >&2
  exit 2
fi
