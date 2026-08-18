#!/usr/bin/env bash
set -euo pipefail

# Create social media post via n8n workflow

if [[ -f .env ]]; then
  source .env
fi

N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"

CONTENT=""
PLATFORMS=""
MEDIA_IDS=""
LINK=""
HASHTAGS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --content)
      CONTENT="$2"
      shift 2
      ;;
    --platforms)
      PLATFORMS="$2"
      shift 2
      ;;
    --media-ids)
      MEDIA_IDS="$2"
      shift 2
      ;;
    --link)
      LINK="$2"
      shift 2
      ;;
    --hashtags)
      HASHTAGS="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$CONTENT" ]]; then
  echo "Error: --content is required" >&2
  exit 1
fi

if [[ -z "$PLATFORMS" ]]; then
  echo "Error: --platforms is required" >&2
  exit 1
fi

# Convert comma-separated values to JSON arrays
PLATFORMS_ARRAY=$(echo "$PLATFORMS" | jq -R 'split(",")')
MEDIA_IDS_ARRAY=$(if [[ -n "$MEDIA_IDS" ]]; then echo "$MEDIA_IDS" | jq -R 'split(",")'; else echo "[]"; fi)
HASHTAGS_ARRAY=$(if [[ -n "$HASHTAGS" ]]; then echo "$HASHTAGS" | jq -R 'split(",")'; else echo "[]"; fi)

PAYLOAD=$(jq -n \
  --arg content "$CONTENT" \
  --argjson platforms "$PLATFORMS_ARRAY" \
  --argjson mediaIds "$MEDIA_IDS_ARRAY" \
  --arg link "$LINK" \
  --argjson hashtags "$HASHTAGS_ARRAY" \
  '{
    content: $content,
    platforms: $platforms,
    mediaIds: $mediaIds,
    link: $link,
    hashtags: $hashtags
  }')

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -d "$PAYLOAD" \
  "${N8N_BASE_URL}/webhook/marketing/social/create-post" || echo -e "\n000")

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
