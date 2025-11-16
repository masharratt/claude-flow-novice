#!/usr/bin/env bash
set -euo pipefail

# distribute-press-release.sh - Distribute press release through wire services

TITLE=""
BODY=""
OUTLETS=""
EMBARGO_DATE=""
CONTACT_NAME=""
CONTACT_EMAIL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --title)
      TITLE="$2"
      shift 2
      ;;
    --body)
      BODY="$2"
      shift 2
      ;;
    --outlets)
      OUTLETS="$2"
      shift 2
      ;;
    --embargo-date)
      EMBARGO_DATE="$2"
      shift 2
      ;;
    --contact-name)
      CONTACT_NAME="$2"
      shift 2
      ;;
    --contact-email)
      CONTACT_EMAIL="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$TITLE" ]] || [[ -z "$BODY" ]] || [[ -z "$OUTLETS" ]]; then
  echo "Error: --title, --body, and --outlets are required" >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg title "$TITLE" \
  --arg body "$BODY" \
  --arg outlets "$OUTLETS" \
  --arg embargo_date "$EMBARGO_DATE" \
  --arg contact_name "$CONTACT_NAME" \
  --arg contact_email "$CONTACT_EMAIL" \
  '{
    title: $title,
    body: $body,
    outlets: $outlets,
    embargo_date: $embargo_date,
    contact_name: $contact_name,
    contact_email: $contact_email
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/press-distribution-release" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 ]] && [[ "$HTTP_CODE" -lt 300 ]]; then
  echo "$BODY"
  exit 0
elif [[ "$HTTP_CODE" -ge 400 ]] && [[ "$HTTP_CODE" -lt 500 ]]; then
  echo "Error: Invalid request - $BODY" >&2
  exit 3
else
  echo "Error: API error (HTTP $HTTP_CODE) - $BODY" >&2
  exit 2
fi
