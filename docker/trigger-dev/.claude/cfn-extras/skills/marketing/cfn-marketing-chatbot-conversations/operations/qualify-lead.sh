#!/bin/bash
# CFN Marketing Chatbot Conversations - Qualify Lead Operation
# Version: 1.0.0
# Purpose: Score lead using BANT framework

set -euo pipefail

# Parse arguments
VISITOR_ID=""
BUDGET_SCORE=0
AUTHORITY_SCORE=0
NEED_SCORE=0
TIMELINE_SCORE=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --visitor-id)
      VISITOR_ID="$2"
      shift 2
      ;;
    --budget)
      BUDGET_SCORE="$2"
      shift 2
      ;;
    --authority)
      AUTHORITY_SCORE="$2"
      shift 2
      ;;
    --need)
      NEED_SCORE="$2"
      shift 2
      ;;
    --timeline)
      TIMELINE_SCORE="$2"
      shift 2
      ;;
    *)
      echo '{"error": "Unknown parameter: '$1'", "code": "INVALID_PARAMETER"}' >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$VISITOR_ID" ]]; then
  echo '{"error": "Missing required parameter: --visitor-id", "code": "MISSING_PARAMETER"}' >&2
  exit 1
fi

# Validate score ranges
if ! [[ "$BUDGET_SCORE" =~ ^[0-9]+$ ]] || [[ "$BUDGET_SCORE" -lt 0 ]] || [[ "$BUDGET_SCORE" -gt 40 ]]; then
  echo '{"error": "Invalid budget score. Must be between 0 and 40", "code": "INVALID_BUDGET"}' >&2
  exit 1
fi

if ! [[ "$AUTHORITY_SCORE" =~ ^[0-9]+$ ]] || [[ "$AUTHORITY_SCORE" -lt 0 ]] || [[ "$AUTHORITY_SCORE" -gt 20 ]]; then
  echo '{"error": "Invalid authority score. Must be between 0 and 20", "code": "INVALID_AUTHORITY"}' >&2
  exit 1
fi

if ! [[ "$NEED_SCORE" =~ ^[0-9]+$ ]] || [[ "$NEED_SCORE" -lt 0 ]] || [[ "$NEED_SCORE" -gt 20 ]]; then
  echo '{"error": "Invalid need score. Must be between 0 and 20", "code": "INVALID_NEED"}' >&2
  exit 1
fi

if ! [[ "$TIMELINE_SCORE" =~ ^[0-9]+$ ]] || [[ "$TIMELINE_SCORE" -lt 0 ]] || [[ "$TIMELINE_SCORE" -gt 20 ]]; then
  echo '{"error": "Invalid timeline score. Must be between 0 and 20", "code": "INVALID_TIMELINE"}' >&2
  exit 1
fi

# Calculate total BANT score
TOTAL_SCORE=$((BUDGET_SCORE + AUTHORITY_SCORE + NEED_SCORE + TIMELINE_SCORE))
THRESHOLD=60

# Determine qualification status
QUALIFIED="false"
TIER="Unqualified"
RECOMMENDATION="Continue nurturing"

if [[ "$TOTAL_SCORE" -ge 80 ]]; then
  QUALIFIED="true"
  TIER="Hot Lead"
  RECOMMENDATION="Schedule demo immediately - high priority"
elif [[ "$TOTAL_SCORE" -ge "$THRESHOLD" ]]; then
  QUALIFIED="true"
  TIER="MQL"
  RECOMMENDATION="Schedule demo within 24-48 hours"
elif [[ "$TOTAL_SCORE" -ge 40 ]]; then
  QUALIFIED="false"
  TIER="Warm Lead"
  RECOMMENDATION="Continue conversation to gather more information"
else
  QUALIFIED="false"
  TIER="Cold Lead"
  RECOMMENDATION="Add to nurture campaign"
fi

# Generate detailed recommendations based on weak areas
IMPROVEMENTS=()

if [[ "$BUDGET_SCORE" -lt 20 ]]; then
  IMPROVEMENTS+=("Discuss budget ranges and ROI")
fi

if [[ "$AUTHORITY_SCORE" -lt 10 ]]; then
  IMPROVEMENTS+=("Identify decision maker and approval process")
fi

if [[ "$NEED_SCORE" -lt 10 ]]; then
  IMPROVEMENTS+=("Clarify pain points and business impact")
fi

if [[ "$TIMELINE_SCORE" -lt 10 ]]; then
  IMPROVEMENTS+=("Understand urgency and implementation timeline")
fi

# Build improvements JSON array
IMPROVEMENTS_JSON="[]"
if [[ ${#IMPROVEMENTS[@]} -gt 0 ]]; then
  IMPROVEMENTS_JSON=$(printf '%s\n' "${IMPROVEMENTS[@]}" | jq -R . | jq -s .)
fi

# Store qualification in Redis (optional - for analytics)
if command -v redis-cli &> /dev/null; then
  redis-cli SET "chatbot:qualification:${VISITOR_ID}" "$TOTAL_SCORE" EX 2592000 > /dev/null 2>&1 || true
  redis-cli SET "chatbot:tier:${VISITOR_ID}" "$TIER" EX 2592000 > /dev/null 2>&1 || true
fi

# Return qualification result
jq -n \
  --arg visitor_id "$VISITOR_ID" \
  --argjson qualified "$QUALIFIED" \
  --arg score "$TOTAL_SCORE" \
  --arg tier "$TIER" \
  --arg budget "$BUDGET_SCORE" \
  --arg authority "$AUTHORITY_SCORE" \
  --arg need "$NEED_SCORE" \
  --arg timeline "$TIMELINE_SCORE" \
  --arg recommendation "$RECOMMENDATION" \
  --argjson improvements "$IMPROVEMENTS_JSON" \
  '{
    visitor_id: $visitor_id,
    qualified: $qualified,
    score: ($score | tonumber),
    tier: $tier,
    breakdown: {
      budget: ($budget | tonumber),
      authority: ($authority | tonumber),
      need: ($need | tonumber),
      timeline: ($timeline | tonumber)
    },
    recommendation: $recommendation,
    improvements: $improvements
  }'

exit 0
