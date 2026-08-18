#!/usr/bin/env bash
set -euo pipefail

# export-report.sh - Export daily/weekly brand mention report

QUERY=""
REPORT_TYPE=""
FORMAT="json"
EMAIL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --query)
      QUERY="$2"
      shift 2
      ;;
    --report-type)
      REPORT_TYPE="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --email)
      EMAIL="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown parameter $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$QUERY" ]] || [[ -z "$REPORT_TYPE" ]]; then
  echo "Error: --query and --report-type are required" >&2
  exit 1
fi

# Validate report type
if [[ ! "$REPORT_TYPE" =~ ^(daily|weekly|monthly)$ ]]; then
  echo "Error: --report-type must be daily, weekly, or monthly" >&2
  exit 1
fi

# Validate format
if [[ ! "$FORMAT" =~ ^(json|csv|pdf)$ ]]; then
  echo "Error: --format must be json, csv, or pdf" >&2
  exit 1
fi

# Validate environment variables
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_BASE_URL and N8N_API_KEY environment variables required" >&2
  exit 1
fi

# Build JSON payload
JSON_PAYLOAD=$(jq -n \
  --arg query "$QUERY" \
  --arg report_type "$REPORT_TYPE" \
  --arg format "$FORMAT" \
  --arg email "$EMAIL" \
  '{
    query: $query,
    report_type: $report_type,
    format: $format,
    email: $email
  }')

# Call n8n webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${N8N_BASE_URL}/webhook/media-monitoring-report" \
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
  exit 1
else
  echo "Error: API error (HTTP $HTTP_CODE) - $BODY" >&2
  exit 2
fi
