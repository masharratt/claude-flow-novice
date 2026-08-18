#!/usr/bin/env bash
set -euo pipefail

# Create CRM contact via n8n workflow

if [[ -f .env ]]; then
  source .env
fi

N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"

EMAIL=""
FIRST_NAME=""
LAST_NAME=""
COMPANY=""
PHONE=""
CUSTOM_FIELDS="{}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --email)
      EMAIL="$2"
      shift 2
      ;;
    --first-name)
      FIRST_NAME="$2"
      shift 2
      ;;
    --last-name)
      LAST_NAME="$2"
      shift 2
      ;;
    --company)
      COMPANY="$2"
      shift 2
      ;;
    --phone)
      PHONE="$2"
      shift 2
      ;;
    --custom-fields)
      CUSTOM_FIELDS="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$EMAIL" ]]; then
  echo "Error: --email is required" >&2
  exit 1
fi

# Validate email format (basic check)
if [[ ! "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
  echo "Error: Invalid email format" >&2
  exit 1
fi

# Validate custom fields JSON
if ! echo "$CUSTOM_FIELDS" | jq empty 2>/dev/null; then
  echo "Error: --custom-fields must be valid JSON" >&2
  exit 1
fi

PAYLOAD=$(jq -n \
  --arg email "$EMAIL" \
  --arg firstName "$FIRST_NAME" \
  --arg lastName "$LAST_NAME" \
  --arg company "$COMPANY" \
  --arg phone "$PHONE" \
  --argjson customFields "$CUSTOM_FIELDS" \
  '{
    email: $email,
    firstName: $firstName,
    lastName: $lastName,
    company: $company,
    phone: $phone,
    customFields: $customFields
  }')

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/marketing/crm/create-contact" || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "000" ]]; then
  echo '{"success":false,"message":"Network error: Unable to connect to n8n"}' >&2
  exit 2
elif [[ "$HTTP_CODE" == "401" ]] || [[ "$HTTP_CODE" == "403" ]]; then
  echo '{"success":false,"message":"Authentication error: Invalid API key"}' >&2
  exit 3
elif [[ ! "$HTTP_CODE" =~ ^2 ]]; then
  echo "{\"success\":false,\"message\":\"API error: HTTP $HTTP_CODE\",\"response\":$BODY}" >&2
  exit 2
fi

if echo "$BODY" | jq -e '.success' >/dev/null 2>&1; then
  echo "$BODY"
  exit 0
else
  echo '{"success":false,"message":"Invalid response format from n8n"}' >&2
  exit 2
fi
