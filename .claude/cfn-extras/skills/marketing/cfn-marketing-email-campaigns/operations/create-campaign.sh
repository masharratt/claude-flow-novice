#!/bin/bash
set -euo pipefail

# Create email campaign via n8n workflow

# Load environment
if [[ -f .env ]]; then
  source .env
fi

N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"

# Parse parameters
NAME=""
SUBJECT=""
TEMPLATE_ID=""
SEGMENT_ID=""
FROM_EMAIL="marketing@company.com"
FROM_NAME="Marketing Team"

while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      NAME="$2"
      shift 2
      ;;
    --subject)
      SUBJECT="$2"
      shift 2
      ;;
    --template-id)
      TEMPLATE_ID="$2"
      shift 2
      ;;
    --segment-id)
      SEGMENT_ID="$2"
      shift 2
      ;;
    --from-email)
      FROM_EMAIL="$2"
      shift 2
      ;;
    --from-name)
      FROM_NAME="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$NAME" ]]; then
  echo "Error: --name is required" >&2
  exit 1
fi

if [[ -z "$SUBJECT" ]]; then
  echo "Error: --subject is required" >&2
  exit 1
fi

if [[ -z "$TEMPLATE_ID" ]]; then
  echo "Error: --template-id is required" >&2
  exit 1
fi

if [[ -z "$SEGMENT_ID" ]]; then
  echo "Error: --segment-id is required" >&2
  exit 1
fi

# Build JSON payload
PAYLOAD=$(jq -n \
  --arg name "$NAME" \
  --arg subject "$SUBJECT" \
  --arg templateId "$TEMPLATE_ID" \
  --arg segmentId "$SEGMENT_ID" \
  --arg fromEmail "$FROM_EMAIL" \
  --arg fromName "$FROM_NAME" \
  '{
    name: $name,
    subject: $subject,
    templateId: $templateId,
    segmentId: $segmentId,
    fromEmail: $fromEmail,
    fromName: $fromName
  }')

# Call n8n workflow
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/marketing/email/create-campaign" || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle HTTP errors
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

# Parse and return response
if echo "$BODY" | jq -e '.success' >/dev/null 2>&1; then
  echo "$BODY"
  exit 0
else
  echo '{"success":false,"message":"Invalid response format from n8n"}' >&2
  exit 2
fi
