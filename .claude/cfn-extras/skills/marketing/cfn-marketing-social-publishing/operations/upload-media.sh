#!/usr/bin/env bash
set -euo pipefail

# Upload media for social posts via n8n workflow

if [[ -f .env ]]; then
  source .env
fi

N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"

FILE_PATH=""
MEDIA_TYPE=""
ALT_TEXT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --file-path)
      FILE_PATH="$2"
      shift 2
      ;;
    --media-type)
      MEDIA_TYPE="$2"
      shift 2
      ;;
    --alt-text)
      ALT_TEXT="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$FILE_PATH" ]]; then
  echo "Error: --file-path is required" >&2
  exit 1
fi

if [[ ! -f "$FILE_PATH" ]]; then
  echo "Error: File not found: $FILE_PATH" >&2
  exit 1
fi

if [[ -z "$MEDIA_TYPE" ]]; then
  echo "Error: --media-type is required" >&2
  exit 1
fi

# Validate media type
if [[ ! "$MEDIA_TYPE" =~ ^(image|video|gif)$ ]]; then
  echo "Error: --media-type must be one of: image, video, gif" >&2
  exit 1
fi

# Upload file using multipart form data
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -F "file=@$FILE_PATH" \
  -F "mediaType=$MEDIA_TYPE" \
  -F "altText=$ALT_TEXT" \
  "${N8N_BASE_URL}/webhook/marketing/social/upload-media" || echo -e "\n000")

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
