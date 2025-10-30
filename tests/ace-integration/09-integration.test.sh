#!/bin/bash
# ACE System: Context Query Integration Test
# Tests domain-aware context retrieval

set -e

QS=".claude/skills/cfn-ace-system/query-contexts.sh"
TEMP="/tmp/ace-test-$$"
mkdir -p "$TEMP"

echo "=== ACE Context Query Integration ==="
echo ""

# Test 1: Frontend domain
echo -n "Test 1: Frontend domain... "
bash "$QS" "Build React" --limit 2 --format json > "$TEMP/t1.json"
DOMAIN=$(jq -r '.query.domains' < "$TEMP/t1.json")
[ "$DOMAIN" = "frontend" ] && echo "✓" || echo "✗ (got: $DOMAIN)"

# Test 2: Multi-domain
echo -n "Test 2: Multi-domain... "
bash "$QS" "JWT with React and Postgres" --limit 3 --format json > "$TEMP/t2.json"
DOMAINS=$(jq -r '.query.domains' < "$TEMP/t2.json")
echo "$DOMAINS" | grep -qE "(backend|frontend)" && echo "✓" || echo "✗ (got: $DOMAINS)"

# Test 3: Results count
echo -n "Test 3: Results returned... "
COUNT=$(jq -r '.results.count' < "$TEMP/t1.json")
[ "$COUNT" -gt 0 ] && echo "✓ ($COUNT)" || echo "✗"

# Test 4: Confidence filtering
echo -n "Test 4: Confidence filter... "
bash "$QS" "Build API" --min-confidence 0.95 --limit 10 --format json > "$TEMP/t4a.json"
bash "$QS" "Build API" --min-confidence 0.80 --limit 10 --format json > "$TEMP/t4b.json"
C_HIGH=$(jq -r '.results.count' < "$TEMP/t4a.json")
C_LOW=$(jq -r '.results.count' < "$TEMP/t4b.json")
[ "$C_LOW" -ge "$C_HIGH" ] && echo "✓ ($C_LOW >= $C_HIGH)" || echo "✗"

# Test 5: Simple format
echo -n "Test 5: Simple format... "
bash "$QS" "Test task" --limit 1 --format simple > "$TEMP/t5.txt"
grep -q "Query:" "$TEMP/t5.txt" && echo "✓" || echo "✗"

# Cleanup
rm -rf "$TEMP"

echo ""
echo "=== All tests complete ===" 
