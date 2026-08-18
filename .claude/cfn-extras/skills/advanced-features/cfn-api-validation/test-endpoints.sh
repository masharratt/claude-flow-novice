#!/usr/bin/env bash
# API Endpoint Validation Script
# Usage: ./test-endpoints.sh <base-url> <endpoint> [request-count]

BASE_URL="${1:-http://localhost:8080}"
ENDPOINT="$2"
COUNT="${3:-10}"

if [ -z "$ENDPOINT" ]; then
  echo "Usage: $0 <base-url> <endpoint> [request-count]"
  exit 1
fi

echo "Testing: $BASE_URL$ENDPOINT"
echo "Requests: $COUNT"
echo ""

SUCCESS=0
FAILED=0
TOTAL_RESPONSE_TIME=0

for i in $(seq 1 "$COUNT"); do
  START_TIME=$(date +%s.%N)
  RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" "$BASE_URL$ENDPOINT")

  HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
  RESPONSE_TIME=$(echo "$RESPONSE" | tail -2 | head -1)
  BODY=$(echo "$RESPONSE" | sed '$d' | sed '$d')  # head -n -N is GNU-only

  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Request $i: 200 OK (Response Time: ${RESPONSE_TIME}s)"
    ((SUCCESS++))
  else
    echo "❌ Request $i: $HTTP_STATUS"
    echo "   Response: $BODY"
    ((FAILED++))
  fi

  TOTAL_RESPONSE_TIME=$(echo "$TOTAL_RESPONSE_TIME + $RESPONSE_TIME" | bc)

  [ $i -lt "$COUNT" ] && sleep 2
done

AVG_RESPONSE_TIME=$(echo "scale=3; $TOTAL_RESPONSE_TIME / $COUNT" | bc)

echo ""
echo "Results:"
echo "- Requests: $COUNT total"
echo "- Succeeded: $SUCCESS"
echo "- Failed: $FAILED"
echo "- Average Response Time: ${AVG_RESPONSE_TIME}s"

# Strict success criteria
[ $FAILED -eq 0 ] && exit 0 || exit 1